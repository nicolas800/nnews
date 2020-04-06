var msi = require('electron-wix-msi');
const replace = require('replace-in-file');
var path = require('path');
var fs = require('fs');

/**
* 
* @param {IGrunt} grunt
*/
module.exports = (grunt) => {
	const version = JSON.parse(require("fs").readFileSync("./package.json").toString()).version;

	async function patchWIX( appDirectory , afile )
	{
		await replace( {  files:afile , 
			from : '<!-- Installation files to %PROGRAMFILES% -->' , 
			to: `<!-- Installation files to %PROGRAMFILES% -->
			<Directory Id="DesktopFolder" Name="Desktop" />`} ); 
		await replace( {  files:afile , 
			from:'</Feature>' , 
			to: `</Feature>
			<Component Id="cmpDesktopShortcut" Guid="*" Directory="DesktopFolder" >
			<Shortcut Id="MyDesktopShortcut" 
					  Name="nNews Application"
					  Description="Opens the program." 
					  Directory="DesktopFolder" 
					  Target="[APPLICATIONROOTDIRECTORY]nNews.exe"
					  WorkingDirectory="APPLICATIONROOTDIRECTORY"/>
			<RegistryValue Root="HKCU" Key="Software\\Sigma Solutions\\nNews" Name="installed" Type="integer" Value="1" KeyPath="yes" />
		</Component>			
			`} );
		await replace( {  files:afile , 
				from:'<!-- Step 4: Tell WiX to install the files -->' ,
			to : `<Feature Id="ProductFeature" Title="SetupProject" Level="1">
			<ComponentRef Id="cmpDesktopShortcut" />
		  </Feature>
		  <!-- Step 4: Tell WiX to install the files -->`} ) ;

		  await replace( { files:afile , 
			from:'<!-- Step 2: Add files and directories -->' ,
			to : `<Icon Id="nnews.ico" SourceFile="${appDirectory}\\resources\\app\\nnews.ico"/>
				  <Property Id="ARPPRODUCTICON" Value="nnews.ico" />
				  <!-- Step 2: Add files and directories -->				  
		`} ) ;
	}

	async function createMSI(arch) {
		if (process.platform !== "win32")
			return ; 
		const outDir = path.resolve('./nnews-binaries');
		const appDirectory = path.resolve(`./nnews-binaries/nNews-win32-${arch}`); 
		// Step 1: Instantiate the MSICreator
		const msiCreator = new msi.MSICreator({
			appDirectory ,
			exe: 'nNews',
			name: 'nNews',
			manufacturer: 'Sigma Solutions',
			description: 'Newsgroup nzb client downloader',
			version: version,
			outputDirectory: outDir,
			arch: arch === 'ia32' ? 'x86' : arch
		});
		await msiCreator.create();
		patchWIX( appDirectory , path.join( outDir , 'nNews.wxs' ) );
		const { wixobjFile, msiFile } = await msiCreator.compile();
		fs.renameSync(msiFile, path.join(outDir, `nnews-${arch}.msi`));
	}

	grunt.initConfig(
		{
			ts:
			{
				default:
				{
					tsconfig: './tsconfig.json'
				}
			},
			webpack:
			{
				default: require('./webpack.config.js')
			},
			shell:
			{
				test:
				{
					command: "jasmine-ts"
				},
				tag:
				{
					command: 'sh -x ./tag.sh &>-'
				},
				prebuild:
				{
					command: ["npm install", "rm -rf ./dist/*"].join('&&')
				},
				eslint:
				{
					command : "eslint --fix \"src/**/*.ts\""
				},
				package:
				{
					command:
						[
							'cd ./nnews-binaries',
							'tar czf nNews-linux-ia32.tgz nNews-linux-ia32/',
							'tar czf nNews-linux-x64.tgz nNews-linux-x64/',
							'zip -r nNews-darwin-x64.zip nNews-darwin-x64/ -q || true',
							'cd ..',
							'rm -f ./website/*.msi ./website/*.tgz ./website/*.zip',
							'mv -f ./nnews-binaries/*.msi ./website || true',
							'mv -f ./nnews-binaries/nNews-linux*.tgz ./website || true',
							'mv ./nnews-binaries/nNews-darwin*.zip ./website || true'
						].join('&&')
				}
			},
			ftp_push:
			{
				nuxitsite:
				{
					options:
					{
						host: "ftp.webmo.fr",
						authKey: "serverNuxit",
						dest: "/www/nnews/",
						incrementalUpdates:true
					},
					files: 
					[
						{
							expand: true,
							cwd: 'website/',
							src:
								[
									"version.js",
									"*.png",
									"*.xml",
									"*.html",
									"*.msi",
									"*.zip",
									"*.gzip"
								]
						}
					]
				}				
			},
			electron:
			{
				build: {
					options: {
						name: 'nNews',
						dir: '.',
						out: 'nnews-binaries',
						ignore:
							[
								'testfiles',
								'\.urllink',
								'\.website',
								'\.tscache',
								'\.vscode',
								'\.git',
								'\.grunt',
								'src/.*.ts',
								'spec/.*.ts',
								'src/.*.tsx',
								'dist/.*\.map',
								'dist/spec/.*\.js',
								'dist/src/.*\.js',
								'node_modules',
								'_SpecRunner.html',
								'gruntfile.js',
								'nnews.svg',
								'README.md',
								'tag.sh',
								'tsconfig.json',
								'.eslintrc.js',
								'webpack.config.js',
								'\.tsBuildInfoFile',
								'nnews-binaries'
							],
						overwrite: true,
						icon: "./public/nnews.ico",
						platform: ['win32', 'linux','darwin'],
						arch: ['ia32', 'x64']
					}
				}
			}
		});
	grunt.loadNpmTasks('grunt-ftp-push');
	grunt.loadNpmTasks("grunt-ts");
	grunt.loadNpmTasks("grunt-electron");
	grunt.loadNpmTasks('grunt-webpack');
	grunt.loadNpmTasks('grunt-shell');
	grunt.registerTask("default", ["ts"]);
	grunt.registerTask("test", ["shell:test"]);
	grunt.registerTask("tag", ["shell:tag"]);
	grunt.registerTask("gitpush", ["shell:gitpush"]);
	grunt.registerTask("package", ["shell:package"]);
	grunt.registerTask("msi", "create msi", function () {
		var done = this.async();
		createMSI('ia32').then(() => createMSI('x64')).then(done);
	});
	grunt.registerTask("eslint", ["shell:eslint"]);
	grunt.registerTask("prebuild", ["shell:prebuild"]);
	grunt.registerTask("build", ["tag", "eslint", "ts", "webpack"]);
	grunt.registerTask("all", ["prebuild", "build", "test", "electron", "msi", "package","ftp_push"]);
};