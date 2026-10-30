"""Seeded random search for tropical rational puzzles F = P ⊘ Q = P - Q (max convention).

Each candidate draws a few terms for P and for Q, with distinct integer slopes
and coefficients on a 1/20 grid. The pieces are the cells of the common
refinement, scaled like new2 (domain half-width 4, 18 mm per unit, 144 mm tray,
8 + 35 mm roof). A candidate is kept when it is a reasonable physical puzzle:

- 9 to 16 pieces, none smaller than 3% of the tray;
- interior angles of at least 20 degrees and edges of at least 8 mm;
- roof tilt of at most 30 degrees, so the pieces print roof-down (`tpl-stl`)
  without supports;
- both creases present: P's tropical curve makes valleys and Q's makes ridges,
  and the shorter of the two curves is at least 30% of the longer;
- no two pieces congruent under rotation (they are never flipped).

Kept candidates are ranked by the smallest piece area relative to the mean
(so that piece counts compare fairly), then by the smallest angle.
The best ones are printed as recipe fragments.

    ../.venv/Scripts/python scripts/search_rational.py --seed 1 --samples 20000
"""
from __future__ import annotations

import argparse
import json
import math
import random
from fractions import Fraction

from tropical_puzzle_lab.geometry import area, clip, square
from tropical_puzzle_lab.tropical import Term, refine, regions, roof_transform

DOMAIN = Fraction(4)
XY = 18
MIN_THICKNESS = Fraction(8)
RELIEF = Fraction(35)
SLOPES = [(a, b) for a in range(4) for b in range(4)]


def perimeter(poly) -> float:
    return sum(math.dist(p, q) for p, q in zip(poly, poly[1:] + poly[:1]))


def curve_length(cells) -> float:
    """Length of the tropical curve inside the domain: interior cell edges are counted twice."""
    return (sum(perimeter([(float(x), float(y)) for x, y in c]) for c in cells) - 8 * float(DOMAIN)) / 2


def angles_deg(poly) -> list[float]:
    out = []
    n = len(poly)
    for k in range(n):
        a, b, c = poly[k - 1], poly[k], poly[(k + 1) % n]
        u = (a[0] - b[0], a[1] - b[1])
        v = (c[0] - b[0], c[1] - b[1])
        out.append(math.degrees(math.atan2(abs(u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1])))
    return out


def signature(poly) -> tuple:
    """Rotation-invariant shape key: the cyclic sequence of (edge length, angle), rounded, in canonical rotation."""
    n = len(poly)
    angles = angles_deg(poly)
    seq = [(round(math.dist(poly[k], poly[(k + 1) % n]) * 2) / 2, round(angles[(k + 1) % n])) for k in range(n)]
    return min(tuple(seq[k:] + seq[:k]) for k in range(n))


def draw_terms(rng: random.Random, count: int, letters: str, spread: int) -> list[Term]:
    """Random terms with distinct slopes; terms that never attain the max in the domain are dropped."""
    slopes = rng.sample(SLOPES, count)
    terms = [Term("", a, b, Fraction(rng.randint(-spread, spread), 20)) for a, b in slopes]
    active = []
    for t in terms:
        cell = square(DOMAIN)
        for u in terms:
            if u is not t:
                cell = clip(cell, (t.a - u.a, t.b - u.b), u.c - t.c)
        if area(cell) > 0:
            active.append(t)
    return [Term(letters[i], t.a, t.b, t.c) for i, t in enumerate(active)]


def evaluate(numerator: list[Term], denominator: list[Term]) -> dict | None:
    if len(numerator) < 2 or len(denominator) < 2:
        return None
    p_cells = regions(numerator, DOMAIN)
    q_cells = regions(denominator, DOMAIN)
    terms, cells = refine(numerator, denominator, DOMAIN)
    n = len(cells)
    if not 9 <= n <= 16:
        return None
    mm = [[(float(x) * XY, float(y) * XY) for x, y in c] for c in cells]
    tray = (2 * float(DOMAIN) * XY) ** 2
    min_area = min(float(area(c)) * XY * XY for c in cells) / tray
    min_angle = min(min(angles_deg(p)) for p in mm)
    min_edge = min(math.dist(p[k], p[(k + 1) % len(p)]) for p in mm for k in range(len(p)))
    roof = roof_transform(terms, cells, MIN_THICKNESS, RELIEF)
    max_tilt = max(math.degrees(math.atan(float(roof.scale) * math.hypot(t.a, t.b) / XY)) for t in terms)
    valleys, ridges = curve_length(p_cells), curve_length(q_cells)
    balance = min(valleys, ridges) / max(valleys, ridges)
    congruent = len({signature(p) for p in mm}) < n
    edge = float(DOMAIN) - 1e-9
    interior = sum(all(abs(x) < edge and abs(y) < edge for x, y in c) for c in cells)
    if min_area < 0.03 or min_angle < 20 or min_edge < 8 or max_tilt > 30 or balance < 0.3 or congruent:
        return None
    return {
        "pieces": n, "interior": interior, "minArea": round(min_area, 4), "minAngle": round(min_angle, 1),
        "minEdgeMm": round(min_edge, 1), "maxTiltDeg": round(max_tilt, 1), "curveBalance": round(balance, 2),
    }


def term_json(t: Term) -> dict:
    return {"id": t.id, "a": t.a, "b": t.b, "c": str(t.c)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--samples", type=int, default=20000)
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()
    rng = random.Random(args.seed)
    found = []
    for sample in range(args.samples):
        numerator = draw_terms(rng, rng.randint(3, 6), "ABCDEF", 80)
        denominator = draw_terms(rng, rng.randint(3, 6), "abcdef", 80)
        metrics = evaluate(numerator, denominator)
        if metrics:
            found.append((metrics, sample, numerator, denominator))
    found.sort(key=lambda f: (-f[0]["minArea"] * f[0]["pieces"], -f[0]["minAngle"]))
    print(f"seed {args.seed}: {len(found)} of {args.samples} samples kept")
    for metrics, sample, numerator, denominator in found[: args.top]:
        print(json.dumps({"sample": sample, **metrics}))
        print(json.dumps({"numerator": [term_json(t) for t in numerator], "denominator": [term_json(t) for t in denominator]}))


if __name__ == "__main__":
    main()
