import { EventEmitter } from 'events';
import randomstring from 'randomstring';

import { ErrorObject, isErrorObject, JiraIssue, JiraUser, Round, ServerSocket, SessionFullJson, SessionJson } from '../events';
import { getJiraIssue, setJiraStoryPoints } from './jira';

interface JiraMultiUser extends JiraUser {
	count: number;
}

const REMOVE_EMPTY_SESSION_MS = 60 * 1000;

export class Session {
	public readonly created: Date;
	public members: JiraMultiUser[];
	public round: Round | undefined;
	private removeTimer: ReturnType<typeof setTimeout> | undefined = undefined;

	constructor(private readonly sessions: Sessions, public readonly id: string, public readonly name: string, public readonly owner: JiraUser) {
		this.created = new Date();
		this.members = [];
	}

	public addMember(user: JiraUser) {
		const existing = this.members.find(seek => seek.key === user.key);
		if (existing) {
			existing.count++;
		} else {
			this.members.push({
				...user,
				count: 1,
			});
			if (this.round?.votes[user.key]) {
				delete this.round.votes[user.key];
			}
			const idx = this.round?.oldMembers?.findIndex(seek => seek.key === user.key);
			if (idx !== undefined && idx >= 0) {
				this.round!.oldMembers.splice(idx, 1);
			}
			if (this.removeTimer && user.key === this.owner.key) {
				clearTimeout(this.removeTimer);
				this.removeTimer = undefined;
			}
		}
		this.changed();
	}

	public removeMember(user: JiraUser) {
		const idx = this.members.findIndex(seek => seek.key === user.key);
		if (idx >= 0) {
			if (--this.members[idx].count == 0) {
				this.members.splice(idx, 1);
				if (this.round && !this.round.oldMembers.find(seek => seek.key === user.key)) {
					this.round.oldMembers.push(user);
				}
				if (user.key === this.owner.key) {
					this.removeTimer = setTimeout(() => this.sessions.remove(this), REMOVE_EMPTY_SESSION_MS);
				}
			}
			this.changed();
		}
	}

	public startRound(description: string, options: string[], settings: Round['settings'], jiraIssue: JiraIssue | ErrorObject | undefined) {
		this.round = {
			description, options, jiraIssue, settings,
			done: false,
			votes: {},
			originalVotes: {},
			anonymousVotes: [],
			oldMembers: [],
		};
		this.changed();
	}

	public setRoundSettings(settings: Round['settings']) {
		if (!this.round) {
			throw new Error("No round");
		}
		if (this.round.settings.anonymize && !settings.anonymize) {
			throw new Error("Can't unanonymize a round in-progress");
		}
		this.round.settings = settings;
		this.changed();
		this.checkRoundOver();
	}

	public endRound() {
		if (!this.round) {
			throw new Error("No round");
		}
		this.round.done = true;
		this.changed();
	}

	private checkRoundOver() {
		if (!this.round) {
			throw new Error("No round");
		}
		if (this.round.settings.autoEnd && this.members.every(member => this.round!.votes[member.key] !== undefined)) {
			this.endRound();
		}
	}

	public clearRound() {
		this.round = undefined;
		this.changed();
	}

	public castVote(user: JiraUser, vote: string | false) {
		if (!this.round) {
			throw new Error("No round");
		} else if (this.round.done && !this.round.settings.revoting) {
			throw new Error("Round is over");
		} else if (typeof vote === 'string' && this.round.options.indexOf(vote) < 0) {
			throw new Error("Invalid vote");
		} else if (!this.members.some(member => member.key == user.key)) {
			throw new Error("Not a member of the session");
		}
		if (this.round.done && this.round.originalVotes[user.key] === undefined) {
			this.round.originalVotes[user.key] = (this.round.votes[user.key] as string | false | undefined) ?? false;
		}
		this.round.votes[user.key] = vote;
		this.changed();
		this.checkRoundOver();
	}

	public retractVote(user: JiraUser) {
		if (!this.round) {
			throw new Error("No round");
		} else if (this.round.done) {
			throw new Error("Round is over");
		}
		delete this.round.votes[user.key];
		this.changed();
	}

	public async setStoryPoints(points: number, socket: ServerSocket): Promise<void> {
		if (!this.round) {
			throw new Error("No round");
		} else if (!this.round.jiraIssue || isErrorObject(this.round.jiraIssue)) {
			throw new Error("No JIRA issue");
		}
		await setJiraStoryPoints(socket, this.round.jiraIssue.key, points);
		this.round.jiraIssue.storyPoints = points;
		this.changed();
	}

	private changed() {
		this.sessions.emit('session-changed', this);
	}

	public toJson(): SessionJson {
		const { id, name, owner, created, members } = this;
		return {
			id, name, owner, members,
			created: created.toJSON(),
			alive: (this.removeTimer === undefined),
		};
	}

	public roundToJson(): Round | undefined {
		if (!this.round) {
			return undefined;
		}
		let round = { ...this.round };
		if (this.round.settings.hideMidRound && !this.round.done) {
			round.votes = Object.fromEntries(Object.entries(this.round.votes).map(([k, v]) => [k, true]));
		}
		if (this.round.settings.anonymize) {
			round.anonymousVotes = Object.values(round.votes);
			round.votes = {};
			round.originalVotes = {};
		}
		return round;
	}

	public toFullJson(): SessionFullJson {
		return {
			...this.toJson(),
			round: this.roundToJson(),
		};
	}
}

export default class Sessions extends EventEmitter {
	private sessions: Map<string, Session>;

	constructor() {
		super();
		this.sessions = new Map();
		this.on('session-changed', () => this.sessionsChanged());
	}

	public get(id: string): Session | undefined {
		return this.sessions.get(id);
	}

	public getAll(): Session[] {
		return Array.from(this.sessions.values());
	}

	public create(name: string, creator: JiraUser): Session {
		name = name.trim();

		// Duplicating the name isn't strictly a problem since sessions are found by ID, but it seems best avoided
		for (const session of this.sessions.values()) {
			if (session.name == name) {
				throw new Error("Session name already in use");
			}
		}

		let id: string;
		do {
			id = randomstring.generate({
				length: 4,
				readable: true,
				capitalization: 'uppercase',
			});
		} while (this.sessions.has(id));

		const session = new Session(this, id, name, creator);
		this.sessions.set(id, session);
		this.sessionsChanged();
		return session;
	}

	public remove(session: Session) {
		if (this.sessions.delete(session.id)) {
			this.emit('session-ended', session.id);
			this.sessionsChanged();
		}
	}

	public hookSocket(socket: ServerSocket) {
		socket.on('getSessions', cb => cb(this.getAll().map(session => session.toJson())));
		socket.on('getSession', (id, cb) => {
			const session = this.get(id);
			cb(session ? session.toFullJson() : { error: "Session not found" });
		});
		socket.on('createSession', (name, cb) => {
			const user: JiraUser | undefined = socket.data.user;
			if (!user) {
				return cb({ error: "Not logged in" });
			}
			try {
				cb(this.create(name, user).toJson());
			} catch (e) {
				cb({ error: `${e}` });
			}
		});
		socket.on('disconnect', reason => {
			if (socket.data.session && socket.data.user) {
				socket.data.session.removeMember(socket.data.user);
			}
		});

		async function getSessionAndUser(errorCb: (err: ErrorObject) => void, mustBeOwner: boolean, mustHaveRound: boolean, cb: (session: Session, user: JiraUser) => void) {
			const session: Session | undefined = socket.data.session;
			const user: JiraUser | undefined = socket.data.user;
			if (!session) {
				errorCb({ error: "No session" });
			} else if (!user) {
				errorCb({ error: "No user" });
			} else if (mustBeOwner && session.owner.key != user.key) {
				errorCb({ error: "Not session owner" });
			} else if (mustHaveRound && !session.round) {
				errorCb({ error: "No round" });
			} else {
				try {
					await cb(session, user);
				} catch (e) {
					errorCb({ error: `${e}` });
				}
			}
		}

		socket.on('startRound', (description, options, settings: Round['settings'], cb) => {
			getSessionAndUser(cb, true, false, async (session, user) => {
				if(!socket.data.auth) {
					throw new Error("Not logged in");
				}
				description = description.trim() || 'Vote';
				if (new Set(options).size < 2) {
					throw new Error("Need at least two options to vote on");
				}
				let jiraIssue: JiraIssue | ErrorObject | undefined;
				try {
					jiraIssue = await getJiraIssue(socket, description);
				} catch (e) {
					jiraIssue = {
						error: `${e}`,
					};
				}
				session.startRound(description, options, settings, jiraIssue);
				cb(undefined);
			});
		});
		socket.on('setRoundSettings', (settings, cb) => {
			getSessionAndUser(cb, true, true, (session, user) => {
				session.setRoundSettings(settings);
				cb(undefined);
			});
		});
		socket.on('endRound', cb => {
			getSessionAndUser(cb, true, true, (session, user) => {
				session.endRound();
				cb(undefined);
			});
		});
		socket.on('clearRound', cb => {
			getSessionAndUser(cb, true, true, (session, user) => {
				session.clearRound();
				cb(undefined);
			});
		});
		socket.on('castVote', (vote, cb) => {
			getSessionAndUser(cb, false, true, (session, user) => {
				session.castVote(user, vote);
				cb(undefined);
			});
		});
		socket.on('retractVote', cb => {
			getSessionAndUser(cb, false, true, (session, user) => {
				session.retractVote(user);
				cb(undefined);
			});
		});

		socket.on('setStoryPoints', (points, cb) => {
			getSessionAndUser(cb, true, true, async (session, user) => {
				await session.setStoryPoints(points, socket);
				cb(undefined);
			});
		});
	}

	public on(eventName: 'session-changed', listener: (session: Session) => void): this;
	public on(eventName: 'sessions-changed', listener: (sessions: Session[]) => void): this;
	public on(eventName: 'session-ended', listener: (id: string) => void): this;
	public on(eventName: string | symbol, listener: (...args: any[]) => void): this {
		return super.on(eventName, listener);
	}

	public emit(eventName: 'session-changed', session: Session): boolean;
	public emit(eventName: 'sessions-changed', sessions: Session[]): boolean;
	public emit(eventName: 'session-ended', id: string): boolean;
	public emit(eventName: string | symbol, ...args: any[]): boolean {
		return super.emit(eventName, ...args);
	}

	private sessionsChanged() {
		this.emit('sessions-changed', this.getAll());
	}
}
