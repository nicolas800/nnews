import * as fs from 'fs';
import * as afs from 'async-file';
import * as xmljs from 'xml-js';
import * as path from 'path';
import * as _ from 'lodash';
import sanitize from 'sanitize-filename' ;
import * as log from 'winston';
const checkDiskSpace = require('check-disk-space') ;
import { StageEnum, IRenderNZBReferential, IRenderProgress, SeverityEnum } from './shareddef';
import { IExtTools ,searchCrLf ,safeMkDirSync , safeErrorMessage,setTimeoutAsync , OutOfBandScheduler , isPar2 , isNzb } from './helpers' ;
import { INntpConnectionProvider, INNTPConnection, LimitedCountConnProvider, NNTPError } from './nntp';
import { CancellationToken, CancellationTokenSource, CancellationError } from './cancellation';



export interface INzbRefConfig
{
	downloadDir: string ;
	repairAndInflate: boolean ;
	removePar2AndArchives: boolean;
	priorSmallNzb:boolean;
	recurseNzbDownload:boolean;
}

export type ProgressNotifyer = (newprogres:ProgressiveItem) => void;

export class ProgressiveItem
{
	progressNotifyer: ProgressNotifyer ;
	stage: StageEnum = StageEnum.none;
	num: number = 0;
	denum: number = 0;
	message: string = "";
	severity = SeverityEnum.info ;

	constructor( progressCb: ProgressNotifyer = () => {})
	{
		this.progressNotifyer = progressCb ;
	}

	percentage() : number | undefined
	{
		if ( this.denum === 0 )
			return this.stage === StageEnum.downloading ? 0 : undefined ;
		else
			return this.stage === StageEnum.done ? 100 : Math.round(100 * (this.num / this.denum)) ;
	}

	setCallback( progressCb: ProgressNotifyer = () => {} )
	{
		this.progressNotifyer = progressCb ;
	}

	setStage( newStage: StageEnum )
	{
		if ( this.stage !== newStage )
		{
			this.stage = newStage ;
			this.severity = SeverityEnum.info ;
			this.message = '' ;
			if ( this.stage === StageEnum.done )
			{
				if ( this.denum === 0 )
					this.denum = 1 ;
				this.num = this.denum ;
			}
			else
			{
				this.num = 0;
				this.denum = 0;
			}
			this.progressNotifyer(this);
		}
	}

	setMessage( message:string , severity:SeverityEnum)
	{
		if ( this.message !== message || this.severity !== severity )
		{
			this.message = message ;
			this.severity = severity ;
			this.progressNotifyer(this);
		}
	}

	setProgress( newProgress : number )
	{
		if ( this.num !== newProgress )
		{
			this.num = newProgress ;
			this.progressNotifyer(this);
		}
	}

	addProgress( newProgressIncr : number )
	{
		if ( newProgressIncr !== 0 )
		{
			this.num += newProgressIncr ;
			this.progressNotifyer(this);
		}
	}

	setDenum( newDenum : number )
	{
		this.denum = newDenum ;
	}

	toIrdProgress(): IRenderProgress
	{
		const retval = { progression: this.percentage() , stage: this.stage , message: this.message , severity : this.severity } ;
		return retval;
	}
}

export class NZBSegment
{
	readonly name: string;
	readonly byte: number;
	readonly order: number;
	readonly group : string ;
	readonly filename : string ;

	constructor( name: string , byte: number , order: number , group : string , filename : string )
	{
		this.name = name;
		this.byte = byte;
		this.order = order ;
		this.group = group ;
		this.filename = filename ;
	}

	static equals = 61;
	static cr = 13;
	static lf = 10;
	static escapeOffset = 64 ;
	static regularOffset = 42 ;
	static regularOffsetModulo = (NZBSegment.regularOffset - 256 ) ;

	static decodeYEnc(source: Buffer): Buffer
	{
		let isEscaped = false;
		const output: number[] = [];
		for (let value of source)
		{
			if (value === NZBSegment.cr || value === NZBSegment.lf)
				continue;
			// if we're an "=" and we haven't been flagged, set flag
			if (value === NZBSegment.equals && !isEscaped)
			{
				isEscaped = true;
				continue;
			}
			if (isEscaped)
			{
				isEscaped = false;
				value = value - NZBSegment.escapeOffset ;
			}
			if (value < NZBSegment.regularOffset )
				value = value - NZBSegment.regularOffsetModulo ;
			else
				value = value - NZBSegment.regularOffset;
			output.push(value);
		}
		return Buffer.from(output);
	}

	static genTmpFileName( filename : string , order : number ) : string
	{
		return `${filename}.nnews${order}` ;
	}

	async download( connPool: INntpConnectionProvider , token: CancellationToken )
	{
		let conn: INNTPConnection | undefined;
		var anarticleBody : Buffer ;
		try
		{
			token.ThrowIfCanceled();
			conn = await connPool.getConn();
			token.ThrowIfCanceled();
			await conn.group( this.group );
			anarticleBody = await conn.body( this.name);
			return anarticleBody ;
		}
		finally
		{
			if (conn !== undefined)
				connPool.release(conn);
		}
	}

	async downloadRetry( connPool: INntpConnectionProvider , token: CancellationToken , count = 2 ) : Promise<Buffer>
	{
		if ( count > 1 )
			try
			{
				return await this.download( connPool , token ) ;
			}
			catch ( error )
			{
				// eslint-disable no-magic-numbers
				log.error( `loadSegment failed ${path.basename(this.filename)} ` , error );
				if ( error instanceof NNTPError && !error.mayRetry() )
					throw error;
				else
				{
					log.warn( `retrying loading segment ${path.basename(this.filename)}` );
					await setTimeoutAsync( 500 ) ;
					return this.downloadRetry( connPool , token , count - 1 );
				}
			}
		else
			throw new Error( `loadSegment failed ${path.basename(this.filename)} after retry` );
	}

	static decodeToBuffer(sourceDataBin: Buffer, expectedSize : number) : Buffer
	{
		try
		{
			let sourceData = sourceDataBin.toString( 'binary' );
			const rxYBegin = /=ybegin\s+line=(\d+)\s+size=(\d+)\s+name=(.*)/; //TODO : individual regex
			const rxYBeginWithParts = /=ybegin\s+part=(\d+)\s+line=(\d+)\s+size=(\d+)\s+name=(.*)/;
			const rxYPart = /=ypart\s+begin=(\d+)\s+end=(\d+)/;
			const rxYend = /=yend\s+size=(\d+)/;
			const rxYendWithParts = /=yend\s+size=(\d+)\s+part=(?:\d+)/;
			sourceData = _.trimStart(sourceData, "\r\n");
			const firstLineIndex = searchCrLf(sourceData);
			const lastLineIndex = sourceData.lastIndexOf("=yend");
			if (firstLineIndex < 0 || lastLineIndex < 0)
				throw Error("invalid block");
			const ybeginLine = sourceData.substring(0, firstLineIndex);
			const yendLine = sourceData.substring(lastLineIndex);
			let content = sourceData.substring(firstLineIndex + 1, lastLineIndex);
			let sizeStart: string, sizeEnd: string;
			let ypartLine: string;
			if (content.startsWith("=ypart"))
			{
				const secondLineIndex = searchCrLf(content);
				ypartLine = content.substring(0, secondLineIndex);
				content = content.substring(secondLineIndex + 1, lastLineIndex);
				//[, , ,] = rxYBeginWithParts.exec(ybeginLine)!;
				[, , sizeStart] = rxYPart.exec(ypartLine)!;
				[, sizeEnd] = rxYendWithParts.exec(yendLine)!;
			}
			else
			{
				[, , sizeStart] = rxYBegin.exec(ybeginLine)!;
				[, sizeEnd] = rxYend.exec(yendLine)!;
			}
			const decoded = NZBSegment.decodeYEnc(Buffer.from(content, 'binary'));
			return decoded ;
		}
		catch ( error )
		{
			const reterr = new Error( `Parsing buffer: ${safeErrorMessage(error)}` ) ;
			log.error( reterr.message );
			throw reterr ;
		}
	}
}

export class NZBFile extends ProgressiveItem
{
	readonly filename: string;
	segmentsDone: Readonly< NZBSegment >[] ;
	segmentsToRead: Readonly< NZBSegment >[] ;

	get basename():string {
        return path.basename(this.filename);
	}

	constructor( file: string, rosegments: ReadonlyArray< Readonly< NZBSegment > > )
	{
		super();
		this.filename = file ;
		const segments = [...rosegments].sort((a, b) => a.order - b.order);
		if ( fs.existsSync(this.filename) )
		{
			this.segmentsToRead = [] ;
			this.segmentsDone = segments ;
			this.setStage( StageEnum.done ) ;
		}
		else
		{
			const previousOrder = NZBFile.getOrderFromFile( this.filename ) ;
			this.segmentsToRead = segments.slice( previousOrder ) ;
			this.segmentsDone = segments.slice( 0 ,previousOrder) ;
			this.setStage( StageEnum.downloading ) ;
		}
		this.setDenum( segments.map(aseg => aseg.byte).reduce((acc, asegbyte) => acc + asegbyte) ) ;
	}

	static extractFileNameFromSubject(subject: string): string
	{
		let retFileName = subject ;
		let regres = /["'](.*)["']/.exec(subject);
		if (regres !== null)
			retFileName = regres[1];
		else
		{
			regres = /(.*)["']/.exec(subject); // remove trailing ' or "
			if (regres !== null)
				retFileName = regres[1];
			regres = /(.*)\s+\(.*\)\s*$/.exec(subject); // remove trailing '(x/y)'
			if (regres !== null)
				retFileName = regres[1];
		}
		retFileName = retFileName.trim();
		retFileName = sanitize( retFileName );
		return retFileName ;
	}

	static getOrderFromFile( filename:string )
	{
		const fileregex = /\.nnews(\d+)/ ;
		const afile = fs.readdirSync( path.dirname(filename) ).find( anent =>
			fileregex.exec( anent ) !== null && anent.startsWith( path.basename( filename ) ) ) ;
		if ( afile !== undefined )
		{
			const rxres = fileregex.exec( afile ) as RegExpExecArray ;
			return parseInt( rxres[1] ) ;
		}
		else
			return 0 ;
	}

	private async loadSegment(connPool: INntpConnectionProvider, token: CancellationToken )
	{
		token.ThrowIfCanceled();
		const segment = this.segmentsToRead.shift()!;
		this.segmentsDone.push(segment);
		const prevFilename = NZBSegment.genTmpFileName( this.filename , segment.order - 1 ) ;
		const newFilename = NZBSegment.genTmpFileName( this.filename , segment.order ) ;
		let abuffer = Buffer.alloc(0);
		try
		{
			abuffer = await segment.downloadRetry( connPool , token ) ;
			abuffer = NZBSegment.decodeToBuffer( abuffer , segment.byte ) ;
		}
		catch (error)
		{
			if ( error instanceof CancellationError )
				throw error;
			abuffer = Buffer.alloc( segment.byte );
			this.setMessage( `error decoding part ${path.basename(this.filename)}, reason: ${safeErrorMessage(error)}` , SeverityEnum.error ) ;
		}
		await afs.appendFile( prevFilename , abuffer , {"encoding":'binary'} );
		await afs.rename( prevFilename , newFilename );
		this.addProgress( segment.byte );
	}

	public async load( connPool: INntpConnectionProvider , token: CancellationToken = CancellationToken.None )
	{
		while ( this.segmentsToRead.length > 0 )
			await this.loadSegment(connPool , token);
		await afs.rename( NZBSegment.genTmpFileName( this.filename , this.segmentsDone.length ) , this.filename );
		this.setStage(StageEnum.done);
	}
}

export class NzbGroup extends ProgressiveItem
{
	readonly config : INzbRefConfig;
	readonly nzbFile: string;

	mainnzb : NZBFile[];
	addpar2 : NZBFile[];
	tokenSource = new CancellationTokenSource() ;

	static nameFromFilename( filename : string )
	{
		return path.basename( filename , '.nzb' );
	}

	get entries()
	{
		return this.mainnzb.concat( this.addpar2 );
	}

	get name(): string
	{
		return NzbGroup.nameFromFilename(this.nzbFile);
	}

	get downloadDir() : string
	{
		return path.join( this.config.downloadDir, this.name );
	}

	constructor( config : INzbRefConfig , nzbFile: string, progressCb: ProgressNotifyer | undefined )
	{
		super();
		this.config = Object.freeze(config) ;
		this.nzbFile = nzbFile;
		safeMkDirSync(this.downloadDir);
		this.setCallback(progressCb) ;
		const entries = NzbGroup.Entries( this.downloadDir , nzbFile);
		[ this.mainnzb , this.addpar2 ] = NzbGroup.splitEntries( entries );
		this.denum = this.totalBytes();
		entries.forEach( anzfFile =>
		{
			anzfFile.setCallback( () =>
			{
				this.setProgress( this.downloadedBytes() );
				this.setMessage( anzfFile.message , anzfFile.severity ) ;
			} );
		} );
	}

	static Entries( downloadDir: string, nzbFile: string ): NZBFile[]
	{
		const findSubTag = (element: xmljs.Element, tagName: string): xmljs.Element =>
			element.elements!.find(e => e.name !== undefined && e.name.toLowerCase() === tagName.toLowerCase())!;
		const strbuff = fs.readFileSync(nzbFile).toLocaleString();
		const resObject = xmljs.xml2js(strbuff, { compact : false }) as xmljs.Element;
		return findSubTag(resObject, "nzb").elements!.map( item =>
			{
				const group = (findSubTag(item, "groups").elements![0].elements![0].text) as string ;
				const filename = path.join(downloadDir, NZBFile.extractFileNameFromSubject(item.attributes!.subject as string) );
				return new NZBFile(
					filename,
					findSubTag(item, "segments").elements!.map( e => new NZBSegment(
						e.elements![0].text as string ,
						Number.parseInt(e.attributes!.bytes as string),
						Number.parseInt(e.attributes!.number as string),
						group ,
						filename )
					)
				) ;
			}
		).sort( ( a , b ) => a.filename.localeCompare( b.filename ) );
	}

	public static fromNZBFile( config : INzbRefConfig , nzbFile: string , progressCb: ProgressNotifyer | undefined = undefined ) : NzbGroup
	{
		try
		{
			return new NzbGroup( config , nzbFile , progressCb );
		}
		catch (error)
		{
			const errmsg = `Can't open file ${nzbFile}` ;
			log.error( `Function fromNZB : ${errmsg}: ` , safeErrorMessage(error) );
			throw new Error(errmsg) ;
		}
	}

	public static splitEntries( entries:NZBFile[] )
	{
		const mainEntries = entries.filter( afile => ! isPar2(afile.filename ) );
		const firstpar2 = entries.find( afile => isPar2(afile.filename ) ) ;
		if ( firstpar2 !== undefined )
			mainEntries.push(firstpar2);
		const additionalPar2 = _.difference( entries , mainEntries );
		return [mainEntries,additionalPar2];
	}

	downloadedBytes()
	{
		return this.entries.map( aseg => aseg.num ).reduce((acc, totalBytes) => acc + totalBytes);
	}

	totalBytes()
	{
		return this.entries.map( aseg => aseg.denum ).reduce((acc, totalBytes) => acc + totalBytes) ;
	}

	async loadFiles( connPool: INntpConnectionProvider , fileList : NZBFile[] )
	{
		this.setStage( StageEnum.downloading ) ;
		this.setDenum( this.totalBytes() );
		const entries = _.intersection( fileList , this.entries.filter((anzbFile) => anzbFile.stage !== StageEnum.done) ) ;
		await Promise.all( _.range(0, connPool.total() ).map( async () =>
		{
			let anzbEntry : NZBFile | undefined ;
			while ( ( anzbEntry = entries.shift() ) !== undefined )
				await anzbEntry.load( connPool , this.tokenSource.token ) ;
				//TODO: check suspicious downloads
		} ) ) ;
	}

	async processRecurseNZB( addNzbFct : ( afile : string) => void )
	{
		try
		{
			const dirents = (await afs.readdir( this.downloadDir )).filter( afile => !isPar2(afile) );
			if ( dirents.length === 1 && isNzb( dirents[0] ) )
			{
				const anzbfn = path.join( this.downloadDir , dirents[0] ) ;
				const anzbfnmod = `${anzbfn}_recurse` ;
				await afs.rename( anzbfn , anzbfnmod );
				addNzbFct( anzbfnmod ) ;
			}
		}
		catch (error)
		{
			log.error( "Function processRecurseNZB: " , error );
		}
	}

	public async loadAllFiles( connPool: INntpConnectionProvider )
	{
		await this.loadFiles(connPool,this.entries);
	}

	public hasErrors()
	{
		return this.entries.some( anzbfile => anzbfile.severity === SeverityEnum.error ) ;
	}

	public async process( connPool: INntpConnectionProvider , processPool : IExtTools , addNzbFct : ( afile : string) => void )
	{
		try
		{
			if (this.stage !== StageEnum.none )
				return;
			// eslint-disable-next-line
			const diskSpace = (await checkDiskSpace( this.downloadDir )).free as number ;
			if ( diskSpace < this.totalBytes() )
				throw new Error( `Not enough disk space for ${this.name}` );
			await this.loadFiles( connPool , this.mainnzb );
			if ( this.config.repairAndInflate )
			{
				if ( this.hasErrors() || ( ! await processPool.ExecPar2Check( this.downloadDir , this.tokenSource.token ) ) )
				{	//TODO : report checking step
					await this.loadFiles( connPool , this.addpar2 );
					this.setStage( StageEnum.reparing );
					await processPool.ExecPar2Repair( this.downloadDir, this.config.removePar2AndArchives , this.tokenSource.token ) ;
				}
				this.setStage( StageEnum.unzipping );
				await processPool.ExecUnzip( this.downloadDir , this.config.removePar2AndArchives , this.tokenSource.token ) ;
			}
			else
				await this.loadFiles( connPool , this.addpar2 );
			this.setStage( StageEnum.done );
			if ( this.config.recurseNzbDownload )
				await this.processRecurseNZB( addNzbFct );
		}
		catch ( error )
		{
			if ( ! (error instanceof CancellationError ) )
				this.setMessage( safeErrorMessage( error ) , SeverityEnum.error ) ;
			else
				this.setStage(StageEnum.cancelled);
			throw error;
		}
	}

	cancel()
	{
		if ( this.stage !== StageEnum.done )
		{
			this.tokenSource.cancel();
			this.stage = StageEnum.cancelled ;
		}
	}
}

export class NzbReferential
{
	static readonly smallNzbByteSize = 5_000_000 ;
	connPool: INntpConnectionProvider ;
	processPool : IExtTools ;
	readonly config : INzbRefConfig;
	public nzbQueue: Array<NzbGroup> = new Array();
	nzbScheduler = new OutOfBandScheduler();
	tokenSource = new CancellationTokenSource();
	onUpdate: () => void;

	public constructor( config : INzbRefConfig , connPool: INntpConnectionProvider = new LimitedCountConnProvider()
		, processPool : IExtTools , onUpdate: () => void = () => { } )
	{
		this.onUpdate = onUpdate ;
		this.connPool = connPool ;
		this.processPool = processPool ;
		this.config = { ...config } ;
		safeMkDirSync(this.config.downloadDir);
	}

	isDownloading(): boolean
	{
		return this.nzbQueue.some(agrp => agrp.stage === StageEnum.downloading);
	}

	public addFile( afile : string )
	{
		if ( this.nzbQueue.every( agrp => NzbGroup.nameFromFilename(afile) !== agrp.name) )
		{
			const agrp = NzbGroup.fromNZBFile( this.config , afile, this.onUpdate ) ;
			this.nzbQueue = this.nzbQueue.concat( agrp );
			this.nzbScheduler.schedule( () => agrp.process( this.connPool , this.processPool , (anzbfn) => this.addFile( anzbfn ) ) ,
				this.config.priorSmallNzb && agrp.totalBytes() < NzbReferential.smallNzbByteSize ) ;
		}
	}

	public addFileList( afilelist : string[] )
	{
		for ( const afile of afilelist )
			this.addFile(afile);
	}

	removeFile(nzbToRemove: string): any
	{
		const anzbToRemove = this.nzbQueue.find( anzb => anzb.name === nzbToRemove ) ;
		if ( anzbToRemove !== undefined )
		{
			_.remove( this.nzbQueue , anzbToRemove) ;
			anzbToRemove.stage = StageEnum.cancelled ;
			anzbToRemove.cancel();
		}
	}

	public async shutdown()
	{
		try
		{
			for (const anzb of this.nzbQueue )
				anzb.cancel();
			this.tokenSource.cancel();
			await this.nzbScheduler.shutdown();
			await this.connPool.end();
			this.processPool.shutdown() ;
		}
		catch (error)
		{
			if ( error instanceof Error && error.name !== CancellationError.name)
				throw error;
		}
	}
//TODO : improve error msg display
	public rendererData(): IRenderNZBReferential
	{
		return {
			items: this.nzbQueue.map( nzbgrp =>
			({
				name: nzbgrp.name,
				items: nzbgrp.entries.map( anzb => ({ progress : anzb.toIrdProgress(), filename : anzb.basename } ) ),
				progress : nzbgrp.toIrdProgress()
			})
			)
		};
	}
}
