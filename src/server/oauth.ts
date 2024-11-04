import axios from 'axios';

import config from './config';
import { JiraAuth } from '@/events';

const oauthUrl = `${config.jira.url}/rest/oauth2/latest`;

export function getRequestUrl(): string {
	const url = new URL(`${oauthUrl}/authorize`);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', 'WRITE');
	url.searchParams.set('client_id', config.jira.clientId);
	url.searchParams.set('redirect_uri', config.server.redirectUrl);
	return url.toString();
}

export async function getAccessToken(grant: string, type: 'authorization_code' | 'refresh_token'): Promise<JiraAuth> {
	const fieldName = {
		'authorization_code': 'code',
		'refresh_token': 'refresh_token',
	}[type];
	const res = await axios.post(`${oauthUrl}/token`, new URLSearchParams({
		client_id: config.jira.clientId,
		client_secret: config.jira.clientSecret,
		grant_type: type,
		[fieldName]: grant,
		redirect_uri: config.server.redirectUrl, // Why this is necessary is beyond me
	}).toString());
	const auth: JiraAuth = res.data;
	if(typeof auth.access_token === 'string' && typeof auth.refresh_token === 'string') {
		return auth;
	} else {
		throw new Error("Bad response from Jira");
	}
}
