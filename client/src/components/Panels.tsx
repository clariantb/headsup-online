import { useEffect, useState } from 'react';
import { MIN_PLAYERS, type Card, type ClientMessage, type PlayerView, type RoomView } from '../../../shared/protocol.ts';
import { CardPicker } from './CardPicker.tsx';
import { CardBack, CardFace } from './CardFace.tsx';
import { Countdown } from './Countdown.tsx';
import { CheckIcon, CopyIcon, CrownIcon, FlagIcon } from './Icons.tsx';

interface PanelProps {
  room: RoomView;
  me: PlayerView;
  cards: Record<string, Card>;
  send(msg: ClientMessage): void;
  showToast(msg: string): void;
  serverOffset: number;
}

const nameOf = (room: RoomView, id: string | null) => room.players.find((p) => p.id === id)?.name ?? '?';
const colorVar = (p: PlayerView) => ({ '--player-color': p.color }) as React.CSSProperties;

export function LobbyPanel({ room, me, send, showToast }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const connected = room.players.filter((p) => p.connected).length;
  const link = `${location.origin}/r/${room.code}`;

  const share = async () => {
    // Phones get the native share sheet; desktops copy the link.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Heads Up Online', text: `Join my Heads Up game (room ${room.code})`, url: link }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast(`Copy this link: ${link}`);
    }
  };

  return (
    <>
      <div className="sheet__head">
        <h2>Who's playing</h2>
        <span className="mono small muted">
          {room.players.length}/6
        </span>
      </div>

      <div className="invite">
        <code>{link.replace(/^https?:\/\//, '')}</code>
        <button onClick={() => void share()}>
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          {copied ? 'Copied' : 'Invite'}
        </button>
      </div>

      <div className="label">Players</div>
      <ul className="roster">
        {room.players.map((p) => (
          <li key={p.id} className={p.connected ? '' : 'is-away'} style={colorVar(p)}>
            <span className="swatch" />
            <span className="roster__name">
              {p.name}
              {p.id === me.id && <span className="muted"> · you</span>}
            </span>
            {p.isHost && (
              <span className="roster__meta">
                <CrownIcon size={14} /> host
              </span>
            )}
            {!p.connected && <span className="roster__meta">away</span>}
            {me.isHost && p.id !== me.id && (
              <button className="link-btn" onClick={() => send({ type: 'kick', playerId: p.id })}>
                remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="label">How it works</div>
      <ol className="rules">
        <li>Everyone picks a card for the next person. Paste a picture from anywhere, or roll one from the deck.</li>
        <li>You see every card except the one on your own forehead.</li>
        <li>Take turns asking yes-or-no questions out loud. The table answers.</li>
        <li>Say the right answer and the others tap Got it. First to guess scores the most.</li>
      </ol>

      {me.isHost ? (
        <>
          <div className="label">Settings</div>
          <div className="settings-grid">
            <label>
              Time to pick a card
              <select value={room.settings.assignSeconds} onChange={(e) => send({ type: 'settings', settings: { assignSeconds: +e.target.value } })}>
                <option value={0}>No limit</option>
                <option value={60}>1 minute</option>
                <option value={90}>90 seconds</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
              </select>
            </label>
            <label>
              Time per turn
              <select value={room.settings.turnSeconds} onChange={(e) => send({ type: 'settings', settings: { turnSeconds: +e.target.value } })}>
                <option value={0}>No limit</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={90}>90 seconds</option>
                <option value={120}>2 minutes</option>
              </select>
            </label>
          </div>
          <button className="btn btn--primary btn--block" disabled={connected < MIN_PLAYERS} onClick={() => send({ type: 'start' })}>
            {connected < MIN_PLAYERS ? 'Waiting for one more player' : 'Deal the cards'}
          </button>
        </>
      ) : (
        <div className="waiting">Waiting for {nameOf(room, room.hostId)} to deal the cards…</div>
      )}
    </>
  );
}

export function AssignPanel({ room, me, cards, send, showToast, serverOffset }: PanelProps) {
  const waiting = room.players.filter((p) => p.inRound && !p.submitted);
  const target = room.players.find((p) => p.id === me.assignedFor);
  return (
    <>
      <div className="sheet__head">
        <span className="mono small muted">Round {room.round}</span>
        <Countdown endsAt={room.assignEndsAt} serverOffset={serverOffset} />
      </div>
      {!me.inRound ? (
        <div className="waiting">You joined mid-round, so you're watching this one. You'll get a card next round.</div>
      ) : target ? (
        <CardPicker
          key={target.id}
          target={target}
          current={cards[target.id]?.pickedBy === me.id ? cards[target.id] : null}
          onSubmit={(label, image, hint) => send({ type: 'submit-card', label, image, hint })}
          onError={showToast}
        />
      ) : (
        <div className="waiting">Nothing for you to pick this round.</div>
      )}
      <p className="status-line">
        {waiting.length ? <>Still picking: {waiting.map((p) => p.name).join(', ')}.</> : 'Everyone is ready.'}
        {room.assignEndsAt ? ' Anyone who runs out of time gets a random card.' : ''}
      </p>
    </>
  );
}

export function PlayPanel({ room, me, send, serverOffset }: PanelProps) {
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const turn = room.players.find((p) => p.id === room.turnPlayerId) ?? null;
  const myTurn = turn?.id === me.id;
  const others = room.players.filter((p) => p.connected && p.id !== turn?.id).length;
  const skipNeeded = Math.max(1, Math.ceil(others / 2));
  const iVotedSkip = room.skipVotes.includes(me.id);
  const guessing = me.inRound && me.solved === 'no';

  return (
    <>
      <div className="sheet__head">
        <span className="mono small muted">Round {room.round}</span>
        <Countdown endsAt={room.turnEndsAt} serverOffset={serverOffset} />
      </div>

      <div className={`who ${myTurn ? 'who--me' : ''}`}>
        <div className="who__kicker">{myTurn ? 'Your turn' : turn ? 'Now asking' : 'Free play'}</div>
        <div className="who__title">{myTurn ? 'Ask a yes-or-no question' : turn ? turn.name : 'Anyone can ask'}</div>
        <div className="who__actions">
          {myTurn && (
            <button className="btn btn--ink" onClick={() => send({ type: 'end-turn' })}>
              I'm done, next player
            </button>
          )}
          {turn && !myTurn && (
            <button className={`btn btn--sm ${iVotedSkip ? 'btn--selected' : ''}`} onClick={() => send({ type: 'skip-vote' })}>
              {iVotedSkip ? 'Voted to skip' : 'Vote to skip'} · {room.skipVotes.length}/{skipNeeded}
            </button>
          )}
        </div>
      </div>

      {guessing && (
        <>
          <div className="label">Your card</div>
          <div className="my-card">
            <CardBack hint={me.hint} />
            <p>{me.hint ? <>The picker says it's a <strong>{me.hint.toLowerCase()}</strong>.</> : 'No hint this round.'}</p>
          </div>
          <Notes storageKey={`headsup:notes:${room.code}:${room.round}`} />
        </>
      )}

      <div className="label">Turn order</div>
      <ul className="roster">
        {room.players
          .filter((p) => p.inRound)
          .map((p) => (
            <li key={p.id} className={p.id === turn?.id ? 'is-current' : p.solved !== 'no' ? 'is-done' : ''} style={colorVar(p)}>
              <span className="swatch" />
              <span className="roster__name">{p.name}</span>
              <span className="roster__meta">
                {p.solved === 'guessed' ? `got it #${p.solvedRank}` : p.solved === 'gave-up' ? 'gave up' : p.id === turn?.id ? 'asking' : ''}
              </span>
            </li>
          ))}
      </ul>
      <p className="status-line">When someone names their card, tap Got it on their video.</p>

      {(guessing || me.isHost) && (
        <div className="host-tools">
          {guessing &&
            (confirmGiveUp ? (
              <div className="who__actions" style={{ marginTop: 0 }}>
                <button className="btn btn--primary btn--sm" onClick={() => send({ type: 'give-up' })}>
                  Yes, show me my card
                </button>
                <button className="btn btn--sm" onClick={() => setConfirmGiveUp(false)}>
                  Keep guessing
                </button>
              </div>
            ) : (
              <button className="link-btn" onClick={() => setConfirmGiveUp(true)}>
                <FlagIcon size={16} /> I give up
              </button>
            ))}
          {me.isHost && (
            <div>
              <button className="link-btn" onClick={() => send({ type: 'end-round' })}>
                End the round for everyone
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Private scratchpad for what you've learned about your own card. Never leaves your browser. */
function Notes({ storageKey }: { storageKey: string }) {
  const [text, setText] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, text);
    } catch {}
  }, [storageKey, text]);
  return (
    <label className="field notes" style={{ marginTop: '0.9rem' }}>
      <span className="field__label">
        Notes <em>only you can see these</em>
      </span>
      <textarea rows={3} value={text} placeholder="not an animal, real person, on TV…" onChange={(e) => setText(e.target.value)} />
    </label>
  );
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function ResultsPanel({ room, me, cards, send }: PanelProps) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <>
      <div className="sheet__head">
        <h2>Round {room.round}</h2>
        <span className="mono small muted">all cards revealed</span>
      </div>

      <div className="reveal">
        {room.players
          .filter((p) => cards[p.id])
          .map((p) => (
            <div key={p.id} className="reveal__item">
              <CardFace card={cards[p.id]} />
              <div className="reveal__who">{p.name}</div>
              <div className="reveal__how">
                {p.solved === 'guessed' ? `got it #${p.solvedRank}` : p.solved === 'gave-up' ? 'gave up' : 'unsolved'} · by {nameOf(room, cards[p.id].pickedBy)}
              </div>
            </div>
          ))}
      </div>

      <div className="label">Scores</div>
      <ol className="scoreboard">
        {ranked.map((p, i) => (
          <li key={p.id} className={i === 0 && p.score > 0 ? 'is-winner' : ''} style={colorVar(p)}>
            <span className="scoreboard__rank">{ORDINALS[i]}</span>
            <span className="swatch" />
            <span className="roster__name">{p.name}</span>
            <span className="scoreboard__pts">{p.score}</span>
          </li>
        ))}
      </ol>
      <p className="status-line">The first to guess scores the most. Pickers get a point when their card is guessed.</p>

      {me.isHost ? (
        <div className="result-actions">
          <button className="btn btn--primary" onClick={() => send({ type: 'start' })}>
            Deal another round
          </button>
          <button className="btn" onClick={() => send({ type: 'back-to-lobby' })}>
            Back to lobby
          </button>
        </div>
      ) : (
        <div className="waiting">Waiting for {nameOf(room, room.hostId)} to deal the next round…</div>
      )}
    </>
  );
}
