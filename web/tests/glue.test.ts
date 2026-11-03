import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, tolerances } from '../src/geometry/evaluate';
import { fittingPairs, groups, members, moveRigidly, pairKey } from '../src/geometry/glue';
import { penetration, transform } from '../src/geometry/polygon';
import { scramble } from '../src/geometry/scramble';
import { snapPose, snapTolerances } from '../src/geometry/snap';
import type { Pose, Puzzle, Vec2 } from '../src/types';

const load = (id: string): Puzzle =>
  JSON.parse(readFileSync(new URL(`../../puzzles/${id}/puzzle.json`, import.meta.url), 'utf-8'));

const rev2 = load('rev2');
const flat = load('rev2-flat');
const reference = (p: Puzzle): Pose[] => p.reference.poses.map((q) => ({ ...q }));
const keys = (pairs: [number, number][]) => pairs.map(([a, b]) => `${a}-${b}`).sort();
const rect = (w: number, h: number): Vec2[] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

/** A 144 mm square split into two congruent halves with different roofs (as in evaluate.test.ts). */
function halves(variant: 'relief' | 'tiling'): Puzzle {
  const roofs = [{ z0: 10, gx: 0.1, gy: 0 }, { z0: 24.4, gx: 0.3, gy: 0 }];
  return {
    ...rev2,
    variant,
    geometry: { ...rev2.geometry, reliefMm: 30 },
    pieces: roofs.map((roof, i) => ({ id: 'LR'[i], polygon: rect(72, 144), ...(variant === 'relief' ? { roof } : { thickness: 12 }) })),
    reference: { poses: [{ id: 'L', x: -36, y: 0, theta: 0 }, { id: 'R', x: 36, y: 0, theta: 0 }] },
    validation: variant === 'relief' ? rev2.validation : { ...rev2.validation, roofMismatch: undefined },
  };
}

describe('fitting pairs', () => {
  it('are exactly the neighbours of the reference assembly, in both variants', () => {
    const seamPairs = keys([...new Set(evaluate(rev2, reference(rev2)).seams.map((s) => `${s.a},${s.b}`))].map((k) => k.split(',').map(Number) as [number, number]));
    expect(seamPairs.length).toBeGreaterThan(8);
    expect(keys(fittingPairs(rev2, reference(rev2)))).toEqual(seamPairs);
    expect(keys(fittingPairs(flat, reference(flat)))).toEqual(seamPairs);
  });

  it('never include a scrambled pair', () => {
    for (const p of [rev2, flat, load('new2')]) expect(fittingPairs(p, scramble(p, p.scramble.defaultSeed))).toEqual([]);
  });

  it('need the roofs to meet in relief, but only the outlines in a flat puzzle', () => {
    const swapped: Pose[] = [{ id: 'L', x: 36, y: 0, theta: 0 }, { id: 'R', x: -36, y: 0, theta: 0 }];
    expect(fittingPairs(halves('relief'), reference(halves('relief')))).toEqual([[0, 1]]);
    expect(fittingPairs(halves('relief'), swapped)).toEqual([]);
    expect(fittingPairs(halves('tiling'), swapped)).toEqual([[0, 1]]);
  });

  it('exclude pairs that overlap beyond the depth tolerance', () => {
    const poses = reference(rev2);
    poses[5].x += 6; // interior piece F pushed into its neighbour, as in evaluate.test.ts
    const depth = tolerances(rev2).depth;
    const polys = rev2.pieces.map((piece, i) => transform(piece.polygon, poses[i]));
    const pairs = fittingPairs(rev2, poses);
    for (const [a, b] of pairs) expect(penetration(polys[a], polys[b])).toBeLessThanOrEqual(depth);
    const red = evaluate(rev2, poses).overlaps.filter((o) => o.depth > depth);
    expect(red.length).toBeGreaterThan(0);
    for (const o of red) expect(keys(pairs)).not.toContain(`${o.a}-${o.b}`);
  });
});

describe('groups', () => {
  it('join chains of pairs', () => {
    const labels = groups(5, [[0, 1], [3, 1]]);
    expect(labels).toEqual([0, 0, 2, 0, 4]);
    expect(members(labels, 3)).toEqual([0, 1, 3]);
    expect(members(labels, 2)).toEqual([2]);
  });

  it('use order-independent pair keys', () => {
    expect(pairKey('B', 'A')).toBe(pairKey('A', 'B'));
  });
});

describe('moving a group rigidly', () => {
  it('keeps the pivot in place when turning, and turns every member', () => {
    const start = reference(rev2);
    const poses = reference(rev2);
    moveRigidly(poses, start, [0, 1, 2], 1, 0, 0, 0.7);
    expect(poses[1].x).toBeCloseTo(start[1].x, 12);
    expect(poses[1].y).toBeCloseTo(start[1].y, 12);
    for (const i of [0, 1, 2]) expect(poses[i].theta).toBeCloseTo(start[i].theta + 0.7, 12);
    expect(poses[3]).toEqual(start[3]);
  });

  it('keeps a glued pair fitting, and only that pair, after it is carried off and turned', () => {
    const [a, b] = fittingPairs(rev2, reference(rev2))[0];
    const start = reference(rev2);
    const poses = reference(rev2);
    moveRigidly(poses, start, [a, b], a, 300, -50, 1.1);
    const pairs = fittingPairs(rev2, poses);
    expect(keys(pairs)).toContain(`${a}-${b}`);
    expect(pairs.filter(([p, q]) => (p === a || p === b || q === a || q === b) && !(p === a && q === b))).toEqual([]);
  });
});

describe('sticky edges with a glued group', () => {
  it('does not snap to pieces of the same group', () => {
    // The whole assembly far from the tray, with one piece nudged off its neighbours.
    const start = reference(rev2);
    const poses = reference(rev2);
    moveRigidly(poses, start, rev2.pieces.map((_, i) => i), 0, 400, 0, 0);
    poses[5].x += 0.5;
    const others = new Set(rev2.pieces.map((_, i) => i).filter((i) => i !== 5));
    expect(snapPose(rev2, poses, 5)).not.toBeNull();
    expect(snapPose(rev2, poses, 5, snapTolerances(rev2), others)).toBeNull();
  });
});
