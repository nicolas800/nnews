import { promisify } from 'util' ;
import * as fs from 'fs';
import * as fse from 'fs-extra' ;
import * as path from 'path';
import * as pool from 'generic-pool';
import * as afs from 'async-file';
import { execFile ,ChildProcess } from 'child_process';
import * as log from 'winston';
import * as _ from 'lodash';
import { CancellationToken } from './cancellation';

export const thirdrdpartyDir = '3rdparty';

export const setTimeoutAsync = promisify( setTimeout );

export function rootPath()
{
	let retval = path.join(__dirname, '..' ) ;
		if ( ! fs.existsSync( path.join( retval , thirdrdpartyDir ) ) )
			retval = path.join( retval , '..' ) ;
	return retval ;
}

export function searchCrLf(input: string): number
{
	return Math.max(input.search('\r'), input.search('\n'));
}

export function safeMkDirSync(dirname: string)
{
	try
	{
		if (!fs.existsSync(dirname))
			fs.mkdirSync(dirname);
	}
	catch
	{}
}

export async function safeUnlink( entry : string)
{
	try
	{
		await fse.unlink(entry);
	}
	catch
	{}
}

export function safeErrorMessage( error : any )
{
	if ( error instanceof Error )
		return error.message ;
	else
		return 'unknown' ;
}

export function saveJsonSync<T extends object>(configFile: string, configObj: T): void
{
	// eslint-disable-next-line
	fs.writeFileSync(configFile, JSON.stringify(configObj , null , 4 ) );
}

export function loadJsonSync(configFile: string ): object | Array<any>
{
	// eslint-disable-next-line
	return JSON.parse(fs.readFileSync(configFile).toLocaleString()) ;
}

function cloneBuffer( from : Buffer )
{
	const retbuf = Buffer.alloc( from.length );
	from.copy( retbuf , 0 , 0 , from.length );
	return retbuf ;
}

export function replaceAllRefImpl( from : Buffer , toRemove : Buffer , toReplace : Buffer ) : Buffer
{
	if ( toRemove.length === 0 )
		return cloneBuffer(from) ;
	const fromstr = from.toString('binary');
	const toRemoveStr = toRemove.toString('binary');
	const toReplaceStr = toReplace.toString('binary');
	const splitted = fromstr.split(toRemoveStr) ;
	const retvalStr = splitted.join(toReplaceStr) ;
	return Buffer.from( retvalStr , 'binary' );
}

export function replaceAll( from : Buffer , toRemove : Buffer , toReplace : Buffer ) : Buffer
{
	if ( toRemove.length === 0 )
		return cloneBuffer(from) ;
	const splitIndexes : number[] = [] ;

	for ( let curIdx = 0 ; curIdx < from.length ; )
	{
		curIdx = from.indexOf( toRemove , curIdx ) ;
		if ( curIdx === -1 )
			break;
		splitIndexes.push(curIdx);
		curIdx += toRemove.length ;
	}
	const destBuffer = Buffer.alloc( from.length + ( toReplace.length - toRemove.length ) * splitIndexes.length ) ;
	let destIndex = 0 ;
	for ( let idx = 0 ; idx <= splitIndexes.length ; idx += 1 )
	{
		const lastSplittIndex = idx > 0 ? splitIndexes[ idx - 1 ] + toRemove.length : 0 ;
		const splitIndex = idx < splitIndexes.length ? splitIndexes[idx] : from.length ;
		from.copy( destBuffer , destIndex, lastSplittIndex, splitIndex ) ;
		destIndex += splitIndex - lastSplittIndex ;
		if ( idx < splitIndexes.length )
		{
			toReplace.copy( destBuffer , destIndex , 0 , toReplace.length ) ;
			destIndex += toReplace.length ;
		}
	}
	return destBuffer ;
}

export function isOSWin64()
{
	return process.arch === 'x64' || process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
}

export function isPar2( afile : string )
{
	return path.extname(afile).toLocaleLowerCase() === '.par2' ;
}

export function isNzb( afile : string )
{
	return path.extname(afile).toLocaleLowerCase() === '.nzb' ;
}

class ProcessExecutor {}

export interface IExtTools
{
	shutdown() : void;
	ExecPar2Repair( par2Dir : string , removepar2files : boolean , token: CancellationToken ) : Promise<void> ;
	ExecPar2Repair( par2Dir : string , removepar2files : boolean ) : Promise<void> ;
	ExecPar2Check( par2Dir : string , token: CancellationToken ) : Promise<boolean> ;
	ExecPar2Check( par2Dir : string ) : Promise<boolean> ;
	ExecUnzip( zip2Dir : string , removeZipFiles: boolean , token: CancellationToken ) : Promise<void> ;
	ExecUnzip( zip2Dir : string , removeZipFiles: boolean ) : Promise<void> ;
}

export abstract class ExtTools
{
	pool: pool.Pool<ProcessExecutor> ;
	process : ChildProcess | undefined ;
	par2Path : string = '' ;
	unzipPath : string = '' ;

	constructor()
	{
		const factory =
		{
			create : async () => new ProcessExecutor() ,
			destroy : async ( _client:ProcessExecutor ) => {}
		} ;
		const opts = { min : 1, max : 1 } ;
		this.pool = pool.createPool( factory , opts ) ;
	}

	static create() : IExtTools
	{
		switch ( process.platform )
		{
			case 'win32' :
				return new WindowsProcessTools();
			case 'linux' :
				return new LinuxProcessTools();
			case 'darwin':
				return new DarwinProcessTools();
			default :
				return new VoidExtTools();
		}
	}

	shutdown()
	{
		if ( this.process !== undefined )
		{
			process.kill( this.process.pid );
			this.process = undefined;
		}
	}

//TODO return {stdout stderr }
	async Exec( cmdLine : string , cwd : string , param:string[] , token: CancellationToken )
	{
		let res:ProcessExecutor | undefined;
		token.ThrowIfCanceled();

		const options = { cwd :cwd , windowsHide : true } ;
		try
		{
			// eslint-disable-next-line
			res = await this.pool.acquire() ;
			let exitCode : number | undefined ;
			log.info( `Starting command : ${cmdLine} ${ _.join(param,' ')}` );
			await new Promise( (resolve,reject) =>
			{
				this.process = execFile( cmdLine , param , options , (error, stdout, stderr) =>
				{
					log.silly( `Command echoed : ${stdout}` );
					if ( error !== null )
					{
						const anex = new Error(`${path.basename(cmdLine)} failed, reason: ${error.message}`) ;
						log.error( anex.message ) ;
						reject( anex ) ;
					}
					else if ( exitCode !== undefined || exitCode === 0 ) // wait exit code to be sure
					{
						log.info( "Command complete" ) ;
						resolve() ;
					}
				} ).once( 'exit' , ( code : number | null ) =>
				{	// actually called before execFile callback !
					if ( code !== null )
					{
						exitCode = code ;
						if ( code === 0 )
						{
							log.info( "Command complete" ) ;
							resolve() ;
						}
						else
							log.error( `Command exit code : ${exitCode}`);
					}
				} ).once('error' , reject ) ;
			});
		}
		finally
		{
			if ( res !== undefined )
			// eslint-disable-next-line
				await this.pool.release(res);
		}
	}

	async ExecPar2RepairHelper( par2Dir : string , removepar2files : boolean , token: CancellationToken = CancellationToken.None )
	{
		const par2list = await ExtTools.par2List( par2Dir );
		if ( par2list.length > 0 )
		{
			await this.Exec( this.par2Path , par2Dir , [ 'r' , par2list[0] , '*' ] , token );
			if ( removepar2files )
				await Promise.all( par2list.map( async afn => safeUnlink( afn ) ) ) ;
		}
	}

	async ExecPar2CheckHelper( par2Dir : string , token: CancellationToken = CancellationToken.None )
	{
		const par2list = await ExtTools.par2List( par2Dir );
		if ( par2list.length > 0 )
			try
			{
				await this.Exec( this.par2Path , par2Dir , [ 'v' , par2list[0] , '*' ] , token );
				return true;
			}
			catch
			{
				return false;
			}
		else
			return true ;
	}

	async UnzipLaunch( zip2Dir : string , filetodecode : string , token: CancellationToken = CancellationToken.None)
	{
		await this.Exec( this.unzipPath , zip2Dir , [ 'x' , '-pp' , '-y' , filetodecode ] , token ) ;
	}

	async ExecUnzipHelper( zip2Dir : string , removeZipFiles: boolean , token: CancellationToken = CancellationToken.None)
	{
		const fileEntries = await ExtTools.archiveList( zip2Dir );
		if ( fileEntries.length > 0 )
		{
			let filetodecode = fileEntries.find( apath => path.extname(apath) === '.rar' ) ;
			if ( filetodecode === undefined )
				filetodecode = fileEntries[0] ;
			await this.UnzipLaunch( zip2Dir , filetodecode , token ) ;
			if ( removeZipFiles )
			{
				const fileEntriesAfter = await ExtTools.archiveList( zip2Dir );
				await Promise.all( fileEntriesAfter.map( safeUnlink ) ) ;
			}
		}
	}

	async ExecPar2Repair( par2Dir : string , removepar2files : boolean , token: CancellationToken = CancellationToken.None )
	{
		await this.ExecPar2RepairHelper( par2Dir , removepar2files , token );
	}

	async ExecUnzip( zip2Dir : string , removeZipFiles: boolean , token: CancellationToken = CancellationToken.None)
	{
		await this.ExecUnzipHelper( zip2Dir , removeZipFiles , token );
	}

	async ExecPar2Check( par2Dir : string , token: CancellationToken = CancellationToken.None)
	{
		return this.ExecPar2CheckHelper( par2Dir , token ) ;
	}

	static isRar( afile : string )
	{
		const extension = path.extname(afile).slice(1) ;
		return ['rar'].includes(extension) ||
			/[r]\d\d/.exec(extension) !== null ;
	}

	static isZip( afile : string )
	{
		const extension = path.extname(afile).slice(1) ;
		return ['zip'].includes(extension) ||
			/[z]\d\d/.exec(extension) !== null ;
	}

	static isArchive( afile : string )
	{
		const extension = path.extname(afile).slice(1) ;
		return ['rar','zip','7z'].includes(extension) ||
			/[rz]\d\d/.exec(extension) !== null ||
			/\d\d\d/.exec(extension) !== null;
	}

	static async readdirFullPath( adir : string )
	{
		return ( await afs.readdir(adir) ).map( afn => path.join(adir,afn) ) ;
	}

	static async par2List( par2Dir : string )
	{
		const fileEntries = await ExtTools.readdirFullPath(par2Dir) ;
		return fileEntries.filter( isPar2 ).sort( afile => - afile.length ) ;
	}

	static async archiveList( zip2Dir : string )
	{
		const fileEntries = await ExtTools.readdirFullPath(zip2Dir) ;
		return fileEntries.filter( ExtTools.isArchive ).sort() ;
	}
}

export class VoidExtTools extends ExtTools
{
	sleeppath : string ;

	constructor()
	{
		super();
		if ( process.platform === 'win32' )
			this.sleeppath = path.join( rootPath() ,'public' , '3rdparty' , 'sleep.exe' );
		else
			this.sleeppath = path.join( '/' , 'usr' , 'bin', 'sleep' );
	}

	async sleep()
	{
		await this.Exec( this.sleeppath , '.' , ['3'] , CancellationToken.None ) ;
	}

	async ExecPar2Repair( _par2Dir : string , _removepar2files : boolean , _token: CancellationToken = CancellationToken.None)
	{
	}

	async ExecPar2Check( _par2Dir : string , _token: CancellationToken = CancellationToken.None)
	{
		return true ;
	}

	async ExecUnzip( _zip2Dir : string , _removeZipFiles: boolean , _token: CancellationToken = CancellationToken.None )
	{
	}
}

export class WindowsProcessTools extends ExtTools implements IExtTools
{
	constructor()
	{
		super();
		if ( isOSWin64() )
		{
			this.par2Path = path.join( rootPath() ,'public', '3rdparty' , 'win64','phpar2.exe' );
			this.unzipPath = path.join( rootPath() ,'public' , '3rdparty' , 'win64' , '7z.exe' );
		}
		else
		{
			this.par2Path = path.join( rootPath() ,'public' , '3rdparty' , 'win32' , 'phpar2.exe' );
			this.unzipPath = path.join( rootPath() ,'public' , '3rdparty' , 'win32' , '7z.exe' );
		}
	}
}

export class LinuxProcessTools extends ExtTools implements IExtTools
{
	par2Path = path.join( '/usr' , 'bin' , 'par2' );
	unzipPath = path.join( '/usr' , 'bin' , '7z' );
}

export class DarwinProcessTools extends ExtTools implements IExtTools
{
	unrarPath : string ;

	constructor()
	{
		super();
		this.unzipPath = 'unzip' ;
		this.unrarPath = path.join( rootPath() ,'public' , '3rdparty' , 'darwin','unrar' );
		this.par2Path = path.join( rootPath() ,'public' , '3rdparty' , 'darwin','par2' );
	}

	async UnzipLaunch( zip2Dir : string , filetodecode : string , token: CancellationToken = CancellationToken.None)
	{
		if ( ExtTools.isRar( filetodecode ) )
			await this.Exec( this.unrarPath , zip2Dir , [ 'x' , '-pp' , '-y' , filetodecode ] , token ) ;
		else if ( ExtTools.isZip( filetodecode ) )
			await this.Exec( this.unzipPath , zip2Dir , [ '-Pp' , '-q' , filetodecode ] , token ) ;
	}
}

export class OutOfBandScheduler
{
	private hasMainTask = false ;
	private runningTasks : Promise<void>[] = [] ;
	private awaitingTask : ( () => Promise<void> )[] = [] ;

	private async decorateOOBTask( oobTask : Promise<void> ) : Promise<void>
	{
		const decoratedTask = (async () =>
		{
			try
			{
				await oobTask ;
			}
			finally
			{
				_.remove( this.runningTasks , (task) => task === decoratedTask );
			}
		})();
		return decoratedTask ;
	}

	private async decorateMainTask( mainTask : Promise<void> ) : Promise<void>
	{
		const decoratedTask = (async () =>
		{
			try
			{
				await mainTask ;
			}
			finally
			{
				this.hasMainTask = false ;
				_.remove( this.runningTasks , (task) => task === decoratedTask );
				if ( this.awaitingTask.length > 0 )
					this.runMainTask( this.awaitingTask.shift()! );
			}
		})();
		return decoratedTask ;
	}

	private runMainTask( mainTaskGen : () => Promise<void> )
	{
		this.hasMainTask = true ;
		this.runningTasks.push( this.decorateMainTask( mainTaskGen() ) ) ;
	}

	private runOOBTask( oobTaskGen : () => Promise<void> )
	{
		this.runningTasks.push( this.decorateOOBTask( oobTaskGen() ) ) ;
	}

	schedule( aTaskGen : () => Promise<void> , isOutOfBand : boolean )
	{
		if ( isOutOfBand )
			this.runOOBTask( aTaskGen ) ;
		else
			if ( this.hasMainTask )
				this.awaitingTask.push( aTaskGen );
			else
				this.runMainTask( aTaskGen ) ;
	}

	async shutdown()
	{
		await Promise.all(this.runningTasks);
	}
}