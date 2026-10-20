// Seeded scramble. Changing this algorithm changes every seed's layout, so
// bump the algorithm version in the puzzle format when it changes.
import type { Pose, Puzzle, Vec2 } from '../types';
import { bounds, penetration, radius, transform } from './polygon';

export const SCRAMBLE_VERSION = 'v1';

/** mulberry32: small, fast, deterministic PRNG returning values in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 2147483646) + 1;
}

/**
 * v1: every piece gets a uniformly random rotation and a position in a band
 * around the target, separated from the target and from each other by a gap.
 * The band widens if the pieces do not fit.
 */
export function scramble(puzzle: Puzzle, seed: number): Pose[] {
  const random = rng(seed);
  const target = puzzle.geometry.target.vertices;
  const tb = bounds(target);
  const gap = 0.03 * puzzle.geometry.spanMm;
  const maxR = Math.max(...puzzle.pieces.map((p) => radius(p.polygon)));
  let reach = maxR + 2 * gap;

  for (;;) {
    const poses: Pose[] = [];
    const placed: Vec2[][] = [];
    const ok = puzzle.pieces.every((piece) => {
      const theta = random() * 2 * Math.PI;
      for (let attempt = 0; attempt < 400; attempt++) {
        const x = tb.minX - reach + random() * (tb.maxX - tb.minX + 2 * reach);
        const y = tb.minY - reach + random() * (tb.maxY - tb.minY + 2 * reach);
        const pose = { id: piece.id, x, y, theta };
        const poly = transform(piece.polygon, pose);
        if (penetration(poly, target) > -gap) continue;
        if (placed.some((other) => penetration(poly, other) > -gap)) continue;
        poses.push(pose);
        placed.push(poly);
        return true;
      }
      return false;
    });
    if (ok) return poses;
    reach *= 1.15;
  }
}
