import express from 'express';
import { Server } from 'socket.io';

import config from './config';
import { ClientToServer, ServerToClient } from '../events';
import { hookSocket as jiraHookSocket } from './jira';
import Sessions, { Session } from './sessions';

const sessions = new Sessions();

const io = new Server<ClientToServer, ServerToClient>({
	cors: {
		origin: config.server.url,
	},
});

io.on('connection', socket => {
	socket.on('setPathname', pathname => {
		if (socket.data.session && socket.data.user) {
			(socket.data.session as Session).removeMember(socket.data.user);
			socket.data.session = undefined;
		}
		// Leave every room except the special one based on the socket's id
		for (const name of [...socket.rooms]) {
			if (name != socket.id) {
				socket.leave(name);
			}
		}

		// Join based on pathname
		if (pathname == '/') {
			socket.join('home');
		} else {
			const session = sessions.get(pathname.substring(1));
			if (session) {
				socket.data.session = session;
				socket.join(`session/${session.id}`);
				if (socket.data.user) {
					session.addMember(socket.data.user);
				}
			}
		}
	});

	jiraHookSocket(socket);
	sessions.hookSocket(socket);
});

sessions.on('sessions-changed', sessions => {
	io.to('home').emit('updateSessions', sessions.map(session => session.toJson()));
});
sessions.on('session-changed', session => {
	io.to(`session/${session.id}`).emit('updateSession', session.toFullJson());
});
sessions.on('session-ended', id => {
	io.to(`session/${id}`).emit('endSession', id);
});

io.listen(config.server.websocketPort);

if(config.api) {
	const { port, auth: expectedAuth } = config.api;
	const apiServer = express();
	apiServer.post('/push', (req, res) => {
		const { auth, description, owner, session: sessionKey, jira: isJira, optionSet } = req.query;
		if(expectedAuth) {
			if(!auth) {
				return res.status(403).send('Missing auth');
			} else if(auth !== expectedAuth) {
				return res.status(403).send('Bad auth');
			}
		}
		if(!description) {
			return res.status(400).send('Missing description');
		}

		let session: Session | undefined;
		if(sessionKey) {
			session = sessions.get(sessionKey as string);
			if(!session) {
				return res.status(404).send(`No session with ID ${sessionKey}`);
			}
		} else if(owner) {
			const userSessions = sessions.getAll().filter(session => session.owner.name === owner);
			switch(userSessions.length) {
				case 0:
					return res.status(404).send(`Couldn't find session owned by ${owner}`);
				case 1:
					session = userSessions[0];
					break;
				default:
					return res.status(409).send(`${owner} owns ${userSessions.length} sessions`);
			}
		} else {
			return res.status(400).send("Need to specify session or owner");
		}

		io.to(`session/${session.id}`).emit('pushNewRoundDescription', description as string, isJira === 'true' ? true : isJira === 'false' ? false : undefined, optionSet as string | undefined);
		return res.status(200).send("Done");
	});
	apiServer.listen(port);
	console.log(`API server listening on port ${port}`);
}

console.log(`Ready, frontend ${config.server.url}, websocket port ${config.server.websocketPort}`);
