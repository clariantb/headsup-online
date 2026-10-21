import { useEffect, useRef, type ReactNode } from 'react';
import type { Card, PlayerView } from '../../../shared/protocol.ts';
import type { VideoSource } from '../useMedia.ts';
import { poses } from '../poses.ts';
import { CardFace } from './CardFace.tsx';

interface Props {
  player: PlayerView;
  isSelf: boolean;
  video: VideoSource | null;
  /** What sits on this player's forehead: a card, the "?" (for yourself), or nothing. */
  overlay: { kind: 'card'; card: Card } | { kind: 'hidden' } | null;
  isTurn: boolean;
  speaking: boolean;
  children?: ReactNode; // per-tile actions
}

const SMOOTHING = 0.35; // 0..1 per frame; higher follows faster

export function Tile({ player, isSelf, video, overlay, isTurn, speaking, children }: Props) {
  const tileRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Attach the video track.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    video.attach(el);
    return () => video.detach(el);
  }, [video?.key]);

  // Keep the card glued to the forehead. Runs every frame without re-rendering React.
  useEffect(() => {
    if (!overlay) return;
    let frame = 0;
    let cur: { x: number; y: number; w: number; a: number } | null = null;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const tile = tileRef.current;
      const card = cardRef.current;
      const vid = videoRef.current;
      if (!tile || !card) return;
      const W = tile.clientWidth;
      const H = tile.clientHeight;

      // Default spot when there's no face (or no video): pinned near the top of the tile.
      let target = { x: W / 2, y: H * 0.3, w: Math.min(W * 0.38, H * 0.45), a: 0 };
      const pose = poses.get(player.id);
      if (pose && vid && vid.videoWidth && video) {
        // Map from raw-frame coordinates to the tile, accounting for object-fit: cover.
        const scale = Math.max(W / vid.videoWidth, H / vid.videoHeight);
        const dw = vid.videoWidth * scale;
        const dh = vid.videoHeight * scale;
        let x = (W - dw) / 2 + pose.x * dw;
        let a = pose.angle;
        if (isSelf) {
          x = W - x; // your own tile is mirrored like a selfie camera
          a = -a;
        }
        target = { x, y: (H - dh) / 2 + pose.y * dh, w: pose.w * dw, a };
      }
      cur = cur
        ? {
            x: cur.x + (target.x - cur.x) * SMOOTHING,
            y: cur.y + (target.y - cur.y) * SMOOTHING,
            w: cur.w + (target.w - cur.w) * SMOOTHING,
            a: cur.a + (target.a - cur.a) * SMOOTHING,
          }
        : target;
      const w = Math.max(48, cur.w);
      card.style.width = `${w}px`;
      card.style.fontSize = `${w / 9}px`;
      card.style.transform = `translate(${cur.x}px, ${cur.y}px) translate(-50%, -50%) rotate(${cur.a}rad)`;
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [overlay?.kind, player.id, isSelf, !!video]);

  const classes = ['tile', isTurn && 'tile--turn', speaking && 'tile--speaking', !player.connected && 'tile--away']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} ref={tileRef} style={{ '--player-color': player.color } as React.CSSProperties}>
      {video ? (
        <video ref={videoRef} className={isSelf ? 'tile__video mirrored' : 'tile__video'} autoPlay playsInline muted />
      ) : (
        <div className="tile__avatar">
          <span>{player.name.slice(0, 1).toUpperCase()}</span>
        </div>
      )}

      {overlay && (
        <div className="forehead" ref={cardRef}>
          {overlay.kind === 'card' ? <CardFace card={overlay.card} /> : <div className="card card--hidden">?</div>}
        </div>
      )}

      <div className="tile__tag">
        {player.isHost && <span title="Host">👑</span>}
        <span className="tile__name">
          {player.name}
          {isSelf && ' (you)'}
        </span>
        <span className="tile__score">{player.score}</span>
      </div>
      {player.solved === 'guessed' && <div className="tile__badge tile__badge--ok">Got it! #{player.solvedRank}</div>}
      {player.solved === 'gave-up' && <div className="tile__badge">Gave up</div>}
      {!player.connected && <div className="tile__badge tile__badge--away">Reconnecting…</div>}
      {children && <div className="tile__actions">{children}</div>}
    </div>
  );
}
