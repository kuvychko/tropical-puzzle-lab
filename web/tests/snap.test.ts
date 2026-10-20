import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/geometry/evaluate';
import { penetration, transform } from '../src/geometry/polygon';
import { snapPose } from '../src/geometry/snap';
import type { Pose, Puzzle, Vec2 } from '../src/types';

const rev2: Puzzle = JSON.parse(readFileSync(new URL('../../puzzles/rev2/puzzle.json', import.meta.url), 'utf-8'));
const square = (s: number): Vec2[] => [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
const deg = Math.PI / 180;

/** The rev2 tray with two 40 mm square pieces. */
const blocks: Puzzle = {
  ...rev2,
  variant: 'tiling',
  pieces: [{ id: 'P', polygon: square(40), thickness: 10 }, { id: 'Q', polygon: square(40), thickness: 10 }],
};
const parked: Pose = { id: 'Q', x: 300, y: 300, theta: 0 };

describe('sticky edges', () => {
  it('settles a piece into a tray corner', () => {
    const poses = [{ id: 'P', x: -52 + 1.5, y: -52 + 1.2, theta: 3 * deg }, parked];
    const snapped = snapPose(blocks, poses, 0)!;
    expect(snapped.x).toBeCloseTo(-52, 9);
    expect(snapped.y).toBeCloseTo(-52, 9);
    expect(snapped.theta).toBeCloseTo(0, 9);
  });

  it('pulls a piece flush against a neighbour without overlap', () => {
    const poses = [{ id: 'P', x: -41.2, y: 5, theta: -2 * deg }, { id: 'Q', x: 0, y: 0, theta: 0 }];
    const snapped = snapPose(blocks, poses, 0)!;
    expect(snapped.theta).toBeCloseTo(0, 9);
    expect(snapped.x).toBeCloseTo(-40, 6);
    const depth = penetration(transform(blocks.pieces[0].polygon, snapped), transform(blocks.pieces[1].polygon, poses[1]));
    expect(Math.abs(depth)).toBeLessThan(1e-9);
  });

  it('pushes a slightly overlapping piece back out', () => {
    const poses = [{ id: 'P', x: -38.5, y: 0, theta: 0 }, { id: 'Q', x: 0, y: 0, theta: 0 }];
    expect(snapPose(blocks, poses, 0)!.x).toBeCloseTo(-40, 9);
  });

  it('ignores edges that are too far or too skewed', () => {
    expect(snapPose(blocks, [{ id: 'P', x: -52 + 10, y: -52 + 10, theta: 0 }, parked], 0)).toBeNull();
    expect(snapPose(blocks, [{ id: 'P', x: -52 + 1, y: -52 + 1, theta: 15 * deg }, parked], 0)).toBeNull();
  });

  it('does not stick to the outside of the tray walls', () => {
    expect(snapPose(blocks, [{ id: 'P', x: -72 - 21, y: 0, theta: 0 }, parked], 0)).toBeNull();
  });

  it('puts a rev2 corner piece back into its corner', () => {
    const ref = rev2.reference.poses;
    const corner = rev2.pieces.findIndex((p, i) =>
      transform(p.polygon, ref[i]).some(([x, y]) => Math.abs(Math.abs(x) - 72) < 1e-9 && Math.abs(Math.abs(y) - 72) < 1e-9));
    expect(corner).toBeGreaterThanOrEqual(0);
    // Every other piece parked far away, so only the tray walls are nearby.
    const poses = ref.map((p, i) => (i === corner ? { ...p, x: p.x + Math.sign(p.x) * -1.4, y: p.y + Math.sign(p.y) * -1.1, theta: 2.5 * deg } : { ...p, x: p.x + 1000 }));
    const snapped = snapPose(rev2, poses, corner)!;
    expect(snapped.x).toBeCloseTo(ref[corner].x, 6);
    expect(snapped.y).toBeCloseTo(ref[corner].y, 6);
    expect(snapped.theta).toBeCloseTo(ref[corner].theta, 9);
  });

  it('never pulls an assembled piece out of a solved state', () => {
    const ref = rev2.reference.poses.map((p) => ({ ...p }));
    for (let i = 0; i < ref.length; i++) {
      const snapped = snapPose(rev2, ref, i);
      const poses = ref.map((p, k) => (k === i && snapped ? snapped : p));
      expect(evaluate(rev2, poses).solved).toBe(true);
    }
  });
});
