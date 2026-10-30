"""`tpl-export`: regenerate puzzle.json files and the gallery index. `tpl-stl`: printable STL files."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .export import export_recipe, write_index
from . import stl


def find_puzzles_dir(start: Path) -> Path:
    for folder in [start, *start.parents]:
        if (folder / "puzzles").is_dir():
            return folder / "puzzles"
    raise SystemExit("could not find a puzzles/ directory; pass --puzzles")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipes", nargs="*", type=Path, help="recipe.json files (default: all under puzzles/)")
    parser.add_argument("--puzzles", type=Path, help="puzzles directory (default: nearest puzzles/ above cwd)")
    args = parser.parse_args(argv)
    puzzles = args.puzzles or find_puzzles_dir(Path.cwd())
    recipes = args.recipes or sorted(puzzles.glob("*/recipe.json"))
    for recipe in recipes:
        for puzzle in export_recipe(recipe, puzzles):
            print(f"wrote {puzzle['id']}/puzzle.json ({puzzle['variant']}, {len(puzzle['pieces'])} pieces)")
    write_index(puzzles)
    print("wrote index.json")


def stl_main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Write printable STL files (pieces, tray, SETTINGS.txt) for a generated puzzle.")
    parser.add_argument("puzzle", help="puzzle id, e.g. new2 (relief) or new2-flat (uniform thickness)")
    parser.add_argument("--puzzles", type=Path, help="puzzles directory (default: nearest puzzles/ above cwd)")
    parser.add_argument("--out", type=Path, help="output directory (default: print/<puzzle> next to puzzles/)")
    parser.add_argument("--xy-inset", type=float, default=stl.DEFAULT_XY_INSET_MM, metavar="MM",
                        help="inward offset of every piece edge, in mm (default %(default)s)")
    parser.add_argument("--orientation", choices=stl.ORIENTATIONS, default="roof-down",
                        help="roof-down (default) prints the roof on the bed for a smooth top surface")
    parser.add_argument("--wall", type=float, default=stl.DEFAULT_WALL_MM, metavar="MM", help="tray wall (default %(default)s)")
    parser.add_argument("--floor", type=float, default=stl.DEFAULT_FLOOR_MM, metavar="MM", help="tray floor (default %(default)s)")
    args = parser.parse_args(argv)
    puzzles = args.puzzles or find_puzzles_dir(Path.cwd())
    source = puzzles / args.puzzle / "puzzle.json"
    if not source.is_file():
        raise SystemExit(f"{source} not found; run tpl-export first")
    puzzle = json.loads(source.read_text(encoding="utf-8"))
    out = args.out or puzzles.parent / "print" / args.puzzle
    try:
        written = stl.export_print(puzzle, out, args.xy_inset, args.orientation, args.wall, args.floor)
    except ValueError as error:
        raise SystemExit(str(error))
    print(f"wrote {len(written)} files to {out}")


if __name__ == "__main__":
    main()
