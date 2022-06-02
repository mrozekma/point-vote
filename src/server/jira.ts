import fs from 'fs';

import JiraApi from 'jira-client';
// @ts-ignore
import { OAuth } from 'oauth';

import { ClientToServer, JiraUser, ServerToClient } from '../events';
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

const JIRA_URL = {
	protocol: 'http',
	host: 'localhost',
	port: 8080,
};
const CONSUMER_KEY = 'bjd8RUA1kgn@vbv_nxu';

const jiraUrlStr = `${JIRA_URL.protocol}://${JIRA_URL.host}:${JIRA_URL.port}`;
const privKey = fs.readFileSync('oauth/jira_privatekey.pem', 'utf8');

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
		const { protocol, host, port } = JIRA_URL;
		const jira = new JiraApi({
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
		try {
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
