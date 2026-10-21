import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  MAX_IMAGE_BYTES,
  MAX_LABEL_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Card,
  type ClientMessage,
  type Phase,
  type PlayerView,
  type RoomView,
  type ServerMessage,
  type Settings,
} from '../../shared/protocol.ts';
import { randomDeckCard } from '../../shared/decks.ts';

const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#f783ac', '#63e6be'];
const HOST_HANDOFF_MS = 20_000;
const LOBBY_DROP_MS = 60_000;

interface Player {
  id: string;
  token: string;
  name: string;
  color: string;
  socket: WebSocket | null;
  score: number;
  inRound: boolean;
  assignedFor: string | null;
  solved: 'no' | 'guessed' | 'gave-up';
  solvedRank: number | null;
  gotItVotes: Set<string>;
  dropTimer: NodeJS.Timeout | null;
}

export class Room {
  readonly code: string;
  private players = new Map<string, Player>();
  private order: string[] = []; // join order in the lobby, turn order during a round
  private phase: Phase = 'lobby';
  private hostId = '';
  private settings: Settings = { assignSeconds: 90, turnSeconds: 0 };
  private cards = new Map<string, Card>(); // keyed by the player wearing the card
  private turnIndex = 0;
  private turnEndsAt: number | null = null;
  private assignEndsAt: number | null = null;
  private skipVotes = new Set<string>();
  private solvedCount = 0;
  private round = 0;
  private phaseTimer: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;

  constructor(code: string, private onEmpty: (room: Room) => void) {
    this.code = code;
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.socket).length;
  }

  /** Returns the player for this socket, or an error message. */
  join(socket: WebSocket, name: string, token?: string): Player | string {
    const existing = token ? [...this.players.values()].find((p) => p.token === token) : undefined;
    if (existing) {
      existing.socket?.close(4000, 'Replaced by a new connection');
      existing.socket = socket;
      existing.name = cleanName(name) || existing.name;
      if (existing.dropTimer) clearTimeout(existing.dropTimer);
      existing.dropTimer = null;
      if (existing.id === this.hostId && this.hostTimer) {
        clearTimeout(this.hostTimer);
        this.hostTimer = null;
      }
      return existing;
    }
    if (this.players.size >= MAX_PLAYERS) return `Room is full (max ${MAX_PLAYERS} players).`;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const player: Player = {
      id: randomBytes(6).toString('hex'),
      token: randomUUID(),
      name: cleanName(name) || 'Player',
      color: COLORS.find((c) => !used.has(c)) ?? COLORS[0],
      socket,
      score: 0,
      inRound: false,
      assignedFor: null,
      solved: 'no',
      solvedRank: null,
      gotItVotes: new Set(),
      dropTimer: null,
    };
    this.players.set(player.id, player);
    this.order.push(player.id);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  leave(player: Player, socket: WebSocket) {
    if (player.socket !== socket) return; // an older connection closing after a reconnect
    player.socket = null;

    if (player.id === this.hostId) {
      this.hostTimer = setTimeout(() => this.handOffHost(), HOST_HANDOFF_MS);
    }
    if (this.phase === 'lobby' || !player.inRound) {
      player.dropTimer = setTimeout(() => this.remove(player.id), LOBBY_DROP_MS);
    }
    if (this.phase === 'play' && this.turnPlayerId() === player.id) this.advanceTurn();

    if (this.connectedCount === 0) this.onEmpty(this);
    else this.broadcast();
  }

  handle(player: Player, msg: ClientMessage) {
    const isHost = player.id === this.hostId;
    switch (msg.type) {
      case 'settings': {
        if (!isHost || this.phase !== 'lobby') return;
        const s = msg.settings;
        if (s.assignSeconds !== undefined) this.settings.assignSeconds = clamp(s.assignSeconds, 0, 300);
        if (s.turnSeconds !== undefined) this.settings.turnSeconds = clamp(s.turnSeconds, 0, 300);
        break;
      }
      case 'start': {
        if (!isHost || this.phase === 'assign' || this.phase === 'play') return;
        const ready = this.order.filter((id) => this.players.get(id)!.socket);
        if (ready.length < MIN_PLAYERS) return this.send(player, { type: 'error', message: `Need at least ${MIN_PLAYERS} players.` });
        this.startAssign(ready);
        break;
      }
      case 'submit-card': {
        if (this.phase !== 'assign' || !player.inRound || !player.assignedFor) return;
        const label = msg.label.trim().slice(0, MAX_LABEL_LENGTH);
        if (!label) return this.send(player, { type: 'error', message: 'Give the card a name.' });
        const image = msg.image;
        if (image !== null && (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image) || image.length > MAX_IMAGE_BYTES)) {
          return this.send(player, { type: 'error', message: 'That image is too big or not a supported format.' });
        }
        this.cards.set(player.assignedFor, { label, image, pickedBy: player.id });
        if (this.roundPlayers().every((p) => this.cards.has(p.id))) this.startPlay();
        else this.sendCards(player);
        break;
      }
      case 'end-turn': {
        if (this.phase === 'play' && this.turnPlayerId() === player.id) this.advanceTurn();
        break;
      }
      case 'skip-vote': {
        const turnId = this.turnPlayerId();
        if (this.phase !== 'play' || !turnId || turnId === player.id) return;
        toggle(this.skipVotes, player.id);
        if (this.skipVotes.size >= this.votesNeeded(turnId)) this.advanceTurn();
        break;
      }
      case 'got-it': {
        const target = this.players.get(msg.playerId);
        if (this.phase !== 'play' || !target || !target.inRound || target.solved !== 'no' || target.id === player.id) return;
        toggle(target.gotItVotes, player.id);
        if (target.gotItVotes.size >= this.votesNeeded(target.id)) this.markSolved(target, 'guessed');
        break;
      }
      case 'give-up': {
        if (this.phase !== 'play' || !player.inRound || player.solved !== 'no') return;
        this.markSolved(player, 'gave-up');
        break;
      }
      case 'end-round': {
        if (isHost && this.phase === 'play') this.endRound();
        break;
      }
      case 'back-to-lobby': {
        if (!isHost || this.phase === 'lobby') return;
        this.clearPhaseTimer();
        this.phase = 'lobby';
        this.cards.clear();
        for (const p of this.players.values()) this.resetRoundState(p);
        this.broadcastCards();
        break;
      }
      case 'kick': {
        if (!isHost || msg.playerId === player.id) return;
        const target = this.players.get(msg.playerId);
        if (!target) return;
        this.send(target, { type: 'error', message: 'The host removed you from the room.', fatal: true });
        target.socket?.close(4001, 'Kicked');
        this.remove(target.id);
        return;
      }
      default:
        return;
    }
    this.broadcast();
  }

  // ---- phases ----

  private startAssign(ids: string[]) {
    this.clearPhaseTimer();
    this.round++;
    this.cards.clear();
    // Shuffle so the "who picks for whom" chain changes each round.
    this.order = shuffle(ids).concat(this.order.filter((id) => !ids.includes(id)));
    for (const p of this.players.values()) this.resetRoundState(p);
    for (const id of ids) this.players.get(id)!.inRound = true;
    const inRound = this.order.filter((id) => this.players.get(id)!.inRound);
    inRound.forEach((id, i) => (this.players.get(id)!.assignedFor = inRound[(i + 1) % inRound.length]));
    this.phase = 'assign';
    this.solvedCount = 0;
    if (this.settings.assignSeconds > 0) {
      this.assignEndsAt = Date.now() + this.settings.assignSeconds * 1000;
      this.phaseTimer = setTimeout(() => {
        // Anyone who didn't pick in time gets a random card from the built-in decks.
        for (const p of this.roundPlayers()) {
          if (!this.cards.has(p.id)) {
            const picker = this.roundPlayers().find((q) => q.assignedFor === p.id);
            this.cards.set(p.id, { label: randomDeckCard(), image: null, pickedBy: picker?.id ?? '' });
          }
        }
        this.startPlay();
        this.broadcast();
      }, this.settings.assignSeconds * 1000);
    }
    this.broadcastCards();
  }

  private startPlay() {
    this.clearPhaseTimer();
    this.phase = 'play';
    this.assignEndsAt = null;
    this.turnIndex = -1;
    this.advanceTurn();
    this.broadcastCards();
  }

  private advanceTurn() {
    if (this.phase !== 'play') return;
    this.clearPhaseTimer();
    this.skipVotes.clear();
    const n = this.order.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turnIndex + step) % n;
      const p = this.players.get(this.order[idx])!;
      if (p.inRound && p.solved === 'no' && p.socket) {
        this.turnIndex = idx;
        if (this.settings.turnSeconds > 0) {
          this.turnEndsAt = Date.now() + this.settings.turnSeconds * 1000;
          this.phaseTimer = setTimeout(() => {
            this.advanceTurn();
            this.broadcast();
          }, this.settings.turnSeconds * 1000);
        } else {
          this.turnEndsAt = null;
        }
        return;
      }
    }
    // Nobody left who can take a turn (everyone connected has solved).
    if (this.roundPlayers().every((p) => p.solved !== 'no')) this.endRound();
    else {
      this.turnIndex = -1;
      this.turnEndsAt = null;
    }
  }

  private markSolved(player: Player, how: 'guessed' | 'gave-up') {
    player.solved = how;
    player.gotItVotes.clear();
    if (how === 'guessed') {
      player.solvedRank = ++this.solvedCount;
      // First to guess gets the most points; giving up scores nothing.
      player.score += this.roundPlayers().length - player.solvedRank + 1;
      // The picker earns a point too, for choosing something guessable.
      const picker = this.players.get(this.cards.get(player.id)?.pickedBy ?? '');
      if (picker) picker.score += 1;
    }
    if (this.roundPlayers().every((p) => p.solved !== 'no')) return this.endRound();
    if (this.turnPlayerId() === player.id) this.advanceTurn();
    this.broadcastCards();
  }

  private endRound() {
    this.clearPhaseTimer();
    this.phase = 'results';
    this.turnEndsAt = null;
    this.skipVotes.clear();
    this.broadcastCards();
  }

  // ---- helpers ----

  private roundPlayers() {
    return [...this.players.values()].filter((p) => p.inRound);
  }

  private turnPlayerId(): string | null {
    if (this.phase !== 'play' || this.turnIndex < 0) return null;
    return this.order[this.turnIndex] ?? null;
  }

  /** Majority of the *other* connected players, at least one. */
  private votesNeeded(aboutId: string) {
    const others = [...this.players.values()].filter((p) => p.socket && p.id !== aboutId).length;
    return Math.max(1, Math.ceil(others / 2));
  }

  private resetRoundState(p: Player) {
    p.inRound = false;
    p.assignedFor = null;
    p.solved = 'no';
    p.solvedRank = null;
    p.gotItVotes.clear();
  }

  private handOffHost() {
    this.hostTimer = null;
    const next = this.order.map((id) => this.players.get(id)!).find((p) => p.socket);
    if (next) {
      this.hostId = next.id;
      this.broadcast();
    }
  }

  private remove(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.dropTimer) clearTimeout(p.dropTimer);
    const wasTurn = this.turnPlayerId() === id;
    const turnId = this.turnPlayerId();
    this.players.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.cards.delete(id);
    for (const q of this.players.values()) q.gotItVotes.delete(id);
    this.skipVotes.delete(id);
    // Keep turnIndex pointing at the same player after the array shifted.
    if (turnId && !wasTurn) this.turnIndex = this.order.indexOf(turnId);
    else if (wasTurn) {
      this.turnIndex--;
      this.advanceTurn();
    }
    if (this.hostId === id) this.hostId = this.order.find((x) => this.players.get(x)!.socket) ?? this.order[0] ?? '';
    if (this.phase === 'assign' && p.inRound) {
      // Re-link the chain: whoever was picking for the leaver now picks for the leaver's target,
      // unless the leaver already picked that card.
      const picker = this.roundPlayers().find((q) => q.assignedFor === id);
      const orphan = p.assignedFor;
      if (picker) picker.assignedFor = orphan && orphan !== picker.id && !this.cards.has(orphan) ? orphan : null;
    }
    if ((this.phase === 'assign' || this.phase === 'play') && this.roundPlayers().length < MIN_PLAYERS) this.endRound();
    if (this.phase === 'assign' && this.roundPlayers().every((q) => this.cards.has(q.id))) this.startPlay();
    if (this.players.size === 0) return this.onEmpty(this);
    this.broadcast();
    this.broadcastCards();
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  isEmpty() {
    return this.players.size === 0 || this.connectedCount === 0;
  }

  dispose() {
    this.clearPhaseTimer();
    if (this.hostTimer) clearTimeout(this.hostTimer);
    for (const p of this.players.values()) if (p.dropTimer) clearTimeout(p.dropTimer);
    this.cards.clear();
  }

  // ---- networking ----

  view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: this.order.map((id) => {
        const p = this.players.get(id)!;
        const pv: PlayerView = {
          id: p.id,
          name: p.name,
          color: p.color,
          connected: !!p.socket,
          isHost: p.id === this.hostId,
          score: p.score,
          inRound: p.inRound,
          assignedFor: p.assignedFor,
          submitted: p.inRound && (!p.assignedFor || this.cards.get(p.assignedFor)?.pickedBy === p.id),
          solved: p.solved,
          solvedRank: p.solvedRank,
          gotItVotes: [...p.gotItVotes],
        };
        return pv;
      }),
      turnPlayerId: this.turnPlayerId(),
      turnEndsAt: this.turnEndsAt,
      assignEndsAt: this.assignEndsAt,
      skipVotes: [...this.skipVotes],
      round: this.round,
    };
  }

  /** The cards this player may see. The server never sends you your own unsolved card. */
  private visibleCards(viewer: Player): Record<string, Card> {
    const out: Record<string, Card> = {};
    for (const [wearer, card] of this.cards) {
      const p = this.players.get(wearer);
      if (!p) continue;
      const visible =
        this.phase === 'results' ||
        (this.phase === 'assign' && card.pickedBy === viewer.id) ||
        (this.phase === 'play' && (wearer !== viewer.id || p.solved !== 'no'));
      if (visible) out[wearer] = card;
    }
    return out;
  }

  sendWelcome(player: Player, livekit: { url: string; token: string } | null) {
    this.send(player, { type: 'welcome', playerId: player.id, token: player.token, livekit });
    this.sendCards(player);
  }

  sendCards(player: Player) {
    this.send(player, { type: 'cards', cards: this.visibleCards(player) });
  }

  broadcastCards() {
    for (const p of this.players.values()) this.sendCards(p);
  }

  broadcast() {
    const msg: ServerMessage = { type: 'state', room: this.view(), serverNow: Date.now() };
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.socket?.readyState === 1) p.socket.send(data);
  }

  send(player: Player, msg: ServerMessage) {
    if (player.socket?.readyState === 1) player.socket.send(JSON.stringify(msg));
  }
}

export type { Player };

function cleanName(name: unknown) {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
}

function clamp(n: unknown, min: number, max: number) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;
}

function toggle<T>(set: Set<T>, v: T) {
  if (set.has(v)) set.delete(v);
  else set.add(v);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
