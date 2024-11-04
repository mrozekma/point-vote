<script setup lang="ts">
import qs from 'qs';
import { ref } from 'vue';

import useStore from '../store';
import { useRouter } from 'vue-router';

const router = useRouter();
const store = useStore();

const loading = ref(false);
const finishingLogin = ref(false);
const error = ref<string | undefined>(undefined);

if (window.location.search.startsWith('?')) {
	const query = qs.parse(window.location.search.substring(1));
	if (typeof query.code === 'string') {
		finishingLogin.value = true;
		try {
			await store.sendServer('jiraLoginFinish', query.code, 'authorization_code');
			const user = await store.sendServer('jiraGetUser');
			store.onLogin(user);
			finishingLogin.value = false;
			const pathname = localStorage.getItem('redir');
			if(pathname) {
				localStorage.removeItem('redir');
				router.replace(pathname);
			}
		} catch(e) {
			error.value = `${e}`;
		}
		finishingLogin.value = false;
	}
}

async function jiraLogin() {
	loading.value = true;
	localStorage.setItem('redir', window.location.pathname);
	try {
		const res = await store.sendServer('jiraLogin');
		window.location.href = res.url;
	} catch(e) {
		error.value = `${e}`;
	}
	loading.value = false;
}
</script>

<template>
	<div>
		<a-alert v-if="finishingLogin" message="Logging in" description="Finishing Jira login..." type="info" show-icon />
		<a-card v-else title="Login" size="small" class="login-box">
			For the moment, you must login via Jira to participate in votes. This might change in the future.
			<a-alert v-if="error" :message="error" type="error" closable @close="error = undefined" />
			<template #actions>
				<a-button type="primary" @click="jiraLogin" :loading="loading">Jira Login</a-button>
			</template>
		</a-card>
	</div>
</template>

<style lang="less" scoped>
.login-box {
	max-width: 800px;
}
</style>
