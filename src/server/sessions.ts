import { EventEmitter } from 'events';
import randomstring from 'randomstring';
import { Socket } from 'socket.io';

import { ClientToServer, ErrorObject, JiraUser, Round, ServerToClient, SessionFullJson, SessionJson } from '../events';

export class Session {
	public readonly created: Date;
	public members: JiraUser[];
	public round: Round | undefined;

	constructor(private readonly sessions: Sessions, public readonly id: string, public readonly name: string, public readonly owner: JiraUser) {
		this.created = new Date();
		this.members = [];
	}

	public addMember(user: JiraUser) {
		this.members.push(user);
		this.changed();
	}

	public removeMember(user: JiraUser) {
		const idx = this.members.indexOf(user);
		if(idx >= 0) {
			this.members.splice(idx, 1);
			this.changed();
		}
	}

	public startRound(description: string, options: string[]) {
		this.round = {
			description, options,
			done: false,
			votes: {},
		};
		this.changed();
	}

	public endRound() {
		if(!this.round) {
			throw new Error("No round");
		}
		this.round.done = true;
		this.changed();
	}

	public abortRound() {
		this.round = undefined;
		this.changed();
	}

	public castVote(user: JiraUser, vote: string) {
		if(!this.round) {
			throw new Error("No round");
		} else if(this.round.options.indexOf(vote) < 0) {
			throw new Error("Invalid vote");
		} else if(!this.members.some(member => member.key == user.key)) {
			throw new Error("Not a member of the session");
		}
		this.round.votes[user.key] = vote;
		this.changed();
	}

	public retractVote(user: JiraUser) {
		if(!this.round) {
			throw new Error("No round");
		}
		delete this.round.votes[user.key];
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
		};
	}

	public toFullJson(): SessionFullJson {
		return {
			...this.toJson(),
			round: this.round,
		};
	}
}

export default class Sessions extends EventEmitter {
	private sessions: Map<string, Session>;

	constructor() {
		super();
		this.sessions = new Map();

		setInterval(() => {
			for(const session of this.sessions) {
				//TODO Delete old sessions
			}
		}, 60 * 1000);

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
		for(const session of this.sessions.values()) {
			if(session.name == name) {
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
		} while(this.sessions.has(id));

		const session = new Session(this, id, name, creator);
		this.sessions.set(id, session);
		this.sessionsChanged();
		return session;
	}

	public hookSocket(socket: Socket<ClientToServer, ServerToClient>) {
		socket.on('getSessions', cb => cb(this.getAll().map(session => session.toJson())));
		socket.on('getSession', (id, cb) => {
			const session = this.get(id);
			cb(session ? session.toFullJson() : { error: "Session not found" });
		});
		socket.on('createSession', (name, cb) => {
			const user: JiraUser = socket.data.user;
			if(!user) {
				return cb({ error: "Not logged in" });
			}
			try {
				cb(this.create(name, user).toJson());
			} catch(e) {
				cb({ error: `${e}` });
			}
		});
		socket.on('disconnect', reason => {
			if(socket.data.session && socket.data.user) {
				socket.data.session.removeMember(socket.data.user);
			}
		});

		function getSessionAndUser(errorCb: (err: ErrorObject) => void, mustBeOwner: boolean, mustHaveRound: boolean, cb: (session: Session, user: JiraUser) => void) {
			const session: Session = socket.data.session;
			const user: JiraUser = socket.data.user;
			if(!session) {
				errorCb({ error: "No session" });
			} else if(!user) {
				errorCb({ error: "No user" });
			} else if(mustBeOwner && session.owner.key != user.key) {
				errorCb({ error: "Not session owner" });
			} else if(mustHaveRound && !session.round) {
				errorCb({ error: "No round" });
			} else {
				try {
					cb(session, user);
				} catch(e) {
					errorCb({ error: `${e}` });
				}
			}
		}

		socket.on('startRound', (description, options, cb) => {
			getSessionAndUser(cb, true, false, (session, user) => {
				session.startRound(description, options);
				cb(undefined);
			});
		});
		socket.on('endRound', cb => {
			getSessionAndUser(cb, true, true, (session, user) => {
				session.endRound();
			});
		});
		socket.on('abortRound', cb => {
			getSessionAndUser(cb, true, true, (session, user) => {
				session.abortRound();
			});
		});
		socket.on('castVote', (vote, cb) => {
			getSessionAndUser(cb, false, true, (session, user) => {
				session.castVote(user, vote);
			});
		});
		socket.on('retractVote', cb => {
			getSessionAndUser(cb, false, true, (session, user) => {
				session.retractVote(user);
			});
		});
	}

	public on(eventName: 'session-changed', listener: (session: Session) => void): this;
	public on(eventName: 'sessions-changed', listener: (sessions: Session[]) => void): this;
	public on(eventName: string | symbol, listener: (...args: any[]) => void): this {
		return super.on(eventName, listener);
	}

	public emit(eventName: 'session-changed', session: Session): boolean;
	public emit(eventName: 'sessions-changed', sessions: Session[]): boolean;
	public emit(eventName: string | symbol, ...args: any[]): boolean {
		return super.emit(eventName, ...args);
	}

	private sessionsChanged() {
		this.emit('sessions-changed', this.getAll());
	}
}
