import { useEffect, useRef, useState } from 'react';
import { useGame } from '../useGame.ts';
import { useMedia, type MediaPrefs } from '../useMedia.ts';
import { sfx } from '../sfx.ts';
import { confetti, confettiAt } from '../confetti.ts';
import { Tile, type Overlay } from './Tile.tsx';
import { DevicePicker } from './DevicePicker.tsx';
import { AssignPanel, LobbyPanel, PlayPanel, ResultsPanel } from './Panels.tsx';
import { REACTIONS, type PlayerView, type Reaction, type RoomView } from '../../../shared/protocol.ts';

const REACTION_KEYS: Record<string, Reaction> = { y: 'yes', n: 'no', s: 'maybe', c: 'close', h: 'laugh' };

export function RoomScreen({ code, name, prefs, onLeave }: { code: string; name: string; prefs: MediaPrefs; onLeave(): void }) {
  const game = useGame(code, name);
  const media = useMedia(game.playerId, game.livekit, prefs);
  const { room, playerId, cards, send } = game;
  const me = room?.players.find((p) => p.id === playerId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(sfx.isMuted());

  useGameEffects(room, playerId);

  // Keyboard shortcuts for reactions while playing.
  const canReact = room?.phase === 'play';
  useEffect(() => {
    if (!canReact) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
      const reaction = REACTION_KEYS[e.key.toLowerCase()];
      if (reaction) send({ type: 'react', reaction });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canReact, send]);

  // Sound for incoming reactions.
  const lastReaction = game.reactions.at(-1)?.id;
  useEffect(() => {
    if (lastReaction) sfx.reaction();
  }, [lastReaction]);

  if (game.fatalError) {
    return (
      <div className="center-screen">
        <div className="panel narrow">
          <h2>Can't join</h2>
          <p>{game.fatalError}</p>
          <button className="btn btn--primary" onClick={onLeave}>
            Back home
          </button>
        </div>
      </div>
    );
  }
  if (!room || !me) {
    return (
      <div className="center-screen muted">
        <div className="spinner" />
        Joining room {code}…
      </div>
    );
  }

  const panelProps = { room, me, cards, send, showToast: game.showToast, serverOffset: game.serverOffset };
  const showCards = room.phase === 'play' || room.phase === 'results';

  const overlayFor = (p: PlayerView): Overlay => {
    if (!showCards || !p.inRound) return null;
    const card = cards[p.id];
    if (card) return { kind: 'card', card };
    // Your own unsolved card: the server never sent it, so there's nothing to peek at.
    return p.id === me.id ? { kind: 'hidden', hint: p.hint } : null;
  };

  return (
    <div className="room">
      <header className="room__bar">
        <button className="link" onClick={onLeave}>
          ← Leave
        </button>
        <span className="room__code">
          Room <strong>{room.code}</strong>
        </span>
        <div className="room__controls">
          {media.mode === 'livekit' && (
            <button className={`btn btn--icon ${media.micOn ? '' : 'btn--off'}`} onClick={media.toggleMic} title={media.micOn ? 'Mute' : 'Unmute'}>
              {media.micOn ? '🎙️' : '🔇'}
            </button>
          )}
          <button className={`btn btn--icon ${media.camOn ? '' : 'btn--off'}`} onClick={media.toggleCam} title={media.camOn ? 'Turn camera off' : 'Turn camera on'}>
            {media.camOn ? '📷' : '🚫'}
          </button>
          <div className="popover-anchor">
            <button className="btn btn--icon" onClick={() => setSettingsOpen((v) => !v)} title="Settings" aria-expanded={settingsOpen}>
              ⚙️
            </button>
            {settingsOpen && (
              <div className="popover" role="dialog">
                <DevicePicker
                  videoDeviceId={media.videoDeviceId}
                  audioDeviceId={media.audioDeviceId}
                  onChange={media.setDevice}
                  showAudio={media.mode === 'livekit'}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!muted}
                    onChange={(e) => {
                      sfx.setMuted(!e.target.checked);
                      setMuted(!e.target.checked);
                    }}
                  />
                  Sound effects
                </label>
                <button className="btn btn--ghost btn--small" onClick={() => setSettingsOpen(false)}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {game.status === 'reconnecting' && <div className="banner">Connection lost — reconnecting…</div>}
      {media.mode === 'local-only' && (
        <div className="banner banner--info">Video server not configured: only you can see your camera. Game still works.</div>
      )}
      {media.error && <div className="banner">{media.error}</div>}
      {media.audioBlocked && (
        <button className="banner banner--action" onClick={media.startAudio}>
          🔊 Click to enable sound
        </button>
      )}

      <main className="room__main">
        <div className="room__stage">
          <section className={`grid grid--${Math.min(room.players.length, 6)}`}>
            {room.players.map((p) => (
              <Tile
                key={p.id}
                player={p}
                isSelf={p.id === me.id}
                video={p.id === me.id ? media.local : media.remote[p.id] ?? null}
                overlay={overlayFor(p)}
                isTurn={room.phase === 'play' && room.turnPlayerId === p.id}
                speaking={media.speaking.has(p.id)}
                reactions={game.reactions.filter((r) => r.playerId === p.id)}
              >
                {tileActions(room, me, p, send)}
              </Tile>
            ))}
          </section>

          {canReact && (
            <div className="reactbar" role="toolbar" aria-label="Quick answers">
              {(Object.keys(REACTIONS) as Reaction[]).map((r) => (
                <button key={r} className="reactbar__btn" onClick={() => send({ type: 'react', reaction: r })} title={`${REACTIONS[r].text} (${keyFor(r).toUpperCase()})`}>
                  <span>{REACTIONS[r].emoji}</span>
                  <small>{REACTIONS[r].text}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="room__side">
          {room.phase === 'lobby' && <LobbyPanel {...panelProps} />}
          {room.phase === 'assign' && <AssignPanel {...panelProps} />}
          {room.phase === 'play' && <PlayPanel {...panelProps} />}
          {room.phase === 'results' && <ResultsPanel {...panelProps} />}
        </aside>
      </main>

      {game.toast && <div className="toast">{game.toast}</div>}
    </div>
  );
}

function keyFor(r: Reaction) {
  return Object.entries(REACTION_KEYS).find(([, v]) => v === r)?.[0] ?? '';
}

/** Sounds and confetti driven by changes in the room state. */
function useGameEffects(room: RoomView | null, playerId: string | null) {
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = room;
    if (!room || !before) return;

    if (room.phase === 'lobby' && room.players.length > before.players.length) sfx.join();

    if (room.phase === 'play' && room.turnPlayerId !== before.turnPlayerId && room.turnPlayerId) {
      if (room.turnPlayerId === playerId) sfx.yourTurn();
      else sfx.turn();
    }

    for (const p of room.players) {
      const was = before.players.find((q) => q.id === p.id);
      if (!was || was.solved === p.solved) continue;
      if (p.solved === 'guessed') {
        sfx.solved();
        confettiAt(document.querySelector(`[data-player="${p.id}"]`), p.id === playerId ? 120 : 60);
      } else if (p.solved === 'gave-up') {
        sfx.gaveUp();
      }
    }

    if (room.phase === 'results' && before.phase !== 'results') {
      sfx.results();
      setTimeout(() => {
        confetti(innerWidth * 0.25, innerHeight * 0.6, 80);
        confetti(innerWidth * 0.75, innerHeight * 0.6, 80);
      }, 250);
    }
  }, [room, playerId]);
}

function tileActions(room: RoomView, me: PlayerView, p: PlayerView, send: ReturnType<typeof useGame>['send']) {
  if (room.phase !== 'play' || p.id === me.id || !p.inRound || p.solved !== 'no') return null;
  const others = room.players.filter((q) => q.connected && q.id !== p.id).length;
  const needed = Math.max(1, Math.ceil(others / 2));
  const voted = p.gotItVotes.includes(me.id);
  return (
    <button className={`btn btn--small ${voted ? 'btn--active' : 'btn--ok'}`} onClick={() => send({ type: 'got-it', playerId: p.id })}>
      ✓ Got it {needed > 1 && `(${p.gotItVotes.length}/${needed})`}
    </button>
  );
}
