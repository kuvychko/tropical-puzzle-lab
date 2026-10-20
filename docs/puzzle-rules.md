# Puzzle rules

These are the play rules agreed in [project.md](project.md), as the player implements them.

| Aspect | Rule |
| --- | --- |
| Motion | Pieces can be translated in the plane and rotated about the vertical axis, continuously. |
| Flipping | Not allowed. Each piece keeps its flat underside down. |
| Appearance | All pieces look the same. A temporary outline marks the selected piece. |
| Target | The square tray outline is always visible. |
| Snapping | None, including for keyboard nudges and turns. |
| Collision | Pieces may pass through each other while being moved. |
| Overlap feedback | A pair of pieces turns red while it overlaps by more than the depth tolerance. |
| Contact | Boundary contact alone is not overlap. |
| Completion | Any assembly within tolerances counts, including alternatives to the reference solution. |

## Variants

The same construction can be played two ways.

- **Relief** (for example `rev2`): each piece's top is the plane of its tropical term. The puzzle is solved when the footprints fill the tray *and* neighbouring roofs agree in height along every shared edge, so the roof is one continuous surface.
- **Tiling** (for example `rev2-flat`): the relief is removed and every piece has the same thickness. The puzzle is solved when the footprints fill the tray.

A physical tray only enforces the tiling condition. The relief condition is stricter, and makes the tropical structure part of the puzzle.

## Starting a puzzle

A puzzle always starts from a seeded **scramble**. Every piece gets a random rotation and is placed beside the tray. The reference assembly is never shown while loading or in the gallery.

**Show solution** draws the reference outlines in the tray. Using it is recorded in the session and in the report line.

The proposal also describes an *explode* view for illustration. It is not implemented yet.

## Completion tolerances

Completion is judged from the current geometry, not by comparison with the reference poses. The checks are listed below. The constants live in each puzzle's `validation` block, scaled by the tray span (S = 144 mm for rev2), the tray area, or the relief height.

| Check | Criterion | rev2 starting value |
| --- | --- | --- |
| No overlap | Separating-axis penetration depth of every pair ≤ `overlapDepth`·S | 0.86 mm |
| Inside | No vertex lies farther than `outsideDepth`·S outside the tray | 0.86 mm |
| Area | Total pairwise overlap area + area outside ≤ `areaError`·area, and the uncovered area is within the same bound | 249 mm² |
| Roof (relief only) | On antiparallel edges within `edgeAngleDeg` and 2×depth of each other, overlapping by ≥ `edgeMinOverlap`·S, roof heights differ by ≤ `roofMismatch`·relief | 1.75 mm |

The depth criteria catch long, thin misfits that an area threshold alone would accept.

The overlap colouring uses exactly the same depth test as completion, so a red piece and "solved" never appear together. Penetration below `contactNoise`·S is treated as numerical noise.

These values are a first guess to be tuned through play, not settled constants.
