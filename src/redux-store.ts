import { combineReducers } from 'redux';
import { configureStore ,createSlice, PayloadAction } from '@reduxjs/toolkit';
import logger from 'redux-logger';
import * as ElectronHelper from './electron-client-helpers';
import { INzbConfig , IRenderNZB, IRenderNZBReferential , defConfig, safeCast, TNzbConfig } from './shareddef';
import { appVersion } from './version';

const versionSlice = createSlice(
    {
        name: 'version',
        initialState: appVersion.version,
        reducers:
        {
            set: (state, action: PayloadAction<string>) => action.payload
        }
    });

const displayConfigSlice = createSlice(
    {
        name: 'displayConfig',
        initialState: false,
        reducers:
        {
            set: (state, action: PayloadAction<boolean>) => action.payload
        }
    });

const displayAdvancedConfigSlice = createSlice(
{
    name: 'displayAdvancedConfig',
    initialState: false,
    reducers:
    {
        set: (state, action: PayloadAction<boolean>) => action.payload
    }
});

const configSlice = createSlice(
{
    name: 'config',
    initialState: defConfig() ,
    reducers:
    {
        submit: (state, action: PayloadAction<INzbConfig>) =>
        {
            try
            {
                safeCast(state,TNzbConfig);
                return state ;
            }
            catch (error)
            {
                return ElectronHelper.getConfig();
            }
        },
        cancel: (state, action: PayloadAction<INzbConfig>) =>
        {
            return ElectronHelper.getConfig();
        },
        set: (state, action: PayloadAction<INzbConfig>) =>
        {
            ElectronHelper.setConfig( action.payload ) ;
            return action.payload ;
        }
    }
});

const renderNZBRefSlice = createSlice(
{
    name: 'renderNZBRef',
    initialState: { items : [] as IRenderNZB[] } ,
    reducers:
    {
        set: (state, action: PayloadAction<IRenderNZBReferential>) => action.payload
    }
});

const rootReducer = combineReducers(
{
    version : versionSlice.reducer ,
    displayConfig: displayConfigSlice.reducer,
    displayAdvancedConfig: displayAdvancedConfigSlice.reducer,
    config: configSlice.reducer ,
    renderNZBRef : renderNZBRefSlice.reducer
});

export type State = ReturnType<typeof rootReducer>;

function startup()
{
    ElectronHelper.onShowconfig( () => store.dispatch( displayConfigSlice.actions.set(true) ) );
    ElectronHelper.onNzbUpdate( (arg: IRenderNZBReferential) => store.dispatch( renderNZBRefSlice.actions.set( arg ) ) );
    store.dispatch( versionAction.set( ElectronHelper.getVersion( ) ) ) ;
    store.dispatch( configActions.set( ElectronHelper.getConfig( ) ) ) ;
    store.dispatch( nzbRefActions.set( ElectronHelper.getNzbRef() ) );
}

export const store = configureStore({reducer: rootReducer , middleware:[logger]});
export const versionAction = versionSlice.actions ;
export const displayConfigAction = displayConfigSlice.actions ;
export const displayAdvancedConfigAction = displayAdvancedConfigSlice.actions ;
export const configActions = configSlice.actions ;
export const nzbRefActions = renderNZBRefSlice.actions ;

startup();