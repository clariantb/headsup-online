import { useEffect, useState } from 'react';

/** Camera / microphone dropdowns. Labels only appear after the browser has granted access once. */
export function DevicePicker({
  videoDeviceId,
  audioDeviceId,
  onChange,
  showAudio = true,
}: {
  videoDeviceId?: string;
  audioDeviceId?: string;
  onChange(kind: 'videoinput' | 'audioinput', deviceId: string): void;
  showAudio?: boolean;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const refresh = () => void md.enumerateDevices().then(setDevices, () => {});
    refresh();
    md.addEventListener('devicechange', refresh);
    return () => md.removeEventListener('devicechange', refresh);
  }, [videoDeviceId, audioDeviceId]);

  const list = (kind: MediaDeviceKind) => devices.filter((d) => d.kind === kind && d.deviceId);
  const cams = list('videoinput');
  const mics = list('audioinput');

  return (
    <div className="devices">
      <label>
        Camera
        <select value={videoDeviceId ?? ''} onChange={(e) => onChange('videoinput', e.target.value)} disabled={!cams.length}>
          {!videoDeviceId && <option value="">Default camera</option>}
          {cams.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      {showAudio && (
        <label>
          Microphone
          <select value={audioDeviceId ?? ''} onChange={(e) => onChange('audioinput', e.target.value)} disabled={!mics.length}>
            {!audioDeviceId && <option value="">Default microphone</option>}
            {mics.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
