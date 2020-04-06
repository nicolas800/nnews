module.exports = {
	performance: { hints: false },	
	//mode: "production",
	mode: 'development',
	node:
	{
		__dirname : false ,
		__filename: false	
	},
	entry:
	{
		renderer: "./src/renderer.tsx",
		about: "./src/about.tsx",
		main: "./src/main.ts"
	},
	output: {
		filename: '[name].js',
		pathinfo: false,
		path: __dirname + "/dist/bundle"
	},
	target: 'electron-renderer',

	// Enable sourcemaps for debugging webpack's output.
	devtool: "source-map",

	resolve: {
		// Add '.ts' and '.tsx' as resolvable extensions.
		extensions: [".ts", ".tsx", ".js", ".json"]
	},

	module: {
		rules: [
			// All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
			{ test: /\.tsx?$/, loader: "awesome-typescript-loader" },

			// All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
			{ enforce: "pre", test: /\.js$/, loader: "source-map-loader" }
		]
	},

	externals: {}
};