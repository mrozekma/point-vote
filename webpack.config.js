const pathlib = require('path');
const webpack = require('webpack');
const NodemonPlugin = require('nodemon-webpack-plugin');
// const nodeExternals = require('webpack-node-externals');

module.exports = {
	mode: process.env.NODE_ENV || 'development',
	entry: {
		server: './src/server/server.ts',
	},
	target: 'node',
	output: {
		path: pathlib.resolve(__dirname, 'dist', 'server'),
	},
	node: {
		__dirname: true,
		__filename: true,
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: [ '.tsx', '.ts', '.js' ],
	},
	plugins: [
		new NodemonPlugin({
			script: './dist/server/server.js',
			nodeArgs: [ '--inspect' ],
		}),
	],
	// externals: [
		// nodeExternals({ modulesFromFile: true }),
	// ],
};
