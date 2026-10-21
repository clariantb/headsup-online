import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, ClientMessage, Reaction, RoomView, ServerMessage } from '../../shared/protocol.ts';

export interface ReactionBubble {
  id: number;
  playerId: string;
  reaction: Reaction;
}

const REACTION_SHOW_MS = 2600;
let nextReactionId = 1;

export interface GameState {
  status: 'connecting' | 'connected' | 'reconnecting' | 'closed';
  playerId: string | null;
  room: RoomView | null;
  cards: Record<string, Card>;
  livekit: { url: string; token: string } | null;
  fatalError: string | null;
  toast: string | null;
  serverOffset: number; // serverNow - Date.now()
  reactions: ReactionBubble[];
}

const tokenKey = (code: string) => `headsup:token:${code}`;

export function useGame(code: string, name: string) {
  const [state, setState] = useState<GameState>({
    status: 'connecting',
    playerId: null,
    room: null,
    cards: {},
    livekit: null,
    fatalError: null,
    toast: null,
    serverOffset: 0,
    reactions: [],
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let retryTimer: number | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        let token: string | undefined;
        try {
          token = sessionStorage.getItem(tokenKey(code)) ?? undefined;
        } catch {}
        ws.send(JSON.stringify({ type: 'join', code, name, token } satisfies ClientMessage));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        switch (msg.type) {
          case 'welcome':
            try {
              sessionStorage.setItem(tokenKey(code), msg.token);
            } catch {}
            setState((s) => ({
              ...s,
              status: 'connected',
              playerId: msg.playerId,
              // Keep the first LiveKit token so a WebSocket reconnect doesn't restart video.
              livekit: s.livekit ?? msg.livekit,
            }));
            break;
          case 'state':
            setState((s) => ({ ...s, room: msg.room, serverOffset: msg.serverNow - Date.now() }));
            break;
          case 'cards':
            setState((s) => ({ ...s, cards: msg.cards }));
            break;
          case 'reaction': {
            const bubble = { id: nextReactionId++, playerId: msg.playerId, reaction: msg.reaction };
            setState((s) => ({ ...s, reactions: [...s.reactions.slice(-11), bubble] }));
            setTimeout(() => setState((s) => ({ ...s, reactions: s.reactions.filter((r) => r.id !== bubble.id) })), REACTION_SHOW_MS);
            break;
          }
          case 'error':
            if (msg.fatal) {
              closed = true;
              setState((s) => ({ ...s, status: 'closed', fatalError: msg.message }));
            } else {
              setState((s) => ({ ...s, toast: msg.message }));
            }
            break;
        }
      };

      ws.onclose = () => {
        if (closed) return;
        setState((s) => ({ ...s, status: 'reconnecting' }));
        retryTimer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [code, name]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => setState((s) => ({ ...s, toast: null })), 3500);
    return () => clearTimeout(t);
  }, [state.toast]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const showToast = useCallback((toast: string) => setState((s) => ({ ...s, toast })), []);

  return { ...state, send, showToast };
}
