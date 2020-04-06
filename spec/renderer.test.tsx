import React from 'react';
import { store } from '../src/redux-store';
import { render } from '@testing-library/react' ;
import { setupJSDOM } from './testhelpers';
setupJSDOM();

import { ConnectedAppComponent } from '../src/components';
import { Provider } from 'react-redux';

describe('React components: ', () =>
{
	fit( 'Application initial display' ,  () =>
	{
		//given
    	const {getByText} = render( <Provider store={store}><ConnectedAppComponent/></Provider> );

		//when

		//then
		expect( getByText("Please drag and drop nzb files to start downloading") ).toBeDefined();
    });
});

