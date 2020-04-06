import * as _ from 'lodash';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra' ;
import { safeCast , TNzbConfig , Options } from '../src/shareddef' ;
import { loadJsonSync , replaceAll , ExtTools,rootPath , OutOfBandScheduler , setTimeoutAsync } from '../src/helpers';
import { NNTPConnection } from '../src/nntp';
import { testPath ,compareFiles, safeRmDirSync , configureLog, makeSafeTmpDir } from './testhelpers';

describe('API test: ', () =>
{	// tslint:disable: no-magic-numbers
	let tmpOutDir : string ;

	beforeEach( () =>
	{
		configureLog() ;
		tmpOutDir = makeSafeTmpDir();
	});

	afterEach( () => safeRmDirSync(tmpOutDir) );

	it('trivial test', () =>
	{
		//given
		const aval = 1;

		//when

		//then
		expect(aval).not.toEqual(0);
	});

	it('retrieve version from package', () =>
	{
		//given
		const afile = path.join( rootPath() , 'package.json' );

		//when
		// eslint-disable-next-line
		const version = JSON.parse( fs.readFileSync(afile).toString()).version as string;

		//then
		expect(version.length ).toBeGreaterThan(0);
	});

	it('lodashtrim from several chars', () =>
	{
		//given
		let strval = "\r\n\ntest\r\nstring\r\r\n";

		//when
		strval = _.trim(strval, "\r\n");

		//then
		expect(strval).toEqual("test\r\nstring");
	});

	it('buffer replaceAll', () =>
	{
		//given
		const strval = "test*ùp$";

		const body = Buffer.from(strval, 'binary');

		//when
		const strbody = body.toString('binary');

		//then
		expect(strbody).toEqual(strval);
	});

	[
		[ [] , [] , [] , [] ],
		[ [] , [4,5] , [6,7] , [] ],
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [] , [6,7] , [6,7,6,6,7,3,4,5,6,6,7,8,9,10] ],
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [6,6,7] , [6,7] , [6,7,6,7,3,4,5,6,7,8,9,10] ] ,
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [6,6,7] , [7,6,8,10] , [6,7,7,6,8,10,3,4,5,7,6,8,10,8,9,10] ] ,
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [1,2,3,4] , [6,7] , [6,7,6,6,7,3,4,5,6,6,7,8,9,10] ],
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [1,2,3,4] , [1,2,3,4] ] ,
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [6,7] , [7,6,8] , [7,6,8,6,7,6,8,3,4,5,6,7,6,8,8,9,10] ] ,
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [6] , [1,2] , [1,2,7,1,2,1,2,7,3,4,5,1,2,1,2,7,8,9,10] ] ,
		[ [6,7,6,6,7,3,4,5,6,6,7,8,9,10] , [9,10] , [3,4,5] , [6,7,6,6,7,3,4,5,6,6,7,8,3,4,5] ]
	].forEach( ( [abufArray,toreplaceArray,replacewithArray,expectedbufArray] ) =>
	it('replaceAll in buffer', () =>
	{
		//given
		const abuf = Buffer.from(abufArray) ;
		const expectedbuf = Buffer.from(expectedbufArray) ;
		const toreplace = Buffer.from(toreplaceArray) ;
		const replacewith = Buffer.from(replacewithArray) ;

		//when
		const resultbuf = replaceAll(abuf , toreplace , replacewith ) ;

		//then
		expect(resultbuf.equals(expectedbuf)).toBeTruthy();
	}));

	it('full range buffer convert to string and back are equals', () =>
	{
		//given
		const arr = _.range(0,255).concat(_.range(0,255)) ;
		const body = Buffer.from( arr );
		const str = body.toString('binary' );

		//when
		const bodyback = Buffer.from( str , 'binary' );

		//then
		expect(bodyback.equals(body)).toBeTruthy() ;
	});

	it( 'OutOfBandScheduler schedules many oob tasks but only one main task at a time' , async (done) =>
	{
		// given
		let mainTaskCurCount = 0 ;
		let mainTaskCount = 0 ;
		let OOBTaskCount = 0 ;
		const maintask = (num:number) => async () =>
		{
			expect( mainTaskCurCount ).toBeLessThan(1);
			mainTaskCurCount += 1 ;
			if ( num < 10 )
				sched.schedule( maintask(num * 10 ) , false );
			await setTimeoutAsync(30);
			expect( mainTaskCurCount ).toBeLessThanOrEqual(1);
			mainTaskCurCount -= 1 ;
			mainTaskCount += 1 ;
		};

		const oobtask = (num:number) => async () =>
		{
			expect( mainTaskCurCount ).toBeLessThanOrEqual(1);
			await setTimeoutAsync(10);
			OOBTaskCount += 1 ;
		};

		const sched = new OutOfBandScheduler();

		// when
		sched.schedule( oobtask(1) , true );
		sched.schedule( maintask(1) , false );
		sched.schedule( oobtask(2) , true );
		sched.schedule( oobtask(3) , true );
		sched.schedule( oobtask(4) , true );
		sched.schedule( maintask(2) , false );
		sched.schedule( oobtask(5) , true );
		sched.schedule( maintask(3) , false );

		// then
		await setTimeoutAsync(3000);
		await sched.shutdown() ;
		expect(mainTaskCurCount).toEqual(0);
		expect(mainTaskCount).toEqual(6);
		expect(OOBTaskCount).toEqual(5);
		done();
	} );

	it('invalid safeCast with invalid INzbConfig fails', () =>
	{
		//given
		const abadconf = {
			host : '',
			port : '5',
			secure : true,
			user : 'auser',
			password : 'apass',
			connTimeout : 5.7,
			downloadDir : "adir",
			connectionCount : '8',
			repairAndInflate : true,
			removePar2AndArchives : true,
			priorSmallNzb : "ok",
			recurseNzbDownload : true
		} ;

		//then
		expect( () => safeCast( abadconf , TNzbConfig ) ).toThrowError();
	});

	it('valid safeCast with INzbConfig passes', () =>
	{
		// given
		const agoodconf = {
			host : 'ahost',
			port : 5,
			secure : true,
			user : 'auser',
			password : 'apass',
			connTimeout : 500,
			downloadDir : "adir",
			connectionCount : 4,
			repairAndInflate : true,
			removePar2AndArchives : true,
			priorSmallNzb : true,
			recurseNzbDownload : true,
			removeSuspiciousDownloads:true
		} ;

		// when
		const aconf = safeCast( agoodconf , TNzbConfig );

		// then
		expect( aconf ).not.toBeNull() ;
	});

	it('par2 cmdline does nothing if no par', async () =>
	{
		// given
		const parfiledir = 'none2torepare' ;
		const srcDir = path.join( testPath() , parfiledir );
		const apool = ExtTools.create() ;

		// when
		await apool.ExecPar2Repair(srcDir,false);

		// then
		//no throw
	});

	it('nntp helper throw on unopened connection', async (done) =>
	{
		const conn = new NNTPConnection( { host : '' , port : 0 , secure : false , connTimeout:10_000 } );
		let anerror: any;
		try
		{
			await conn.group('php.doc.nl');
			const anarticle = await conn.body("<20020623201011.46714.qmail@pb1.pair.com>");
			await conn.end();
		}
		catch (error)
		{
			anerror = error;
		}
		expect(anerror instanceof Error).toBe(true);
		done();
	});

	it('nntp helper throw on bad host', async (done) =>
	{
		const conn = new NNTPConnection( { host : 'bidbid.com' , port : 0 , secure : false , connTimeout:3_000 } );
		let anerror: any;
		try
		{
			await conn.connect();
		}
		catch (error)
		{
			anerror = error;
		}
		expect(anerror instanceof Error).toBe(true);
		expect(conn.isConnected()).toBeFalsy();
		done();
	},10000);

	it('test nntp helper api on php.doc.nl', async (done) =>
	{
		const conn = new NNTPConnection({ host : 'news.php.net' , port : NNTPConnection.DEFAULT_NNTP_PORT , secure : false , connTimeout:10_000 });
		await conn.connect();
		await conn.group('php.doc.nl');
		const anarticle = await conn.body("<20020623201011.46714.qmail@pb1.pair.com>");
		await conn.end();
		expect(anarticle.length).toBeGreaterThan(1);
		done();
	},15000);


	[
		[ 'alt.binaries.ebook.french' , '<qPMZD.124880$kk4.86131@usenetxs.com>' , 'canard_demineur.ntx' ]
	].forEach( ( [ agroup , apostid , outFilename ] ) => {
	it(`download ${apostid} from newsserver group ${agroup} yields expected file ${outFilename}`, async (done) =>
	{
		// sorry to test you will have to provide your own news server and credentials
		const myconf = loadJsonSync( path.join( testPath() ,"persoconf.json" ) ) as Options ;

		const outFileNamePath = path.join( tmpOutDir, outFilename ) ;
		const expectedOutFilePath = path.join( testPath() , outFilename ) ;

		// given
		const conn = new NNTPConnection(
			{
				host : myconf.host ,
				user : myconf.user ,
				password : myconf.password ,
				port : NNTPConnection.DEFAULT_NNTP_PORT,//myconf.port ,
				secure : false , //myconf.secure
				connTimeout : 10_000
			});
		await conn.connect();
		await conn.group(agroup);
		const anarticle = await conn.body( apostid );
		await conn.end();
		fs.writeFileSync( outFileNamePath , anarticle );

		//then
		expect( compareFiles(outFileNamePath,expectedOutFilePath) ).toBe(true);
		done();
	},150000); });

	[
		[ 'par2torepare' , false ] ,
		[ 'par2nottorepare' , true ]
	].forEach( ( [ checkdir , expectedresult ] ) => {
	it('par2 cmdline check damaged file false', async () =>
	{
		// given
		const destDir = path.join( testPath() , checkdir as string );
		const apool = ExtTools.create() ;

		// when
		const result = await apool.ExecPar2Check(destDir);

		// then
		expect( result ).toEqual( expectedresult as boolean ) ;
	}, 100000 );});

	it('par2 cmdline repares damaged file', async () =>
	{
		// given
		const expectedFilename = 'Linux.Format.UK.TruePDF-December.2018.pdf' ;
		const srcDirFail = path.join( testPath() , 'par2torepare' );
		const srcDirOk = path.join( testPath() , 'par2repared' );
		const destDir = path.join( tmpOutDir , 'par2torepare' );
		fse.copySync( srcDirFail , destDir ) ;
		const apool = ExtTools.create() ;

		// when
		await apool.ExecPar2Repair(destDir,true);

		// then
		expect( compareFiles( path.join( srcDirOk , expectedFilename ) ,path.join( destDir , expectedFilename ) ) ).toBe(true);
		expect( ( await ExtTools.par2List(destDir ) ).length ).toEqual(0) ;
	}, 100000);

	it('par2 cmdline returns error if damaged file beyong reparable', async () =>
	{
		// given
		const parfiledir = 'par2torepare' ;
		const expectedFilename = 'Linux.Format.UK.TruePDF-December.2018.pdf' ;
		const srcDir = path.join( testPath() , parfiledir );
		const destDir = path.join( tmpOutDir , parfiledir );
		fse.copySync( srcDir , destDir ) ;
		fse.unlinkSync( path.join( destDir , expectedFilename ) ) ;
		const apool = ExtTools.create() ;

		// when
		let errorReturned = false ;
		let errorIsDefined = false ;
		try
		{
			await apool.ExecPar2Repair(destDir,true);
		}
		catch ( error )
		{
			errorReturned = true ;
			if ( error !== undefined )
				errorIsDefined = true;
		}

		// then
		expect(errorReturned).toBeTruthy();
		expect(errorIsDefined).toBeTruthy();
		expect( ( await ExtTools.par2List( destDir ) ).length ).toBeGreaterThan(0) ;
	}, 100000);

	[
		[ '2018-11-28 Auto Test Germany.pdf' , 'tounrar' ],
		['dcb-sos1116.pdf','multitounrar']
	].forEach( ( [ expectedFilename , partdir ] ) =>
	it( `7zip cmdline extract files to ${partdir}/${expectedFilename}`, async () =>
	{
		// given
		const srcDir = path.join( testPath() , partdir );
		const destDir = path.join( tmpOutDir , partdir );
		fse.copySync( srcDir , destDir ) ;
		fse.unlinkSync( path.join( destDir , expectedFilename ) ) ;
		const apool = ExtTools.create() ;

		// when
		await apool.ExecUnzip(destDir,true);

		// then
		expect( compareFiles( path.join( srcDir , expectedFilename ) ,path.join( destDir , expectedFilename ) ) ).toBe(true);
		expect( ( await ExtTools.archiveList( destDir )).length ).toEqual(0) ;
	}, 100000) );

	it('7zip cmdline protected file do not lock', async () =>
	{
		// given
		const srcDir = path.join( testPath() , 'tounrarprotected' );
		const destDir = path.join( tmpOutDir , 'tounrarprotectedtounrar' );
		fse.copySync( srcDir , destDir ) ;
		const apool = ExtTools.create() ;

		// when
		try
		{
			await apool.ExecUnzip(destDir,true);
		}
		catch
		{}

		// then
	}, 4000);
});
