import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { remote } from 'electron';
import { Grid , Row , Button } from 'react-bootstrap';
import { appVersion } from './version';

// eslint-disable no-magic-numbers

const Anchor : React.SFC< { href : string , label:string } > = ({href,label}) =>
	<a href='#' onClick={ () => remote.shell.openExternal(href) }>{label}</a> ;

const AboutComponent : React.SFC<{}> = () =>
	<div style={{ padding : 30 , width : '100%' }}>
	<Grid frameBorder={20} >
		<Row>
			<img src='./nnews.png' width='64' height='64' style={{float:'left' , marginRight:30 }} ></img>
			<h3>nNews</h3>
		</Row>
		<Row><h4>Newsgroup client application</h4></Row>
		<Row><h4>{`version : ${appVersion.version}`}</h4></Row>
		<Row><h4>This software is provided "as it", without warranty of any kind</h4></Row>
		<Row><h4><Anchor href={`mailto:{SupportEmail}`} label='contact' /></h4></Row>
		<Row><hr style={ { height : 3 } }/></Row>
		<Row><Button style={{ float:'right' , minWidth:130 }} onClick={ () =>
			{
				const window = remote.getCurrentWindow();
				window.close();
			} }>Ok</Button></Row>
</Grid></div> ;

ReactDOM.render(
	<AboutComponent />,
	document.getElementById('about')
);
