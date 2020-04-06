import * as t from 'io-ts';

export enum StageEnum
{
	none = 'none',
	cancelled = 'cancelled',
	downloading = 'downloading',
	reparing = 'reparing',
	unzipping = 'unzipping',
	done = 'done'
}

export enum SeverityEnum
{
	info = 'info' , warning = 'warning' , error = 'error'
}

export class Stage
{
	stage: StageEnum = StageEnum.none;
	progress: number = 0;
}

export interface IRenderProgress
{
	stage: StageEnum;
	progression : number | undefined ;
	severity : SeverityEnum;
	message: string;
}

export interface IRenderNZBRItem
{
	progress: IRenderProgress;
	filename: string;
}

export interface IRenderNZB
{
	name: string;
	items: IRenderNZBRItem[];
	progress: IRenderProgress;
}


export interface IRenderNZBReferential
{
	items: IRenderNZB[];
}

export interface Options
{
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	password?: string;
	connTimeout: number;
}

export const TNzbConfig = t.type(
	{
		host : t.string ,
		port : t.refinement(t.Integer , n => n >= 0 ),
		secure : t.boolean,
		user : t.union([ t.string , t.undefined ] ) ,
		password : t.union([ t.string , t.undefined ] ),
		connTimeout : t.refinement(t.Integer , n => n >= 1 ),
		downloadDir : t.string,
		connectionCount : t.refinement(t.Integer , n => n >= 1 ),
		repairAndInflate : t.boolean,
		removePar2AndArchives : t.boolean,
		priorSmallNzb : t.boolean,
		recurseNzbDownload : t.boolean,
		removeSuspiciousDownloads : t.boolean ,
		logLevel : t.union([ t.string , t.undefined ] )
	} ) ;

export type INzbConfig = t.TypeOf< typeof TNzbConfig>;

export function defConfig( downloadPath : string = "" ) : INzbConfig
{
	return {
		downloadDir: downloadPath ,
		host: "",
		user:"",
		password:"",
		port: 563,
		secure: true,
		connTimeout:10000,
		connectionCount: 3,
		repairAndInflate:true,
		removePar2AndArchives:true,
		priorSmallNzb:true,
		recurseNzbDownload:true,
		removeSuspiciousDownloads:true,
		logLevel  : undefined
	};
}

export function safeCast< T extends t.Type<any> >( anopt:object , atype : T ) : t.TypeOf< T >
{
	const validation = atype.decode(anopt);
	if ( ! validation.isRight() )
		throw new Error( validation.toString() );
	return anopt ;
}

export enum IpcMessage
{
	SetConfig = 'setconfig',
	GetConfig = 'getconfig',
	GetNzbRef = 'getnzb',
	GetRemoteVersion = 'getremotever' ,
	NZBRefUpdate = 'nzbupdate',
	AddNzbFile = 'addnzb',
	CancelDownload = 'canceldownload',
	ShowConfigDlg = 'showconfig',
	TestConnection = 'testconn'
}

export const SupportEmail = 'nnews@sigma-solutions.fr';
export const WebSite = 'https://nnews.sigma-solutions.fr' ;