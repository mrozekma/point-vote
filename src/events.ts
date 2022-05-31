export interface ErrorObject {
	code?: number;
	error: string;
}

export function isErrorObject(obj: any): obj is ErrorObject {
	return (typeof obj.error) === 'string';
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
	creator: JiraUser;
	created: Iso8601;
	members: JiraUser[];
}

// export interface SessionFullJson extends SessionJson {}

export interface ClientToServer {
	jiraLogin(originUrl: string, cb: Callback<JiraLogin>): void;
	jiraLoginFinish(reqToken: string, reqSecret: string, verifier: string, cb: Callback<JiraAuth>): void;
	jiraGetUser(auth: JiraAuth, cb: Callback<JiraUser>): void;
	createSession(name: string, cb: Callback<SessionJson>): void;
	getSessions(cb: Callback<SessionJson[]>): void;
}

export interface ServerToClient {
	updateSession(session: SessionJson): void;
	updateSessions(sessions: SessionJson[]): void;
}
