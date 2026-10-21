import { useEffect, useState } from 'react';
import { RoomScreen } from './components/RoomScreen.tsx';
import { PreJoin } from './components/PreJoin.tsx';
import type { MediaPrefs } from './useMedia.ts';

const NAME_KEY = 'headsup:name';

function codeFromPath() {
  const m = location.pathname.match(/^\/r\/([A-Za-z]{4})\/?$/);
  return m ? m[1].toUpperCase() : null;
}

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const [code, setCode] = useState(codeFromPath);
  const [stage, setStage] = useState<'home' | 'prejoin' | 'room'>('home');
  const [prefs, setPrefs] = useState<MediaPrefs>({ camOn: true, micOn: true });
  const [name, setName] = useState(loadName);

  useEffect(() => {
    const onPop = () => {
      setCode(codeFromPath());
      setStage('home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: string | null) => {
    history.pushState(null, '', next ? `/r/${next}` : '/');
    setCode(next);
  };

  const leave = () => {
    setStage('home');
    go(null);
  };

  if (code && stage === 'room') return <RoomScreen code={code} name={name} prefs={prefs} onLeave={leave} />;
  if (code && stage === 'prejoin') {
    return (
      <PreJoin
        code={code}
        name={name.trim()}
        onBack={() => setStage('home')}
        onJoin={(p) => {
          setPrefs(p);
          setStage('room');
        }}
      />
    );
  }

  return (
    <Home
      code={code}
      name={name}
      setName={(n) => {
        setName(n);
        try {
          localStorage.setItem(NAME_KEY, n);
        } catch {}
      }}
      onEnter={(c) => {
        if (c !== code) go(c);
        setStage('prejoin');
      }}
    />
  );
}

function Home({ code, name, setName, onEnter }: { code: string | null; name: string; setName(n: string): void; onEnter(code: string): void }) {
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
      setError("Couldn't reach the game server.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const c = joinCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return setError('Room codes are 4 letters.');
    setBusy(true);
    setError(null);
    try {
      const { exists } = await (await fetch(`/api/rooms/${c}`)).json();
      if (exists) onEnter(c);
      else setError('No room with that code.');
    } catch {
      setError("Couldn't reach the game server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen home">
      <div className="home__hero">
        <div className="home__logo">
          <div className="card card--hidden">?</div>
        </div>
        <h1>Heads Up Online</h1>
        <p className="muted">Everyone can see the card on your forehead — except you.</p>
      </div>

      <div className="panel home__panel">
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={20} placeholder="e.g. Sam" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        {code ? (
          <button className="btn btn--primary btn--wide" disabled={!nameOk || busy} onClick={() => void join()}>
            Join room {code}
          </button>
        ) : (
          <>
            <button className="btn btn--primary btn--wide" disabled={!nameOk || busy} onClick={() => void create()}>
              Create a room
            </button>
            <div className="divider">or join one</div>
            <div className="row">
              <input
                className="code-input"
                value={joinCode}
                maxLength={4}
                placeholder="CODE"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && nameOk && void join()}
              />
              <button className="btn btn--ghost" disabled={!nameOk || busy} onClick={() => void join()}>
                Join
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <p className="muted small">2–6 players · camera & mic recommended · images are never saved</p>
      </div>
    </div>
  );
}
