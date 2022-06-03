export interface ErrorObject {
	code?: number;
	error: string;
}

export function isErrorObject(obj: any): obj is ErrorObject {
	return (typeof obj?.error) === 'string';
}

type Callback<T> = (arg: T | ErrorObject) => void;

export interface JiraAuth {
	token: string;
	secret: string;
}

export interface JiraLogin {
	token: string;
	secret: string;
	url: string;
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
	owner: JiraUser;
	created: Iso8601;
	members: JiraUser[];
}

export interface Round {
	description: string;
	// jiraData
	options: string[];
	done: boolean;
	votes: { [JiraUserId: string]: string };
}

export interface SessionFullJson extends SessionJson {
	round: Round | undefined;
}

export interface ClientToServer {
	setPathname(pathname: string, cb: Callback<undefined>): void;

	jiraLogin(originUrl: string, cb: Callback<JiraLogin>): void;
	jiraLoginFinish(reqToken: string, reqSecret: string, verifier: string, cb: Callback<JiraAuth>): void;
	jiraGetUser(auth: JiraAuth, cb: Callback<JiraUser>): void;

	createSession(name: string, cb: Callback<SessionJson>): void;
	getSession(id: string, cb: Callback<SessionFullJson>): void;
	getSessions(cb: Callback<SessionJson[]>): void;

	startRound(description: string, options: string[], cb: Callback<undefined>): void;
	endRound(cb: Callback<undefined>): void;
	abortRound(cb: Callback<undefined>): void;
	castVote(vote: string, cb: Callback<undefined>): void;
	retractVote(cb: Callback<undefined>): void;
}

export interface ServerToClient {
	updateSession(session: SessionFullJson): void;
	updateSessions(sessions: SessionJson[]): void;
}
