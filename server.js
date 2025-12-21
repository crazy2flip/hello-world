import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ROOM_PORT ?? '8787');
const HOST = '0.0.0.0';

const rooms = new Map();
let nextSocketId = 1;

const wss = new WebSocketServer({ host: HOST, port: PORT });

const randomUUIDAvailable = typeof crypto.randomUUID === 'function';
log('runtime info', { node: process.version, randomUUIDAvailable });

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

wss.on('connection', (socket, request) => {
  const socketId = nextSocketId++;
  const remoteAddress = request?.socket?.remoteAddress ?? '<unknown>';
  let joinedRoom = null;
  let joinedOnce = false;
  const heartbeat = setInterval(() => {
    if (socket.readyState === socket.OPEN) {
      socket.ping();
    }
  }, 20000);

  log(`socket ${socketId} connected from ${remoteAddress}`);

  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'join-room') {
        if (joinedOnce) {
          log(`socket ${socketId} duplicate join ignored for ${joinedRoom ?? parsed.roomCode}`);
          return;
        }
        joinedRoom = parsed.roomCode;
        joinedOnce = true;
        if (!rooms.has(joinedRoom)) rooms.set(joinedRoom, new Set());
        rooms.get(joinedRoom).add(socket);
        log(`socket ${socketId} joined ${joinedRoom} current ${rooms.get(joinedRoom).size} from ${remoteAddress}`);
        socket.send(JSON.stringify({ type: 'joined-room', roomCode: joinedRoom }));
        return;
      }

      if (parsed.type === 'room-message' && parsed.roomCode && rooms.has(parsed.roomCode)) {
        broadcast(parsed.roomCode, JSON.stringify(parsed), socket);
        return;
      }
    } catch (err) {
      log(`socket ${socketId} failed to process message`, err);
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  socket.on('close', (code, reasonBuffer) => {
    clearInterval(heartbeat);
    const reason = reasonBuffer?.toString() || '<none>';
    if (joinedRoom && rooms.has(joinedRoom)) {
      rooms.get(joinedRoom).delete(socket);
      if (rooms.get(joinedRoom).size === 0) rooms.delete(joinedRoom);
      log(`socket ${socketId} closed code=${code} reason=${reason} room=${joinedRoom} remaining ${rooms.get(joinedRoom)?.size ?? 0}`);
    } else {
      log(`socket ${socketId} closed code=${code} reason=${reason} room=<none>`);
    }
  });

  socket.on('error', (err) => {
    log(`socket ${socketId} error`, err);
  });
});

wss.on('listening', () => {
  log(`listening on ws://${HOST}:${PORT}`);
});
