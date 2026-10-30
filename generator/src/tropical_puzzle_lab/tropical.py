"""Cells and roof of a max- or min-convention tropical polynomial, or rational function, over a square domain."""
from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

from .geometry import Polygon, area, clip, intersect, square


@dataclass(frozen=True)
class Term:
    """Affine term a*x + b*y + c with integer slopes."""

    id: str
    a: int
    b: int
    c: Fraction

    def value(self, p) -> Fraction:
        return self.a * p[0] + self.b * p[1] + self.c


CONVENTIONS = {"max": 1, "min": -1}


def regions(terms: list[Term], domain: Fraction, center=(0, 0), convention: str = "max") -> list[Polygon]:
    """Region where each term attains the maximum (or minimum), cropped to the
    square of half-width `domain` around `center`.

    Same construction as `regions` in the rev2 `search.py`: intersect the
    pairwise dominance half-planes with the domain. Raises if a term has no
    two-dimensional cell.
    """
    s = CONVENTIONS[convention]
    box = [(x + center[0], y + center[1]) for x, y in square(domain)]
    result = []
    for ti in terms:
        p = box
        for tj in terms:
            if tj is ti:
                continue
            p = clip(p, (s * (ti.a - tj.a), s * (ti.b - tj.b)), s * (tj.c - ti.c))
            if len(p) < 3:
                break
        if area(p) <= 0:
            raise ValueError(f"term {ti.id} has no active cell")
        result.append(p)
    return result


def refine(numerator: list[Term], denominator: list[Term], domain: Fraction, center=(0, 0),
           convention: str = "max") -> tuple[list[Term], list[Polygon]]:
    """Linear pieces of the tropical rational function P ⊘ Q = P - Q.

    The cells are the two-dimensional intersections of a cell of P with a cell
    of Q, in numerator-major order. On the cell of terms (p, q) the function is
    the affine term p - q, with id `p.id + q.id`.
    """
    p_cells = regions(numerator, domain, center, convention)
    q_cells = regions(denominator, domain, center, convention)
    terms, cells = [], []
    for p, p_cell in zip(numerator, p_cells):
        for q, q_cell in zip(denominator, q_cells):
            cell = intersect(p_cell, q_cell)
            if area(cell) > 0:
                terms.append(Term(p.id + q.id, p.a - q.a, p.b - q.b, p.c - q.c))
                cells.append(cell)
    return terms, cells


def tropical_value(terms: list[Term], p, convention: str = "max") -> Fraction:
    values = [t.value(p) for t in terms]
    return max(values) if convention == "max" else min(values)


@dataclass(frozen=True)
class RoofTransform:
    """Physical roof height above the piece underside, in mm.

    z = min_thickness + scale * (F(x, y) - f_min), with scale = relief / (f_max - f_min).
    Matches rev2 `generate.py` with the 3 mm tray floor removed.
    """

    f_min: Fraction
    f_max: Fraction
    min_thickness: Fraction
    relief: Fraction

    @property
    def scale(self) -> Fraction:
        return self.relief / (self.f_max - self.f_min)


def roof_transform(terms: list[Term], cells: list[Polygon], min_thickness: Fraction, relief: Fraction) -> RoofTransform:
    # F is piecewise affine, so its extrema over the domain occur at cell vertices.
    values = [t.value(v) for t, cell in zip(terms, cells) for v in cell]
    return RoofTransform(min(values), max(values), min_thickness, relief)
