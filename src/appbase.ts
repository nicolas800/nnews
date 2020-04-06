import _ from 'lodash';
import { IpcMessage, INzbConfig, IRenderNZBReferential, StageEnum,safeCast,TNzbConfig , defConfig } from './shareddef';
import { NzbReferential } from './nzbprocess';
import { LimitedCountConnProvider, INNTPConnection, NNTPConnection } from './nntp';
import { loadJsonSync, saveJsonSync ,IExtTools, safeErrorMessage , isNzb } from './helpers';
import * as Electron from 'electron' ;
import { appVersion } from './version';

import * as t from 'io-ts';

declare const programTag : { gitTag : string , compilDate : string };

export const TAppState = t.interface(
	{
		nzbFileList : t.array( t.interface( { file : t.string , status : t.string } ) ) ,
		width : t.Integer ,
		height : t.Integer
	} ) ;

export type IAppState = t.TypeOf< typeof TAppState >;
//TODO : user reorder nzb donwload
//TODO: bugfix faulty.nzb
export abstract class AppBase
{
	configFile: string;
	stateFile: string;
	downloadPath: string;
	nntpctor: () => INNTPConnection;
	config: INzbConfig ;
	appState : IAppState ;
	pool: LimitedCountConnProvider = new LimitedCountConnProvider() ;
	processPool: IExtTools ;
	nzbref: NzbReferential = undefined as any;
	lastGuiData: IRenderNZBReferential = { items: [] };
	remoteVersion : string = appVersion.version ;

	constructor(configFile: string, stateFile:string , downloadPath: string, nntpctor: () => INNTPConnection,processPool : IExtTools )
	{
		this.config = defConfig(downloadPath) ;
		this.appState = this.defState() ;
		this.configFile = configFile;
		this.processPool = processPool ;
		this.stateFile = stateFile ;
		this.downloadPath = downloadPath;
		this.nntpctor = nntpctor;
		this.loadConfAndState();
	}

	defState() : IAppState
	{
		return { nzbFileList:[] , width: 950 , height: 750 };
	}

	loadConfAndState()
	{
		try
		{
			this.config = safeCast( loadJsonSync( this.configFile ) , TNzbConfig ) ;
			this.appState = safeCast( loadJsonSync( this.stateFile ) , TAppState ) ;
		}
		catch
		{
			this.config = defConfig(this.downloadPath);
			this.appState = this.defState() ;
		}
	}

	getCmdLine() : string[]
	{
		return [];
	}

	static parseCmdLine( cmdLine : string[] )
	{
		return cmdLine
			.filter( arg => !arg.startsWith('-') )
			.filter( isNzb );
	}

	addFileList( nzbFiles: string[] )
	{
		nzbFiles.forEach( afile =>
		{
			try
			{
				this.nzbref.addFile( afile );
			}
			catch (error)
			{
				this.showErrorBox("Load file error", safeErrorMessage( error ) );
			}
		} ) ;
		this.updateNzbGui();
		this.saveState();
	}

	addFiles( ...nzbFiles: string[] )
	{
		this.addFileList(nzbFiles);
	}

	onUpdateConfig( aconfig : object )
	{
		this.config = safeCast( aconfig , TNzbConfig );
		if (!this.nzbref.isDownloading())
			this.pool = new LimitedCountConnProvider(this.config.connectionCount, this.nntpctor );
		else
			this.showMessageBox("Configuration will be updated on restart");
		this.saveConf();
	}

	async testConnection( aconfig : object )
	{
		const safeconfig = safeCast( aconfig , TNzbConfig );
		try
		{
			if (!this.nzbref.isDownloading())
			{
				const aconn = new NNTPConnection( safeconfig ) ;
				await aconn.connect();
				await aconn.end();
			}
			else
				return "Can't test connection while downloading" ;
		}
		catch ( error )
		{
			return `Connection failed: ${error instanceof Error ? error.toString() : 'unkown' }` ;
		}
		return "Connection OK" ;
	}

	onAddFileDialog()
	{
		const files = this.showOpenDialog();
		if ( files.length > 0 )
			this.addFileList(files);
	}

	onDragAndDropFiles( fileList : string[])
	{
		this.addFileList( fileList.filter( afile => afile.endsWith(".nzb") )) ;
	}

	saveConf()
	{
		saveJsonSync(this.configFile, this.config);
	}

	saveState()
	{
		this.appState.nzbFileList = this.nzbref.nzbQueue
			.map(item => ({ file: item.nzbFile, status: item.stage }))
			.filter(item => ![StageEnum.cancelled, StageEnum.done].includes(item.status));
		saveJsonSync(this.stateFile, this.appState);
	}

	updateNzbGui()
	{
		const guiData = this.nzbref.rendererData();
		if (!_.isEqual(guiData, this.lastGuiData))
		{
			this.lastGuiData = guiData;
			this.send(IpcMessage.NZBRefUpdate, guiData);
		}
	}

	start(): void
	{ //TODO: cleanup tmp download files
		this.createWindow();
		this.pool = new LimitedCountConnProvider(this.config.connectionCount, this.nntpctor );
		this.nzbref = new NzbReferential( this.config , this.pool, this.processPool,() => this.updateNzbGui() );
		this.addFileList(this.appState.nzbFileList.map(el => el.file));
		this.addFileList( AppBase.parseCmdLine(this.getCmdLine() ) );
		this.on(IpcMessage.GetRemoteVersion, (event: Electron.Event ) => event.returnValue = this.remoteVersion );
		this.on(IpcMessage.GetNzbRef, (event: Electron.Event ) => event.returnValue = this.lastGuiData );
		this.on(IpcMessage.TestConnection , async (_event: Electron.Event, aconfig: INzbConfig) => { _event.returnValue = await this.testConnection( aconfig ); });
		this.on(IpcMessage.GetConfig, (event: Electron.Event ) => event.returnValue = this.config);
		this.on(IpcMessage.SetConfig, (_event: Electron.Event, aconfig: INzbConfig) => this.onUpdateConfig(aconfig));
		this.on(IpcMessage.AddNzbFile , (_event: Electron.Event, nzbFiles: string[] ) => this.onDragAndDropFiles(nzbFiles));
		this.on(IpcMessage.CancelDownload , (_event: Electron.Event,nzbToCancel:string) => this.onCancelDownload(nzbToCancel));
	}

	onCancelDownload( nzbToCancel: string ): void
	{
		this.nzbref.removeFile(nzbToCancel);
		this.saveState();
		this.updateNzbGui();
	}

	async quit()
	{
		this.saveConf();
		this.saveState();
		try
		{
			await this.nzbref.shutdown();
		}
		catch
		{}
	}

	// Electron dependent code implemented in derived class

	abstract on(channel: string, handler: (event: Electron.Event, _arg?: any) => void) : void ;

	abstract send<T>(channel: string, content?: T) : void ;

	abstract showMessageBox(_message: string) : void ;

	abstract showErrorBox(title: string, msg: string) : void ;

	abstract showOpenDialog(): string[] ;

	abstract createWindow(): void ;
}