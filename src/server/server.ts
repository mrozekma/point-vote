import fs from 'fs';
import { Server } from 'socket.io';

import JiraApi from 'jira-client';
// @ts-ignore
import { OAuth } from 'oauth';

import { ClientToServer, JiraUser, ServerToClient } from '../events';

interface OAuthError {
	statusCode: number;
	data: string;
}

const JIRA_URL = {
	protocol: 'http',
	host: 'localhost',
	port: 8080,
};
const CONSUMER_KEY = 'asdf';

const jiraUrlStr = `${JIRA_URL.protocol}://${JIRA_URL.host}:${JIRA_URL.port}`;
const privKey = fs.readFileSync('oauth/jira_privatekey.pem', 'utf8');

const io = new Server<ClientToServer, ServerToClient>({
	cors: {
		origin: 'http://localhost:3000',
	},
});

io.on('connection', socket => {
	socket.on('jiraLogin', (originUrl, cb) => {
		const oauth = new OAuth(`${jiraUrlStr}/plugins/servlet/oauth/request-token`, `${jiraUrlStr}/plugins/servlet/oauth/access-token`, CONSUMER_KEY, privKey, '1.0', originUrl, 'RSA-SHA1');
		oauth.getOAuthRequestToken((err: OAuthError | null, token: string, secret: string) => {
			if(err) {
				cb({ code: err.statusCode, error: `Error ${err.statusCode}: ${err.data}` });
			} else {
				console.log(token, secret);
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
			console.log(info);
		} catch(e) {
			socket.data.user = undefined;
			cb({ error: `${e}` });
		}
	});
});
io.listen(3001);
