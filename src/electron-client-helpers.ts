import _ from 'lodash';
import { ipcRenderer as ipc ,remote , dialog ,IpcRenderer } from 'electron';
import { IpcMessage , INzbConfig, IRenderNZBReferential } from './shareddef';

export function showMessageBox( type : string , message:string)
{
    try
    {
        remote.dialog.showMessageBox( { type : type , buttons: ['Ok'] , message : message } );
    }
    catch
    {}
}

export function showOpenDirDialog( callback?: (filePaths: string[], bookmarks: string[]) => void): string[]
{
    try
    {
        return remote.dialog.showOpenDialog({ properties: ["openDirectory" ] },callback );
    }
    catch
    {
        return [] ;
    }
}

export function send(channel: string, ...args: any[]): void
{
    try
    {
        ipc.send(channel , ...args );
    }
    catch
    {
    }
}

 function sendSync(channel: string, ...args: any[]): any
{
    try
    {
        return ipc.sendSync(channel , ...args );
    }
    catch
    {
        return undefined ;
    }
}

function on(channel: string, listener: Function) : IpcRenderer | undefined
{
    try
    {
        ipc.on(channel, listener);
    }
    catch
    {
        return undefined ;
    }
}


export function openExternal(url:string) : boolean
{
    try
    {
        return remote.shell.openExternal(url);
    }
    catch
    {
        return false ;
    }
}

export function testConnection( aconfig : INzbConfig )
{
    return sendSync( IpcMessage.TestConnection , aconfig ) as string ;
}

export function getVersion()
{
    return sendSync( IpcMessage.GetRemoteVersion ) as string ;
}

export function getConfig()
{
    return sendSync( IpcMessage.GetConfig ) as INzbConfig ;
}

export function setConfig( aconfig : INzbConfig )
{
    send(IpcMessage.SetConfig, aconfig );
}

export function getNzbRef()
{
    return sendSync( IpcMessage.GetNzbRef ) as IRenderNZBReferential ;
}

export function cancelDownload( item : string )
{
    send(IpcMessage.CancelDownload,item);
}

export function onShowconfig( handler : () => void)
{
    on(IpcMessage.ShowConfigDlg, handler );
}

export function onNzbUpdate( handler : (arg: IRenderNZBReferential) => void  )
{
    on(IpcMessage.NZBRefUpdate, (_event: Electron.Event, arg: IRenderNZBReferential) => handler( arg ) );
}

export function addNzbFile(filelist: string[] )
{
    send( IpcMessage.AddNzbFile , filelist );
}
