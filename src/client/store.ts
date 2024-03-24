import { defineStore } from 'pinia'
import { io, Socket } from 'socket.io-client';
import { isNavigationFailure, useRouter } from 'vue-router';

import { ClientToServer, isErrorObject, JiraAuth, JiraUser, ServerToClient } from '../events';

const def = defineStore('store', {
	state: () => {
		return {
			server: {
				socket: io('ws://localhost:3001') as Socket<ServerToClient, ClientToServer>,
				connected: false,
				error: undefined as string | undefined,
			},
			jira: undefined as {
				auth: JiraAuth,
				user: JiraUser,
			} | undefined,
		};
	},
	getters: {
		socket(state) {
			return state.server.socket;
		},
	},
	actions: {
		onLogin(auth: JiraAuth, user: JiraUser) {
			this.jira = { auth, user };
			window.localStorage.setItem('jiraToken', auth.token);
		},
		onLogout() {
			window.localStorage.removeItem('jiraToken');
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
	},
});
export default function () {
	const store = def();
	store.socket.on('connect', () => {
		// Wait to set server.connected until we've tried to load the login info
		function setConnected() {
			store.$patch({
				server: {
					connected: true,
					error: undefined,
				},
			});
		}

		const token = window.localStorage.getItem('jiraToken');
		if (token) {
			const auth: JiraAuth = { token };
			store.socket.emit('jiraGetUser', auth, user => {
				if (isErrorObject(user)) {
					window.localStorage.removeItem('jiraToken');
				} else {
					store.jira = { auth, user };
					store.socket.emit('setPathname', window.location.pathname);
				}
				setConnected();
			});
		} else {
			setConnected();
		}
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
	useRouter().afterEach((to, from, failure) => {
		if (!isNavigationFailure(failure)) {
			store.socket.emit('setPathname', to.path);
		}
	});
	return store;
}
