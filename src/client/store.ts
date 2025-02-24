import { theme } from 'ant-design-vue';
import { defineStore, storeToRefs } from 'pinia'
import { io, Socket } from 'socket.io-client';
import { isNavigationFailure, useRouter } from 'vue-router';

import { ClientToServer, ErrorObject, isErrorObject, JiraAuth, JiraUser, ServerToClient } from '../events';
import { EventNames, EventParams } from 'socket.io/dist/typed-events';
import { watch } from 'vue';

// Used by sendServer()
type RemoveCallbackParam<T> = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? U : never;
type PromisifyCallbackParam<T> = T extends [...infer U, (obj: infer V | ErrorObject) => void] ? Promise<V> : never;

const def = defineStore('store', {
	state: () => {
		const darkModePref = localStorage.getItem('darkMode');
		const darkMode =
			(darkModePref !== null) ? JSON.parse(darkModePref) :
			window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches :
			false;
		return {
			server: {
				socket: io('ws://localhost:3001') as Socket<ServerToClient, ClientToServer>,
				connected: false,
				error: undefined as string | undefined,
			},
			jira: undefined as {
				user: JiraUser,
			} | undefined,
			darkMode,
		};
	},
	getters: {
		socket(state) {
			return state.server.socket;
		},
		antTheme(state) {
			const algorithm = state.darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm;
			return algorithm(theme.defaultSeed);
		},
	},
	actions: {
		onLogin(user: JiraUser) {
			this.jira = { user };
		},
		onLogout() {
			window.localStorage.removeItem('jiraAuth');
			this.jira = undefined;
		},
		getLogin(): Promise<JiraUser> {
			return new Promise(resolve => {
				if (this.jira) {
					return resolve(this.jira.user);
				}
				const unsubscribe = this.$subscribe((mutation, state) => {
					if (state.jira) {
						unsubscribe();
						return resolve(state.jira.user);
					}
				});
			});
		},
		// Wrapper around socket.emit() that converts the callback into a Promise.
		sendServer<Ev extends EventNames<ClientToServer>>(event: Ev, ...params: RemoveCallbackParam<EventParams<ClientToServer, Ev>>): PromisifyCallbackParam<EventParams<ClientToServer, Ev>> {
			const arr = params as any;
			//@ts-ignore
			return new Promise((resolve, reject) => {
				//@ts-ignore
				this.socket.emit(event, ...arr, res => {
					isErrorObject(res) ? reject(res.error) : resolve(res);
				});
			});
		},
	},
});
export default function () {
	const store = def();
	const { darkMode } = storeToRefs(store);
	watch(darkMode, darkMode => {
		window.localStorage.setItem('darkMode', `${darkMode}`);
	});
	store.socket.on('connect', async () => {
		const token = window.localStorage.getItem('jiraAuth');
		if (token) {
			const auth: JiraAuth = JSON.parse(token);
			try {
				const user = await store.sendServer('setJiraAuth', auth);
				store.$patch({
					jira: { user },
				});
				store.sendServer('setPathname', window.location.pathname);
			} catch {
				window.localStorage.removeItem('jiraAuth');
			}
		}

		// Wait to set server.connected until we've tried to load the login info
		store.$patch({
			server: {
				connected: true,
				error: undefined,
			},
		});
	});
	store.socket.on('disconnect', () => {
		store.$patch({
			server: {
				connected: true,
				error: undefined,
			},
		});
	});
	store.socket.on('connect_error', e => {
		console.error(e);
		store.$patch({
			server: {
				connected: false,
				error: `${e}`,
			},
		});
	});
	store.socket.on('updateJiraAuth', auth => {
		if(auth) {
			window.localStorage.setItem('jiraAuth', JSON.stringify(auth));
		} else {
			window.localStorage.removeItem('jiraAuth');
		}
	});

	useRouter().afterEach((to, from, failure) => {
		if (!isNavigationFailure(failure)) {
			store.sendServer('setPathname', to.path);
		}
	});
	return store;
}
