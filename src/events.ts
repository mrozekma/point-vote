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
	setPathname(pathname: string): void;

	jiraLogin(originUrl: string, cb: Callback<{ url: string }>): void;
	jiraLoginFinish(originUrl: string, code: string, cb: Callback<JiraAuth>): void;
	jiraGetUser(auth: JiraAuth, cb: Callback<JiraUser>): void;

	createSession(name: string, cb: Callback<SessionJson>): void;
	getSession(id: string, cb: Callback<SessionFullJson>): void;
	getSessions(cb: Callback<SessionJson[]>): void;

	startRound(description: string, options: string[], settings: Round['settings'], jiraAuth: JiraAuth, cb: Callback<undefined>): void;
	setRoundSettings(settings: Round['settings'], cb: Callback<undefined>): void;
	endRound(cb: Callback<undefined>): void;
	clearRound(cb: Callback<undefined>): void;
	castVote(vote: string | false, cb: Callback<undefined>): void;
	retractVote(cb: Callback<undefined>): void;
	setStoryPoints(points: number, jiraAuth: JiraAuth, cb: Callback<undefined>): void;
}

export interface ServerToClient {
	updateSession(session: SessionFullJson): void;
	updateSessions(sessions: SessionJson[]): void;
	endSession(id: string): void;
	pushNewRoundDescription(description: string, optionSet: string | undefined): void;
}
