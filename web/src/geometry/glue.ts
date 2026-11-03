// Optional "glue" assist. Two pieces that fit together on the table, along an edge they
// share with tops that meet (relief), are glued and move as one from then on. Fitting is
// judged with the same seam test and tolerances as completion; the reference solution is
// never consulted, so any assembly that fits glues, and wrong pairs can glue in flat puzzles.
import type { Pose, Puzzle, Vec2 } from '../types';
import { roofAt, seamsBetween, tolerances, worldPolygons } from './evaluate';
import { bounds, boxesTouch, penetration } from './polygon';

export type Pair = [number, number];

/** Order-independent key of a pair of piece ids, as stored in sessions. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pairs of pieces (a < b) that fit: they share an edge of at least the minimum seam length,
 * don't overlap beyond the depth tolerance, and (relief) their roofs agree along every shared edge.
 */
export function fittingPairs(puzzle: Puzzle, poses: Pose[]): Pair[] {
  const t = tolerances(puzzle);
  const polys = worldPolygons(puzzle, poses);
  const boxes = polys.map(bounds);
  const pairs: Pair[] = [];
  for (let a = 0; a < polys.length; a++) {
    for (let b = a + 1; b < polys.length; b++) {
      if (!boxesTouch(boxes[a], boxes[b], t.lateral)) continue;
      const depth = penetration(polys[a], polys[b]);
      if (depth > t.depth || depth < -t.lateral) continue;
      const roofA = (p: Vec2) => roofAt(puzzle.pieces[a], poses[a], p);
      const roofB = (p: Vec2) => roofAt(puzzle.pieces[b], poses[b], p);
      const seams = seamsBetween(polys[a], polys[b], roofA, roofB, t.cosAngle, t.lateral, t.minSeam);
      if (seams.length && (t.roof == null || seams.every((s) => s.mismatch <= t.roof!))) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Group label per piece: pieces joined by a chain of pairs share a label (the smallest index). */
export function groups(n: number, pairs: Pair[]): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b] of pairs) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  return parent.map((_, i) => find(i));
}

/** Indices of the pieces in the same group as `index`, including it. */
export const members = (labels: number[], index: number): number[] =>
  labels.flatMap((label, i) => (label === labels[index] ? [i] : []));

/**
 * Move `indices` rigidly from their `start` poses: turn by `turn` radians about the start
 * position of piece `pivot`, then translate by (dx, dy). Poses are updated in place.
 */
export function moveRigidly(poses: Pose[], start: Pose[], indices: number[], pivot: number, dx: number, dy: number, turn: number): void {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const px = start[pivot].x;
  const py = start[pivot].y;
  for (const i of indices) {
    const rx = start[i].x - px;
    const ry = start[i].y - py;
    poses[i].x = px + cos * rx - sin * ry + dx;
    poses[i].y = py + sin * rx + cos * ry + dy;
    poses[i].theta = start[i].theta + turn;
  }
}
