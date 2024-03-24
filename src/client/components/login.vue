<script setup lang="ts">
import qs from 'qs';
import { ref } from 'vue';

import { isErrorObject } from '../../events';
import useStore from '../store';

const store = useStore();

const loading = ref(false);
const finishingLogin = ref(false);
const error = ref<string | undefined>(undefined);

function getCurrentUrlSansOauth(): string {
	const here = new URL(window.location.href);
	if (here.search.startsWith('?') && here.search.indexOf('code') > 0) {
		const query = qs.parse(here.search.substring(1));
		delete query['code'];
		here.search = '?' + qs.stringify(query);
	}
	return here.href;
}

if (window.location.search.startsWith('?')) {
	const query = qs.parse(window.location.search.substring(1));
	if (typeof query.code === 'string') {
		finishingLogin.value = true;
		function fail(msg: string) {
			error.value = msg;
			finishingLogin.value = false;
		}

		store.socket.emit('jiraLoginFinish', getCurrentUrlSansOauth(), query.code, auth => {
			if (isErrorObject(auth)) {
				fail(auth.error);
			} else {
				store.socket.emit('jiraGetUser', auth, user => {
					if (isErrorObject(user)) {
						fail(user.error);
					} else {
						store.onLogin(auth, user);
						finishingLogin.value = false;
						const pathname = localStorage.getItem('redir');
						localStorage.removeItem('redir');
						window.history.replaceState(history.state, '', pathname ?? getCurrentUrlSansOauth());
					}
				});
			}
		});
	}
}

function jiraLogin() {
	loading.value = true;
	localStorage.setItem('redir', window.location.pathname);
	store.socket.emit('jiraLogin', getCurrentUrlSansOauth(), res => {
		loading.value = false;
		if (isErrorObject(res)) {
			error.value = res.error;
		} else {
			window.location.href = res.url;
		}
	});
}
</script>

<template>
	<div>
		<a-alert v-if="store.server.error" message="Cannot connect to server" :description="`${store.server.error}. Retrying...`" type="error" show-icon />
		<a-spin v-else-if="!store.server.connected" />
		<a-alert v-else-if="finishingLogin" message="Logging in" description="Finishing Jira login..." type="info" show-icon />
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
