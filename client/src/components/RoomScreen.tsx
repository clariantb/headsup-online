import { useGame } from '../useGame.ts';
import { useMedia } from '../useMedia.ts';
import { Tile } from './Tile.tsx';
import { AssignPanel, LobbyPanel, PlayPanel, ResultsPanel } from './Panels.tsx';
import type { PlayerView, RoomView } from '../../../shared/protocol.ts';

export function RoomScreen({ code, name, onLeave }: { code: string; name: string; onLeave(): void }) {
  const game = useGame(code, name);
  const media = useMedia(game.playerId, game.livekit);
  const { room, playerId, cards } = game;
  const me = room?.players.find((p) => p.id === playerId);

  if (game.fatalError) {
    return (
      <div className="center-screen">
        <div className="panel">
          <h2>Can't join</h2>
          <p>{game.fatalError}</p>
          <button className="btn btn--primary" onClick={onLeave}>
            Back home
          </button>
        </div>
      </div>
    );
  }
  if (!room || !me) return <div className="center-screen muted">Joining room {code}…</div>;

  const panelProps = { room, me, cards, send: game.send, showToast: game.showToast, serverOffset: game.serverOffset };
  const showCards = room.phase === 'play' || room.phase === 'results';

  const overlayFor = (p: PlayerView) => {
    if (!showCards || !p.inRound) return null;
    const card = cards[p.id];
    if (card) return { kind: 'card' as const, card };
    // Your own unsolved card: the server never sent it, so there's nothing to peek at.
    return p.id === me.id ? { kind: 'hidden' as const } : null;
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
            <button className={`btn btn--icon ${media.micOn ? '' : 'btn--off'}`} onClick={media.toggleMic} title="Microphone">
              {media.micOn ? '🎙️' : '🔇'}
            </button>
          )}
          <button className={`btn btn--icon ${media.camOn ? '' : 'btn--off'}`} onClick={media.toggleCam} title="Camera">
            {media.camOn ? '📷' : '🚫'}
          </button>
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
            >
              {tileActions(room, me, p, game.send)}
            </Tile>
          ))}
        </section>

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
