import { Socket } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

import { Session } from './server/sessions';

export interface ErrorObject {
	code?: number;
	error: string;
}

export function isErrorObject(obj: any): obj is ErrorObject {
	return (typeof obj?.error) === 'string';
}

type Callback<T> = (arg: T | ErrorObject) => void;

export interface JiraAuth {
	scope: string;
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	refreshing?: boolean;
}

export interface JiraUser {
	key: string;
	name: string;
	displayName: string;
	avatar?: string;
}

export type Iso8601 = string;

export interface SessionJson {
	id: string;
	name: string;
	alive: boolean;
	owner: JiraUser;
	created: Iso8601;
	members: JiraUser[];
}

export interface JiraIssue {
	key: string;
	url: string;
	summary: string;
	descriptionHtml: string;
	storyPoints?: number;
}

export interface Round {
	description: string;
	jiraIssue: JiraIssue | ErrorObject | undefined;
	options: string[];
	settings: {
		autoEnd: boolean;
		hideMidRound: boolean;
		revoting: boolean;
		anonymize: boolean;
		autoStartRoundOnPush: boolean;
	};
	done: boolean;
	oldMembers: JiraUser[];
	votes: { [JiraUserId: string]: string | boolean }; // True for a hidden vote, false for abstentions
	originalVotes: { [JiraUserId: string]: string | false };
	anonymousVotes: (string | boolean)[];
}

export interface SessionFullJson extends SessionJson {
	round: Round | undefined;
}

export interface ClientToServer {
	setPathname(pathname: string, cb: Callback<undefined>): void;
	setJiraAuth(auth: JiraAuth, cb: Callback<JiraUser>): void;

	jiraLogin(cb: Callback<{ url: string }>): void;
	jiraLoginFinish(grant: string, type: 'authorization_code' | 'refresh_token', cb: Callback<undefined>): void;
	jiraGetUser(cb: Callback<JiraUser>): void;

	createSession(name: string, cb: Callback<SessionJson>): void;
	getSession(id: string, cb: Callback<SessionFullJson>): void;
	getSessions(cb: Callback<SessionJson[]>): void;

	startRound(description: string, options: string[], settings: Round['settings'], cb: Callback<undefined>): void;
	setRoundDescription(description: string, cb: Callback<undefined>): void;
	setRoundSettings(settings: Round['settings'], cb: Callback<undefined>): void;
	endRound(cb: Callback<undefined>): void;
	clearRound(cb: Callback<undefined>): void;
	castVote(vote: string | false, cb: Callback<undefined>): void;
	retractVote(cb: Callback<undefined>): void;
	setStoryPoints(points: number, cb: Callback<undefined>): void;
}

export interface ServerToClient {
	updateJiraAuth(auth: JiraAuth): void;
	updateSession(session: SessionFullJson): void;
	updateSessions(sessions: SessionJson[]): void;
	endSession(id: string): void;
	pushNewRoundDescription(description: string, optionSet: string | undefined): void;
}

export interface SocketData {
	auth?: JiraAuth & { refreshing?: boolean };
	user?: JiraUser;
	session?: Session;
}

export type ServerSocket = Socket<ClientToServer, ServerToClient, DefaultEventsMap, SocketData>;
export type ClientSocket = Socket<ServerToClient, ClientToServer>;
