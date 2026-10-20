# Rev 2 finalized design and handoff

The recommended nine-piece layout is the selected final design.
`PRINT-REV2/` is the unambiguous print set. XY inset is configurable through
`python generate.py --xy-inset 0.15`; no Z clearance is introduced.
The prior prototype already used this default inset. Finalization exposes it
as a named parameter and adds geometry-invariant checks; it does not shrink
the previous mesh a second time. See PRINTING.md for fabrication details.

## What changed

Rev 1 had eight perimeter pieces and one central piece, with an approximate
3x3 arrangement. Rev 2 keeps nine pieces but uses five perimeter pieces (A-E)
and four fully interior pieces (F-I). All top planes have nonzero slopes.
The minimum is a junction, not a conspicuous flat center.

The square outline still gives four corner clues. The improvement is that
completing the perimeter now leaves four pieces to reason about, rather than
one. This is likely a more interesting teaching puzzle; it is not established
as a hard packing puzzle. Flat bottoms, convex footprints and convex global
surface still provide useful solving information.

## Recommended candidate

Search trial 1201 is selected. The alternative is trial 1477. They both meet
the four-interior-piece goal; the recommended set has a larger minimum piece
width and more similar interior silhouettes.

Recommended numerical properties (ideal polygons unless specified):
- 9 pieces, 4 fully interior, 5 touching the frame.
- Smallest width between parallel supporting lines: 31.64 mm.
- Shortest polygon edge: 8.65 mm.
- Largest/smallest area ratio: 2.33.
- Interior piece areas F/G/H/I: approximately 1659/1731/1904/1578 mm^2.
- Lowest roof point at physical x=-2.56 mm, y=14.77 mm relative to tray center.
- Minimum printed thickness: 8.01 mm after clearance inset.
- Maximum assembled printed height: 45.90 mm.
- F and I have similar silhouettes after approximately a half turn. Their
  sampled support-function RMS difference is 2.68 mm at equal physical scale.

Do not interpret 2.68 mm as a fit clearance or Hausdorff bound. It measures
global support-function resemblance, sampled at 5-degree directions and
rotations after area-centroid alignment. The footprints are NOT congruent.
Search code stores each pair's lower index first, and the reported rotation
rotates that first polygon toward the second one.

## Polynomial

Use max convention and D=[-3.2,3.2]^2. Each row is an affine term a*x+b*y+c.

| Piece | a | b | c | Region |
|---|---:|---:|---:|---|
| A | -6 | -4 | -10.353781 | perimeter |
| B | 4 | -6 | -11.279469 | perimeter |
| C | 7 | 1 | -11.445728 | perimeter |
| D | 1 | 7 | -9.139592 | perimeter |
| E | -6 | 4 | -13.518475 | perimeter |
| F | 2 | 2 | -2.223625 | interior |
| G | -1 | -1 | -0.595755 | interior |
| H | 1 | -2 | -1.443053 | interior |
| I | -2 | 2 | -2.678293 | interior |

F(x,y) is the maximum of these nine terms. These integer slopes define a
tropical Laurent polynomial. Adding the common affine function 6x+6y makes
all exponents nonnegative; subtracting it again recovers the displayed roof
without changing the winning regions or tropical curve.

Convex cells are intersections of pairwise dominance half-planes with D.
Their shared boundaries form the tropical curve, excluding the arbitrary
frame crop. A maximum of affine functions is convex (bowl-shaped). This
revision stays within that structure; no decorative nonconvex cuts were added.

Physical conversion: X=22.5x, Y=22.5y. The ideal top is
Z=3+8+s*(F-Fmin), with s=35/(Fmax-Fmin), all heights in mm. Fmin and Fmax are
evaluated over all cell vertices; piecewise affinity makes those extrema
sufficient. The assembled underside is Z=3. Each candidate is independently
normalized to 35 mm of relief for shape comparison. Consequently this viewer
is NOT a coefficient-sensitivity experiment with a common vertical scale.
The exact transformations are stored in generated/geometry.json.

Manufacturing clearance: offset each physical polygon inward by 0.15 mm,
then evaluate its unchanged top plane on that inset. Never shrink a polygon
around its centroid to create gaps. The planar top and vertical sides form
one closed convex solid with a common flat bottom.

## Candidate generation and selection

Five fixed extreme integer slopes surround four interior integer slopes.
The interior support is sampled without duplicates, with a separation filter.
Coefficients start from a concave quadratic lifting, plus shear, translation
and random perturbations. No noninteger slopes are introduced.

Filter: nine active cells, at least three interior cells, minimum cell area
700 mm^2, area ratio <=4.5, exact minimum width >=23 mm, edge lengths >=2 mm.
Rank mainly by interior count, then area balance, footprint resemblance and
minimum width. A finite support-function comparison allows rotated silhouettes
to resemble one another without changing physical scale or permitting reflection.
This objective is a design heuristic and does not simulate a human solver.

The search is reproducible but limited: 1,800 trials, 15 accepted, top 12 saved.
Both generated finalists have four interior pieces. Coefficients are rounded
to six decimal places for manufacturing output and all checks are repeated
on the rounded geometry. Per-part mesh and state checks are in validation.json.

## Next tasks for Claude Code

1. Keep this nine-piece design as the baseline; inspect the default unlabeled
   single-material viewer. The teaching colors and labels should remain an
   optional overlay, never placement hints on the physical top.
2. Make a small clearance coupon and add bottom elephant-foot relief. Keep
   top faces planar. Add underside piece IDs and a subtle tray orientation mark.
3. Slice and print the recommended set. Check fit, minimum thickness, pointed
   corners, removal, and whether the middle actually takes thought to assemble.
   Do not print both finalist sets before this feedback.
4. If more ambiguity is needed, refine the F/I-like silhouette pairing while
   preserving area, width and printability. Direct shape matching should use
   polygon overlap/Hausdorff distance, not only the sampled support proxy.
5. For a truly height-dependent puzzle, construct congruent footprint pairs
   with different top planes and verify a wrong 2D placement that fails 3D
   continuity. The current revision does not establish this property.
6. Consider 10-12 pieces only after the nine-piece physical trial. Count
   interior pieces and plausible placements, not just total pieces.
7. Optional later exact/approximate assembly solver: fix square-frame rotational
   symmetry, allow arbitrary in-plane piece rotations with flat bottoms down,
   and distinguish planar tiling uniqueness from continuous-height uniqueness.
   Exact-congruence comparisons alone are insufficient because multiple pieces
   could collectively rearrange into a different tiling.

## Known limitations

Sharp mesh edges are not yet chamfered. No physical fit validation, solution-
uniqueness proof, collision-aware interactive assembly, or drag-and-drop game.
The viewer is a lightweight polygon projection with approximate depth sorting,
not a CAD renderer. The STL and source geometry are the fabrication reference.
The old coefficient-sweep concept is intentionally outside this revision.
