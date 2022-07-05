import fs from 'fs';

import JiraApi from 'jira-client';
// @ts-ignore
import { OAuth } from 'oauth';
import { Socket } from 'socket.io';

import config from './config';
import { ClientToServer, JiraAuth, JiraIssue, JiraUser, ServerToClient } from '../events';

interface OAuthError {
	statusCode: number;
	data: string;
}

const jiraUrl = new URL(config.jira.url);
const privKey = fs.readFileSync(config.jira.privateKey, 'utf8');

// Whee
if(!config.jira.strictSSL) {
	process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

function makeJiraApi(auth: JiraAuth): JiraApi {
	const { protocol, hostname, port } = jiraUrl;
	return new JiraApi({
		protocol,
		host: hostname,
		port,
		oauth: {
			consumer_key: config.jira.consumerKey,
			consumer_secret: privKey,
			access_token: auth.token,
			access_token_secret: auth.secret,
			signature_method: 'RSA-SHA1',
		},
		strictSSL: config.jira.strictSSL,
	});
}

const jiraIssueRe = new RegExp(`^(?:(?:${jiraUrl.protocol}//)?${jiraUrl.host}.*/browse/)?([A-Za-z0-9-]+)$`);
export async function getJiraIssue(auth: JiraAuth, key_or_url: string): Promise<JiraIssue> {
	const match = key_or_url.match(jiraIssueRe);
	if(!match) {
		throw new Error("Couldn't find JIRA key or URL");
	}
	const key = match[1].toUpperCase();
	const jira = makeJiraApi(auth);
	const issue = await jira.getIssue(key, undefined, 'renderedFields');
	return {
		key,
		url: `${jiraUrl}browse/${key}`,
		summary: issue.fields.summary,
		descriptionHtml: issue.renderedFields.description,
		storyPoints: config.jira.storyPointsFieldName ? issue.fields[config.jira.storyPointsFieldName] ?? undefined : undefined,
	};
}

export async function setJiraStoryPoints(auth: JiraAuth, key: string, points: number): Promise<void> {
	if(!config.jira.storyPointsFieldName) {
		throw new Error("Story point field not configured");
	}
	const jira = makeJiraApi(auth);
	const res = await jira.updateIssue(key, { fields: { [config.jira.storyPointsFieldName]: points } });
	let err = res?.errors?.[config.jira.storyPointsFieldName]
	if(err) {
		throw new Error(err);
	}
}

export function hookSocket(socket: Socket<ClientToServer, ServerToClient>) {
	socket.on('jiraLogin', (originUrl, cb) => {
		const oauth = new OAuth(`${jiraUrl}/plugins/servlet/oauth/request-token`, `${jiraUrl}/plugins/servlet/oauth/access-token`, config.jira.consumerKey, privKey, '1.0', originUrl, 'RSA-SHA1');
		oauth.getOAuthRequestToken((err: OAuthError | null, token: string, secret: string) => {
			if(err) {
				if(err.statusCode && err.data) {
					cb({ code: err.statusCode, error: `Error ${err.statusCode}: ${err.data}` });
				} else {
					cb({ error: `${err}` });
				}
			} else {
				cb({ token, secret, url: `${jiraUrl}/plugins/servlet/oauth/authorize?oauth_token=${token}` });
			}
		});
	});

	socket.on('jiraLoginFinish', (token, secret, verifier, cb) => {
		const oauth = new OAuth(`${jiraUrl}/plugins/servlet/oauth/request-token`, `${jiraUrl}/plugins/servlet/oauth/access-token`, config.jira.consumerKey, privKey, '1.0', null, 'RSA-SHA1');
		oauth.getOAuthAccessToken(token, secret, verifier, (err: OAuthError | null, token: string, secret: string, results: any) => {
			if(err) {
				if(err.statusCode && err.data) {
					cb({ code: err.statusCode, error: `Error ${err.statusCode}: ${err.data}` });
				} else {
					cb({ error: `${err}` });
				}
			} else {
				cb({ token, secret });
			}
		});
	});

	socket.on('jiraGetUser', async (auth, cb) => {
		try {
			const jira = makeJiraApi(auth);
			const info = await jira.getCurrentUser();
			if(typeof info === 'string') {
				throw new Error(info);
			}
			const user: JiraUser = {
				key: info.key,
				name: info.name,
				displayName: info.displayName,
				avatar: (() => {
					// This is really annoying. Why would they format avatarUrls like this.
					if(!info.avatarUrls || Object.entries(info.avatarUrls).length == 0) {
						return undefined;
					}
					let largest: string = '0';
					for(const k of Object.keys(info.avatarUrls)) {
						if(parseInt(k) > parseInt(largest)) {
							largest = k;
						}
					}
					return info.avatarUrls[largest];
				})(),
			};
			socket.data.user = user;
			cb(user);
		} catch(e) {
			socket.data.user = undefined;
			cb({ error: `${e}` });
		}
	});
}
