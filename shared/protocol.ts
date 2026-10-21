// Types shared by the game server and the browser client.

export type Phase = 'lobby' | 'assign' | 'play' | 'results';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_IMAGE_BYTES = 400_000; // data URL length cap, after client-side resize
export const MAX_LABEL_LENGTH = 60;

export interface Settings {
  assignSeconds: number; // 0 = no timer
  turnSeconds: number; // 0 = no timer
}

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  // Round state
  inRound: boolean; // false for people who joined mid-round; they play next round
  assignedFor: string | null; // id of the player this player picks a card for
  submitted: boolean; // has picked a card for assignedFor
  solved: 'no' | 'guessed' | 'gave-up';
  solvedRank: number | null;
  gotItVotes: string[]; // ids of players who said this player guessed right
}

export interface RoomView {
  code: string;
  phase: Phase;
  hostId: string;
  settings: Settings;
  players: PlayerView[]; // in turn order once a round starts
  turnPlayerId: string | null;
  turnEndsAt: number | null; // epoch ms
  assignEndsAt: number | null;
  skipVotes: string[];
  round: number;
}

export interface Card {
  label: string;
  image: string | null; // data URL, held in server memory only
  pickedBy: string;
}

export type ClientMessage =
  | { type: 'join'; code: string; name: string; token?: string }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'start' }
  | { type: 'submit-card'; label: string; image: string | null }
  | { type: 'end-turn' }
  | { type: 'skip-vote' }
  | { type: 'got-it'; playerId: string }
  | { type: 'give-up' }
  | { type: 'end-round' }
  | { type: 'back-to-lobby' }
  | { type: 'kick'; playerId: string };

export type ServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      token: string;
      livekit: { url: string; token: string } | null;
    }
  | { type: 'state'; room: RoomView; serverNow: number }
  // Every card the recipient is allowed to see. Never includes their own unsolved card.
  | { type: 'cards'; cards: Record<string, Card> }
  | { type: 'error'; message: string; fatal?: boolean };

// Sent peer-to-peer over the LiveKit data channel by each player about their own face.
// Coordinates are normalized to the raw (unmirrored) camera frame.
export interface ForeheadPose {
  x: number;
  y: number;
  w: number; // card width as a fraction of frame width
  angle: number; // radians
}

export const FACE_TOPIC = 'face';
