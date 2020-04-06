import * as path from 'path';
import * as url from 'url';
import * as _ from 'lodash';
import { app, BrowserWindow, ipcMain as ipc, Menu, dialog } from 'electron';
import { IpcMessage , WebSite } from './shareddef';
import { AppBase } from './appbase';
import { rootPath , ExtTools } from './helpers';
import { NNTPConnection } from './nntp';
import * as log from 'winston';
import { format } from 'logform';
import Axios from 'axios' ;

declare const appNewVersion : string ;

class Application extends AppBase
{
	mainWindow: Electron.BrowserWindow | undefined ;
	iconFileName = path.join( rootPath() , 'public' , '96x96.png' ) ;

	static getUserDataPath()
	{
		return app.getPath('home') ;
	}

	constructor()
	{
		super(
			path.join( Application.getUserDataPath(), '.nnews'),
			path.join( Application.getUserDataPath(), '.nnewsstate'),
			path.join( app.getPath('downloads'), 'nnews'),
			() => new NNTPConnection( this.config ) ,
			ExtTools.create()
		);
		if ( this.config.logLevel !== undefined )
		{
			log.configure(
			{
				level: this.config.logLevel ,
				transports:
				[
					new log.transports.Console( { handleExceptions: true } ),
					new log.transports.File( {  handleExceptions: true, filename:path.join( Application.getUserDataPath(), 'nnews.log') } )
				],
				format: format.combine(
					format.timestamp( { format:'DD-MM-YYYY HH:mm:ss' } ),
					format.align(),
					format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`) )
			} ) ;
			log.info( "nNews starting" );
		}
		if ( !app.requestSingleInstanceLock() )
			app.quit();
		else
		{
			app.on('second-instance', (event, commandLine, workingDirectory) =>
			{
				if ( this.mainWindow !== undefined )
				{
					this.addFileList( AppBase.parseCmdLine( commandLine ) ) ;
					if ( this.mainWindow.isMinimized() )
						this.mainWindow.restore() ;
					this.mainWindow.focus();
				}
			});
			app.on('ready', () => this.start());
		}
	}

	getCmdLine() : string[]
	{
		return process.argv;
	}

	async start()
	{
		try
		{
			const aresp = await Axios.get( `${WebSite}/version.js` , { timeout:2000 } );
			const content = aresp.data as string;
			eval(content);
			this.remoteVersion = appNewVersion ;
		}
		catch {}
		this.loadConfAndState();
		super.start();
	}

	send<T>( channel:string , content?:T )
	{
		if ( ! this.mainWindow!.isDestroyed() )
			this.mainWindow!.webContents.send(channel,content);
	}

	on<T>( channel:string , handler:( event: Electron.Event, _arg?: T) => void)
	{
		ipc.on( channel, handler) ;
	}

	showConfiDlg()
	{
		this.send(IpcMessage.ShowConfigDlg);
	}

	showMessageBox(message:string)
	{
		dialog.showMessageBox(
		{
			icon :  this.iconFileName as any,
			title : "NNews" ,
			buttons: ['Ok'],
			message: message
		} );
	}

	showOpenDialog()
	{
		const retval = dialog.showOpenDialog( this.mainWindow! ,
			{
				properties: ['openFile'] ,
				filters: [ { name: 'nzb', extensions: ['nzb'] } ]
			}) as string[] | undefined ;
		return retval !== undefined ? retval : [] ;
	}

	showAboutDialog()
	{
		const aboutdlg = new BrowserWindow(
			{ modal:true, icon: this.iconFileName , parent : this.mainWindow , width:650, height:420 });
		aboutdlg.setMenu( null );
		const indexPath = path.join( rootPath() , 'public' ,'about.html' );
		aboutdlg.loadURL( url.format({ pathname: indexPath, protocol: 'file:', slashes: true } ) );
	}

	showErrorBox( title:string , msg:string)
	{
		dialog.showErrorBox(title, msg);
	}

	createWindow(): void
	{
		const menu = Menu.buildFromTemplate([
			{
				label: 'File',
				submenu:
					[
						{ label: "Add NZB", "click": () => this.onAddFileDialog() },
						{ type: 'separator' },
						{
							label: 'Settings',
							click: () => this.showConfiDlg()
						},
						{ type: 'separator' },
						{ role: 'close', label: "Exit" }
					]
			},
			{
				label: 'Help',
				submenu:
					[
						{ label: "About" , click: () => this.showAboutDialog() }
						,{ role: 'toggledevtools', label: "Dev Tools" }
					]
			}
		]);
		this.mainWindow = new BrowserWindow( { width: this.appState.width , height: this.appState.height , icon: this.iconFileName } );
		const indexPath = path.join( rootPath() , 'public' , 'index.html');
		this.mainWindow.loadURL( url.format( { pathname: indexPath, protocol: 'file:',slashes: true } ) );
		Menu.setApplicationMenu(menu);
		this.mainWindow.webContents.once('dom-ready', () =>
		{
			if ( this.config.host === "" )
				this.showConfiDlg();
		});
		let isClosing : boolean = false ;
		this.mainWindow.on( 'close' , async () =>
		{
			[ this.appState.width , this.appState.height ] = this.mainWindow!.getSize();
			if ( !isClosing )
			{
				isClosing = true ;
				await this.quit();
				app.quit();
			}
		});
	}
}


const _ourApp = new Application();
