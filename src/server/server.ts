import { Server, Socket } from 'socket.io';

import config from './config';
import { ClientToServer, JiraUser, ServerToClient } from '../events';
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

io.listen(3001); //TODO Config
console.log('Ready');
