# Puzzle rules

These are the play rules agreed in [project.md](project.md), as the player implements them.

| Aspect | Rule |
| --- | --- |
| Motion | Pieces can be translated in the plane and rotated about the vertical axis, continuously. |
| Flipping | Not allowed. Each piece keeps its flat underside down. |
| Appearance | All pieces look the same. A temporary outline marks the selected piece. |
| Target | The square tray outline is always visible. |
| Snapping | Never toward the solution: no attraction to a piece's correct position or orientation, and no angle quantisation, including for keyboard nudges and turns. |
| Sticky edges | Optional assist, off by default (see below). |
| Collision | Pieces may pass through each other while being moved. |
| Overlap feedback | A pair of pieces turns red while it overlaps by more than the depth tolerance. |
| Contact | Boundary contact alone is not overlap. |
| Completion | Any assembly within tolerances counts, including alternatives to the reference solution. |

## Variants

The same construction can be played two ways.

- **Relief** (for example `rev2`): each piece's top is the plane of its tropical term. The puzzle is solved when the footprints fill the tray *and* neighbouring roofs agree in height along every shared edge, so the roof is one continuous surface.
- **Tiling** (for example `rev2-flat`): the relief is removed and every piece has the same thickness. The puzzle is solved when the footprints fill the tray.

The gallery shows the variants of one construction as one card, and the player has a **Relief | Flat** switch. The variants share footprints, tolerances and scramble seeds, but each is still its own puzzle with its own id, saved attempt and report line. Switching opens the other variant's attempt; it never carries piece positions across, so a flat attempt never benefits from having seen the roofs.

A physical tray only enforces the tiling condition. The relief condition is stricter, and makes the tropical structure part of the puzzle.

## Starting a puzzle

A puzzle always starts from a seeded **scramble**. Every piece gets a random rotation and is placed beside the tray. The reference assembly is never shown while loading or in the gallery.

**Show solution** draws the reference outlines in the tray. Using it is recorded in the session and in the report line.

The proposal also describes an *explode* view for illustration. It is not implemented yet.

## Sticky edges (optional assist)

This is different from the snapping the agreed rules exclude. That rule is about pulling pieces toward their *correct* placement or orientation. Sticky edges only uses edges that are physically next to the piece, like a real tray wall guiding a piece into place.

When it is on (checkbox in the panel, or **S**), releasing a dragged or turned piece does the following:

1. It finds the piece's edge that best matches a nearby fixed edge: a tray wall (from the inside) or another piece. Matching edges face each other, are within 6° of parallel and within 2% of the span (2.9 mm for rev2) of each other, and run alongside each other for at least 2% of the span.
2. It turns the piece to be exactly parallel and moves it flush, which closes the gap or removes the small overlap.
3. It then slides the piece along that edge until a second, already-parallel edge is flush, if one is close. This is how a piece settles into a corner.

It does not use the reference solution. It can make a piece flush against a wrong neighbour, as a physical tray would.

Keyboard nudges are never snapped, so fine adjustment always stays possible.

Each snap that moves a piece is counted in the session. The report line shows `assist=sticky-edges(N)`, or `assist=none` if it never moved a piece. The toggle is off by default so that unassisted attempts stay comparable.

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
