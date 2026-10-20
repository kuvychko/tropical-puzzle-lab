import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/geometry/evaluate';
import { penetration, transform } from '../src/geometry/polygon';
import { scramble } from '../src/geometry/scramble';
import type { Pose, Puzzle, Vec2 } from '../src/types';

const load = (id: string): Puzzle =>
  JSON.parse(readFileSync(new URL(`../../puzzles/${id}/puzzle.json`, import.meta.url), 'utf-8'));

const rev2 = load('rev2');
const flat = load('rev2-flat');
const reference = (p: Puzzle): Pose[] => p.reference.poses.map((q) => ({ ...q }));

const validation = rev2.validation;
const rect = (w: number, h: number): Vec2[] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

/** A 144 mm square split into two congruent halves with different roofs. */
function halves(variant: 'relief' | 'tiling'): Puzzle {
  const roofs = [{ z0: 10, gx: 0.1, gy: 0 }, { z0: 24.4, gx: 0.3, gy: 0 }];
  return {
    ...rev2,
    id: `halves-${variant}`,
    variant,
    geometry: { ...rev2.geometry, reliefMm: 30 },
    pieces: roofs.map((roof, i) => ({
      id: 'LR'[i],
      polygon: rect(72, 144),
      ...(variant === 'relief' ? { roof } : { thickness: 12 }),
    })),
    reference: { poses: [{ id: 'L', x: -36, y: 0, theta: 0 }, { id: 'R', x: 36, y: 0, theta: 0 }] },
    validation: variant === 'relief' ? validation : { ...validation, roofMismatch: undefined },
  };
}

describe('polygon primitives', () => {
  it('treats edge contact as zero penetration', () => {
    const a = transform(rect(10, 10), { id: 'a', x: 0, y: 0, theta: 0 });
    const b = transform(rect(10, 10), { id: 'b', x: 10, y: 0, theta: 0 });
    expect(Math.abs(penetration(a, b))).toBeLessThan(1e-12);
  });

  it('measures the depth of a long thin overlap', () => {
    const a = transform(rect(100, 10), { id: 'a', x: 0, y: 0, theta: 0 });
    const b = transform(rect(100, 10), { id: 'b', x: 0, y: 9, theta: 0 });
    expect(penetration(a, b)).toBeCloseTo(1, 9);
  });
});

describe('rev2 evaluation', () => {
  it('accepts the reference assembly in both variants', () => {
    for (const p of [rev2, flat]) {
      const e = evaluate(p, reference(p));
      expect(e.solved).toBe(true);
      expect(e.overlapping.some(Boolean)).toBe(false);
    }
  });

  it('finds roof seams along shared edges of the reference', () => {
    const e = evaluate(rev2, reference(rev2));
    expect(e.seams.length).toBeGreaterThanOrEqual(12);
    expect(e.totals.worstRoof).toBeLessThan(1e-9);
  });

  it('does not flag edge contact as overlap', () => {
    const e = evaluate(rev2, reference(rev2));
    expect(e.totals.worstDepth).toBe(0);
    expect(e.overlaps).toHaveLength(0);
  });

  it('accepts ordinary placement noise', () => {
    const poses = reference(rev2).map((p, i) => ({ ...p, x: p.x + 0.2 * Math.sin(i), y: p.y + 0.2 * Math.cos(i), theta: 0.002 * (i % 3 - 1) }));
    expect(evaluate(rev2, poses).solved).toBe(true);
  });

  it('rejects and colours a clear overlap', () => {
    const poses = reference(rev2);
    poses[5].x += 6; // interior piece F pushed into its neighbour
    const e = evaluate(rev2, poses);
    expect(e.solved).toBe(false);
    expect(e.overlapping[5]).toBe(true);
    expect(e.checks.noOverlap).toBe(false);
  });

  it('rejects a piece outside the target', () => {
    const poses = reference(rev2);
    poses[0].x -= 5; // perimeter piece A pushed through the frame
    const e = evaluate(rev2, poses);
    expect(e.checks.inside).toBe(false);
    expect(e.solved).toBe(false);
  });

  it('rejects a slightly rotated interior piece in relief via depth or roof', () => {
    const poses = reference(rev2);
    poses[6].theta += 0.05;
    expect(evaluate(rev2, poses).solved).toBe(false);
  });

  it('a red piece never coexists with solved', () => {
    for (let k = 0; k < 50; k++) {
      const poses = reference(rev2).map((p, i) => ({ ...p, x: p.x + ((k * 7 + i * 3) % 11) * 0.12 - 0.6, theta: p.theta + ((k + i) % 5 - 2) * 0.004 }));
      const e = evaluate(rev2, poses);
      if (e.overlapping.some(Boolean)) expect(e.solved).toBe(false);
    }
  });
});

describe('relief vs tiling', () => {
  const swapped: Pose[] = [{ id: 'L', x: 36, y: 0, theta: 0 }, { id: 'R', x: -36, y: 0, theta: 0 }];

  it('accepts the reference halves in both modes', () => {
    expect(evaluate(halves('relief'), halves('relief').reference.poses).solved).toBe(true);
    expect(evaluate(halves('tiling'), halves('tiling').reference.poses).solved).toBe(true);
  });

  it('accepts swapped halves as a tiling but not as a relief', () => {
    expect(evaluate(halves('tiling'), swapped).solved).toBe(true);
    const relief = evaluate(halves('relief'), swapped);
    expect(relief.checks.noOverlap && relief.checks.inside && relief.checks.area).toBe(true);
    expect(relief.checks.roof).toBe(false);
  });
});

describe('scramble', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(scramble(rev2, 42)).toEqual(scramble(rev2, 42));
    expect(scramble(rev2, 42)).not.toEqual(scramble(rev2, 43));
  });

  it('places every piece outside the target without overlaps', () => {
    const poses = scramble(rev2, rev2.scramble.defaultSeed);
    const e = evaluate(rev2, poses);
    expect(e.overlaps).toHaveLength(0);
    const target = rev2.geometry.target.vertices;
    rev2.pieces.forEach((piece, i) => expect(penetration(transform(piece.polygon, poses[i]), target)).toBeLessThan(0));
  });
});
