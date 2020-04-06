import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';
import { StageEnum ,INzbConfig } from '../src/shareddef';
import { saveJsonSync } from '../src/helpers';
import {  TestApp, testPath , safeRmDirSync , configureLog , makeFakeNzbReferential, makeSafeTmpDir } from './testhelpers';
import { IAppState } from '../src/appbase';

describe('Application: ', () =>
{
	let tmpOutDir ='' ;

	beforeEach( () =>
	{
		configureLog() ;
		tmpOutDir = makeSafeTmpDir();
	});

	afterEach( () => safeRmDirSync(tmpOutDir) );

	it('NzbReferential worker loop', async (done) =>
	{
		// given
		const aref = makeFakeNzbReferential(tmpOutDir);
		const filelist = ["Linux.Format.UK.nzb","micro-1.3.3-linux.nzb"];
		aref.addFileList( filelist.map(fn => path.join(testPath(), fn)));

		// when
		setTimeout( async () =>
		{
			await aref.shutdown();
			// then
			expect(fs.readdirSync(path.join(tmpOutDir, "Linux.Format.UK")).length).toBeGreaterThan(0);
			done();
		}, 3000);
	},15000);


	it( 'launch App creates new config', (done) =>
	{
		// given
		const newConfFilename = path.join(tmpOutDir, "testconf.json");
		const newStateFilename = path.join(tmpOutDir, "teststate.json");
		const _anapp = new TestApp(newConfFilename,newStateFilename, tmpOutDir);

		// when
		_anapp.start();
		_anapp.addFiles( path.join(testPath(), 'SQL Server.nzb'));
		_anapp.addFiles( path.join(testPath(), 'Linux.Format.UK.nzb'));

		// then
		setTimeout( async() =>
		{
			await _anapp.quit();
			expect(fs.existsSync(newConfFilename)).toBeTruthy();
			expect(fs.existsSync(newStateFilename)).toBeTruthy();
			done();
		}, 4000
		);
	});

	it( 'launch App uses exiting config yields launch remaining downloads' , (done) =>
	{
		// given
		const existingConf : INzbConfig = {
			downloadDir : tmpOutDir,
			host : "",
			user : undefined,
			password : undefined,
			port : 563,
			secure : true,
			connectionCount : 2,
			repairAndInflate : false,
			priorSmallNzb : true ,
			removePar2AndArchives : true,
			recurseNzbDownload : false,
			removeSuspiciousDownloads:false,
			connTimeout : 10_000,
			logLevel : undefined
		} ;
		const existingState : IAppState =
		{
			nzbFileList : [ { file : path.join( testPath(), "Linux.Format.UK.nzb"), status : StageEnum.downloading}] , width : 950 , height : 750
		} ;
		const existingConfFilename = path.join( tmpOutDir , "testconf.json" );
		const existingStateFilename = path.join(tmpOutDir, "teststate.json");
		saveJsonSync( existingConfFilename , existingConf );
		saveJsonSync( existingStateFilename , existingState ) ;
		const _anapp = new TestApp( existingConfFilename , existingStateFilename , tmpOutDir ) ;

		// when
		_anapp.start();

		// then
		setTimeout( async () =>
		{
			await _anapp.quit();
			expect( _anapp.lastGuiData.items.length ).toEqual(1);
			expect(fs.existsSync( path.join( tmpOutDir , "Linux.Format.UK","Linux.Format.UK.TruePDF-December.2018.pdf") ) ).toBeTruthy();
			done();
		} , 7000
		);
	} , 10000);


});
