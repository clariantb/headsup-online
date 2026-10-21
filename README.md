# Heads Up Online

A video-call party game for 2–6 friends. Everyone wears a card on their forehead that follows their face. You can see everyone's card but your own, which shows as a black `?`.

## How a round works

1. **Pick:** each player picks a card for the next player in a shuffled chain. Paste an image (Ctrl/⌘+V), drop or upload a file, or roll a random card from a built-in deck. Anyone still picking when the timer runs out gets a random card.
2. **Play:** turns follow the order shown in the side panel. The current player asks yes/no questions out loud. When they're done they press **Done**, or the rest of the table can **vote skip** (a majority of the others is needed).
3. **Guess:** when someone says their answer, the others tap **✓ Got it** on that player's tile (again a majority of the others). Points go 1st = N, 2nd = N−1, and so on. Whoever picked the card gets +1. You can also give up, which reveals your card and scores 0.
4. **Results:** every card is revealed. The host starts the next round.

## Running it

```bash
npm install
npm run dev:server   # game server on :3001
npm run dev:client   # Vite on :5173 (proxies /api and /ws to :3001)
```

Open http://localhost:5173 and share the room link.

### Video (LiveKit)

Without LiveKit settings the game still runs, but only you can see your own camera. Other players show as avatars. To turn on video and audio:

```bash
cp .env.example .env
docker compose up livekit          # local dev server: ws://localhost:7880, devkey / secret
```

Or create a free project at https://cloud.livekit.io and put its URL, key and secret in `.env`. Restart the game server afterwards.

To play with friends over the internet, the page needs HTTPS (browsers only allow camera access on HTTPS or localhost). A LiveKit Cloud project plus any Node host, or a tunnel such as `cloudflared` for a quick test, is enough.

### Production

```bash
npm run build && npm start   # the server also serves client/dist
```

## How it works

| Piece | Where |
| --- | --- |
| Rooms, phases, turns, votes, scoring | `server/src/room.ts` (the server holds all game state) |
| HTTP + WebSocket, LiveKit tokens | `server/src/index.ts` |
| Shared message types | `shared/protocol.ts` |
| Face tracking (MediaPipe Face Landmarker) | `client/src/face.ts` |
| Video, audio and forehead poses over LiveKit | `client/src/useMedia.ts` |
| Card glued to the forehead | `client/src/components/Tile.tsx` |

- **No peeking:** the server never sends you your own card until you've solved it or the round has ended, so DevTools shows nothing.
- **Cheap tracking:** each player only tracks *their own* face (~15 fps) and sends a tiny `{x, y, w, angle}` about 12 times a second over LiveKit's lossy data channel. Every viewer draws the card over the video locally and smooths its movement.
- **Privacy:** images are shrunk in the browser (max 512px, WebP) and relayed through server memory only. They're dropped when the round resets or the room empties (5 minutes after the last person leaves). Nothing is written to disk.

## Not done yet / ideas

- A public room browser, with moderation (report / kick votes). Pasted images go to strangers without any checks.
- Moving face tracking into a Web Worker. It runs on the main thread for now.
- Code-splitting MediaPipe / LiveKit out of the main bundle.
- Sound effects, a reveal animation, and a card that wobbles with head movement.
