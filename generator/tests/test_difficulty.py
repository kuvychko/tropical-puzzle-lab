import json
import math
from pathlib import Path

import pytest

from tropical_puzzle_lab.difficulty import (
    diversity, intrinsic_volumes, piece_solid, puzzle_difficulty, rating, shape_vectors,
)
from tropical_puzzle_lab.export import build_index, dump

PUZZLES = Path(__file__).resolve().parents[2] / "puzzles"


def box(a, b, c, origin=(0.0, 0.0, 0.0)):
    ox, oy, oz = origin
    return [(ox + x, oy + y, oz + z) for x in (0, a) for y in (0, b) for z in (0, c)]


def volumes(vertices):
    v = intrinsic_volumes(vertices)
    return (v.v0, v.v1, v.v2, v.v3)


def load(puzzle_id):
    return json.loads((PUZZLES / puzzle_id / "puzzle.json").read_text(encoding="utf-8"))


def test_unit_cube():
    assert volumes(box(1, 1, 1)) == pytest.approx((1, 3, 3, 1), abs=1e-12)


@pytest.mark.parametrize("a,b,c", [(1, 2, 3), (0.5, 4, 7.25), (10, 0.1, 2), (3, 3, 1)])
def test_boxes(a, b, c):
    expected = (1, a + b + c, a * b + b * c + c * a, a * b * c)
    assert volumes(box(a, b, c, origin=(-2.5, 7, 1.25))) == pytest.approx(expected, rel=1e-12)


def test_near_coplanar_points_do_not_add_edges():
    # Face centres and edge midpoints, nudged off their faces by 1e-12, as a triangulated hull would have.
    extra = [(0.5, 0.5, 1e-12), (0.5, 0.5, 1 - 1e-12), (1e-12, 0.5, 0.5), (0.5, 1 - 1e-12, 0.5), (0.5, 0, 0), (1, 1, 0.5)]
    assert volumes(box(1, 1, 1) + extra) == pytest.approx((1, 3, 3, 1), abs=1e-9)


def test_identical_pieces_have_diversity_one():
    piece = intrinsic_volumes(box(1, 2, 3))
    assert diversity(shape_vectors([piece] * 7)) == 1


def test_profile_matches_closed_forms_and_limits():
    vectors = shape_vectors([intrinsic_volumes(piece_solid(p)) for p in load("new3")["pieces"]])
    n = len(vectors)
    z = sum(math.exp(-10 * math.dist(a, b)) for a in vectors for b in vectors)
    assert diversity(vectors, 10, 2) == pytest.approx(n * n / z, rel=1e-12)
    assert diversity(vectors, 10, 2.0000001) == pytest.approx(diversity(vectors, 10, 2), rel=1e-6)
    assert diversity(vectors, 10, 1 + 1e-7) == pytest.approx(diversity(vectors, 10, 1), rel=1e-6)
    assert diversity(vectors, 10, 1e4) == pytest.approx(diversity(vectors, 10, math.inf), rel=1e-3)
    profile = [diversity(vectors, 10, q) for q in (0, 0.5, 1, 2, 3, math.inf)]
    assert profile == sorted(profile, reverse=True)  # D_q is non-increasing in q


@pytest.mark.parametrize("q", [0, 1, 2, math.inf])
def test_profile_extremes(q):
    same = shape_vectors([intrinsic_volumes(box(1, 2, 3))] * 5)
    assert diversity(same, 10, q) == pytest.approx(1, abs=1e-12)
    apart = [(1.0, 100.0 * i, 0.0, 0.0) for i in range(5)]  # Z is the identity to double precision
    assert diversity(apart, 10, q) == pytest.approx(5, abs=1e-12)


def test_scaling_every_piece_leaves_diversity_unchanged():
    solids = [piece_solid(p) for p in load("new2")["pieces"]]
    d = diversity(shape_vectors([intrinsic_volumes(s) for s in solids]))
    for factor in (0.01, 3.7, 250):
        scaled = [[tuple(factor * c for c in v) for v in s] for s in solids]
        assert diversity(shape_vectors([intrinsic_volumes(s) for s in scaled])) == pytest.approx(d, rel=1e-9)


def test_rigid_motion_leaves_shape_vector_unchanged():
    pieces = load("rev2")["pieces"]
    solids = [piece_solid(p) for p in pieces]
    before = shape_vectors([intrinsic_volumes(s) for s in solids])
    # Rotate about an oblique axis (Rodrigues) and translate the first piece.
    k = (1 / math.sqrt(14), 2 / math.sqrt(14), 3 / math.sqrt(14))
    t = 1.234

    def move(p):
        cos, sin = math.cos(t), math.sin(t)
        kxp = (k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0])
        kdp = sum(a * b for a, b in zip(k, p))
        r = [p[i] * cos + kxp[i] * sin + k[i] * kdp * (1 - cos) for i in range(3)]
        return (r[0] + 40, r[1] - 13, r[2] + 5)

    solids[0] = [move(p) for p in solids[0]]
    after = shape_vectors([intrinsic_volumes(s) for s in solids])
    for a, b in zip(before, after):
        assert a == pytest.approx(b, rel=1e-9)


def test_relief_piece_volume_is_area_times_centroid_height():
    for piece in load("new1")["pieces"]:
        poly = piece["polygon"]  # centred on its area centroid, so the mean height is roof z0
        area = 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))
        assert intrinsic_volumes(piece_solid(piece)).v3 == pytest.approx(area * piece["roof"]["z0"], rel=1e-9)


@pytest.mark.parametrize("x", [i / 400 for i in range(401)])
def test_default_mapping_is_rounded_linear(x):
    assert rating(x) == max(1, min(5, 5 - math.floor(4 * x + 0.5)))


def test_ratings_are_in_range():
    for entry in build_index(PUZZLES)["puzzles"]:
        d = puzzle_difficulty(load(entry["id"]))
        assert 1 <= d.diversity <= d.n and 1 <= d.rating <= 5


def test_variants_of_a_construction_share_footprints():
    # The gallery shows one card per construction and the player switches between its variants.
    groups = {}
    for entry in build_index(PUZZLES)["puzzles"]:
        groups.setdefault(entry["construction"], []).append(load(entry["id"]))
    for construction, puzzles in groups.items():
        assert len({p["variant"] for p in puzzles}) == len(puzzles), construction
        assert len({json.dumps([q["polygon"] for q in p["pieces"]]) for p in puzzles}) == 1, construction
        assert len({p["scramble"]["defaultSeed"] for p in puzzles}) == 1, construction


def test_committed_index_is_current():
    committed = (PUZZLES / "index.json").read_text(encoding="utf-8")
    assert committed == dump(build_index(PUZZLES)), "run tpl-export to regenerate index.json"
