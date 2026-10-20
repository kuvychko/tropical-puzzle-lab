# rev2 provenance

**Source.** `tropical-puzzle-rev2.zip`, dated 2026-09-28. The source scripts, documents and frozen search results are kept unmodified in `source/`. The zip itself, the generated STL meshes and the PNG renders are not committed, because `source/generate.py` can regenerate them.

**Selected design.** Candidate 0 of `source/search-results.json` (search trial 1201, search seed 20260928) is the "recommended" nine-piece set described in `source/DESIGN-AND-HANDOFF.md`.

**Mathematics.** Max-convention tropical polynomial F(x, y) = max of nine affine terms a·x + b·y + c with integer slopes, over the domain [-3.2, 3.2]². Each piece is the region where one term attains the maximum. `recipe.json` stores the coefficients rounded to 6 decimals, the same rounding the source applies before manufacturing output. They are stored as decimal strings and evaluated exactly with rational arithmetic.

**Physical scale.** X = 22.5·x and Y = 22.5·y (mm), so the tray is 144 mm square. The roof height above a piece's underside is 8 + s·(F − Fmin) mm, with s = 35 / (Fmax − Fmin), giving tops from 8 mm to 43 mm. The source measures from the tray floor, which adds 3 mm. These are the source's numbers.

## Adaptations for virtual play

- **Ideal geometry.** The 0.15 mm print inset (`--xy-inset`) is not applied. Virtual pieces partition the square exactly.
- **Heights.** Measured from the piece underside, not the tray floor.
- **Local frames.** Each piece is centred on its area centroid. The reference pose for every piece has θ = 0.
- **Two variants from one recipe.**
  - `rev2` (relief) keeps the sloped tops, and the roof must be continuous to count as solved.
  - `rev2-flat` (tiling) drops the relief and gives every piece the same 12 mm thickness.
- **Not modelled.** Underside letters, chamfers and the tray's 0.15 mm wall clearance.

## Checks

`generator/tests/test_rev2.py` verifies the following:

- The source polygons are reproduced to 1e-9 using the unrounded coefficients.
- The interior pieces are F, G, H and I.
- The areas match the source metrics.
- The lowest roof point is at (−2.56, 14.77) mm, matching the handoff document.
- The exact reference assembly has no overlap, covers the square, and has a continuous roof.
