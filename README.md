# Tropical Puzzle Lab

Generate, explore, and solve tropical geometry puzzles in the browser: a laboratory for studying how puzzles are built and what makes them difficult.

**Play:** https://kuvychko.github.io/tropical-puzzle-lab/ (once GitHub Pages is enabled)

## The idea

A tropical polynomial in max convention is the maximum of a few affine functions, F(x, y) = max(aᵢx + bᵢy + cᵢ); in min convention it is the minimum. The plane splits into convex regions, one for each term that wins there, and the boundaries between them form a tropical curve.

Each region becomes a puzzle piece. In the **relief** puzzles a piece's top is the plane of its own term, so a correct assembly forms one continuous roof: bowl-shaped for max-convention puzzles such as rev2, rising to ridges for min-convention ones such as new1–new4. A tropical **rational** function P ⊘ Q (classically P − Q) refines both subdivisions; its roof has valleys from P and ridges from Q (`rat1`). In the **flat** variants the heights are removed and only the outlines matter. Each puzzle has one gallery card, and you can switch between the two modes; each mode keeps its own progress.

The first puzzle is **rev2**: nine pieces, four of them fully interior, which was originally designed as a 3D-printed puzzle in a 144 mm tray (see [puzzles/rev2/provenance.md](puzzles/rev2/provenance.md)).

## Controls

| Action | Control |
| --- | --- |
| Move a piece | Left-drag it |
| Turn a piece | Drag the ring around the selected piece |
| Nudge | Arrow keys move 1 mm (Shift: 0.1 mm); Q / E turn 1° (Shift: 0.1°) |
| Select | Click; Tab cycles; click the same spot again to reach a piece underneath |
| Camera (as in PrusaSlicer) | Left-drag empty space orbits, right- or middle-drag pans, the wheel zooms toward the cursor |
| Views | 0 iso, 1 top, 3 front, 4 rear, 5 left, 6 right (side views at table level, to compare heights), Z zoom to fit (also buttons in the panel). The camera can orbit down to table level. Dragging pieces is paused at grazing angles; keyboard nudges still work |
| History | Ctrl+Z undo, Ctrl+Shift+Z redo, Restart, New scramble |
| Sticky edges | Optional, off by default (checkbox or S): a released piece aligns flush with a tray wall or piece edge it is already next to |

Pieces cannot be flipped and nothing pulls them toward the solution. The optional sticky-edges assist only aligns a piece with edges it is already touching, and its use is noted in the report. Pieces may pass through each other. Overlapping pieces turn red.

Progress is saved in your browser. **Copy report line** gives a line like `puzzle=rev2 rev=1 seed=… time=…` to quote when you share observations.

## Status

Working:

- Gallery with one card per puzzle (rev2, four min-convention ones and a rational one), each playable in relief or flat mode.
- Seeded scrambles, with direct links such as `?puzzle=rev2&seed=123`.
- Moving, turning and nudging pieces.
- Overlap colouring and tolerance-based completion (including roof continuity for relief).
- Undo and redo.
- Saving progress and resuming after a reload.
- An optional solution outline whose use is recorded.
- An optional sticky-edges assist, also recorded.

Planned: more puzzles and parametric families, an explode/illustration mode, session export, mobile input, automated solvers and difficulty studies. Difficulty is a research question; nothing here classifies it yet.

## Printing

`tpl-stl <puzzle id>` writes binary STL files for every piece, the tray and a `SETTINGS.txt` into `print/<puzzle id>/` (gitignored; regenerate them whenever you need them):

```sh
tpl-stl new2                 # relief pieces of 16 hard
tpl-stl new2-flat            # the same footprints at uniform thickness
tpl-stl new2 --xy-inset 0.2 --orientation underside-down
```

- **Clearance.** `--xy-inset` (default 0.15 mm) moves every footprint edge inward perpendicular to itself, as in the rev2 print files: 0.3 mm between neighbours, 0.15 mm to the tray wall. Roof planes are kept, with no Z compensation. The tray cavity is the exact target square.
- **Orientation.** By default each piece is turned over so its **roof lies on the bed**. The visible top is then the smooth first layer, and the stair-stepping of the sloped surface ends up on the hidden underside. The side walls lean by the roof's tilt (at most about 16° for new1–new4, 26° for rev2), so no supports are needed. `--orientation underside-down` prints pieces the way they sit in the tray.
- Print at 100% scale, separate parts, with your usual elephant-foot compensation. Physical fit is untested.

## Repository

| Path | Contents |
| --- | --- |
| `puzzles/` | Authoritative recipes, original sources, and generated `puzzle.json` files |
| `generator/` | Python package (no runtime dependencies) that turns recipes into puzzle definitions, using exact rational arithmetic |
| `web/` | TypeScript + Three.js player and gallery (Vite), deployed to GitHub Pages |
| `docs/` | [Project proposal](docs/project.md), [rules](docs/puzzle-rules.md), [formats](docs/puzzle-format.md), [research notes](docs/research-notes.md) |

```sh
# generator
python -m venv .venv && .venv/Scripts/pip install -e "generator[test]"   # .venv/bin on macOS/Linux
cd generator && pytest && tpl-export
tpl-stl new2                                     # printable STLs into print/new2/

# web
cd web && npm install && npm run dev      # http://localhost:5173/tropical-puzzle-lab/
npm test && npm run build
```

## Credits and license

<!-- TODO: attribution text to be agreed between collaborators before publishing. -->

Released under the [MIT License](LICENSE).
