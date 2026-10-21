import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { AccessToken } from 'livekit-server-sdk';
import { Room, type Player } from './room.ts';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';

const PORT = Number(process.env.PORT ?? 3001);
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const livekitEnabled = !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
const EMPTY_ROOM_TTL_MS = 5 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

const rooms = new Map<string, Room>();
const emptyTimers = new Map<string, NodeJS.Timeout>();

function onRoomEmpty(room: Room) {
  clearTimeout(emptyTimers.get(room.code));
  emptyTimers.set(
    room.code,
    setTimeout(() => {
      emptyTimers.delete(room.code);
      if (!room.isEmpty()) return;
      room.dispose(); // drops every card and image from memory
      rooms.delete(room.code);
    }, EMPTY_ROOM_TTL_MS),
  );
}

function newCode() {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

async function livekitToken(room: Room, player: Player) {
  if (!livekitEnabled) return null;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: player.id, name: player.name, ttl: '6h' });
  at.addGrant({ roomJoin: true, room: `headsup-${room.code}`, canPublish: true, canSubscribe: true, canPublishData: true });
  return { url: LIVEKIT_URL, token: await at.toJwt() };
}

const app = express();
app.use(express.json());

app.post('/api/rooms', (_req, res) => {
  const code = newCode();
  const room = new Room(code, onRoomEmpty);
  rooms.set(code, room);
  onRoomEmpty(room); // reaped if nobody ever joins
  res.json({ code });
});

app.get('/api/rooms/:code', (req, res) => {
  res.json({ exists: rooms.has(req.params.code.toUpperCase()) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, video: livekitEnabled }));

// In production the server also serves the built client.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

wss.on('connection', (socket: WebSocket) => {
  let room: Room | null = null;
  let player: Player | null = null;

  const send = (msg: ServerMessage) => socket.readyState === 1 && socket.send(JSON.stringify(msg));

  socket.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      if (player) return;
      const code = String(msg.code ?? '').toUpperCase();
      const target = rooms.get(code);
      if (!target) return send({ type: 'error', message: 'That room does not exist (or it expired).', fatal: true });
      const result = target.join(socket, msg.name, msg.token);
      if (typeof result === 'string') return send({ type: 'error', message: result, fatal: true });
      room = target;
      player = result;
      clearTimeout(emptyTimers.get(code));
      emptyTimers.delete(code);
      room.sendWelcome(player, await livekitToken(room, player));
      room.broadcast();
      return;
    }

    if (room && player) {
      try {
        room.handle(player, msg);
      } catch (err) {
        console.error('Error handling message', msg.type, err);
      }
    }
  });

  socket.on('close', () => {
    if (room && player) room.leave(player, socket);
  });
});

server.listen(PORT, () => {
  console.log(`Heads Up server on http://localhost:${PORT} (video: ${livekitEnabled ? LIVEKIT_URL : 'off'})`);
});
