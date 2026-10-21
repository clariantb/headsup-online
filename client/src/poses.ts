import type { ForeheadPose } from '../../shared/protocol.ts';

const STALE_MS = 1000;

interface Entry {
  pose: ForeheadPose | null;
  at: number;
}

/**
 * Latest forehead pose per player. Updated many times a second, so it lives outside React state;
 * tiles read it from their own animation loop.
 */
class PoseStore {
  private entries = new Map<string, Entry>();

  set(playerId: string, pose: ForeheadPose | null) {
    this.entries.set(playerId, { pose, at: performance.now() });
  }

  get(playerId: string): ForeheadPose | null {
    const e = this.entries.get(playerId);
    if (!e || performance.now() - e.at > STALE_MS) return null;
    return e.pose;
  }

  clear(playerId: string) {
    this.entries.delete(playerId);
  }
}

export const poses = new PoseStore();
