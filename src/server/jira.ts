import fs from 'fs';

import JiraApi from 'jira-client';
// @ts-ignore
import { OAuth } from 'oauth';

import { ClientToServer, JiraAuth, JiraIssue, JiraUser, ServerToClient } from '../events';
import { Socket } from 'socket.io';

interface OAuthError {
	statusCode: number;
	data: string;
}

// http://localhost:8080/plugins/servlet/applinks/listApplicationLinks
// Enter URL
// Click "Create new link"
// Ignore no response warning and click "Continue"

// Application Name: Point Vote
// Application Type: Generic Application
// Consumer key: <key>
// Create incoming link: Yes
// "-" for the rest
// Click "Continue"

// Consumer Key: <key>
// Consumer Name: Point Vote
// Public Key: <file>

//TODO Pull these into a config file
const JIRA_URL = {
	protocol: 'http',
	host: 'localhost',
	port: 8080,
};
const CONSUMER_KEY = 'bjd8RUA1kgn@vbv_nxu';
const STORY_POINTS_FIELD_NAME = 'customfield_10111';

const jiraUrlStr = (() => {
	const { protocol, host, port } = JIRA_URL;
	const portSuffix = (protocol == 'http' && port == 80) ? '' : (protocol == 'https' && port == 443) ? '' : `:${port}`;
	return `${protocol}://${host}${portSuffix}`;
})();
const privKey = fs.readFileSync('oauth/jira_privatekey.pem', 'utf8');

function makeJiraApi(auth: JiraAuth): JiraApi {
	const { protocol, host, port } = JIRA_URL;
	return new JiraApi({
		protocol, host,
		port: `${port}`,
		oauth: {
			consumer_key: CONSUMER_KEY,
			consumer_secret: privKey,
			access_token: auth.token,
			access_token_secret: auth.secret,
			signature_method: 'RSA-SHA1',
		},
	});
}

const jiraIssueRe = new RegExp(`^(?:(?:${JIRA_URL.protocol}://)?${JIRA_URL.host}.*/browse/)?([A-Za-z0-9-]+)$`);
export async function getJiraIssue(auth: JiraAuth, key_or_url: string): Promise<JiraIssue> {
	const match = key_or_url.match(jiraIssueRe);
	if(!match) {
		throw new Error("Couldn't find JIRA key or URL");
	}
	const key = match[1];
	const jira = makeJiraApi(auth);
	const issue = await jira.getIssue(key, undefined, 'renderedFields');
	return {
		key,
		url: `${jiraUrlStr}/browse/${key}`,
		descriptionHtml: issue.renderedFields.description,
		storyPoints: issue.fields[STORY_POINTS_FIELD_NAME] ?? undefined,
	};
}

export async function setJiraStoryPoints(auth: JiraAuth, key: string, points: number): Promise<void> {
	const jira = makeJiraApi(auth);
	const res = await jira.updateIssue(key, { fields: { [STORY_POINTS_FIELD_NAME]: points } });
	if(res?.errors?.[STORY_POINTS_FIELD_NAME]) {
		throw new Error(res.errors[STORY_POINTS_FIELD_NAME]);
	}
}

export function hookSocket(socket: Socket<ClientToServer, ServerToClient>) {
	socket.on('jiraLogin', (originUrl, cb) => {
		const oauth = new OAuth(`${jiraUrlStr}/plugins/servlet/oauth/request-token`, `${jiraUrlStr}/plugins/servlet/oauth/access-token`, CONSUMER_KEY, privKey, '1.0', originUrl, 'RSA-SHA1');
		oauth.getOAuthRequestToken((err: OAuthError | null, token: string, secret: string) => {
			if(err) {
				cb({ code: err.statusCode, error: `Error ${err.statusCode}: ${err.data}` });
			} else {
				cb({ token, secret, url: `${jiraUrlStr}/plugins/servlet/oauth/authorize?oauth_token=${token}` });
			}
		});
	});

	socket.on('jiraLoginFinish', (token, secret, verifier, cb) => {
		const oauth = new OAuth(`${jiraUrlStr}/plugins/servlet/oauth/request-token`, `${jiraUrlStr}/plugins/servlet/oauth/access-token`, CONSUMER_KEY, privKey, '1.0', null, 'RSA-SHA1');
		oauth.getOAuthAccessToken(token, secret, verifier, (err: OAuthError | null, token: string, secret: string, results: any) => {
			if(err) {
				cb({ code: err.statusCode, error: `Error ${err.statusCode}: ${err.data}` });
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
