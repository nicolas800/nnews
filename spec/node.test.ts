import * as path from 'path';
import * as fs from 'fs';
import * as xmljs from 'xml-js';
import * as _ from 'lodash';
import { CancellationError } from '../src/cancellation' ;
import { Options } from '../src/shareddef';
import { NZBFile, NzbGroup } from '../src/nzbprocess';
import { NNTPConnection, LimitedCountConnProvider } from '../src/nntp';
import { loadJsonSync, safeErrorMessage , isPar2 } from '../src/helpers';
import { compareFiles,testPath,setTimeoutP , makeFakeConnProvider ,makeFakeNNTPHelperWithShutdownFailure ,makeFakeNNTPHelperWithNoArticleFailure, safeRmDirSync , configureLog ,decodeToFile, makeFakeNzbReferential, makeSafeTmpDir } from './testhelpers';

describe('Node main service: ', () =>
{	// tslint:disable: no-magic-numbers
	let tmpOutDir ='' ;

	beforeEach( () =>
	{
		configureLog();
		tmpOutDir = makeSafeTmpDir();
	});

	afterEach( () => safeRmDirSync(tmpOutDir) );

	[
		[ 'example.yenc', 'example.pdf'] ,
		[ 'ds.vol000+001.par2.ntx', 'ds.vol000+001.par2'] ,
		[ 'test2.tst.ntx' , 'test2.tst' ]
	].forEach( ( [ inFile , outFile ] ) =>
	it( `valid yenc ${inFile} decode to file ${outFile}` , async () =>
	{
		//given
		const inFileName = path.join( testPath() , inFile ) ;
		const outFileName = path.join( tmpOutDir , outFile ) ;
		const expectedOutFileName = path.join( testPath() , outFile) ;
		const expectedSize = fs.statSync(inFileName).size ;
		const srcBuffer = fs.readFileSync( inFileName ) ;

		//when
		await decodeToFile( srcBuffer , outFileName , expectedSize ) ;

		//then
		expect( fs.statSync(outFileName).isFile() ).toBe(true) ;
		expect( compareFiles(outFileName,expectedOutFileName) ).toBe(true);
	}));

	it('valid yenc with parts decode to file', async () =>
	{
		//given
		const inFileName = path.join( testPath() , 'exampleybegin.yenc') ;
		const outFileName = path.join( tmpOutDir , "mybinary.dat" ) ;
		const expectedOutFileName = path.join( testPath() , "mybinary.dat" ) ;
		const srcBuffer = fs.readFileSync( inFileName ) ;
		const expectedSize = fs.statSync(expectedOutFileName).size ;

		//when
		await decodeToFile(srcBuffer , outFileName ,expectedSize) ;

		//then
		expect( fs.statSync(outFileName).isFile() ).toBe(true) ;
		expect( compareFiles(outFileName,expectedOutFileName) ).toBe(true);
	});

	it('NZBFile.decodeToFile with bad input yields zerod out file', async () =>
	{
		//given
		const inFileName = path.join( testPath() , 'Linux.Format.UK.nzb') ;
		const outFileName = path.join( tmpOutDir , "baddecoded" ) ;
		const srcBuffer = fs.readFileSync( inFileName ) ;
		const expectedSize = 128 ;
		let errorName = "" ;

		//when
		try
		{
			await decodeToFile(srcBuffer , outFileName , expectedSize ) ;
		}
		catch (error)
		{
			errorName = safeErrorMessage( error ) ;
		}

		// then
		expect( errorName.length ).toBeGreaterThan(0) ;
		const givenSize = fs.statSync( outFileName ).size ;
		expect( givenSize ).toEqual(expectedSize) ;
	});

	[
		[ "[Linux.Format.UK.TruePDF-December.2018] - 'Linux.Format.UK.TruePDF-December.2018.pdf' yEnc - 10.58 MB (1/33)" , "Linux.Format.UK.TruePDF-December.2018.pdf" ] ,
	 	[ "5UebZWW24gax32L.nzb (1/1)" , "5UebZWW24gax32L.nzb" ]
	].forEach( ( [insubject , expectedSubject ] ) =>
	it('extractFileNameFromSubject yields valid filename', () =>
	{
		//given

		//when
		const afilename = NZBFile.extractFileNameFromSubject( insubject );

		//then
		expect( afilename ).toEqual( expectedSubject ) ;
	}));


	it('decode nzb to object with xml-js', () =>
	{
		//given
		const abuffer = fs.readFileSync( path.join( testPath() ,"micro-1.3.3-linux.nzb" ) ) ;
		const strbuff = abuffer.toString('binary');

		//when
		const resObject = xmljs.xml2js(strbuff,{"compact": false});

		//then
		expect( typeof resObject ).toEqual('object') ;
	});

	[
		[ 'micro-1.3.3-linux.nzb' , 1 ] ,
		[ "Linux.Format.UK.nzb" , 7 ]
	].forEach( ( [ infile , numberOfOutFiles ] ) =>
	it(`FileEntry.Entries nzb ${infile} yields right count of ${numberOfOutFiles}`, () =>
	{
		//when
		const entries = NzbGroup.Entries( tmpOutDir , path.join( testPath() , infile as string));

		//then
		expect( entries.length ).toEqual( numberOfOutFiles as number) ;
	}));

	it('NZBFile cancel download', async (done) =>
	{
		// given
		const apool = makeFakeConnProvider() ;
		const inFileName = path.join( testPath() ,"SQL Server.nzb" ) ;

		// when
		const nzbGRp = NzbGroup.fromNZBFile(
			{ downloadDir: tmpOutDir , repairAndInflate: false , removePar2AndArchives: false , priorSmallNzb:false , recurseNzbDownload:false } ,
			inFileName
		) ;
		const loadPromise = nzbGRp.loadAllFiles(apool);
		await setTimeoutP(1000);
		try
		{
			nzbGRp.cancel();
			await loadPromise ;
			await apool.end();
		}
		catch (error)
		{
			if ( error instanceof Error )
			{
				if (error.name !== CancellationError.name)
					throw error;
			}
			else
				throw error;
		}

		//then
		expect( nzbGRp.entries.length ).toBeGreaterThan(0);
		done();
	});

	[
		/*[ 'micro-1.3.3-linux.nzb' , 'micro-1.3.3-linux64.tar.gz' ] ,*/
		[ 'dstest.nzb' , 'ds.vol000+001.par2' ]
	].forEach( ( [inFile,outFile] ) => {
	it(`download nzb : ${inFile} with authentication on real server yields ${outFile} `, async (done) =>
	{
		// sorry, in order to test, you will have to provide your own news server and credentials
		const myconf = loadJsonSync( path.join( testPath() ,"persoconf.json" ) ) as Options ;
		const myNewsServer = myconf.host ;
		const myUser = myconf.user ;
		const myPassword = myconf.password;
		const inFileName = path.join( testPath() , inFile ) ;
		const expectedOutFileName = path.join( testPath() , outFile ) ;

		// given
		const apool = new LimitedCountConnProvider( 1 , () => new NNTPConnection({
			host : myNewsServer ,
			user : myUser,
			password : myPassword ,
			secure : true ,
			connTimeout : 10_000 ,
			port : 563 //,debug:(msg:string) => console.log(msg)
			}) );

		// when
		const afileentry = NzbGroup.Entries( tmpOutDir,inFileName )[0];

		const outFileName = afileentry.filename ;

		await afileentry.load(apool);

		await apool.end();

		//then
		expect( afileentry.percentage() ).toEqual(100);
		expect( compareFiles(outFileName,expectedOutFileName) ).toBe(true);
		done();
	},30000);});

	[ makeFakeConnProvider() , makeFakeNNTPHelperWithShutdownFailure() , makeFakeNNTPHelperWithNoArticleFailure(1) ].forEach( ( apool ) => {
	it( `download nzb with authentication on fake server`, async (done) =>
	{
		// given
		const inFileName = path.join( testPath() ,"micro-1.3.3-linux.nzb" ) ;

		// when
		const afileentry = NzbGroup.Entries( tmpOutDir,inFileName)[0];
		const outFileName = afileentry.filename ;

		await afileentry.load(apool);
		await apool.end();

		//then
		expect( afileentry.percentage() ).toEqual(100);
		expect( fs.existsSync( outFileName ) ).toBe(true);
		done();
	});});

	it('NzbRef add file concat to existing and remove duplicate nzb', (done) =>
	{
		// given
		const aref = makeFakeNzbReferential(tmpOutDir);
		let filelist = ["SQL Server.nzb", "Linux.Format.UK.nzb" ];

		// when
		aref.addFileList( filelist.map(fn => path.join(testPath() , fn)));
		filelist = [ "Linux.Format.UK.nzb","micro-1.3.3-linux.nzb" ];
		aref.addFileList( filelist.map(fn => path.join(testPath() , fn)));

		//then
		expect( aref.nzbQueue.length ).toEqual(3);
		done();
	});

	it('download multiple nzb on fake provider yields files', async (done) =>
	{
		// given
		const apool = makeFakeConnProvider();
		const inFileName = path.join( testPath() ,"Linux.Format.UK.nzb" ) ;

		// when
		const nzbGRp = NzbGroup.fromNZBFile(
			{ downloadDir: tmpOutDir , repairAndInflate: false , removePar2AndArchives: false , priorSmallNzb:false , recurseNzbDownload:false } ,
			inFileName ) ;
		await nzbGRp.loadAllFiles( apool);
		await apool.end();

		//then
		expect( fs.readdirSync(path.join( tmpOutDir , "Linux.Format.UK") ).length ).toEqual(7);
		done();
	});

	it('split nzb with main and additionnal par2', () =>
	{
		const inFileName = path.join( testPath() ,"Linux.Format.UK.nzb" ) ;

		// when
		const nzbGRp = NzbGroup.fromNZBFile(
			{ downloadDir: tmpOutDir , repairAndInflate: false , removePar2AndArchives: false , priorSmallNzb:false , recurseNzbDownload:false } ,
			 inFileName ) ;

		//then
		expect( nzbGRp.mainnzb.filter( afile => isPar2( afile.filename ) ).length ).toEqual(1);
		expect( nzbGRp.addpar2.every( afile => isPar2( afile.filename ) ) ).toBeTruthy();

	});


	it('genRenderData renders data ok', () =>
	{
		// given
		const aref = makeFakeNzbReferential(tmpOutDir);
		aref.addFileList( ["SQL Server.nzb", "Linux.Format.UK.nzb", "micro-1.3.3-linux.nzb"]
			.map( fn => path.join(testPath(), fn)));

		// when
		const arenderData = aref.rendererData() ;

		// then
		expect( arenderData.items.length ).toEqual(3);
	});

	it('download article with NNTPConnection on news.php.net', async (done) =>
	{
		// given
		const conn = new NNTPConnection( { "host": 'news.php.net' , port : NNTPConnection.DEFAULT_NNTP_PORT , "secure":false , connTimeout:10_000} );

		// when
		await conn.connect( );
		await conn.group('php.doc.nl');
		const abody = await conn.body( "<20020623201011.46714.qmail@pb1.pair.com>" );
		await conn.end();
		done();

		//then
		expect(abody.toString('binary')).toEqual("This list is for discussing the translation at http://php.net/manual/nl/");
	});

});
