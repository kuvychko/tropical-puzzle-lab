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

Random sampling rarely reaches large puzzles without slivers, so --climb hill-climbs
instead. From each random start it changes one coefficient or slope at a time, first to
meet the limits given by its options (including an even spread of piece sizes and roof
heights, so one deep valley can't squash the rest of the relief), then to raise the hardness: the roof's interior
peaks, pits and saddles, plus the mean number of other pieces with a compatible wall at
2 mm (the rule of the player's wall match). Budgets are counted in evaluations, so a
seed reproduces exactly.

    ../.venv/Scripts/python scripts/search_rational.py --climb --seed 1 --restarts 10 --evals 2000
"""
from __future__ import annotations

import argparse
import json
import math
import random
from fractions import Fraction

from tropical_puzzle_lab.difficulty import diversity, intrinsic_volumes, rating, shape_vectors
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


CLIMB_SLOPES = [(a, b) for a in range(5) for b in range(5)]
WALL_MATCH_MM = 2.0


def roof_features(numerator: list[Term], denominator: list[Term], cells) -> tuple[int, int, int]:
    """Interior (peaks, pits, saddles) of F = P - Q, from the sign pattern on a small circle round each vertex."""
    def f(x: float, y: float) -> float:
        return max(t.a * x + t.b * y + float(t.c) for t in numerator) - max(t.a * x + t.b * y + float(t.c) for t in denominator)

    peaks = pits = saddles = 0
    for vx, vy in {v for c in cells for v in c if abs(v[0]) < DOMAIN and abs(v[1]) < DOMAIN}:
        x, y = float(vx), float(vy)
        here = f(x, y)
        above = [
            f(x + 0.01 * math.cos(2 * math.pi * (k + 0.5) / 24), y + 0.01 * math.sin(2 * math.pi * (k + 0.5) / 24)) > here
            for k in range(24)
        ]
        changes = sum(above[k] != above[k - 1] for k in range(24))
        if changes == 0:
            peaks += not above[0]
            pits += above[0]
        elif changes >= 4:
            saddles += 1
    return peaks, pits, saddles


def climb_metrics(numerator: list[Term], denominator: list[Term]) -> dict:
    terms, cells = refine(numerator, denominator, DOMAIN)
    mm = [[(float(x) * XY, float(y) * XY) for x, y in c] for c in cells]
    roof = roof_transform(terms, cells, MIN_THICKNESS, RELIEF)
    valleys, ridges = curve_length(regions(numerator, DOMAIN)), curve_length(regions(denominator, DOMAIN))
    tray = (2 * float(DOMAIN) * XY) ** 2
    heights = sorted(float(roof.min_thickness + roof.scale * (t.value(v) - roof.f_min)) for t, c in zip(terms, cells) for v in c)
    return {
        "pieces": len(cells),
        "minArea": min(float(area(c)) * XY * XY for c in cells) / tray,
        "maxArea": max(float(area(c)) * XY * XY for c in cells) / tray,
        "heightIqrMm": heights[3 * len(heights) // 4] - heights[len(heights) // 4],
        "minAngle": min(min(angles_deg(p)) for p in mm),
        "minEdgeMm": min(math.dist(p[k], p[(k + 1) % len(p)]) for p in mm for k in range(len(p))),
        "maxTiltDeg": max(math.degrees(math.atan(float(roof.scale) * math.hypot(t.a, t.b) / XY)) for t in terms),
        "curveBalance": min(valleys, ridges) / max(valleys, ridges),
        "congruent": len(cells) - len({signature(p) for p in mm}),
    }


def shortfall(m: dict, args: argparse.Namespace) -> float:
    """How far a candidate is from meeting the limits, in relative units; 0 when it meets them all."""
    return (
        max(0, args.min_pieces - m["pieces"], m["pieces"] - args.max_pieces)
        + max(0.0, 1 - m["minArea"] / args.min_area)
        + max(0.0, m["maxArea"] / args.max_area - 1)
        + max(0.0, 1 - m["heightIqrMm"] / args.min_height_iqr)
        + max(0.0, 1 - m["minEdgeMm"] / args.min_edge)
        + max(0.0, 1 - m["minAngle"] / args.min_angle)
        + max(0.0, m["maxTiltDeg"] / args.max_tilt - 1)
        + max(0.0, 1 - m["curveBalance"] / args.min_balance)
        + m["congruent"]
    )


def hardness(numerator: list[Term], denominator: list[Term]) -> dict:
    terms, cells = refine(numerator, denominator, DOMAIN)
    roof = roof_transform(terms, cells, MIN_THICKNESS, RELIEF)
    walls = []
    solids = []
    for i, (t, c) in enumerate(zip(terms, cells)):
        z = [float(roof.min_thickness + roof.scale * (t.value(v) - roof.f_min)) for v in c]
        walls += [(i, z[k], z[(k + 1) % len(c)]) for k in range(len(c))]
        footprint = [(float(x) * XY, float(y) * XY) for x, y in c]
        solids.append(intrinsic_volumes([(x, y, 0.0) for x, y in footprint] + [(x, y, h) for (x, y), h in zip(footprint, z)]))
    ambiguity = sum(
        len({o[0] for o in walls if o[0] != w[0] and abs(w[1] - o[2]) <= WALL_MATCH_MM and abs(w[2] - o[1]) <= WALL_MATCH_MM})
        for w in walls
    ) / len(walls)
    peaks, pits, saddles = roof_features(numerator, denominator, cells)
    x = (diversity(shape_vectors(solids)) - 1) / (len(cells) - 1)
    return {"peaks": peaks, "pits": pits, "saddles": saddles, "wallAmbiguity": ambiguity, "x": x, "rating": rating(x)}


def draw_climb_terms(rng: random.Random, count: int, letters: str) -> list[Term]:
    """Random terms, redrawn until each attains the max somewhere: `regions` rejects any that doesn't."""
    while True:
        terms = [Term(letters[i], a, b, Fraction(rng.randint(-120, 120), 20)) for i, (a, b) in enumerate(rng.sample(CLIMB_SLOPES, count))]
        try:
            regions(terms, DOMAIN)
            return terms
        except ValueError:
            pass


def mutate(rng: random.Random, terms: list[Term]) -> list[Term]:
    out = list(terms)
    i = rng.randrange(len(out))
    t = out[i]
    if rng.random() < 0.8:
        out[i] = Term(t.id, t.a, t.b, t.c + Fraction(rng.randint(-16, 16), 20))
    else:
        used = {(u.a, u.b) for u in out}
        a, b = rng.choice([s for s in CLIMB_SLOPES if s not in used])
        out[i] = Term(t.id, a, b, t.c)
    return out


def run_climb(args: argparse.Namespace) -> None:
    rng = random.Random(args.seed)
    letters = "ABCDEFGHIJ"
    for restart in range(args.restarts):
        numerator = draw_climb_terms(rng, args.terms, letters)
        denominator = draw_climb_terms(rng, args.terms, letters.lower())
        best = None
        for _ in range(args.evals):
            p, q = (mutate(rng, numerator), denominator) if best and rng.random() < 0.5 else (numerator, mutate(rng, denominator) if best else denominator)
            try:
                m = climb_metrics(p, q)
            except (ValueError, ZeroDivisionError):
                continue
            miss = shortfall(m, args)
            h = hardness(p, q) if miss == 0 else None
            score = (1, h["peaks"] + h["pits"] + h["saddles"] + h["wallAmbiguity"]) if h else (0, -miss)
            if best is None or score >= best[0]:
                best = (score, m, h)
                numerator, denominator = p, q
        if best and best[2]:
            metrics = {k: round(v, 4) if isinstance(v, float) else v for k, v in {**best[1], **best[2]}.items()}
            print(json.dumps({"seed": args.seed, "restart": restart, **metrics}), flush=True)
            print(json.dumps({"numerator": [term_json(t) for t in numerator], "denominator": [term_json(t) for t in denominator]}), flush=True)
        else:
            print(json.dumps({"seed": args.seed, "restart": restart, "met": False, "pieces": best[1]["pieces"] if best else None}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--samples", type=int, default=20000)
    parser.add_argument("--top", type=int, default=5)
    parser.add_argument("--climb", action="store_true", help="hill-climb instead of sampling")
    parser.add_argument("--restarts", type=int, default=10)
    parser.add_argument("--evals", type=int, default=2000, help="candidates tried per restart")
    parser.add_argument("--terms", type=int, default=7, help="terms each in P and Q at the start of a climb")
    parser.add_argument("--min-pieces", type=int, default=20)
    parser.add_argument("--max-pieces", type=int, default=24)
    parser.add_argument("--min-area", type=float, default=0.012, help="smallest piece, as a share of the tray")
    parser.add_argument("--max-area", type=float, default=0.15, help="largest piece, as a share of the tray")
    parser.add_argument("--min-height-iqr", type=float, default=10.0, help="middle 50%% of vertex heights must span this, mm")
    parser.add_argument("--min-edge", type=float, default=6.0, help="mm")
    parser.add_argument("--min-angle", type=float, default=20.0, help="degrees")
    parser.add_argument("--max-tilt", type=float, default=30.0, help="degrees")
    parser.add_argument("--min-balance", type=float, default=0.4, help="shorter curve over longer curve")
    args = parser.parse_args()
    if args.climb:
        run_climb(args)
        return
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
