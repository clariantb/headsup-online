import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../../../shared/protocol.ts';
import { FaceTracker } from '../face.ts';
import { poses } from '../poses.ts';
import type { MediaPrefs, VideoSource } from '../useMedia.ts';
import { DevicePicker } from './DevicePicker.tsx';
import { Tile } from './Tile.tsx';

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
    color: '#ffd43b',
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
    <div className="center-screen">
      <div className="prejoin">
        <div className="prejoin__preview">
          <Tile player={previewPlayer} isSelf video={camOn ? video : null} overlay={{ kind: 'hidden', hint: null }} isTurn={false} speaking={false} showTag={false} />
          <div className="prejoin__toggles">
            <button className={`btn btn--icon ${micOn ? '' : 'btn--off'}`} onClick={() => setMicOn((v) => !v)} title="Microphone">
              {micOn ? '🎙️' : '🔇'}
            </button>
            <button className={`btn btn--icon ${camOn ? '' : 'btn--off'}`} onClick={() => setCamOn((v) => !v)} title="Camera">
              {camOn ? '📷' : '🚫'}
            </button>
          </div>
        </div>

        <div className="panel prejoin__side">
          <h2>Ready, {name}?</h2>
          <p className="muted">
            Joining room <strong className="accent">{code}</strong>. Check the <strong>?</strong> sits on your forehead — that's
            where your card will be.
          </p>
          {error && <p className="error">{error}</p>}
          <DevicePicker videoDeviceId={videoDeviceId} audioDeviceId={audioDeviceId} onChange={changeDevice} />
          {audioTrack && (
            <div className="meter" aria-label="Microphone level">
              <div ref={meterRef} />
            </div>
          )}
          <button className="btn btn--primary btn--wide" onClick={() => onJoin({ camOn: camOn && !error, micOn: micOn && !error, videoDeviceId, audioDeviceId })}>
            Join game
          </button>
          <button className="link" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
