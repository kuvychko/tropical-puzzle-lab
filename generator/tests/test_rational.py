from fractions import Fraction
from pathlib import Path

import pytest

from tropical_puzzle_lab.export import Construction, build_puzzle, dump, load_recipe, terms_of
from tropical_puzzle_lab.geometry import area, centroid
from tropical_puzzle_lab.tropical import Term, refine, regions, tropical_value

PUZZLES = Path(__file__).resolve().parents[2] / "puzzles"
RECIPES = ["rat1"]


@pytest.fixture(scope="module", params=RECIPES)
def recipe(request):
    return load_recipe(PUZZLES / request.param / "recipe.json")


@pytest.fixture(scope="module")
def construction(recipe):
    return Construction(recipe)


def to_domain(c, v):
    return (v[0] / c.xy + c.center[0], v[1] / c.xy + c.center[1])


def test_reference_assembly_is_valid(construction):
    construction.check()


def test_each_cell_is_where_its_two_terms_win(recipe, construction):
    numerator, denominator = terms_of(recipe, "numerator"), terms_of(recipe, "denominator")
    by_id = {t.id: t for t in numerator + denominator}
    for term, cell in zip(construction.terms, construction.cells):
        p, q = by_id[term.id[0]], by_id[term.id[1]]
        m = centroid(cell)
        assert all(p.value(m) > t.value(m) for t in numerator if t is not p)
        assert all(q.value(m) > t.value(m) for t in denominator if t is not q)
        assert (term.a, term.b, term.c) == (p.a - q.a, p.b - q.b, p.c - q.c)


def test_roof_is_graph_of_difference(recipe, construction):
    numerator, denominator = terms_of(recipe, "numerator"), terms_of(recipe, "denominator")
    r = construction.roof
    for term, piece in zip(construction.terms, construction.pieces):
        for v in piece:
            point = to_domain(construction, v)
            f = tropical_value(numerator, point) - tropical_value(denominator, point)
            assert construction.height(term, v) == r.min_thickness + r.scale * (f - r.f_min)


def test_roof_has_valleys_and_ridges(construction):
    # Across a shared edge the roof folds up (valley: F is the max of the two planes there) or down
    # (ridge: the min). Unlike a tropical polynomial, a rational function has both.
    kinds = set()
    c = construction
    for i, (ti, p) in enumerate(zip(c.terms, c.pieces)):
        for tj, q in zip(c.terms[i + 1:], c.pieces[i + 1:]):
            shared = set(p) & set(q)
            if len(shared) < 2 or (ti.a, ti.b) == (tj.a, tj.b):
                continue
            # Compare the two planes just inside piece i, at its centroid.
            m = to_domain(c, centroid(p))
            kinds.add("valley" if ti.value(m) > tj.value(m) else "ridge")
    assert kinds == {"valley", "ridge"}


def test_refine_with_one_denominator_term_is_the_polynomial():
    numerator = [Term("A", 0, 0, Fraction(0)), Term("B", 1, 0, Fraction(-1)), Term("C", 0, 1, Fraction(1, 2))]
    q = Term("a", 1, 1, Fraction(3))
    terms, cells = refine(numerator, [q], Fraction(3))
    assert cells == regions(numerator, Fraction(3))
    assert [(t.id, t.a, t.b, t.c) for t in terms] == [(p.id + "a", p.a - 1, p.b - 1, p.c - 3) for p in numerator]


def test_cells_tile_the_domain(construction):
    assert sum(area(cell) for cell in construction.cells) == (2 * construction.domain) ** 2


def test_committed_puzzles_are_current(recipe, construction):
    for variant in recipe["variants"]:
        puzzle = build_puzzle(recipe, variant, construction)
        assert "terms" not in puzzle["tropical"] and puzzle["tropical"]["numerator"] == recipe["numerator"]
        committed = (PUZZLES / variant["id"] / "puzzle.json").read_text(encoding="utf-8")
        assert committed == dump(puzzle), f"run tpl-export to regenerate {variant['id']}"
