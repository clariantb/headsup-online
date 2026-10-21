import { useEffect, useRef, useState, type ReactNode } from 'react';
import { REACTIONS, type Card, type PlayerView } from '../../../shared/protocol.ts';
import type { VideoSource } from '../useMedia.ts';
import type { ReactionBubble } from '../useGame.ts';
import { poses } from '../poses.ts';
import { CardBack, CardFace } from './CardFace.tsx';
import { CrownIcon } from './Icons.tsx';

export type Overlay = { kind: 'card'; card: Card } | { kind: 'hidden'; hint: string | null } | null;

interface Props {
  player: PlayerView;
  isSelf: boolean;
  video: VideoSource | null;
  /** What sits on this player's forehead: a card, the "?" (for yourself), or nothing. */
  overlay: Overlay;
  isTurn: boolean;
  speaking: boolean;
  reactions?: ReactionBubble[];
  showTag?: boolean;
  children?: ReactNode; // per-tile actions
}

const SMOOTHING = 0.35; // 0..1 per frame; higher follows faster
const FACE_LOST_MS = 2000;

export function Tile({ player, isSelf, video, overlay, isTurn, speaking, reactions = [], showTag = true, children }: Props) {
  const tileRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [faceLost, setFaceLost] = useState(false);

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

  // On your own tile, say so when tracking can't find your face.
  useEffect(() => {
    if (!isSelf || !video) {
      setFaceLost(false);
      return;
    }
    let lostSince: number | null = null;
    const t = setInterval(() => {
      if (poses.get(player.id)) {
        lostSince = null;
        setFaceLost(false);
      } else {
        lostSince ??= performance.now();
        if (performance.now() - lostSince > FACE_LOST_MS) setFaceLost(true);
      }
    }, 400);
    return () => clearInterval(t);
  }, [isSelf, !!video, player.id]);

  const classes = ['tile', isTurn && 'tile--turn', speaking && 'tile--speaking', !player.connected && 'tile--away']
    .filter(Boolean)
    .join(' ');
  // Remount the card when it changes so it plays the flip-in animation (e.g. your own card being revealed).
  const overlayKey = overlay ? (overlay.kind === 'card' ? `c:${overlay.card.label}:${overlay.card.image?.length ?? 0}` : 'hidden') : '';

  return (
    <div className={classes} ref={tileRef} data-player={player.id} style={{ '--player-color': player.color } as React.CSSProperties}>
      {video ? (
        <video ref={videoRef} className={isSelf ? 'tile__video mirrored' : 'tile__video'} autoPlay playsInline muted />
      ) : (
        <div className="tile__avatar">
          <span>{player.name.slice(0, 1).toUpperCase()}</span>
        </div>
      )}

      {overlay && (
        <div className="forehead" ref={cardRef}>
          <div className="forehead__inner" key={overlayKey}>
            {overlay.kind === 'card' ? <CardFace card={overlay.card} /> : <CardBack hint={overlay.hint} />}
          </div>
        </div>
      )}

      <div className="tile__reactions" aria-live="polite">
        {reactions.map((r) => (
          <div key={r.id} className={`stamp-pop stamp-pop--${r.reaction}`}>
            {REACTIONS[r.reaction].text}
          </div>
        ))}
      </div>

      {showTag && (
        <div className="tape">
          {player.isHost && <CrownIcon size={14} aria-label="Host" />}
          <span className="tape__name">
            {player.name}
            {isSelf && <span className="tape__you"> · you</span>}
          </span>
          <span className="tape__score" title="Score">
            {player.score}
          </span>
        </div>
      )}
      {isTurn && <div className="tile__turn">Asking</div>}
      {player.solved === 'guessed' && <div className="stamp stamp--ok">Got it · #{player.solvedRank}</div>}
      {player.solved === 'gave-up' && <div className="stamp stamp--muted">Gave up</div>}
      {!player.connected && <div className="tile__away">Reconnecting…</div>}
      {faceLost && <div className="tile__hint">Can't see your face — card is pinned to the top</div>}
      {children && <div className="tile__actions">{children}</div>}
    </div>
  );
}
