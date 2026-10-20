"""Cells and roof of a max-convention tropical polynomial over a square domain."""
from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction

from .geometry import Polygon, area, clip, square


@dataclass(frozen=True)
class Term:
    """Affine term a*x + b*y + c with integer slopes."""

    id: str
    a: int
    b: int
    c: Fraction

    def value(self, p) -> Fraction:
        return self.a * p[0] + self.b * p[1] + self.c


def regions(terms: list[Term], domain: Fraction) -> list[Polygon]:
    """Region where each term attains the maximum, cropped to [-domain, domain]^2.

    Same construction as `regions` in the rev2 `search.py`: intersect the
    pairwise dominance half-planes with the domain. Raises if a term has no
    two-dimensional cell.
    """
    result = []
    for ti in terms:
        p = square(domain)
        for tj in terms:
            if tj is ti:
                continue
            p = clip(p, (ti.a - tj.a, ti.b - tj.b), tj.c - ti.c)
            if len(p) < 3:
                break
        if area(p) <= 0:
            raise ValueError(f"term {ti.id} has no active cell")
        result.append(p)
    return result


def tropical_value(terms: list[Term], p) -> Fraction:
    return max(t.value(p) for t in terms)


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
