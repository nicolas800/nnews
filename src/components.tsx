import _ from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { PanelGroup, Panel, ProgressBar, Button, Jumbotron, FormGroup, ControlLabel, Checkbox, FormControl, Col, Form } from 'react-bootstrap';
import { INzbConfig , IRenderProgress, IRenderNZB, IRenderNZBReferential, StageEnum , WebSite ,SeverityEnum } from './shareddef';
import { appVersion } from './version';
import { store,configActions,State, displayConfigAction } from './redux-store';
import { connect,Provider } from 'react-redux';
import { addNzbFile, openExternal, showMessageBox, testConnection, getConfig, showOpenDirDialog, cancelDownload } from './electron-client-helpers';

const labelSize = 3;
const itemSize = 8;

interface ISettingState extends INzbConfig
{
	advanceMode : boolean ;
}

interface ISettingprops extends ISettingState
{
	onSubmit : ( newsVal : INzbConfig ) => void ;
	onCancel : () => void
}

const TextComponent : React.FC<{ value : string , label: string, type?: 'text' | 'password' , onChange: ( value : string ) => void } > = (props) =>
	<FormGroup controlId={props.label} >
		<Col componentClass={ControlLabel} sm={labelSize} >{props.label}</Col>
		<Col sm={itemSize}>
			<FormControl type={props.type ?? 'text' } value={ props.value } onChange={(event) =>
				{
					// eslint-disable-next-line
					const newVal = (event.currentTarget as any).value as string;
					props.onChange(newVal);
				}
			}
			/>
		</Col>
	</FormGroup>
;

const NumberComponent : React.FC<{ value : number , label: string, onChange: ( value : number ) => void } > = (props) =>
	<FormGroup controlId={props.label} >
		<Col componentClass={ControlLabel} sm={labelSize} >{props.label}</Col>
		<Col sm={itemSize}>
			<FormControl type='number'value={ props.value } onChange={(event) =>
				{
					// eslint-disable-next-line
					const newVal = parseInt( (event.currentTarget as any ).value ) ;
					if ( newVal !== NaN )
						props.onChange(newVal);
				}
			}
			/>
		</Col>
	</FormGroup>
;

const LinkComponent : React.FC<{ url:string, label: string , onClick : () => void, display?:boolean }  > = (props) =>
	( props.display === undefined || props.display ) ? <FormGroup controlId={props.label} >
		<Col componentClass={ControlLabel} sm={labelSize} ></Col>
		<Col sm={itemSize}>
		<b><a href='#' onClick={ () =>
			{
				openExternal(props.url);
				props.onClick();
			} }> {props.label}</a></b>
		</Col>
	</FormGroup> : <></>
;

const DirectoryComponent : React.FC<{ value:string , label: string , onChange : (value:string) => void} > = (props) =>
	<FormGroup controlId={props.label} >
		<Col componentClass={ControlLabel} sm={labelSize} >{props.label}</Col>
		<Col sm={itemSize - 1}>
			<FormControl
				type="text"
				value={props.value}
				// eslint-disable-next-line
				onChange={ (event) => props.onChange((event.currentTarget as any).value) } >
			</FormControl>
		</Col>
		<Col sm={1}>
			<Button onClick={() =>
			{
				showOpenDirDialog( (dirNames) => props.onChange( dirNames[0] ) );
			}}>...</Button>
		</Col>
	</FormGroup>
	;

const CheckboxComponent : React.FC<{ value:boolean , label: string , onChange : (value:boolean) => void , display?:boolean} > = (props) =>
	( props.display === undefined || props.display ) ? <FormGroup controlId={props.label} >
		<Col smOffset={labelSize} sm={itemSize} >
			<Checkbox checked={props.value} onChange={(event) =>
			{
				// eslint-disable-next-line
				props.onChange((event.currentTarget as any).checked);
			}
			} >{props.label}</Checkbox>
		</Col>
	</FormGroup> : <></>
;

const ButtonComponent: React.FC<{ label: string, type : string ,enabled? : boolean, offset:number, size:number , onClick: () => void } > = (props) =>
	<Col smOffset={props.offset} sm={props.size}>
		<Button type={props.type} disabled={props.enabled !== undefined ? !props.enabled : false } onClick={props.onClick}>{props.label}</Button>
	</Col>
;

const SettingsComponent : React.FC< ISettingprops > = (props) =>
{
	const [state, setState] = React.useState(props);
	const changeProp = ( afield : keyof ISettingprops ) => ( avalue : string|number|boolean ) => setState( {...state , [afield] : avalue } ) ;
	return <div style={{ background : 'white', paddingTop: 10, paddingBottom : 0 }}><Form horizontal>
		<CheckboxComponent label='advanceMode' value={state.advanceMode} onChange={ changeProp( 'advanceMode' ) } />
		<TextComponent label='Host' value={state.host ?? ''} onChange= { changeProp('host' ) }/>
		<NumberComponent label='Server Port' value={state.port}  onChange= { changeProp('port') } />
		<NumberComponent label='Connection count' value={state.connectionCount}  onChange= { changeProp('connectionCount') } />
		<TextComponent label='User' value={state.user ?? ''} onChange= { changeProp('user') }/>
		<TextComponent label='Password' value={state.password ?? ''} type='password' onChange= { changeProp('password') }/>
		<CheckboxComponent label='Secure Connexion' display={state.advanceMode} value={state.secure} onChange={ changeProp('secure') } />
		<DirectoryComponent label='Download directory' value={state.downloadDir} onChange={ changeProp('downloadDir') } />
		<CheckboxComponent label='Prioritize small nzb' display={state.advanceMode} value={state.priorSmallNzb} onChange={ changeProp('priorSmallNzb') } />
		<CheckboxComponent label='Recursively download nzb' display={state.advanceMode} value={state.recurseNzbDownload} onChange={ changeProp('recurseNzbDownload') } />
		<CheckboxComponent label='Repair and inflate' display={state.advanceMode} value={state.repairAndInflate} onChange={ changeProp('repairAndInflate') } />
		<CheckboxComponent label='Remove par2 and archives' display={state.advanceMode} value={state.removePar2AndArchives} onChange={ changeProp('removePar2AndArchives') } />
		<FormGroup controlId='Test' >
			<Col componentClass={ControlLabel} sm={labelSize} >Test connection</Col>
			<ButtonComponent label='Test' type='button' onClick={() => showMessageBox( 'info', testConnection( state ) ) } offset={0} size={1} />
		</FormGroup>
		<div style={{ background : 'white', padding : 5 }} />
		<hr style={ { height : 3 } }/>
		<FormGroup controlId='buttons'>
			<ButtonComponent label='Submit' type='submit' onClick={() => props.onSubmit(state) } offset={9} size={1} />
			<ButtonComponent label='Cancel' type='submit' onClick={() => props.onCancel()} offset={0} size={1} />
		</FormGroup>
	</Form></div>;
};

const ConnectedSettings = connect(
	(state:State) => ({ ... state.config , advanceMode : state.displayAdvancedConfig }) ,
	(dispatch) => (
	{
		onSubmit : (newsVal : INzbConfig) =>
		{
			dispatch( configActions.set(newsVal) ) ;
			dispatch( displayConfigAction.set(false) ) ;
		} ,
		onCancel : () =>
		{
			dispatch( configActions.set( getConfig() ) ) ;
			dispatch( displayConfigAction.set(false) ) ;
		}
	} ) )(SettingsComponent) ;

function progressBSStyle(aprogress: IRenderProgress): string
{
	if ( aprogress.severity === SeverityEnum.error )
		return "danger";
	else if (aprogress.stage === StageEnum.cancelled || aprogress.severity === SeverityEnum.warning )
		return "warning";
	else if (aprogress.stage === StageEnum.done)
		return "success";
	else return "info";
}

function progressLabel(aprogress: IRenderProgress): string
{
	if (aprogress.message !== "" )
		if ( aprogress.severity === SeverityEnum.error )
			return aprogress.message;
		else
			return `error: ${aprogress.message}` ;
	else if (aprogress.stage === StageEnum.cancelled)
		return aprogress.stage;
	else if (aprogress.stage === "none")
		return "";
	else
		if ( aprogress.progression !== undefined )
			return `${aprogress.stage} ${aprogress.progression}%`;
		else
			return aprogress.stage ;
}

export const NZBProgressBar: React.FC<{ value: IRenderProgress }> = ({value}) =>
	<ProgressBar
		now={value.progression !== undefined ? value.progression : 100 }
		striped style={{ margin: 0, display: 'flex', alignItems: 'flex-end' , cursor:'default'}}
		bsStyle={progressBSStyle(value)}
		label={progressLabel(value)}
	></ProgressBar>
;

//TODO : tranform cancel button into button open
export const NZBHeader: React.FC<{ value: IRenderNZB }> = ({value}) =>
	<table style={{ width: "100%", border: 10 }} ><tbody>
		<tr>
			<td style={{ width: "35em" }} ><Panel.Title toggle>{value.name}</Panel.Title></td>
			<td style={{ verticalAlign: 'middle' }}><NZBProgressBar value={value.progress} /></td>
			<td style={{ width: "7em", textAlign: 'right' }} >
				<Button
					disabled={ value.progress.stage === StageEnum.done }
					onClick={ () => cancelDownload(value.name) } >
						Cancel
				</Button>
			</td>
		</tr></tbody>
	</table>
;


const NZBContent : React.FC<{ value: IRenderNZB }> = ({value}) =>
	<table style={{ width: "100%", border: 5 }} ><tbody>
		{
			value.items.map((anzbitem, key) => <tr key={key} >
				<td style={{ width: "40em", height: 32 }} >{anzbitem.filename}</td>
				<td style={{ height: 32 }}><NZBProgressBar value={anzbitem.progress} /></td>
			</tr>)
		}</tbody></table>;
;

export const EmptyDisplayComponent : React.FC<{remoteVersion:string}> = ({remoteVersion}) =>
	<Jumbotron style={{textAlign:'center' , fontSize:'1.5em'}} >{ remoteVersion !== appVersion.version ?
			<div>New version {remoteVersion} <a href='#' onClick={ () => {openExternal(WebSite) ; } } >available</a></div> :
			<div>Please drag and drop nzb files to start downloading</div>
	}</Jumbotron>
;

const ConnectedEmptyDisplay = connect( (state:State) => ( { remoteVersion : state.version } ) )(EmptyDisplayComponent) ;

export const NZBListComponent : React.FC<{ value: IRenderNZBReferential }> = ({value}) =>
	value.items.length === 0 ?
	<ConnectedEmptyDisplay/> :
	<PanelGroup accordion id="nzblistcomp" >
		{
			value.items.map((anzb, akey) =>
				<Panel key={akey} eventKey={akey}>
					<Panel.Heading>
						<NZBHeader value={anzb}></NZBHeader>
					</Panel.Heading>
					<Panel.Body collapsible><NZBContent value={anzb}></NZBContent></Panel.Body>
				</Panel>)
		}
	</PanelGroup>
;

//TODO: use router instead
const AppComponent : React.FC< { showconfig : boolean , refnzb : IRenderNZBReferential }> = ( { showconfig , refnzb } ) =>
	<div style={{ padding: 20, background: "#FFFFFF" }}>
	{
		showconfig ? <ConnectedSettings/> : <NZBListComponent value={refnzb} />
	}
	</div> ;

export const ConnectedAppComponent
	= connect( (state:State) => ({ showconfig : state.displayConfig , refnzb : state.renderNZBRef }) )(AppComponent) ;

//TODO use https://github.com/sarink/react-file-drop
export function setup()
{
	document.ondragover = (ev) => ev.preventDefault() ;
	document.body.ondrop = (ev) =>
	{
		if ( ev.dataTransfer === null )
			return ;
		const fileObjectlist = Array.from(ev.dataTransfer.files) as File[] ;
		const filelist = fileObjectlist.map( afile => afile.path ) ;
		addNzbFile( filelist );
		ev.preventDefault();
	};
	ReactDOM.render(
		<Provider store={store}><ConnectedAppComponent/></Provider>,
		document.getElementById('app')
	);
}

//TODO : status bar

//TODO : drag n drop from internet link