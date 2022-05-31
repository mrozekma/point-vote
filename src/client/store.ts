import { defineStore } from 'pinia'
import { io, Socket } from "socket.io-client";

import { ClientToServer, isErrorObject, JiraAuth, JiraUser, ServerToClient } from '../events';

const def = defineStore('store', {
	state: () => {
		return {
			server: {
				socket: io(`ws://localhost:3001?pathname=${window.location.pathname}`) as Socket<ServerToClient, ClientToServer>,
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
			window.localStorage.setItem('jiraSecret', auth.secret);
		},
		getLogin(): Promise<JiraUser> {
			return new Promise(resolve => {
				if(this.jira) {
					return resolve(this.jira.user);
				}
				const unsubscribe = this.$subscribe((mutation, state) => {
					if(state.jira) {
						unsubscribe();
						return resolve(state.jira.user);
					}
				});
			});
		},
	},
});
export default function() {
	const store = def();
	store.server.socket.on('connect', () => {
		store.server.connected = true;
		const token = window.localStorage.getItem('jiraToken');
		const secret = window.localStorage.getItem('jiraSecret');
		if(token && secret) {
			const auth: JiraAuth = { token, secret };
			store.socket.emit('jiraGetUser', auth, user => {
				if(isErrorObject(user)) {
					window.localStorage.removeItem('jiraToken');
					window.localStorage.removeItem('jiraSecret');
				} else {
					store.jira = { auth, user };
				}
			});
		}
	});
	store.server.socket.on('disconnect', () => {
		store.server.connected = false;
	});
	store.server.socket.on('connect_error', e => {
		console.error(e);
		store.$patch({
			server: {
				connected: false,
				error: `${e}`,
			},
		});
	});
	return store;
}
