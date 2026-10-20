# Tropical Puzzle Lab

Generate, explore, and solve tropical geometry puzzles in the browser: a laboratory for studying how puzzles are built and what makes them difficult.

**Play:** https://kuvychko.github.io/tropical-puzzle-lab/ (once GitHub Pages is enabled)

## The idea

A tropical polynomial in max convention is the maximum of a few affine functions, F(x, y) = max(aᵢx + bᵢy + cᵢ). The plane splits into convex regions, one for each term that wins there, and the boundaries between them form a tropical curve.

Each region becomes a puzzle piece. In the **relief** puzzles a piece's top is the plane of its own term, so a correct assembly forms one continuous, bowl-shaped roof. In the **flat** variants the heights are removed and only the outlines matter.

The first puzzle is **rev2**: nine pieces, four of them fully interior, which was originally designed as a 3D-printed puzzle in a 144 mm tray (see [puzzles/rev2/provenance.md](puzzles/rev2/provenance.md)).

## Controls

| Action | Control |
| --- | --- |
| Move a piece | Left-drag it |
| Turn a piece | Drag the ring around the selected piece |
| Nudge | Arrow keys move 1 mm (Shift: 0.1 mm); Q / E turn 1° (Shift: 0.1°) |
| Select | Click; Tab cycles; click the same spot again to reach a piece underneath |
| Camera | Right-drag orbits, Shift+right-drag or middle-drag pans, the wheel zooms, T gives a top view |
| History | Ctrl+Z undo, Ctrl+Shift+Z redo, Restart, New scramble |
| Sticky edges | Optional, off by default (checkbox or S): a released piece aligns flush with a tray wall or piece edge it is already next to |

Pieces cannot be flipped and nothing pulls them toward the solution. The optional sticky-edges assist only aligns a piece with edges it is already touching, and its use is noted in the report. Pieces may pass through each other. Overlapping pieces turn red.

Progress is saved in your browser. **Copy report line** gives a line like `puzzle=rev2 rev=1 seed=… time=…` to quote when you share observations.

## Status

Working:

- Gallery with both rev2 variants.
- Seeded scrambles, with direct links such as `?puzzle=rev2&seed=123`.
- Moving, turning and nudging pieces.
- Overlap colouring and tolerance-based completion (including roof continuity for relief).
- Undo and redo.
- Saving progress and resuming after a reload.
- An optional solution outline whose use is recorded.
- An optional sticky-edges assist, also recorded.

Planned: more puzzles and parametric families, an explode/illustration mode, session export, mobile input, automated solvers and difficulty studies. Difficulty is a research question; nothing here classifies it yet.

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

# web
cd web && npm install && npm run dev      # http://localhost:5173/tropical-puzzle-lab/
npm test && npm run build
```

## Credits and license

<!-- TODO: attribution text to be agreed between collaborators before publishing. -->

Released under the [MIT License](LICENSE).
