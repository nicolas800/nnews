import * as _ from 'lodash';
import * as net from 'net';
import * as tls from 'tls';
import * as log from 'winston';
import { Options } from './shareddef';
import { replaceAll } from './helpers' ;

export interface INNTPConnection
{
	isConnected(): boolean;
	connect(): Promise<void>;
	group(search: string): Promise<void>;
	body(articleId: string): Promise<Buffer>;
	end(): Promise<void>;
}

const CR = 13 ;
const LF = 10 ;
const DOT = 46 ;
const CRLF = Buffer.from([CR, LF]);
const END_BLOCK = Buffer.from([CR, LF, DOT ,CR, LF]);
const LF_DOT = Buffer.from([ LF , DOT ]);
const LF_DOT_DOT = Buffer.from([ LF , DOT , DOT ]);

const NNTPCODEGROUP_OK = 200 ;
const NNTPCODEGROUP_OKSOFAR = 300 ;
const NNTPCODEGROUP_ERROR = 400 ;

export class NNTPError extends Error
{
	static NNTPCODE_NOSUCH_ARTICLE = 430 ;
	static NNTPCODE_CLIENT_ERROR = 499 ;
	code : number ;

	constructor(code : number , message = "" )
	{
		super( `${message} nttp code ${code}` );
		this.code = code ;
	}

	mayRetry()
	{
		return this.code !== NNTPError.NNTPCODE_NOSUCH_ARTICLE ;
	}
}

export class NNTPConnection implements INNTPConnection
{
	static DEFAULT_NNTP_PORT = 119 ;
	static DEFAULT_NNTP_SSL_PORT = 563 ;
	socket: net.Socket = new net.Socket() ;
	_isConnected: boolean = false ;
	options: Options;
	lastGroup = '';

	isConnected(): boolean { return this._isConnected; }

	isAuthConn(): boolean
	{
		if ( this.options.password !== undefined && this.options.user !== undefined )
			return true;
		else
			return false;
	}

	static unsureBracketArticleId(artId: string): string
	{
		artId = _.trimStart(artId, '<');
		artId = _.trimEnd(artId, '>');
		return `<${artId}>` ;
	}

	constructor(options: Options )
	{
		this.options = options;
	}

	safeDestroy()
	{
		this._isConnected = false ;
		try
		{
			this.socket.destroy();
		}
		catch
		{}
		log.info( "Socket destroyed" ) ;
	}

	async connectSocket()
	{
		const retval = new Promise<void>( (resolve,reject) =>
		{
			const resolvefn = () =>
			{
				log.info( "Socket connected" ) ;
				resolve();
			};
			const rejectfn = (deferr : Error) => ( err : Error | undefined ) =>
			{
				if ( err === undefined )
					err = deferr ;
				log.error( err.message ) ;
				reject( err );
				this.safeDestroy();
			};
			if (this.options.secure)
				this.socket = tls.connect(this.options.port as number, this.options.host , undefined , resolvefn );
			else
			{
				this.socket = new net.Socket();
				this.socket.connect(this.options.port as number, this.options.host, resolvefn );
			}
			this.socket.setTimeout( this.options.connTimeout , rejectfn( new Error('socket timeout') ) as () => void ) ;
			this.socket.on('close' , () =>
			{
				log.info( "Socket close event" ) ;
				this.safeDestroy();
			} );
			this.socket.on( 'error' , rejectfn( new Error('socket unkown error') ) );
		} ) ;
		return retval ;
	}

	async connect()
	{
		log.info( "Connecting nntp" ) ;
		if ( this.isConnected() )
			throw new NNTPError( NNTPError.NNTPCODE_CLIENT_ERROR , "NNTPConnection already connected");
		await this.connectSocket();
		this.socket.once( 'close' , () => this._isConnected = false );
		await this.read();
		if (this.isAuthConn())
		{
			await this.write(`AUTHINFO USER ${this.options.user}`);
			await this.read();
			await this.write(`AUTHINFO PASS ${this.options.password}`);
			await this.read();
		}
		this._isConnected = true ;
	}

	static endWithCrlLf( abuffer : Buffer )
	{
		return abuffer.length > 2 && abuffer[abuffer.length - 2 ] === CR && abuffer[abuffer.length - 1 ] === LF ;
	}

	async readLine() : Promise<Buffer>
	{
		const retval = new Promise<Buffer>( (resolve,reject) =>
		{
			const socketTimer = setTimeout( () =>
			{
				this.safeDestroy();
				reject( new NNTPError( NNTPError.NNTPCODE_CLIENT_ERROR , 'socket timeout while reading') );
			} , this.options.connTimeout ) ;
			let readBuffer = Buffer.alloc(0);
			const readListener = (adata:Buffer) =>
			{
				readBuffer = Buffer.concat( [readBuffer , adata ] );
				if ( NNTPConnection.endWithCrlLf( readBuffer ) )
				{
					clearInterval( socketTimer );
					this.socket.removeListener( 'data' , readListener );
					resolve( readBuffer ) ;
				}
			} ;
			this.socket.on('data' , readListener ) ;
		} );
		return retval ;
	}

	async read(): Promise< Buffer >
	{
		const regexFirstLine = /(\d+)\s+(.*)/;
		let buf = await this.readLine();
		const firstLineIndex = buf.indexOf( CRLF );
		const firstline = buf.subarray(0, firstLineIndex).toString();
		const [, strcode, message] = regexFirstLine.exec(firstline) as RegExpExecArray;
		log.silly( `Received nntp command code : ${strcode}  message : ${message} ` ) ;
		const code = parseInt(strcode);
		if (code < NNTPCODEGROUP_OK || code >= NNTPCODEGROUP_ERROR )
			throw new NNTPError( code , firstline);
		buf = buf.slice(firstLineIndex + 2 );
		if ( buf.slice(0,2).equals( CRLF ) )
			buf = buf.slice(2);
		return buf ;
	}

	async write( input:string )
	{
		return new Promise( (resolve,reject) =>
		{
			const socketTimer = setTimeout( () =>
			{
				this.safeDestroy();
				reject( new NNTPError( NNTPError.NNTPCODE_CLIENT_ERROR , 'socket timeout while writing') );
			} , this.options.connTimeout ) ;
			log.silly( "Sending nntp command : " , input ) ;
			// eslint-disable-next-line prefer-template
			this.socket.write( input + '\r\n' , ( err : Error | undefined ) =>
			{
				clearInterval( socketTimer );
				if ( err === undefined )
					resolve();
				else
					reject( new NNTPError( NNTPError.NNTPCODE_CLIENT_ERROR , 'socket error while writing') ) ;
			} );
		} );
	}

	async readMultiLines(): Promise<Buffer>
	{
		let content = await this.read();
		let endIndex: number;
		while ((endIndex = content.lastIndexOf( END_BLOCK ) ) < 0)
		{
			const chunck = await this.readLine() ;
			content = Buffer.concat([content, chunck]);
		}
		content = Buffer.from(content.subarray(0, endIndex));
		content = replaceAll( content , Buffer.from( LF_DOT_DOT ), Buffer.from( LF_DOT ) ) ; //dot dot unstuffing
		return content ;
	}

	async group(agroup: string)
	{
		if ( agroup !== this.lastGroup )
		{
			await this.write(`GROUP ${agroup}`);
			await this.read();
			this.lastGroup = agroup ;
		}
	}

	async body(articleId: string): Promise<Buffer>
	{
		articleId = NNTPConnection.unsureBracketArticleId(articleId);
		await this.write(`BODY ${articleId}`);
		return this.readMultiLines() ;
	}

	async end()
	{
		log.info( "Disconnecting nntp" ) ;
		this._isConnected = false ;
		await this.write(`QUIT`);
		await this.read();
		this.socket.end();
		this.socket.destroy();
	}
}

export interface INntpConnectionProvider
{
	getConn(): Promise<INNTPConnection>;
	release(aconn: INNTPConnection): void;
	available(): number;
	total(): number;
	end(): Promise<void>;
}

//TODO use coopernurse pool
export class LimitedCountConnProvider implements INntpConnectionProvider
{
	notifierlist: Array<() => void> = new Array<() => void>();
	conns: Array<INNTPConnection> = new Array();
	totalCount : number ;

	constructor(count: number = 0 , construcFn?: () => INNTPConnection )
	{
		this.totalCount = count ;
		if ( construcFn !== undefined )
			this.conns = _.range(0,count).map( construcFn );
	}

	async end()
	{
		await Promise.all(this.conns.map( async aconn =>
		{
			if (aconn.isConnected())
				await aconn.end();
		}));
	}

	async getConn(): Promise<INNTPConnection>
	{
		if (this.conns.length > 0)
		{
			const aconn = this.conns.shift()!;
			if (!aconn.isConnected() )
				await aconn.connect();
			return aconn;
		}
		else
			return new Promise<INNTPConnection>((resolve, reject) =>
			{
				this.notifierlist.push(() =>
				{
					try
					{
						const aconn = this.conns.shift();
						resolve(aconn);
					}
					catch (error)
					{
						reject(error);
					}
				});
			}).then(async (aconn) =>
			{
				if (!aconn.isConnected())
					await aconn.connect();
				return aconn;
			});
	}

	release(aconn: INNTPConnection ): void
	{
		this.conns.push(aconn);
		while (this.conns.length > 0 && this.notifierlist.length > 0)
			this.notifierlist.shift()!();
	}

	available() { return this.conns.length; }

	total() { return this.totalCount ; }
}
