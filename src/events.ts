export interface ServerToClient {}

export interface ErrorObject {
	code?: number;
	error: string;
}

export function isErrorObject(obj: any): obj is ErrorObject {
	return (typeof obj.error) === 'string';
}

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

type Callback<T> = (arg: T | ErrorObject) => void;

export interface ClientToServer {
	jiraLogin(originUrl: string, cb: Callback<JiraLogin>): void;
	jiraLoginFinish(reqToken: string, reqSecret: string, verifier: string, cb: Callback<JiraAuth>): void;
	jiraGetUser(auth: JiraAuth, cb: Callback<JiraUser>): void;
}
