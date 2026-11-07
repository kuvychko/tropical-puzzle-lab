# Puzzle rules

These are the play rules agreed in [project.md](project.md), as the player implements them.

| Aspect | Rule |
| --- | --- |
| Motion | Pieces can be translated in the plane and rotated about the vertical axis, continuously. |
| Flipping | Not allowed. Each piece keeps its flat underside down. |
| Appearance | All pieces look the same. A temporary outline marks the selected piece, and the optional wall match assist tints its candidates. |
| Target | The square tray outline is always visible. |
| Snapping | Never toward the solution: no attraction to a piece's correct position or orientation, and no angle quantisation, including for keyboard nudges and turns. |
| Sticky edges | Optional assist, off by default (see below). |
| Glue | Optional assist, off by default (see below). |
| Wall match | Optional assist for relief puzzles, off by default (see below). |
| Collision | Pieces may pass through each other while being moved. |
| Overlap feedback | A pair of pieces turns red while it overlaps by more than the depth tolerance. A piece that is partly in the tray turns red while it sticks out through a wall by more than the outside tolerance. Pieces parked entirely outside the tray stay their normal colour. |
| Contact | Boundary contact alone is not overlap. |
| Completion | Any assembly within tolerances counts, including alternatives to the reference solution. |

## Variants

The same construction can be played two ways.

- **Relief** (for example `rev2`): each piece's top is the plane of its tropical term (for a rational puzzle such as `rat1`, the difference of its numerator and denominator terms). The puzzle is solved when the footprints fill the tray *and* neighbouring roofs agree in height along every shared edge, so the roof is one continuous surface.
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

## Glue (optional assist)

When it is on (checkbox in the panel, or **G**), two pieces that fit together are glued and move as one: dragging, turning or nudging any of them moves the whole group rigidly. A group turns about the centre of the piece whose handle is dragged. Pieces glued to a glued piece join the same group.

Two pieces fit when they share an edge, judged with the same test and tolerances as the roof check in completion: edges facing each other within `edgeAngleDeg`, within 2×depth of each other, running alongside each other for at least `edgeMinOverlap`·S, and not overlapping beyond the depth tolerance. In relief puzzles the roofs must also agree along every shared edge, within the roof tolerance. Glue is decided when a move is released, never during a drag, and nothing is moved to make pieces fit.

It does not use the reference solution, so any assembly that fits glues, including alternative ones. In flat puzzles only the outlines count, so pieces with matching edges glue even if they don't belong together.

Double-clicking (or double-tapping) a glued piece detaches it from its group. A detached pair stays apart until the two pieces have been moved so they no longer fit. Undo removes glue made by the undone move, because the pieces no longer fit. With sticky edges on, a released group snaps as one, to edges outside the group.

Each pair is counted the first time it is glued in an attempt, including pairs that already fit when glue is turned on; turning glue off and on, undo and redo never count a pair again. The report line shows `assist=glue(N)`, where N is the number of distinct pairs glued.

## Wall match (optional assist)

With a printed puzzle you can hold two pieces together and see whether their side walls agree. Wall match gives the browser the same cue. It is available on relief puzzles only, because the walls of a tiling piece all have the same height.

When it is on (checkbox in the panel, or **M**), clicking a piece's side wall without dragging marks that wall. Every piece with a compatible wall is tinted and that wall is marked. Walls can't be clicked from the top view, so use a tilted or side view.

Two walls are compatible when their top edges agree at both ends, within the tolerance, with the start of one meeting the end of the other. Length is ignored. Turning a piece doesn't change the result.

It never moves a piece and doesn't use piece positions or the reference solution. A candidate may be a false match, and a wall on the tray edge may also show candidates.

The slider sets the tolerance, from ±5 mm to ±0.25 mm, with a default of ±2 mm. Tighter is a much stronger hint. On the 16-piece `new2`:

| Tolerance | Mean candidate pieces per interior wall | Walls with one candidate |
| --- | --- | --- |
| ±5 mm | 7.5 | 0% |
| ±2 mm | 3.5 | 6% |
| ±1 mm | 1.6 | 51% |
| ±0.25 mm | 1.03 | 96% |

Each wall clicked, and each slider change while a wall is marked, counts as one query. The report line shows `assist=wall-match(N@Tmm)`, where T is the tightest tolerance used, joined with `+` if sticky edges also moved a piece.

## Completion tolerances

Completion is judged from the current geometry, not by comparison with the reference poses. The checks are listed below. The constants live in each puzzle's `validation` block, scaled by the tray span (S = 144 mm for rev2), the tray area, or the relief height.

| Check | Criterion | rev2 starting value |
| --- | --- | --- |
| No overlap | Separating-axis penetration depth of every pair ≤ `overlapDepth`·S | 0.86 mm |
| Inside | No vertex lies farther than `outsideDepth`·S outside the tray | 0.86 mm |
| Area | Total pairwise overlap area + area outside ≤ `areaError`·area, and the uncovered area is within the same bound | 249 mm² |
| Roof (relief only) | On antiparallel edges within `edgeAngleDeg` and 2×depth of each other, overlapping by ≥ `edgeMinOverlap`·S, roof heights differ by ≤ `roofMismatch`·relief | 1.75 mm |

The depth criteria catch long, thin misfits that an area threshold alone would accept.

The red colouring uses exactly the same depth tests as completion (overlap depth, and outside depth for pieces partly in the tray), so a red piece and "solved" never appear together. Penetration below `contactNoise`·S is treated as numerical noise.

These values are a first guess to be tuned through play, not settled constants.
