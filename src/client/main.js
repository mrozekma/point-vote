import { createPinia } from 'pinia'
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/antd.css';

import Home from './views/home.vue';
const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', component: Home },
	],
});

import App from './app.vue';
const app = createApp(App);
app.use(router);
app.use(createPinia());
app.use(Antd);
app.mount('#app');
