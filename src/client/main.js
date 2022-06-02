import { createPinia } from 'pinia'
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/antd.css';

import Home from './views/home.vue';
import Session from './views/session.vue';
const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', component: Home },
		{ path: '/:sessionId', component: Session },
	],
});

import App from './app.vue';
const app = createApp(App);
app.use(router);
app.use(createPinia());
app.use(Antd);
app.mount('#app');
