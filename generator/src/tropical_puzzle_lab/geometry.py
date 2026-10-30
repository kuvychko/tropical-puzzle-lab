"""Exact convex-polygon operations on rational coordinates.

Ported from the rev2 source (`puzzles/rev2/source/geometry_core.py` and
`search.py`). The originals use floats with 1e-9 tolerances; here points are
pairs of `fractions.Fraction`, so clipping, areas and centroids are exact.
"""
from __future__ import annotations

from fractions import Fraction
from typing import Sequence

Point = tuple[Fraction, Fraction]
Polygon = list[Point]


def dot(u: Sequence[Fraction], v: Sequence[Fraction]) -> Fraction:
    return u[0] * v[0] + u[1] * v[1]


def clean(poly: Polygon) -> Polygon:
    """Drop repeated and collinear vertices (exact comparisons)."""
    out: Polygon = []
    for v in poly:
        if not out or v != out[-1]:
            out.append(v)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    changed = True
    while changed and len(out) >= 3:
        changed = False
        for k in range(len(out)):
            a, b, c = out[k - 1], out[k], out[(k + 1) % len(out)]
            if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) == 0:
                out.pop(k)
                changed = True
                break
    return out


def clip(poly: Polygon, normal: Sequence[Fraction], threshold: Fraction) -> Polygon:
    """Keep the part with normal . p >= threshold, preserving CCW winding."""
    if not poly:
        return []
    result: Polygon = []
    for p, q in zip(poly, poly[1:] + poly[:1]):
        fp = dot(normal, p) - threshold
        fq = dot(normal, q) - threshold
        if fp >= 0:
            result.append(p)
        if (fp > 0 and fq < 0) or (fp < 0 and fq > 0):
            t = fp / (fp - fq)
            result.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return clean(result)


def area(poly: Polygon) -> Fraction:
    if len(poly) < 3:
        return Fraction(0)
    return sum((p[0] * q[1] - p[1] * q[0] for p, q in zip(poly, poly[1:] + poly[:1])), Fraction(0)) / 2


def centroid(poly: Polygon) -> Point:
    cx = cy = Fraction(0)
    for p, q in zip(poly, poly[1:] + poly[:1]):
        cross = p[0] * q[1] - q[0] * p[1]
        cx += (p[0] + q[0]) * cross
        cy += (p[1] + q[1]) * cross
    a6 = 6 * area(poly)
    return (cx / a6, cy / a6)


def intersect(p: Polygon, q: Polygon) -> Polygon:
    """Intersection of two convex CCW polygons (empty if it has no area)."""
    out = p
    for a, b in zip(q, q[1:] + q[:1]):
        # Keep the left side of each CCW edge of q.
        out = clip(out, (a[1] - b[1], b[0] - a[0]), (a[1] - b[1]) * a[0] + (b[0] - a[0]) * a[1])
        if len(out) < 3:
            return []
    return out


def square(half: Fraction) -> Polygon:
    return [(-half, -half), (half, -half), (half, half), (-half, half)]
