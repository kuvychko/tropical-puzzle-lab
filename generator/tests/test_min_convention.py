import re
from fractions import Fraction
from pathlib import Path

import pytest

from tropical_puzzle_lab.export import Construction, build_puzzle, dump, load_recipe
from tropical_puzzle_lab.geometry import centroid
from tropical_puzzle_lab.tropical import Term, tropical_value

PUZZLES = Path(__file__).resolve().parents[2] / "puzzles"
RECIPES = ["new1", "new2", "new3", "new4"]


@pytest.fixture(scope="module", params=RECIPES)
def recipe(request):
    return load_recipe(PUZZLES / request.param / "recipe.json")


@pytest.fixture(scope="module")
def construction(recipe):
    return Construction(recipe)


def test_terms_match_source_polynomial(recipe):
    # Recipe terms are exactly the supplied Min[...] expression, in order.
    body = re.fullmatch(r"Min\[(.*)\]", recipe["source"]["polynomial"]).group(1)
    parsed = []
    for t in body.split(","):
        c, a, b = re.fullmatch(r"(\d+(?:/\d+)?)\+(\d+ )?x\+(\d+ )?y", t).groups()
        parsed.append((int(a or 1), int(b or 1), Fraction(c)))
    assert parsed == [(t["a"], t["b"], Fraction(t["c"])) for t in recipe["terms"]]


def test_reference_assembly_is_valid(construction):
    construction.check()


def test_domain_is_shifted_square(construction):
    # Every min-convention puzzle so far ends at x, y = -1 and fills a 144 mm tray.
    corners = [v for cell in construction.cells for v in cell]
    low = construction.center[0] - construction.domain
    assert min(x for x, _ in corners) == low and max(x for x, _ in corners) == -1
    assert min(y for _, y in corners) == low and max(y for _, y in corners) == -1
    assert construction.half_span == 72


def test_each_cell_is_where_its_term_is_minimal(construction):
    terms: list[Term] = construction.terms
    for term, cell in zip(terms, construction.cells):
        p = centroid(cell)
        assert term.value(p) == tropical_value(terms, p, "min")
        assert all(term.value(p) < other.value(p) for other in terms if other is not term)


def test_roof_is_graph_of_min(construction):
    r = construction.roof
    for term, piece in zip(construction.terms, construction.pieces):
        for v in piece:
            point = (v[0] / construction.xy + construction.center[0], v[1] / construction.xy + construction.center[1])
            f = tropical_value(construction.terms, point, "min")
            assert construction.height(term, v) == r.min_thickness + r.scale * (f - r.f_min)


def test_committed_puzzles_are_current(recipe, construction):
    for variant in recipe["variants"]:
        puzzle = build_puzzle(recipe, variant, construction)
        assert puzzle["tropical"]["convention"] == "min"
        committed = (PUZZLES / variant["id"] / "puzzle.json").read_text(encoding="utf-8")
        assert committed == dump(puzzle), f"run tpl-export to regenerate {variant['id']}"
