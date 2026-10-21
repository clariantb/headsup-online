import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room as LKRoom, RemoteTrack, Track } from 'livekit-client';
import { FACE_TOPIC, type ForeheadPose } from '../../shared/protocol.ts';
import { FaceTracker } from './face.ts';
import { poses } from './poses.ts';

/** Anything a <video> element can show: a LiveKit track or a plain local camera track. */
export interface VideoSource {
  attach(el: HTMLVideoElement): void;
  detach(el: HTMLVideoElement): void;
  key: string;
}

/** Choices made on the pre-join screen. */
export interface MediaPrefs {
  camOn: boolean;
  micOn: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
}

export interface Media {
  mode: 'livekit' | 'local-only';
  local: VideoSource | null;
  remote: Record<string, VideoSource>; // by player id
  speaking: Set<string>;
  micOn: boolean;
  camOn: boolean;
  toggleMic(): void;
  toggleCam(): void;
  audioBlocked: boolean;
  startAudio(): void;
  videoDeviceId: string | undefined;
  audioDeviceId: string | undefined;
  setDevice(kind: 'videoinput' | 'audioinput', deviceId: string): void;
  error: string | null;
}

const POSE_SEND_INTERVAL_MS = 80;
const CAMERA = 'camera' as Track.Source; // Track.Source.Camera, without importing LiveKit eagerly
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function wrapTrack(track: MediaStreamTrack): VideoSource {
  return {
    key: track.id,
    attach: (el) => {
      el.srcObject = new MediaStream([track]);
    },
    detach: (el) => {
      el.srcObject = null;
    },
  };
}

function wrapLiveKit(track: { attach(el: HTMLMediaElement): HTMLMediaElement; detach(el: HTMLMediaElement): HTMLMediaElement; sid?: string; mediaStreamTrack: MediaStreamTrack }): VideoSource {
  return {
    key: track.sid ?? track.mediaStreamTrack.id,
    attach: (el) => void track.attach(el),
    detach: (el) => void track.detach(el),
  };
}

export function useMedia(playerId: string | null, livekit: { url: string; token: string } | null, prefs: MediaPrefs): Media {
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const roomRef = useRef<LKRoom | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const [localOnlyStream, setLocalOnlyStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(prefs.micOn);
  const [camOn, setCamOn] = useState(prefs.camOn);
  const [videoDeviceId, setVideoDeviceId] = useState(prefs.videoDeviceId);
  const [audioDeviceId, setAudioDeviceId] = useState(prefs.audioDeviceId);
  const prefsRef = useRef(prefs);
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const audioHost = useRef<HTMLDivElement | null>(null);

  // ---- LiveKit mode ----
  useEffect(() => {
    if (!playerId || !livekit) return;
    const initial = prefsRef.current;
    let cancelled = false;
    let room: LKRoom | null = null;
    let host: HTMLDivElement | null = null;

    // LiveKit is loaded on demand so the home page stays light.
    const start = async () => {
      const { Room, RoomEvent } = await import('livekit-client');
      if (cancelled) return;
      const lk = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { deviceId: initial.videoDeviceId, resolution: { width: 640, height: 480, frameRate: 24 } },
        audioCaptureDefaults: { deviceId: initial.audioDeviceId, echoCancellation: true, noiseSuppression: true },
      });
      room = lk;
      roomRef.current = lk;
      const audioEls = document.createElement('div');
      audioEls.style.display = 'none';
      document.body.appendChild(audioEls);
      host = audioEls;
      audioHost.current = audioEls;

      lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === 'audio') audioEls.appendChild(track.attach());
        bump();
      })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          bump();
        })
        .on(RoomEvent.TrackMuted, bump)
        .on(RoomEvent.TrackUnmuted, bump)
        .on(RoomEvent.LocalTrackPublished, bump)
        .on(RoomEvent.LocalTrackUnpublished, bump)
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          poses.clear(p.identity);
          bump();
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeaking(new Set(speakers.map((s) => s.identity))))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!lk.canPlaybackAudio))
        .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
          if (topic !== FACE_TOPIC || !participant) return;
          try {
            poses.set(participant.identity, JSON.parse(decoder.decode(payload)) as ForeheadPose | null);
          } catch {}
        });

      await lk.connect(livekit.url, livekit.token);
      setAudioBlocked(!lk.canPlaybackAudio);
      await Promise.all([
        lk.localParticipant.setCameraEnabled(initial.camOn),
        lk.localParticipant.setMicrophoneEnabled(initial.micOn),
      ]).catch((err) => setError(`Camera/mic unavailable: ${err?.message ?? err}`));
      bump();
    };
    start().catch((err) => {
      if (!cancelled) setError(`Couldn't connect to the video server: ${(err as Error)?.message ?? err}`);
    });

    return () => {
      cancelled = true;
      void room?.disconnect();
      host?.remove();
      roomRef.current = null;
    };
  }, [playerId, livekit, bump]);

  // ---- local-only mode: no video server, but still show your own camera and tracking ----
  useEffect(() => {
    if (!playerId || livekit || !camOn) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480, deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setLocalOnlyStream(s);
      })
      .catch((err) => setError(`Camera unavailable: ${err?.message ?? err}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setLocalOnlyStream(null);
    };
  }, [playerId, livekit, videoDeviceId, camOn]);

  // ---- resolve current tracks ----
  const room = roomRef.current;
  let local: VideoSource | null = null;
  let localTrack: MediaStreamTrack | null = null;
  const remote: Record<string, VideoSource> = {};

  if (room) {
    const pub = room.localParticipant.getTrackPublication(CAMERA);
    if (pub?.videoTrack && !pub.isMuted) {
      local = wrapLiveKit(pub.videoTrack);
      localTrack = pub.videoTrack.mediaStreamTrack;
    }
    for (const p of room.remoteParticipants.values()) {
      const rpub = p.getTrackPublication(CAMERA);
      if (rpub?.videoTrack && rpub.isSubscribed && !rpub.isMuted) remote[p.identity] = wrapLiveKit(rpub.videoTrack);
    }
  } else if (localOnlyStream) {
    localTrack = localOnlyStream.getVideoTracks()[0] ?? null;
    if (localTrack) local = wrapTrack(localTrack);
  }
  localTrackRef.current = localTrack;

  // ---- face tracking on our own camera; poses go to everyone else over the data channel ----
  const localTrackId = localTrack?.id;
  useEffect(() => {
    const track = localTrackRef.current;
    if (!playerId || !track) {
      if (playerId) poses.set(playerId, null);
      return;
    }
    let lastSent = 0;
    const tracker = new FaceTracker(track, (pose) => {
      poses.set(playerId, pose);
      const now = performance.now();
      const lk = roomRef.current;
      if (lk && now - lastSent >= POSE_SEND_INTERVAL_MS) {
        lastSent = now;
        const rounded = pose && { x: +pose.x.toFixed(4), y: +pose.y.toFixed(4), w: +pose.w.toFixed(4), angle: +pose.angle.toFixed(3) };
        void lk.localParticipant
          .publishData(encoder.encode(JSON.stringify(rounded)), { reliable: false, topic: FACE_TOPIC })
          .catch(() => {});
      }
    });
    return () => tracker.stop();
  }, [playerId, localTrackId]);

  const toggleMic = useCallback(() => {
    const lk = roomRef.current;
    setMicOn((on) => {
      void lk?.localParticipant.setMicrophoneEnabled(!on);
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    const lk = roomRef.current;
    setCamOn((on) => {
      if (lk) void lk.localParticipant.setCameraEnabled(!on).then(bump);
      return !on;
    });
  }, [bump]);

  const setDevice = useCallback(
    (kind: 'videoinput' | 'audioinput', deviceId: string) => {
      if (kind === 'videoinput') setVideoDeviceId(deviceId);
      else setAudioDeviceId(deviceId);
      const lk = roomRef.current;
      if (lk) void lk.switchActiveDevice(kind, deviceId).then(bump, (err) => setError(`Couldn't switch device: ${err?.message ?? err}`));
    },
    [bump],
  );

  const startAudio = useCallback(() => {
    void roomRef.current?.startAudio().then(() => setAudioBlocked(false));
  }, []);

  return {
    mode: livekit ? 'livekit' : 'local-only',
    local,
    remote,
    speaking,
    micOn: livekit ? micOn : false,
    camOn,
    toggleMic,
    toggleCam,
    audioBlocked,
    startAudio,
    videoDeviceId,
    audioDeviceId,
    setDevice,
    error,
  };
}
