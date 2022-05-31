import { Server } from 'socket.io';

import { ClientToServer, JiraUser, ServerToClient, Session } from '../events';
import { hookSocket as jiraHookSocket } from './jira';
import Sessions from './sessions';

const sessions = new Sessions();
sessions.create('foo', {key: 'k', name: 'name', displayName: 'disp'});

const io = new Server<ClientToServer, ServerToClient>({
	cors: {
		origin: 'http://localhost:3000',
	},
});

io.on('connection', socket => {
	console.log('connect', socket.id);

	const pathname = socket.handshake.query.pathname;
	if(typeof pathname === 'string') {
		if(pathname == '/') {
			socket.join('home');
		} else {
			const session = sessions.get(pathname.substring(1));
			if(session) {
				socket.data.session = session;
				socket.join(`session/${session.id}`);
			}
		}
	}

	function onAuth(user: JiraUser) {
		if(socket.data.session) {
			(socket.data.session as Session).addMember(user);
		}
		// Removal is handled in a disconnect listener setup in sessions.hookSocket()
	}

	jiraHookSocket(socket, onAuth);
	sessions.hookSocket(socket);
});

sessions.on('sessions-changed', sessions => {
	io.to('home').emit('updateSessions', sessions.map(session => session.toJson()));
});
sessions.on('session-changed', session => {
	io.to(`session/${session.id}`).emit('updateSession', session.toJson());
});

io.listen(3001);
