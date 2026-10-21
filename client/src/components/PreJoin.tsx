import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../../../shared/protocol.ts';
import { FaceTracker } from '../face.ts';
import { poses } from '../poses.ts';
import type { MediaPrefs, VideoSource } from '../useMedia.ts';
import { DevicePicker } from './DevicePicker.tsx';
import { Tile } from './Tile.tsx';
import { Brand } from './Home.tsx';
import { ArrowIcon, BackIcon, CamIcon, CamOffIcon, MicIcon, MicOffIcon } from './Icons.tsx';

const PREVIEW_ID = '__preview';
const PREFS_KEY = 'headsup:devices';

function loadDevices(): Pick<MediaPrefs, 'videoDeviceId' | 'audioDeviceId'> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Camera check before entering a room: preview, face tracking test, device choice. */
export function PreJoin({ code, name, onJoin, onBack }: { code: string; name: string; onJoin(prefs: MediaPrefs): void; onBack(): void }) {
  const saved = useRef(loadDevices());
  const [videoDeviceId, setVideoDeviceId] = useState(saved.current.videoDeviceId);
  const [audioDeviceId, setAudioDeviceId] = useState(saved.current.audioDeviceId);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  // Open the camera and mic with the chosen devices.
  useEffect(() => {
    let cancelled = false;
    let s: MediaStream | null = null;
    setError(null);
    const want = (id?: string) => (id ? { deviceId: { exact: id } } : true);
    navigator.mediaDevices
      ?.getUserMedia({
        video: camOn ? { ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}), width: 640, height: 480 } : false,
        audio: micOn ? want(audioDeviceId) : false,
      })
      .then((got) => {
        if (cancelled) return got.getTracks().forEach((t) => t.stop());
        s = got;
        setStream(got);
      })
      .catch((err) => {
        if (!camOn && !micOn) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera/mic access was blocked. Allow it in the address bar, or join without them.'
            : `Couldn't open your camera/mic: ${err?.message ?? err}`,
        );
      });
    return () => {
      cancelled = true;
      s?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [camOn, micOn, videoDeviceId, audioDeviceId]);

  // Face tracking on the preview, so you can check the card lands on your forehead.
  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  useEffect(() => {
    if (!videoTrack) return;
    const tracker = new FaceTracker(videoTrack, (pose) => poses.set(PREVIEW_ID, pose));
    return () => {
      tracker.stop();
      poses.clear(PREVIEW_ID);
    };
  }, [videoTrack]);

  // Mic level meter.
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  useEffect(() => {
    if (!audioTrack) return;
    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    ac.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      if (meterRef.current) meterRef.current.style.width = `${Math.min(100, (peak / 64) * 100)}%`;
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      void ac.close();
    };
  }, [audioTrack]);

  const video: VideoSource | null = videoTrack
    ? {
        key: videoTrack.id,
        attach: (el) => (el.srcObject = new MediaStream([videoTrack])),
        detach: (el) => (el.srcObject = null),
      }
    : null;

  const previewPlayer: PlayerView = {
    id: PREVIEW_ID,
    name,
    color: '#f5b700',
    connected: true,
    isHost: false,
    score: 0,
    inRound: true,
    assignedFor: null,
    submitted: false,
    solved: 'no',
    solvedRank: null,
    gotItVotes: [],
    hint: null,
  };

  const changeDevice = (kind: 'videoinput' | 'audioinput', id: string) => {
    if (kind === 'videoinput') setVideoDeviceId(id);
    else setAudioDeviceId(id);
    const next = { ...loadDevices(), [kind === 'videoinput' ? 'videoDeviceId' : 'audioDeviceId']: id };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="screen">
      <header className="bar">
        <Brand onClick={onBack} />
        <span className="bar__spacer" />
        <div className="ticket">
          <span>Room</span>
          <strong>{code}</strong>
        </div>
      </header>
      <main className="screen__body">
        <div className="prejoin">
          <div className="prejoin__stage">
            <Tile player={previewPlayer} isSelf video={camOn ? video : null} overlay={{ kind: 'hidden', hint: null }} isTurn={false} speaking={false} showTag={false} />
            <div className="prejoin__toggles">
              <button className={`icon-btn ${micOn ? '' : 'icon-btn--off'}`} onClick={() => setMicOn((v) => !v)} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </button>
              <button className={`icon-btn ${camOn ? '' : 'icon-btn--off'}`} onClick={() => setCamOn((v) => !v)} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}>
                {camOn ? <CamIcon /> : <CamOffIcon />}
              </button>
            </div>
          </div>

          <div className="sheet">
            <h2>Ready, {name}?</h2>
            <p className="muted">
              That card back is where your card will sit. Move around a bit and check it follows your forehead.
            </p>
            {error && <p className="error small">{error}</p>}
            <DevicePicker videoDeviceId={videoDeviceId} audioDeviceId={audioDeviceId} onChange={changeDevice} />
            {audioTrack && (
              <div className="meter" aria-label="Microphone level">
                <span>Mic</span>
                <div className="meter__track">
                  <div ref={meterRef} className="meter__fill" />
                </div>
              </div>
            )}
            <button className="btn btn--primary btn--block" onClick={() => onJoin({ camOn: camOn && !error, micOn: micOn && !error, videoDeviceId, audioDeviceId })}>
              {error ? 'Join without camera' : 'Join the game'} <ArrowIcon size={18} />
            </button>
            <button className="link-btn" onClick={onBack}>
              <BackIcon size={16} /> Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
