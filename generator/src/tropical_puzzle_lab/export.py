"""Recipe -> versioned puzzle definitions (puzzle.json) for the browser player."""
from __future__ import annotations

import hashlib
import json
from fractions import Fraction
from pathlib import Path

from . import __version__
from .difficulty import config as difficulty_config, puzzle_difficulty
from .geometry import Polygon, area, centroid, clip, square
from .tropical import RoofTransform, Term, regions, roof_transform

FORMAT_VERSION = 1


def load_recipe(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(obj) -> str:
    text = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(text.encode("ascii")).hexdigest()


def terms_of(recipe: dict) -> list[Term]:
    return [Term(t["id"], int(t["a"]), int(t["b"]), Fraction(t["c"])) for t in recipe["terms"]]


def intersection_area(p: Polygon, q: Polygon) -> Fraction:
    out = p
    for a, b in zip(q, q[1:] + q[:1]):
        # Keep the left side of each CCW edge of q.
        out = clip(out, (a[1] - b[1], b[0] - a[0]), (a[1] - b[1]) * a[0] + (b[0] - a[0]) * a[1])
        if len(out) < 3:
            return Fraction(0)
    return area(out)


class Construction:
    """Exact physical geometry of a recipe, in mm."""

    def __init__(self, recipe: dict):
        self.recipe = recipe
        self.terms = terms_of(recipe)
        self.domain = Fraction(recipe["domain"])
        self.center = tuple(Fraction(v) for v in recipe.get("center", ("0", "0")))
        self.convention = recipe.get("convention", "max")
        self.xy = Fraction(recipe["xyMmPerUnit"])
        self.cells = regions(self.terms, self.domain, self.center, self.convention)
        self.roof: RoofTransform = roof_transform(
            self.terms, self.cells, Fraction(recipe["minThicknessMm"]), Fraction(recipe["reliefMm"])
        )
        self.half_span = self.domain * self.xy
        self.target = square(self.half_span)
        # The tray is centred on the origin: physical = xy * (domain point - center).
        cx, cy = self.center
        self.pieces = [[((x - cx) * self.xy, (y - cy) * self.xy) for x, y in cell] for cell in self.cells]

    def height(self, term: Term, p) -> Fraction:
        """Roof height (mm above the underside) of `term`'s plane at physical point p."""
        r = self.roof
        point = (p[0] / self.xy + self.center[0], p[1] / self.xy + self.center[1])
        return r.min_thickness + r.scale * (term.value(point) - r.f_min)

    def check(self) -> None:
        """Validate the reference assembly exactly; raise AssertionError on failure."""
        expected = self.recipe.get("pieceCount")
        assert expected is None or len(self.pieces) == expected, "unexpected piece count"
        assert sum(area(p) for p in self.pieces) == area(self.target), "pieces do not cover the target"
        for i, p in enumerate(self.pieces):
            assert area(p) > 0, f"piece {self.terms[i].id} is degenerate"
            for j in range(i):
                assert intersection_area(p, self.pieces[j]) == 0, "reference pieces overlap"
            for v in p:
                assert self.height(self.terms[i], v) >= self.roof.min_thickness, "roof below minimum thickness"
        # Roof continuity: every vertex shared by two cells has equal height on both.
        for i, p in enumerate(self.pieces):
            for j, q in enumerate(self.pieces):
                for v in set(p) & set(q):
                    assert self.height(self.terms[i], v) == self.height(self.terms[j], v), "roof discontinuity"


def _pt(p) -> list[float]:
    return [float(p[0]), float(p[1])]


def build_puzzle(recipe: dict, variant: dict, construction: Construction | None = None) -> dict:
    c = construction or Construction(recipe)
    relief = variant["variant"] == "relief"
    pieces = []
    poses = []
    for term, poly in zip(c.terms, c.pieces):
        cx, cy = centroid(poly)
        piece: dict = {"id": term.id, "polygon": [_pt((x - cx, y - cy)) for x, y in poly]}
        if relief:
            s = c.roof.scale
            piece["roof"] = {
                "z0": float(c.height(term, (cx, cy))),
                "gx": float(s * term.a / c.xy),
                "gy": float(s * term.b / c.xy),
            }
        else:
            piece["thickness"] = float(Fraction(variant["flatThicknessMm"]))
        pieces.append(piece)
        poses.append({"id": term.id, "x": float(cx), "y": float(cy), "theta": 0.0})

    target = {"type": "polygon", "vertices": [_pt(v) for v in c.target]}
    geometry = {"model": "planar", "units": "mm", "spanMm": float(2 * c.half_span), "target": target}
    if relief:
        geometry["reliefMm"] = float(c.roof.relief)
        geometry["minThicknessMm"] = float(c.roof.min_thickness)
    geometry["trayRimMm"] = float(Fraction(recipe["trayRimMm"]))

    validation = dict(recipe["validation"])
    if not relief:
        validation.pop("roofMismatch", None)

    source = recipe["source"]
    puzzle = {
        "formatVersion": FORMAT_VERSION,
        "id": variant["id"],
        "revision": recipe["revision"],
        "name": variant["name"],
        "description": variant["description"],
        "variant": variant["variant"],
        "geometry": geometry,
        "pieces": pieces,
        "reference": {"poses": poses},
        "rules": {"translate": True, "rotate": "continuous-z", "flip": False, "snap": False},
        "validation": validation,
        "scramble": dict(recipe["scramble"]),
        "provenance": {
            "recipe": f"puzzles/{recipe['id']}/recipe.json",
            "recipeHash": canonical_hash(recipe),
            "generator": f"tropical-puzzle-lab {__version__}",
            "source": source,
            "notes": variant["notes"],
        },
        "tropical": {
            "convention": c.convention,
            "domain": recipe["domain"],
            "xyMmPerUnit": recipe["xyMmPerUnit"],
            "terms": recipe["terms"],
        },
    }
    if "center" in recipe:
        puzzle["tropical"]["center"] = recipe["center"]
    puzzle["geometryHash"] = canonical_hash({"variant": puzzle["variant"], "target": target, "pieces": pieces})
    return puzzle


def dump(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def export_recipe(recipe_path: Path, puzzles_dir: Path) -> list[dict]:
    recipe = load_recipe(recipe_path)
    construction = Construction(recipe)
    construction.check()
    written = []
    for variant in recipe["variants"]:
        puzzle = build_puzzle(recipe, variant, construction)
        out = puzzles_dir / puzzle["id"] / "puzzle.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(dump(puzzle), encoding="utf-8", newline="\n")
        written.append(puzzle)
    return written


def build_index(puzzles_dir: Path) -> dict:
    entries = []
    for path in sorted(puzzles_dir.glob("*/puzzle.json")):
        p = json.loads(path.read_text(encoding="utf-8"))
        d = puzzle_difficulty(p)
        entries.append({
            "id": p["id"],
            # The recipe the variant was built from; the gallery shows one card per construction.
            "construction": Path(p["provenance"]["recipe"]).parent.name,
            "revision": p["revision"],
            "name": p["name"],
            "description": p["description"],
            "variant": p["variant"],
            "pieceCount": len(p["pieces"]),
            "path": f"{p['id']}/puzzle.json",
            # Rounded so the committed index does not depend on the last bits of the platform's libm.
            "difficulty": {"diversity": round(d.diversity, 6), "x": round(d.x, 6), "rating": d.rating},
        })
    order = {"relief": 0, "tiling": 1}
    entries.sort(key=lambda e: (e["construction"], order.get(e["variant"], 9), e["id"]))
    return {"formatVersion": FORMAT_VERSION, "difficulty": difficulty_config(), "puzzles": entries}


def write_index(puzzles_dir: Path) -> dict:
    index = build_index(puzzles_dir)
    (puzzles_dir / "index.json").write_text(dump(index), encoding="utf-8", newline="\n")
    return index
