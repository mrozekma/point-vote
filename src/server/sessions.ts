import { EventEmitter } from 'events';
import randomstring from 'randomstring';
import { Socket } from 'socket.io';

import { ClientToServer, JiraUser, ServerToClient, SessionJson } from '../events';

export class Session {
	public readonly created: Date;
	public members: JiraUser[];

	constructor(private readonly sessions: Sessions, public readonly id: string, public readonly name: string, public readonly creator: JiraUser) {
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

	private changed() {
		this.sessions.emit('session-changed', this);
	}

	public toJson(): SessionJson {
		const { id, name, creator, created, members } = this;
		return {
			id, name, creator, members,
			created: created.toJSON(),
		};
	}

	// public toFullJson(): SessionFullJson {}
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
