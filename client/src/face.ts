import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { ForeheadPose } from '../../shared/protocol.ts';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const DETECT_INTERVAL_MS = 66; // ~15 fps is plenty for a card on a forehead

// FaceMesh landmark indices
const FOREHEAD_TOP = 10;
const BETWEEN_BROWS = 9;
const CHEEK_LEFT = 234;
const CHEEK_RIGHT = 454;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    return create('GPU').catch(() => create('CPU'));
  })();
  return landmarkerPromise;
}

/**
 * Tracks the face in a local camera track and reports where a forehead card should sit,
 * in coordinates normalized to the raw (unmirrored) frame. Reports null when no face is found.
 */
export class FaceTracker {
  private video = document.createElement('video');
  private stopped = false;
  private lastRun = 0;
  private frameHandle = 0;

  constructor(track: MediaStreamTrack, private onPose: (pose: ForeheadPose | null) => void) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([track]);
    void this.start();
  }

  private async start() {
    try {
      await this.video.play();
      const landmarker = await loadLandmarker();
      if (this.stopped) return;
      const loop = () => {
        if (this.stopped) return;
        this.frameHandle = requestAnimationFrame(loop);
        const now = performance.now();
        if (now - this.lastRun < DETECT_INTERVAL_MS || this.video.readyState < 2) return;
        this.lastRun = now;
        const result = landmarker.detectForVideo(this.video, now);
        this.onPose(poseFromLandmarks(result.faceLandmarks[0], this.video.videoWidth, this.video.videoHeight));
      };
      loop();
    } catch (err) {
      console.warn('Face tracking unavailable', err);
      this.onPose(null);
    }
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.frameHandle);
    this.video.srcObject = null;
  }
}

type Landmark = { x: number; y: number };

function poseFromLandmarks(lm: Landmark[] | undefined, vw: number, vh: number): ForeheadPose | null {
  if (!lm || !vw || !vh) return null;
  // Work in pixels so the aspect ratio doesn't skew angles and distances.
  const px = (i: number) => ({ x: lm[i].x * vw, y: lm[i].y * vh });
  const top = px(FOREHEAD_TOP);
  const brow = px(BETWEEN_BROWS);
  const a = px(CHEEK_LEFT);
  const b = px(CHEEK_RIGHT);
  const [left, right] = a.x < b.x ? [a, b] : [b, a];

  const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
  const cardWidth = faceWidth * 0.62;
  const angle = Math.atan2(right.y - left.y, right.x - left.x);

  // "Up" along the face, from the brows towards the hairline.
  const upLen = Math.hypot(top.x - brow.x, top.y - brow.y) || 1;
  const up = { x: (top.x - brow.x) / upLen, y: (top.y - brow.y) / upLen };
  // Sit the card on the upper forehead, poking a little above the head like the real game.
  const cx = top.x + up.x * cardWidth * 0.12;
  const cy = top.y + up.y * cardWidth * 0.12;

  return { x: cx / vw, y: cy / vh, w: cardWidth / vw, angle };
}
