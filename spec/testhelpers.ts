import * as path from 'path';
import * as fs from 'fs';
import * as afs from 'async-file';
import * as fse from 'fs-extra' ;
import * as _ from 'lodash';
import * as util from 'util' ;
import * as log from 'winston';
import * as jsdom from 'jsdom'
import * as tmp from 'tmp' ;
import { INNTPConnection ,LimitedCountConnProvider, NNTPConnection, NNTPError } from '../src/nntp';
import { AppBase } from '../src/appbase';
import { INzbConfig } from '../src/shareddef';
import { VoidExtTools , rootPath, safeMkDirSync } from '../src/helpers';
import { NZBSegment, NzbReferential } from '../src/nzbprocess' ;

export function setupJSDOM()
{
	const dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>');
	(global as any).window = dom.window ;
	(global as any).document = dom.window.document;
	(global as any).navigator = dom.window.navigator;
	(global as any).Node = dom.window.Node;
}

export function configureLog()
{
	log.configure( { level: 'error' ,transports: [new log.transports.Console({ silent:true })] } ) ;
}
export function makeSafeTmpDir() : string
{
	const tmpOutDir = tmp.dirSync().name ;
	safeMkDirSync(tmpOutDir);
	return tmpOutDir;
}

export function testPath()
{
	return path.join(rootPath(), 'testfiles');
}

export const setTimeoutP = util.promisify(setTimeout);

export function safeRmDirSync(dirname: string)
{
	try
	{
		fse.rmdirSync( dirname );
	}
	catch
	{}
}

export function compareFiles(file1: string, file2: string): boolean
{
	try
	{
		const buf1 = fs.readFileSync(file1);
		const buf2 = fs.readFileSync(file2);
		return buf1.equals(buf2);
	}
	catch (error)
	{
		return false;
	}
}

export async function delay(timeout:number)
{
	return new Promise<void>(resolve => setTimeout(resolve,timeout));
}

export async function decodeToFile(sourceDataBin: Buffer, outFile: string , expectedSize : number )
{
	let abuffer = Buffer.alloc(0);
	try
	{
		abuffer = NZBSegment.decodeToBuffer(sourceDataBin , expectedSize) ;
	}
	catch (error)
	{
		abuffer = Buffer.alloc(expectedSize, 0);
		throw error;
	}
	finally
	{
		await afs.appendFile(outFile, abuffer , {"encoding":'binary'} );
	}
}

export class FakeNNTPHelper implements INNTPConnection
{
	articleCount = 0;
	curGroup = "";
	bodyContent: string;
	_isConnected: boolean = false;
	timeout = 5 ;
	isConnected(): boolean { return this._isConnected; }

	constructor(protoFile: string)
	{
		this.bodyContent = fs.readFileSync(protoFile).toString('binary');
	}

	async connect()
	{
		if (this.isConnected())
			throw new Error("already connected");
		await delay(this.timeout);
		this._isConnected = true;
	}

	async group(search: string): Promise<void>
	{
		if (!this.isConnected())
			throw new Error("not connected");
		this.curGroup = search;
		return delay(this.timeout);
	}

	async body(_articleId: string): Promise<Buffer>
	{
		if (!this.isConnected())
			throw new Error("not connected");
		this.articleCount += 1;
		await delay(this.timeout);
		return Buffer.from( this.bodyContent , 'binary' );
	}

	async end(): Promise<void>
	{
		if (!this.isConnected())
			throw new Error("not connected");
		await delay(this.timeout);
	}
}

export class FakeNNTPHelperWithShutdownFailure extends FakeNNTPHelper
{
	async body( anArticleId: string): Promise<Buffer>
	{
		const retval = await super.body( anArticleId );
		this._isConnected = false ;
		return retval ;
	}

	async end(): Promise<void>
	{
		this._isConnected = false ;
		await delay(this.timeout);
	}
}

export class NNTPHelperWithNoArticleFailure implements INNTPConnection
{
	inner : INNTPConnection ;

	failureAfterCounter : number ;

	constructor( aconn : INNTPConnection , failureAfterCounter : number )
	{
		this.inner = aconn ;
		this.failureAfterCounter = failureAfterCounter;
	}

	isConnected(): boolean
	{
		return this.inner.isConnected();
	}

	async connect(): Promise<void>
	{
		return this.inner.connect();
	}

	async group(search: string): Promise<void>
	{
		return this.inner.group(search);
	}

	async body( anArticleId: string): Promise<Buffer>
	{
		if ( this.failureAfterCounter === 0 )
		{
			await delay(100);
			throw new NNTPError( NNTPError.NNTPCODE_NOSUCH_ARTICLE , "FakeNNTPHelperWithNoFoundFailure" );
		}
		this.failureAfterCounter -= 1 ;
		return this.inner.body(anArticleId);
	}

	async end(): Promise<void>
	{
		return this.inner.end();
	}
}

export function makeFakeConnProvider()
{
	return new LimitedCountConnProvider( 2 , () => new FakeNNTPHelper( path.join( testPath(), 'dummy.txt.yenc' ) ) ) ;
}

export function makeFakeNNTPHelperWithShutdownFailure()
{
	return new LimitedCountConnProvider( 1 , () => new FakeNNTPHelperWithShutdownFailure( path.join( testPath(), 'dummy.txt.yenc' ) ) ) ;
}

export function makeFakeNNTPHelperWithNoArticleFailure( failureAfterCounter : number)
{
	return new LimitedCountConnProvider( 1 , () => new NNTPHelperWithNoArticleFailure(
		new FakeNNTPHelperWithShutdownFailure( path.join( testPath(), 'dummy.txt.yenc' ) ),failureAfterCounter) ) ;
}

export function makeFakeNzbReferential(downloadDir:string)
{
	return new NzbReferential(
		{ downloadDir , repairAndInflate: false , removePar2AndArchives: false , priorSmallNzb:false , recurseNzbDownload:false } ,
		makeFakeConnProvider() ,new VoidExtTools() ) ;
}

export class TestApp extends AppBase
{
	tmpOutDir: string;

	constructor(configFile: string, stateFile: string, tmpOutDir: string)
	{
		super(configFile, stateFile, tmpOutDir, () => new FakeNNTPHelper(path.join(testPath(), 'dummy.txt.yenc')),new VoidExtTools());
		this.config.recurseNzbDownload = false ;
		this.tmpOutDir = tmpOutDir;
	}

	defConf() : INzbConfig
	{
		return {
			downloadDir : this.downloadPath,
			host : "",
			user : "",
			password : "",
			port : 563,
			secure : true,
			connectionCount : 2,
			repairAndInflate : true,
			removePar2AndArchives : true,
			priorSmallNzb : true,
			recurseNzbDownload : false
		} as any ;
	}

	start(): void
	{
		this.loadConfAndState();
		this.config.downloadDir = this.tmpOutDir;
		super.start();
	}

	on(channel: string, handler: (event: Electron.Event, _arg?: any) => void)
	{ }

	send<T>(channel: string, content?: T)
	{ }

	showMessageBox(_message: string)
	{
	}

	showErrorBox(title: string, msg: string)
	{ }

	showOpenDialog(): string[]
	{
		return [];
	}

	createWindow(): void
	{
	}
}