"""`tpl-export`: regenerate puzzle.json files and the gallery index."""
from __future__ import annotations

import argparse
from pathlib import Path

from .export import export_recipe, write_index


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


if __name__ == "__main__":
    main()
