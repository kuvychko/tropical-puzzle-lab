// Placement evaluation shared by overlap colouring and the completion check.
// One numerical policy: a piece is drawn red exactly when it fails the overlap
// criterion that also blocks completion.
import type { PieceDef, Pose, Puzzle, Vec2 } from '../types';
import { area, bounds, boxesTouch, intersectionArea, outsideDepth, penetration, toLocal, transform } from './polygon';

export interface PairContact {
  a: number;
  b: number;
  depth: number;
  area: number;
}

export interface RoofSeam {
  a: number;
  b: number;
  length: number;
  /** Largest roof height difference along the shared edge, mm. */
  mismatch: number;
}

export interface Evaluation {
  /** Per piece, in puzzle order. */
  overlapping: boolean[];
  outsideDepth: number[];
  overlaps: PairContact[];
  seams: RoofSeam[];
  totals: { overlapArea: number; outsideArea: number; uncoveredArea: number; worstDepth: number; worstOutside: number; worstRoof: number };
  tolerances: { depth: number; outside: number; area: number; roof: number | null };
  checks: { noOverlap: boolean; inside: boolean; area: boolean; roof: boolean };
  solved: boolean;
}

export function roofAt(piece: PieceDef, pose: Pose, p: Vec2): number {
  if (!piece.roof) return piece.thickness ?? 0;
  const [u, v] = toLocal(p, pose);
  return piece.roof.z0 + piece.roof.gx * u + piece.roof.gy * v;
}

export function worldPolygons(puzzle: Puzzle, poses: Pose[]): Vec2[][] {
  return puzzle.pieces.map((piece, i) => transform(piece.polygon, poses[i]));
}

/** Shared edge segments between two placed pieces and the roof mismatch along each. */
function seamsBetween(
  pa: Vec2[], pb: Vec2[], roofA: (p: Vec2) => number, roofB: (p: Vec2) => number,
  cosTol: number, lateralTol: number, minLength: number,
): { length: number; mismatch: number }[] {
  const found = [];
  for (let i = 0; i < pa.length; i++) {
    const e0 = pa[i];
    const e1 = pa[(i + 1) % pa.length];
    const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
    const d: Vec2 = [(e1[0] - e0[0]) / len, (e1[1] - e0[1]) / len];
    for (let j = 0; j < pb.length; j++) {
      const f0 = pb[j];
      const f1 = pb[(j + 1) % pb.length];
      const flen = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
      const fd: Vec2 = [(f1[0] - f0[0]) / flen, (f1[1] - f0[1]) / flen];
      // Neighbouring CCW polygons traverse a shared edge in opposite directions.
      if (d[0] * fd[0] + d[1] * fd[1] > -cosTol) continue;
      const lateral = (p: Vec2) => d[0] * (p[1] - e0[1]) - d[1] * (p[0] - e0[0]);
      if (Math.abs(lateral(f0)) > lateralTol || Math.abs(lateral(f1)) > lateralTol) continue;
      const along = (p: Vec2) => d[0] * (p[0] - e0[0]) + d[1] * (p[1] - e0[1]);
      const lo = Math.max(0, Math.min(along(f0), along(f1)));
      const hi = Math.min(len, Math.max(along(f0), along(f1)));
      if (hi - lo < minLength) continue;
      let mismatch = 0;
      for (const t of [lo, hi]) {
        // Compare both roof planes at the midline between the two edges.
        const onE: Vec2 = [e0[0] + d[0] * t, e0[1] + d[1] * t];
        const s = (t - along(f0)) / (along(f1) - along(f0));
        const onF: Vec2 = [f0[0] + (f1[0] - f0[0]) * s, f0[1] + (f1[1] - f0[1]) * s];
        const mid: Vec2 = [(onE[0] + onF[0]) / 2, (onE[1] + onF[1]) / 2];
        mismatch = Math.max(mismatch, Math.abs(roofA(mid) - roofB(mid)));
      }
      found.push({ length: hi - lo, mismatch });
    }
  }
  return found;
}

export function evaluate(puzzle: Puzzle, poses: Pose[]): Evaluation {
  const v = puzzle.validation;
  const span = puzzle.geometry.spanMm;
  const target = puzzle.geometry.target.vertices;
  const targetArea = area(target);
  const noise = v.contactNoise * span;
  const tol = {
    depth: v.overlapDepth * span,
    outside: v.outsideDepth * span,
    area: v.areaError * targetArea,
    roof: puzzle.variant === 'relief' && v.roofMismatch != null ? v.roofMismatch * (puzzle.geometry.reliefMm ?? 0) : null,
  };

  const polys = worldPolygons(puzzle, poses);
  const boxes = polys.map(bounds);
  const n = polys.length;
  const overlapping = new Array<boolean>(n).fill(false);
  const overlaps: PairContact[] = [];
  const seams: RoofSeam[] = [];
  const lateralTol = 2 * tol.depth + noise;
  const cosTol = Math.cos((v.edgeAngleDeg * Math.PI) / 180);
  let overlapArea = 0;
  let worstDepth = 0;
  let worstRoof = 0;

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (!boxesTouch(boxes[a], boxes[b], lateralTol)) continue;
      const depth = penetration(polys[a], polys[b]);
      if (depth > noise) {
        const shared = intersectionArea(polys[a], polys[b]);
        overlaps.push({ a, b, depth, area: shared });
        overlapArea += shared;
        worstDepth = Math.max(worstDepth, depth);
        if (depth > tol.depth) overlapping[a] = overlapping[b] = true;
      }
      if (tol.roof != null && depth > -lateralTol) {
        const roofA = (p: Vec2) => roofAt(puzzle.pieces[a], poses[a], p);
        const roofB = (p: Vec2) => roofAt(puzzle.pieces[b], poses[b], p);
        for (const s of seamsBetween(polys[a], polys[b], roofA, roofB, cosTol, lateralTol, v.edgeMinOverlap * span)) {
          seams.push({ a, b, ...s });
          worstRoof = Math.max(worstRoof, s.mismatch);
        }
      }
    }
  }

  let outsideArea = 0;
  let insideArea = 0;
  const outside = polys.map((p) => {
    const inside = intersectionArea(p, target);
    insideArea += inside;
    outsideArea += Math.max(0, area(p) - inside);
    const depth = outsideDepth(p, target);
    return depth > noise ? depth : 0;
  });
  const worstOutside = Math.max(0, ...outside);
  // Inclusion–exclusion to first order: exact when no three pieces share area.
  const uncoveredArea = Math.max(0, targetArea - insideArea + overlapArea);

  const checks = {
    noOverlap: !overlapping.some(Boolean),
    inside: worstOutside <= tol.outside,
    area: overlapArea + outsideArea <= tol.area && uncoveredArea <= tol.area,
    roof: tol.roof == null || worstRoof <= tol.roof,
  };
  return {
    overlapping,
    outsideDepth: outside,
    overlaps,
    seams,
    totals: { overlapArea, outsideArea, uncoveredArea, worstDepth, worstOutside, worstRoof },
    tolerances: tol,
    checks,
    solved: checks.noOverlap && checks.inside && checks.area && checks.roof,
  };
}
