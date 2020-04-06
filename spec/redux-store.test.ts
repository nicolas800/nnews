import * as path from 'path';
import * as _ from 'lodash';
import { store, nzbRefActions } from '../src/redux-store';
import { testPath,configureLog, makeFakeNzbReferential, makeSafeTmpDir } from './testhelpers';

describe('Redux store: ', () =>
{
	let tmpOutDir ='' ;

	beforeEach( () =>
	{
		configureLog();
		tmpOutDir = makeSafeTmpDir();
	});

	it( 'Empty store ok' ,  () =>
	{
		//given

		//when
		const astate = store.getState();

		//then
		expect( astate.displayAdvancedConfig ).toBeFalse() ;
	});

	it( 'Update store notifies subscriber' ,  () =>
	{
		//given
		const aref = makeFakeNzbReferential(tmpOutDir);
		const filelist = ["SQL Server.nzb", "Linux.Format.UK.nzb" ];
		aref.addFileList( filelist.map(fn => path.join(testPath() , fn)));
		const guimodel = aref.rendererData();
		let notified = false;

        // when
        const oldstate = store.getState();
        const unsubscribe = store.subscribe( () => { notified = true ; } );
        store.dispatch( nzbRefActions.set(guimodel) );
        const newstate = store.getState();

        //then
        expect( notified ).toBeTrue() ;
        expect( _.isEqual( oldstate ,newstate ) ).toBeFalse();
        unsubscribe();
    });
});
