// Optional "sticky edges" assist. It aligns a released piece with edges that are
// physically next to it (tray walls and other pieces), like a wall guiding a real
// piece. It never uses the reference solution, so it cannot pull a piece toward
// its correct position or orientation.
import type { Pose, Puzzle, Vec2 } from '../types';
import { transform } from './polygon';

export interface SnapTolerances {
  /** Largest turn applied to make two edges parallel, radians. */
  angle: number;
  /** Largest gap or overlap closed between parallel edges, mm. */
  distance: number;
  /** Edges must run alongside each other for at least this length, mm. */
  overlap: number;
}

export function snapTolerances(puzzle: Puzzle): SnapTolerances {
  const span = puzzle.geometry.spanMm;
  return { angle: (6 * Math.PI) / 180, distance: 0.02 * span, overlap: 0.02 * span };
}

/** A fixed segment with solid material on its left (counter-clockwise boundary convention). */
interface Segment {
  a: Vec2;
  b: Vec2;
}

const sub = (p: Vec2, q: Vec2): Vec2 => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Vec2, q: Vec2) => p[0] * q[0] + p[1] * q[1];
const cross = (p: Vec2, q: Vec2) => p[0] * q[1] - p[1] * q[0];
const unit = (p: Vec2): Vec2 => {
  const len = Math.hypot(p[0], p[1]);
  return [p[0] / len, p[1] / len];
};
const leftNormal = (d: Vec2): Vec2 => [-d[1], d[0]];

function edges(poly: Vec2[]): Segment[] {
  return poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] }));
}

/** Overlap length of segment e with segment f, measured along f. */
function runAlongside(e: Segment, f: Segment): number {
  const d = unit(sub(f.b, f.a));
  const len = dot(sub(f.b, f.a), d);
  const s0 = dot(sub(e.a, f.a), d);
  const s1 = dot(sub(e.b, f.a), d);
  return Math.min(len, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1));
}

/** Signed distance of p from f's line; negative on the free (right) side. */
const sideOf = (p: Vec2, f: Segment) => dot(leftNormal(unit(sub(f.b, f.a))), sub(p, f.a));

function fixedSegments(puzzle: Puzzle, poses: Pose[], index: number): Segment[] {
  // The tray's solid wall is outside the target, so its edges are reversed.
  const target = puzzle.geometry.target.vertices;
  const walls = edges([...target].reverse());
  const others = puzzle.pieces.flatMap((piece, i) => (i === index ? [] : edges(transform(piece.polygon, poses[i]))));
  return [...walls, ...others];
}

/**
 * Returns the snapped pose of piece `index`, or null if no edge is close enough.
 * Step 1 turns the piece so its best-matching edge is parallel and flush with a nearby
 * fixed edge. Step 2 slides it along that edge until a second edge is flush, which
 * settles a piece into a corner.
 */
export function snapPose(puzzle: Puzzle, poses: Pose[], index: number, tol = snapTolerances(puzzle)): Pose | null {
  const local = puzzle.pieces[index].polygon;
  const start = poses[index];
  const fixed = fixedSegments(puzzle, poses, index);

  let best: { pose: Pose; edge: number; segment: Segment; score: number } | null = null;
  edges(transform(local, start)).forEach((e, k) => {
    const de = unit(sub(e.b, e.a));
    for (const f of fixed) {
      const back: Vec2 = unit(sub(f.a, f.b));
      // Turn needed to make e run opposite to f (neighbouring boundaries run in opposite directions).
      const turn = Math.atan2(cross(de, back), dot(de, back));
      if (Math.abs(turn) > tol.angle) continue;
      const turned = { ...start, theta: start.theta + turn };
      const moved = edges(transform(local, turned))[k];
      const gap = sideOf(moved.a, f);
      if (Math.abs(gap) > tol.distance) continue;
      if (runAlongside(moved, f) < tol.overlap) continue;
      const normal = leftNormal(unit(sub(f.b, f.a)));
      const pose = { ...turned, x: turned.x - gap * normal[0], y: turned.y - gap * normal[1] };
      const length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const score = Math.abs(gap) + (Math.abs(turn) * length) / 2;
      if (!best || score < best.score) best = { pose, edge: k, segment: f, score };
    }
  });
  if (!best) return null;
  const first: { pose: Pose; edge: number; segment: Segment } = best;

  // Step 2: slide along the first edge to close a second, already-parallel contact.
  const slide = unit(sub(first.segment.b, first.segment.a));
  let shift: number | null = null;
  edges(transform(local, first.pose)).forEach((e, k) => {
    if (k === first.edge) return;
    const de = unit(sub(e.b, e.a));
    for (const f of fixed) {
      if (f === first.segment) continue;
      const back: Vec2 = unit(sub(f.a, f.b));
      if (Math.abs(Math.atan2(cross(de, back), dot(de, back))) > tol.angle / 6) continue;
      const rate = dot(leftNormal(unit(sub(f.b, f.a))), slide);
      if (Math.abs(rate) < 0.25) continue;
      const gap = sideOf(e.a, f);
      if (Math.abs(gap) > tol.distance) continue;
      const lambda = -gap / rate;
      const shifted: Segment = { a: [e.a[0] + lambda * slide[0], e.a[1] + lambda * slide[1]], b: [e.b[0] + lambda * slide[0], e.b[1] + lambda * slide[1]] };
      if (runAlongside(shifted, f) < tol.overlap) continue;
      if (shift === null || Math.abs(lambda) < Math.abs(shift)) shift = lambda;
    }
  });
  const pose = first.pose;
  return shift === null ? pose : { ...pose, x: pose.x + shift * slide[0], y: pose.y + shift * slide[1] };
}
