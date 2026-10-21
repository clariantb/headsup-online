// Tiny synthesized sound effects: no audio files to download or license.

const MUTE_KEY = 'headsup:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', volume = 0.12) {
  const ac = audio();
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function play(fn: () => void) {
  if (muted) return;
  try {
    fn();
  } catch {
    // AudioContext unavailable (e.g. no user gesture yet): stay silent.
  }
}

export const sfx = {
  yourTurn: () => play(() => [660, 880, 1320].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle'))),
  turn: () => play(() => tone(520, 0, 0.15, 'sine', 0.08)),
  reaction: () => play(() => tone(980, 0, 0.07, 'square', 0.03)),
  solved: () => play(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle'))),
  gaveUp: () => play(() => [392, 330, 262].forEach((f, i) => tone(f, i * 0.12, 0.25, 'sawtooth', 0.05))),
  results: () =>
    play(() => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 5 ? 0.6 : 0.2, 'triangle'))),
  join: () => play(() => [740, 990].forEach((f, i) => tone(f, i * 0.07, 0.12, 'sine', 0.07))),
  tick: () => play(() => tone(1200, 0, 0.04, 'square', 0.025)),
  isMuted: () => muted,
  setMuted(next: boolean) {
    muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {}
  },
};
