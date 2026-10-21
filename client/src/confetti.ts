// Lightweight canvas confetti. One shared full-screen canvas, removed when idle.

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

const COLORS = ['#f5b700', '#e5402f', '#1e9e5a', '#2f5bea', '#f27aa6', '#ff8a1f', '#fffdf8'];
let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let frame = 0;

export function confetti(x: number, y: number, count = 60, spread = 1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    document.body.appendChild(canvas);
  }
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
    const speed = 6 + Math.random() * 8;
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    });
  }
  if (!frame) frame = requestAnimationFrame(step);
}

/** Confetti bursting from the middle of an element. */
export function confettiAt(el: Element | null, count?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2, count);
}

function step() {
  const c = canvas!;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== innerWidth * dpr || c.height !== innerHeight * dpr) {
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of pieces) {
    p.vy += 0.32;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 0.006;
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillStyle = p.color;
    g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    g.restore();
  }
  pieces = pieces.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  if (pieces.length) {
    frame = requestAnimationFrame(step);
  } else {
    frame = 0;
    c.remove();
    canvas = null;
  }
}
