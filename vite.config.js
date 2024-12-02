import * as child_process from 'child_process';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const GITHUB_URL = 'https://github.com/mrozekma/point-vote';

const gitDesc = child_process.execSync('git describe --all --long --abbrev=40', { cwd: __dirname, encoding: 'utf8' }).trim();
const gitHash = child_process.execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();

const buildVersion = gitDesc.replace(/^heads\//, '');
const buildLink = `${GITHUB_URL}/commit/${gitHash}`;

// https://vitejs.dev/config/
export default defineConfig({
	root: 'src/client',
	server: {
		port: 4000,
	},
	build: {
		outDir: '../../dist/client',
		emptyOutDir: true,
	},
	plugins: [
		vue(),
	],
	define: {
		BUILD_VERSION: JSON.stringify(buildVersion),
		BUILD_LINK: JSON.stringify(buildLink),
		BUILD_DATE: JSON.stringify(new Date().toGMTString()),
	},
});
