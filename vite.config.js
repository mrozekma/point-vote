import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
	root: 'src/client',
	build: {
		outDir: '../../dist/client',
		emptyOutDir: true,
	},
	plugins: [
		vue(),
	],
});
