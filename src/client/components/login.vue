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
	if (here.search.startsWith('?') && here.search.indexOf('oauth') > 0) {
		const query = qs.parse(here.search.substring(1));
		delete query['oauth_token'];
		delete query['oauth_verifier'];
		here.search = '?' + qs.stringify(query);
	}
	return here.href;
}

if (window.location.search.startsWith('?')) {
	const query = qs.parse(window.location.search.substring(1));
	if (typeof query.oauth_token === 'string' && typeof query.oauth_verifier === 'string') {
		const token = window.localStorage.getItem('jiraRequestToken');
		const secret = window.localStorage.getItem('jiraRequestSecret');
		finishingLogin.value = true;
		function fail(msg: string) {
			error.value = msg;
			finishingLogin.value = false;
		}
		if (!token || !secret) {
			fail("Missing Jira login data");
		} else {
			window.localStorage.removeItem('jiraRequestToken');
			window.localStorage.removeItem('jiraRequestSecret');
			if (token !== query.oauth_token) {
				fail("Jira login token mismatch");
			} else if (query.oauth_verifier === 'denied') {
				fail("Login rejected by user");
			} else {
				store.socket.emit('jiraLoginFinish', token, secret, query.oauth_verifier, auth => {
					if (isErrorObject(auth)) {
						fail(auth.error);
					} else {
						store.socket.emit('jiraGetUser', auth, user => {
							if (isErrorObject(user)) {
								fail(user.error);
							} else {
								store.onLogin(auth, user);
								finishingLogin.value = false;
								window.history.replaceState(history.state, '', getCurrentUrlSansOauth());
							}
						});
					}
				});
			}
		}
	}
}

function jiraLogin() {
	loading.value = true;
	store.socket.emit('jiraLogin', getCurrentUrlSansOauth(), login => {
		loading.value = false;
		if (isErrorObject(login)) {
			error.value = login.error;
		} else {
			window.localStorage.setItem('jiraRequestToken', login.token);
			window.localStorage.setItem('jiraRequestSecret', login.secret);
			window.location.href = login.url;
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
