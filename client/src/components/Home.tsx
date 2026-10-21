import { useEffect, useState } from 'react';
import { ArrowIcon, Mark } from './Icons.tsx';
import { CardFace } from './CardFace.tsx';

const DEMO_CARDS = ['Pikachu', 'Napoleon', 'Durian', 'Astronaut', 'Taylor Swift', 'Shrek', 'Capybara'];

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Heads Up Online — home">
      <Mark />
      <span className="brand__word">Heads Up</span>
    </button>
  );
}

/** A face looking up at the card on its forehead, which keeps changing. */
function FaceArt() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DEMO_CARDS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="face-art" aria-hidden="true">
      <svg viewBox="0 0 200 190">
        <ellipse cx="100" cy="182" rx="62" ry="6" fill="rgba(23,20,15,0.12)" />
        <circle cx="34" cy="118" r="13" fill="var(--yellow)" stroke="var(--print-ink)" strokeWidth="4" />
        <circle cx="166" cy="118" r="13" fill="var(--yellow)" stroke="var(--print-ink)" strokeWidth="4" />
        <circle cx="100" cy="112" r="68" fill="var(--yellow)" stroke="var(--print-ink)" strokeWidth="4" />
        {/* eyes looking up at the card they can't see */}
        <ellipse cx="76" cy="118" rx="13" ry="15" fill="var(--print)" stroke="var(--print-ink)" strokeWidth="3.5" />
        <ellipse cx="124" cy="118" rx="13" ry="15" fill="var(--print)" stroke="var(--print-ink)" strokeWidth="3.5" />
        <circle cx="78" cy="110" r="5.5" fill="var(--print-ink)" />
        <circle cx="126" cy="110" r="5.5" fill="var(--print-ink)" />
        <path d="M60 96c6-6 14-8 22-6M118 90c8-2 16 0 22 6" fill="none" stroke="var(--print-ink)" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="100" cy="152" rx="8" ry="9" fill="var(--print-ink)" />
        <circle cx="58" cy="142" r="8" fill="var(--pink)" opacity="0.55" />
        <circle cx="142" cy="142" r="8" fill="var(--pink)" opacity="0.55" />
      </svg>
      <div className="face-art__card">
        <CardFace key={i} card={{ label: DEMO_CARDS[i], image: null }} />
      </div>
    </div>
  );
}

export function Home({
  code,
  name,
  setName,
  onEnter,
  onHome,
}: {
  code: string | null;
  name: string;
  setName(n: string): void;
  onEnter(code: string): void;
  onHome(): void;
}) {
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOk = name.trim().length > 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const { code } = await res.json();
      onEnter(code);
    } catch {
      setError("Couldn't reach the game server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const join = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return setError('Room codes are 4 letters.');
    setBusy(true);
    setError(null);
    try {
      const { exists } = await (await fetch(`/api/rooms/${c}`)).json();
      if (exists) onEnter(c);
      else setError(`No room called ${c}. It may have expired.`);
    } catch {
      setError("Couldn't reach the game server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="bar">
        <Brand onClick={onHome} />
      </header>
      <main className="screen__body">
        <div className="home">
          <section>
            <h1 className="home__headline">
              Everyone knows who you are.{' '}
              <span className="hl">
                Except you.
                <svg viewBox="0 0 300 20" preserveAspectRatio="none">
                  <path d="M4 14C60 4 120 18 180 9s90 2 116-2" fill="none" stroke="var(--fg)" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="home__sub">
              Heads Up, played over video. Your friends stick a card on your forehead — a celebrity, a cartoon, that photo of your
              cousin — and you ask yes-or-no questions until you work out who you are.
            </p>
            <ul className="home__facts">
              <li>2–6 players</li>
              <li>No sign-up</li>
              <li>Images never saved</li>
            </ul>
          </section>

          <section className="home__right">
            <FaceArt />
            <form
              className="sheet home__panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (!nameOk || busy) return;
                void (code ? join(code) : create());
              }}
            >
              <h2>{code ? `Join room ${code}` : 'Start a game'}</h2>
              <label className="field">
                <span className="field__label">Your name</span>
                <input value={name} maxLength={20} placeholder="What should we call you?" onChange={(e) => setName(e.target.value)} autoFocus />
              </label>

              <button type="submit" className="btn btn--primary btn--block" disabled={!nameOk || busy}>
                {code ? 'Continue' : 'Create a room'} <ArrowIcon size={18} />
              </button>

              {!code && (
                <>
                  <div className="home__or">or join with a code</div>
                  <div className="join-row">
                    <input
                      className="code-input"
                      value={joinCode}
                      maxLength={4}
                      placeholder="ABCD"
                      aria-label="Room code"
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (nameOk) void join(joinCode);
                        }
                      }}
                    />
                    <button type="button" className="btn" disabled={!nameOk || busy || joinCode.length !== 4} onClick={() => void join(joinCode)}>
                      Join
                    </button>
                  </div>
                </>
              )}
              {error && <p className="error small">{error}</p>}
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
