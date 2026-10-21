import { useEffect, useState } from 'react';

export function Countdown({ endsAt, serverOffset }: { endsAt: number | null; serverOffset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - (now + serverOffset)) / 1000));
  return <span className={`countdown ${left <= 10 ? 'countdown--low' : ''}`}>⏱ {left}s</span>;
}
