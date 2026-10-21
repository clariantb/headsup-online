import { useEffect, useState } from 'react';
import { RoomScreen } from './components/RoomScreen.tsx';
import { PreJoin } from './components/PreJoin.tsx';
import { Home } from './components/Home.tsx';
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
      onHome={() => go(null)}
    />
  );
}
