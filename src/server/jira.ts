import JiraApi from 'jira-client';
import imageType from 'image-type';
import isSvg from 'is-svg';

import config from './config';
import { JiraIssue, JiraUser, ServerSocket } from '../events';
import * as oauth from './oauth';

const jiraUrl = new URL(config.jira.url);

// Whee
if (!config.jira.strictSSL) {
	process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

async function makeJiraApi(socket: ServerSocket): Promise<JiraApi> {
	const { protocol, hostname, port, pathname } = jiraUrl;
	const mk = (bearer: string) => new JiraApi({
		protocol, port, bearer,
		host: hostname,
		base: (pathname == '/') ? undefined : pathname,
		strictSSL: config.jira.strictSSL,
	});

	const auth = socket.data.auth!;
	if(auth.refreshing) {
		// Wait up to 10 seconds for a pending refresh to finish
		let timeout = false;
		setTimeout(() => timeout = true, 10_000);
		while(auth.refreshing) {
			if(timeout) {
				throw new Error("Stuck waiting for a pending token refresh");
			}
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}
	const jira = mk(auth.access_token);
	try {
		await jira.getCurrentUser();
		return jira;
	} catch {
		if(auth.refreshing) {
			// Another refresh snuck in during our getCurrentUser() request. Restart this call
			return await makeJiraApi(socket);
		}
		auth.refreshing = true;
		const newAuth = await oauth.getAccessToken(auth.refresh_token, 'refresh_token');
		const newJira = mk(newAuth.access_token);
		await newJira.getCurrentUser();
		socket.data.auth = newAuth;
		socket.emit('updateJiraAuth', newAuth);
		return newJira;
	}
}

async function getCurrentUser(socket: ServerSocket): Promise<JiraUser> {
	const jira = await makeJiraApi(socket);
	const info = await jira.getCurrentUser();
	if (typeof info === 'string') {
		throw new Error(info);
	}
	return {
		key: info.key,
		name: info.name,
		displayName: info.displayName,
		avatar: await (async () => {
			// This is really annoying. Why would they format avatarUrls like this.
			if (!info.avatarUrls || Object.entries(info.avatarUrls).length == 0) {
				return undefined;
			}
			let largest: string = '0';
			for (const k of Object.keys(info.avatarUrls)) {
				if (parseInt(k) > parseInt(largest)) {
					largest = k;
				}
			}
			const url: string = info.avatarUrls[largest];
			{
				const { protocol, host, port } = new URL(url);
				if (jiraUrl.protocol !== protocol || jiraUrl.host !== host || jiraUrl.port !== port) {
					return url;
				}
			}
			// If the avatar is hosted by Jira and Jira doesn't allow anonymous access, the user's browser won't be able to do a cross-site request for the avatar, it'll just get a generic image back.
			// Instead, request the image data here and return a blob URL.
			try {
				// @ts-ignore doRequest() and makeRequestHeader() are private
				const data: Buffer = await jira.doRequest(jira.makeRequestHeader(url, { encoding: null }));
				let type: { mime: string } | undefined = await imageType(data);
				if (!type) {
					if (isSvg(data)) {
						type = { mime: 'image/svg+xml' };
					} else {
						return undefined;
					}
				}
				return `data:${type.mime};base64,${data.toString('base64')}`;
			} catch (e) {
				console.error(e);
				return undefined;
			}
		})(),
	};
}

const jiraIssueRe = new RegExp(`^(?:(?:${jiraUrl.protocol}//)?${jiraUrl.host}.*/browse/)?([A-Za-z0-9]+-[0-9]+)$`);
export async function getJiraIssue(socket: ServerSocket, key_or_url: string): Promise<JiraIssue | undefined> {
	const match = key_or_url.match(jiraIssueRe);
	if (!match) {
		return undefined;
	}
	const key = match[1].toUpperCase();
	const jira = await makeJiraApi(socket);
	const issue = await jira.getIssue(key, undefined, 'renderedFields');
	return {
		key,
		url: `${jiraUrl}${jiraUrl.toString().endsWith('/') ? '' : '/'}browse/${key}`,
		summary: issue.fields.summary,
		descriptionHtml: issue.renderedFields.description,
		storyPoints: config.jira.storyPointsFieldName ? issue.fields[config.jira.storyPointsFieldName] ?? undefined : undefined,
	};
}

export async function setJiraStoryPoints(socket: ServerSocket, key: string, points: number): Promise<void> {
	if (!config.jira.storyPointsFieldName) {
		throw new Error("Story point field not configured");
	}
	const jira = await makeJiraApi(socket);
	const res = await jira.updateIssue(key, { fields: { [config.jira.storyPointsFieldName]: points } });
	let err = res?.errors?.[config.jira.storyPointsFieldName]
	if (err) {
		throw new Error(err);
	}
}

export function hookSocket(socket: ServerSocket) {
	socket.on('jiraLogin', cb => {
		cb({ url: oauth.getRequestUrl() });
	});

	socket.on('jiraLoginFinish', async (grant, type, cb) => {
		try {
			const auth = await oauth.getAccessToken(grant, type);
			socket.data.auth = auth;
			socket.data.user = await getCurrentUser(socket);
			socket.emit('updateJiraAuth', auth);
			cb(undefined);
		} catch(e) {
			console.error(e);
			socket.data.auth = socket.data.user = undefined;
			cb({ error: `${e}` });
		}
	});

	socket.on('setJiraAuth', async (auth, cb) => {
		socket.data.auth = auth;
		try {
			const user = await getCurrentUser(socket);
			socket.data.user = user;
			cb(user);
		} catch(e) {
			console.error(e);
			socket.data.auth = socket.data.user = undefined;
			cb({ error: `${e}` });
		}
	});

	socket.on('jiraGetUser', async (cb) => {
		try {
			if(!socket.data.auth) {
				throw new Error("Not logged in");
			}
			const user = await getCurrentUser(socket);
			cb(user);
		} catch(e) {
			console.error(e);
			cb({ error: `${e}` });
		}
	});
}
