import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ROOM_PORT ?? '8787');
const HOST = '0.0.0.0';

const rooms = new Map();

const wss = new WebSocketServer({ host: HOST, port: PORT });

function log(...args) {
  console.log('[room-server]', ...args);
}

function broadcast(roomCode, message, origin) {
  const members = rooms.get(roomCode);
  if (!members) return;
  for (const client of members) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'join-room') {
        joinedRoom = parsed.roomCode;
        if (!rooms.has(joinedRoom)) rooms.set(joinedRoom, new Set());
        rooms.get(joinedRoom).add(socket);
        log('client joined', joinedRoom, 'current', rooms.get(joinedRoom).size);
        socket.send(JSON.stringify({ type: 'joined-room', roomCode: joinedRoom }));
        return;
      }

      if (parsed.type === 'room-message' && parsed.roomCode && rooms.has(parsed.roomCode)) {
        broadcast(parsed.roomCode, JSON.stringify(parsed), socket);
        return;
      }
    } catch (err) {
      log('failed to process message', err);
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  socket.on('close', () => {
    if (joinedRoom && rooms.has(joinedRoom)) {
      rooms.get(joinedRoom).delete(socket);
      if (rooms.get(joinedRoom).size === 0) rooms.delete(joinedRoom);
      log('client left', joinedRoom, 'remaining', rooms.get(joinedRoom)?.size ?? 0);
    }
  });

  socket.on('error', (err) => {
    log('socket error', err);
  });
});

wss.on('listening', () => {
  log(`listening on ws://${HOST}:${PORT}`);
});
