import json
from fractions import Fraction
from pathlib import Path

import pytest

from tropical_puzzle_lab.export import Construction, build_puzzle, dump, load_recipe
from tropical_puzzle_lab.geometry import area
from tropical_puzzle_lab.tropical import Term, regions

PUZZLES = Path(__file__).resolve().parents[2] / "puzzles"
RECIPE = PUZZLES / "rev2" / "recipe.json"
SOURCE = PUZZLES / "rev2" / "source"


@pytest.fixture(scope="module")
def recipe():
    return load_recipe(RECIPE)


@pytest.fixture(scope="module")
def construction(recipe):
    return Construction(recipe)


@pytest.fixture(scope="module")
def candidate():
    return json.loads((SOURCE / "search-results.json").read_text())["candidates"][0]


def same_vertices(exact, floats, tol):
    assert len(exact) == len(floats)
    for v in floats:
        assert min(abs(float(p[0]) - v[0]) + abs(float(p[1]) - v[1]) for p in exact) < tol


def test_polygons_match_source(recipe, candidate):
    # Unrounded source coefficients reproduce the frozen search polygons.
    terms = [Term(chr(65 + i), s[0], s[1], Fraction(c)) for i, (s, c) in enumerate(zip(candidate["slopes"], candidate["coefficients"]))]
    for exact, floats in zip(regions(terms, Fraction(recipe["domain"])), candidate["polygons"]):
        same_vertices(exact, floats, 1e-9)


def test_recipe_is_rounded_source(recipe, candidate):
    for term, s, c in zip(recipe["terms"], candidate["slopes"], candidate["coefficients"]):
        assert [term["a"], term["b"]] == s
        assert term["c"] == f"{round(c, 6):.6f}"


def test_reference_assembly_is_valid(construction):
    construction.check()


def test_interior_pieces_and_areas(construction, candidate):
    half = construction.half_span
    interior = [t.id for t, p in zip(construction.terms, construction.pieces) if all(abs(x) < half and abs(y) < half for x, y in p)]
    assert interior == ["F", "G", "H", "I"]
    for p, expected in zip(construction.pieces, candidate["metrics"]["areas_mm2"]):
        assert float(area(p)) == pytest.approx(expected, abs=1e-2)


def test_roof_matches_handoff(construction):
    heights = [(construction.height(t, v), v) for t, p in zip(construction.terms, construction.pieces) for v in p]
    low, low_point = min(heights)
    assert low == 8
    assert max(heights)[0] == 43  # 3 mm floor + 43 = 46 mm assembled, before the print inset
    assert float(low_point[0]) == pytest.approx(-2.56, abs=0.01)
    assert float(low_point[1]) == pytest.approx(14.77, abs=0.01)


def test_roof_plane_in_local_coordinates(recipe, construction):
    puzzle = build_puzzle(recipe, recipe["variants"][0], construction)
    for piece, pose, term, poly in zip(puzzle["pieces"], puzzle["reference"]["poses"], construction.terms, construction.pieces):
        r = piece["roof"]
        for (u, v), exact in zip(piece["polygon"], poly):
            z = r["z0"] + r["gx"] * u + r["gy"] * v
            assert z == pytest.approx(float(construction.height(term, exact)), abs=1e-9)
            assert u + pose["x"] == pytest.approx(float(exact[0]), abs=1e-9)


def test_flat_variant_has_no_roof(recipe, construction):
    puzzle = build_puzzle(recipe, recipe["variants"][1], construction)
    assert puzzle["variant"] == "tiling"
    assert all("roof" not in p and p["thickness"] == 12 for p in puzzle["pieces"])
    assert "roofMismatch" not in puzzle["validation"]


def test_committed_puzzles_are_current(recipe, construction):
    for variant in recipe["variants"]:
        expected = dump(build_puzzle(recipe, variant, construction))
        committed = (PUZZLES / variant["id"] / "puzzle.json").read_text(encoding="utf-8")
        assert committed == expected, f"run tpl-export to regenerate {variant['id']}"
