# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tropical Puzzle Lab is a public repository for building tropical geometry puzzles and playing them in the browser. Scope, agreed rules and research direction are in `docs/project.md` (the original proposal). The implemented rules and tolerances are in `docs/puzzle-rules.md`, and the file formats in `docs/puzzle-format.md`. Read the relevant one before changing behaviour. Everything committed here is public.

## Commands

Generator (Python ≥3.10, no runtime dependencies; venv at repo root):

```sh
python -m venv .venv && .venv/Scripts/python -m pip install -e "generator[test]"
cd generator && ../.venv/Scripts/python -m pytest                      # all tests
../.venv/Scripts/python -m pytest tests/test_rev2.py::test_polygons_match_source
../.venv/Scripts/tpl-export          # regenerate puzzles/*/puzzle.json and puzzles/index.json
```

Web (`cd web`; Node 22):

```sh
npm install
npm run dev                              # http://localhost:5173/tropical-puzzle-lab/
npm test                                 # vitest
npx vitest run tests/evaluate.test.ts -t "contact"
npm run build                            # tsc --noEmit + vite build into dist/
npm run preview                          # serves dist/ at /tropical-puzzle-lab/
```

`dev` and `build` run `scripts/copy-puzzles.mjs` first, which copies `../puzzles` into `public/puzzles` (gitignored). CI (`.github/workflows/pages.yml`) does four things:

- runs pytest;
- fails if `tpl-export` changes any committed `puzzle.json`;
- runs vitest and the build;
- deploys `web/dist` to GitHub Pages from `main`.

## Architecture

There are three concerns, connected only by JSON:

1. **`puzzles/`: the authoritative data.**
   - `<id>/recipe.json` is hand-edited: tropical terms as exact decimal strings, scale, variants, tolerances and scramble seed.
   - `<id>/source/` holds the original material, byte-identical (see `.gitattributes`). Never edit it.
   - `<variant-id>/puzzle.json` and `index.json` are generated and committed. Never edit them by hand: change the recipe or the generator and rerun `tpl-export`.
2. **`generator/` (`tropical_puzzle_lab`).** It computes the cells with exact `Fraction` arithmetic (`tropical.regions`, ported from the rev2 `search.py`). It validates the reference assembly exactly in `Construction.check`, then writes one `puzzle.json` per variant. Pieces are centred on their centroids, and relief roofs are stored as local planes.
3. **`web/`.**
   - `src/geometry/` is pure TypeScript with no Three.js:
     - `polygon.ts`: convex clipping and SAT penetration;
     - `evaluate.ts`: overlap, inside, area and roof checks;
     - `scramble.ts`: the seeded v1 scramble.
   - `src/sessions/` handles localStorage sessions, undo/redo and the report line.
   - `src/player/` does the Three.js rendering and input; `src/gallery/` is the gallery.
   - Routing is by query string (`?puzzle=<id>&seed=<n>`) with the fixed Vite base `/tropical-puzzle-lab/`, so links survive reloads on Pages.
   - `window.tpl` exposes `getPoses`, `setPoses`, `evaluate` and `session` for manual testing.

## Invariants that are easy to break

- **Two variants per construction.**
  - Relief: solved only if the footprints tile the target *and* neighbouring roofs agree along shared edges.
  - Tiling: footprints only, uniform thickness.
- **One numerical policy.** A piece is red exactly when it fails the overlap-depth test that also blocks completion (`evaluate.ts`). Don't add a separate threshold for colouring.
- **Completion is judged from geometry, never by matching reference poses.** Alternative assemblies must pass.
- **Nothing ever pulls a piece toward its solution pose or a preferred angle,** including keyboard nudges. Pieces stay on z=0 and rotate only about z. The camera never changes poses.
- **Sticky edges is the one exception, and it is opt-in.**
  - `src/geometry/snap.ts`, off by default, toggled with **S**.
  - It runs only when a drag or turn is released, and only aligns flush with edges already adjacent to the piece (tray walls from the inside, other pieces).
  - It must never consult `reference`.
  - Every snap that moves a piece increments `session.snaps`, which the report line shows as `assist=…`.
- **The reference assembly is never shown** at load or in thumbnails. "Show solution" sets `session.revealed`, which is sticky and goes into the report.
- **The scramble algorithm is versioned.** Changing `scramble.ts` changes every seed's layout, so give it a new version name. Changing geometry changes `geometryHash`, which makes saved sessions incompatible; that is intended.
- **rev2 uses the ideal polygons** (no 0.15 mm print inset). Heights are measured from the piece underside, while the source adds a 3 mm tray floor. Tolerances in `recipe.json` are first guesses, documented as experimental.
- **Attribution text in the README** needs the collaborators' agreement before it is filled in.
