// Convex-polygon primitives. No rendering dependencies.
import type { Pose, Vec2 } from '../types';

export function transform(local: Vec2[], pose: Pose): Vec2[] {
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  return local.map(([u, v]) => [pose.x + c * u - s * v, pose.y + s * u + c * v]);
}

/** World point -> piece-local coordinates. */
export function toLocal(p: Vec2, pose: Pose): Vec2 {
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  const dx = p[0] - pose.x;
  const dy = p[1] - pose.y;
  return [c * dx + s * dy, -s * dx + c * dy];
}

export function area(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    sum += p[0] * q[1] - p[1] * q[0];
  }
  return sum / 2;
}

/** Keep the part of `subject` left of the directed line a->b. */
function clipLeft(subject: Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const out: Vec2[] = [];
  const side = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < subject.length; i++) {
    const p = subject[i];
    const q = subject[(i + 1) % subject.length];
    const fp = side(p);
    const fq = side(q);
    if (fp >= 0) out.push(p);
    if ((fp > 0 && fq < 0) || (fp < 0 && fq > 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Intersection of two convex CCW polygons (Sutherland–Hodgman). */
export function intersect(subject: Vec2[], clipper: Vec2[]): Vec2[] {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length >= 3; i++) {
    out = clipLeft(out, clipper[i], clipper[(i + 1) % clipper.length]);
  }
  return out.length >= 3 ? out : [];
}

export function intersectionArea(a: Vec2[], b: Vec2[]): number {
  const p = intersect(a, b);
  return p.length ? Math.max(0, area(p)) : 0;
}

function outwardNormals(poly: Vec2[]): Vec2[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    return [dy / len, -dx / len];
  });
}

/**
 * Separating-axis test for convex polygons.
 * Positive: penetration depth (the minimum translation that separates them).
 * Zero or negative: touching or separated; magnitude is the widest gap along an edge normal.
 */
export function penetration(a: Vec2[], b: Vec2[]): number {
  let best = Infinity;
  for (const n of [...outwardNormals(a), ...outwardNormals(b)]) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of a) {
      const d = n[0] * p[0] + n[1] * p[1];
      if (d < minA) minA = d;
      if (d > maxA) maxA = d;
    }
    for (const p of b) {
      const d = n[0] * p[0] + n[1] * p[1];
      if (d < minB) minB = d;
      if (d > maxB) maxB = d;
    }
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap < best) best = overlap;
  }
  return best;
}

/** Largest distance a vertex of `poly` lies outside the convex CCW `container` (0 if inside). */
export function outsideDepth(poly: Vec2[], container: Vec2[]): number {
  const normals = outwardNormals(container);
  let worst = 0;
  for (const p of poly) {
    for (let i = 0; i < container.length; i++) {
      const a = container[i];
      const d = normals[i][0] * (p[0] - a[0]) + normals[i][1] * (p[1] - a[1]);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(poly: Vec2[]): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of poly) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

export function boxesTouch(a: Box, b: Box, margin = 0): boolean {
  return a.minX <= b.maxX + margin && b.minX <= a.maxX + margin && a.minY <= b.maxY + margin && b.minY <= a.maxY + margin;
}

export function radius(local: Vec2[]): number {
  return Math.max(...local.map(([u, v]) => Math.hypot(u, v)));
}
