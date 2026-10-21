import { useEffect, useState } from 'react';
import { MIN_PLAYERS, type Card, type ClientMessage, type PlayerView, type RoomView } from '../../../shared/protocol.ts';
import { CardPicker } from './CardPicker.tsx';
import { CardFace } from './CardFace.tsx';
import { Countdown } from './Countdown.tsx';

interface PanelProps {
  room: RoomView;
  me: PlayerView;
  cards: Record<string, Card>;
  send(msg: ClientMessage): void;
  showToast(msg: string): void;
  serverOffset: number;
}

const nameOf = (room: RoomView, id: string | null) => room.players.find((p) => p.id === id)?.name ?? '?';

export function LobbyPanel({ room, me, send }: PanelProps) {
  const [copied, setCopied] = useState(false);
  const isHost = me.isHost;
  const connected = room.players.filter((p) => p.connected).length;
  const link = `${location.origin}/r/${room.code}`;

  return (
    <div className="panel">
      <h2>Lobby</h2>
      <div className="share">
        <code>{link}</code>
        <button
          className="btn btn--ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied!' : 'Copy invite'}
        </button>
      </div>

      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id}>
            <span className="dot" style={{ background: p.color }} />
            {p.name}
            {p.isHost && ' 👑'}
            {!p.connected && <span className="muted"> (away)</span>}
            {isHost && p.id !== me.id && (
              <button className="link" onClick={() => send({ type: 'kick', playerId: p.id })}>
                remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Rules</h3>
      <ol className="rules">
        <li>Everyone picks a card for the next player. Paste any image from the web, or roll a random one.</li>
        <li>You see everyone's card on their forehead — except your own.</li>
        <li>Take turns asking yes/no questions out loud. House rules are up to you!</li>
        <li>When someone says the answer, tap ✓ on their tile. The table votes to skip a turn if it drags.</li>
      </ol>

      {isHost ? (
        <>
          <div className="settings">
            <label>
              Picking timer
              <select
                value={room.settings.assignSeconds}
                onChange={(e) => send({ type: 'settings', settings: { assignSeconds: +e.target.value } })}
              >
                <option value={0}>Off</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
                <option value={120}>2 min</option>
                <option value={180}>3 min</option>
              </select>
            </label>
            <label>
              Turn timer
              <select
                value={room.settings.turnSeconds}
                onChange={(e) => send({ type: 'settings', settings: { turnSeconds: +e.target.value } })}
              >
                <option value={0}>Off (free play)</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
                <option value={120}>2 min</option>
              </select>
            </label>
          </div>
          <button className="btn btn--primary btn--wide" disabled={connected < MIN_PLAYERS} onClick={() => send({ type: 'start' })}>
            {connected < MIN_PLAYERS ? `Waiting for players (${connected}/${MIN_PLAYERS})` : 'Start round'}
          </button>
        </>
      ) : (
        <p className="muted center">Waiting for {nameOf(room, room.hostId)} to start…</p>
      )}
    </div>
  );
}

export function AssignPanel({ room, me, cards, send, showToast, serverOffset }: PanelProps) {
  const waiting = room.players.filter((p) => p.inRound && !p.submitted);
  return (
    <div className="panel">
      <div className="panel__head">
        <span>Round {room.round} · picking cards</span>
        <Countdown endsAt={room.assignEndsAt} serverOffset={serverOffset} />
      </div>
      {!me.inRound ? (
        <p className="muted">You joined mid-round. You'll be in the next one — enjoy the show!</p>
      ) : me.assignedFor ? (
        <CardPicker
          key={me.assignedFor}
          forName={nameOf(room, me.assignedFor)}
          current={cards[me.assignedFor]?.pickedBy === me.id ? cards[me.assignedFor] : null}
          onSubmit={(label, image, hint) => send({ type: 'submit-card', label, image, hint })}
          onError={showToast}
        />
      ) : (
        <p className="muted">Nothing to pick this time.</p>
      )}
      <p className="muted small">
        {waiting.length ? `Still picking: ${waiting.map((p) => p.name).join(', ')}` : 'Everyone is ready!'}
        {room.assignEndsAt ? " · Anyone who runs out of time gets a random card." : ''}
      </p>
    </div>
  );
}

export function PlayPanel({ room, me, send, serverOffset }: PanelProps) {
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const turn = room.players.find((p) => p.id === room.turnPlayerId) ?? null;
  const myTurn = turn?.id === me.id;
  const others = room.players.filter((p) => p.connected && p.id !== turn?.id).length;
  const skipNeeded = Math.max(1, Math.ceil(others / 2));
  const iVotedSkip = room.skipVotes.includes(me.id);
  const unsolved = room.players.filter((p) => p.inRound && p.solved === 'no');

  return (
    <div className="panel">
      <div className="panel__head">
        <span>Round {room.round}</span>
        <Countdown endsAt={room.turnEndsAt} serverOffset={serverOffset} />
      </div>

      <div className={`turn ${myTurn ? 'turn--me' : ''}`}>
        {turn ? (
          myTurn ? (
            <>
              <strong>Your turn!</strong> Ask a yes/no question about your card.
            </>
          ) : (
            <>
              <strong style={{ color: turn.color }}>{turn.name}</strong> is asking.
            </>
          )
        ) : (
          'Free play'
        )}
      </div>

      <div className="row">
        {myTurn && (
          <button className="btn btn--primary" onClick={() => send({ type: 'end-turn' })}>
            Done — next player
          </button>
        )}
        {turn && !myTurn && (
          <button className={`btn ${iVotedSkip ? 'btn--active' : 'btn--ghost'}`} onClick={() => send({ type: 'skip-vote' })}>
            {iVotedSkip ? 'Voted skip' : 'Vote skip'} ({room.skipVotes.length}/{skipNeeded})
          </button>
        )}
      </div>

      <h3>Turn order</h3>
      <ol className="order">
        {room.players
          .filter((p) => p.inRound)
          .map((p) => (
            <li key={p.id} className={p.id === turn?.id ? 'current' : p.solved !== 'no' ? 'done' : ''}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
              {p.solved === 'guessed' && ' ✓'}
              {p.solved === 'gave-up' && ' ✗'}
            </li>
          ))}
      </ol>

      <p className="muted small">
        Someone said their answer? Tap <strong>✓ Got it</strong> on their tile. {unsolved.length} still guessing.
      </p>

      {me.inRound && me.solved === 'no' && (
        <>
          {me.hint && (
            <div className="my-hint">
              Hint for your card: <strong>{me.hint}</strong>
            </div>
          )}
          <Notes storageKey={`headsup:notes:${room.code}:${room.round}`} />
        </>
      )}

      {me.inRound && me.solved === 'no' && (
        <div className="row">
          {confirmGiveUp ? (
            <>
              <span>Reveal your card?</span>
              <button className="btn btn--danger" onClick={() => send({ type: 'give-up' })}>
                Yes, give up
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirmGiveUp(false)}>
                Keep trying
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmGiveUp(true)}>
              I give up 🏳️
            </button>
          )}
        </div>
      )}

      {me.isHost && (
        <button className="link" onClick={() => send({ type: 'end-round' })}>
          End round now (host)
        </button>
      )}
    </div>
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
    <label className="field notes">
      <span>My notes (only you see these)</span>
      <textarea rows={3} value={text} placeholder="e.g. not an animal · real person · on TV" onChange={(e) => setText(e.target.value)} />
    </label>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function ResultsPanel({ room, me, cards, send }: PanelProps) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <div className="panel">
      <h2>Round {room.round} results</h2>
      <div className="reveal">
        {room.players
          .filter((p) => cards[p.id])
          .map((p) => (
            <div key={p.id} className="reveal__item">
              <div className="reveal__card">
                <CardFace card={cards[p.id]} />
              </div>
              <div>
                <strong style={{ color: p.color }}>{p.name}</strong>
                <div className="muted small">
                  {p.solved === 'guessed' ? `Guessed #${p.solvedRank}` : p.solved === 'gave-up' ? 'Gave up' : 'Unsolved'} · picked by{' '}
                  {nameOf(room, cards[p.id].pickedBy)}
                </div>
              </div>
            </div>
          ))}
      </div>

      <h3>Scoreboard</h3>
      <ol className="scores">
        {ranked.map((p, i) => (
          <li key={p.id} className={i === 0 && p.score > 0 ? 'winner' : ''}>
            <span className="medal">{p.score > 0 ? MEDALS[i] ?? '' : ''}</span>
            <span className="dot" style={{ background: p.color }} />
            {p.name}
            <strong>{p.score}</strong>
          </li>
        ))}
      </ol>
      <p className="muted small">Guessing first scores the most. Pickers earn 1 point when their card gets guessed.</p>

      {me.isHost ? (
        <div className="row">
          <button className="btn btn--primary" onClick={() => send({ type: 'start' })}>
            Play another round
          </button>
          <button className="btn btn--ghost" onClick={() => send({ type: 'back-to-lobby' })}>
            Back to lobby
          </button>
        </div>
      ) : (
        <p className="muted center">Waiting for {nameOf(room, room.hostId)} to start the next round…</p>
      )}
    </div>
  );
}
