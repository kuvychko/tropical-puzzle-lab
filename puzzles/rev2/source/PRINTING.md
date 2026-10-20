# Final Rev 2 fabrication specification

Selected design: recommended nine-piece Rev 2, four interior pieces.
Print the 10 STL files in `PRINT-REV2/`. All files use millimeters.

## Clearance parameter

```sh
python generate.py --xy-inset 0.15
python build_viewer.py
```

`--xy-inset` is the distance in mm to offset EVERY footprint edge inward,
perpendicular to that edge. Default: 0.15 mm. It acts only on piece footprints;
the tray is unchanged. It is not a percentage scale and not an axis-aligned
bounding-box resize. Zero disables this clearance. Negative or non-finite
values are rejected; very large values can eliminate a cell and are rejected.

| Quantity | Default |
|---|---:|
| Inward offset per piece edge | 0.15 mm |
| Nominal normal gap between neighboring pieces | 0.30 mm |
| Nominal clearance from a piece to the tray wall | 0.15 mm |
| Z clearance / Z shrink | 0 mm |
| Tray cavity | 144 x 144 mm |
| Tray outside | 152 x 152 mm |
| Tray floor | 3 mm |

For an axis-aligned rectangle, this reduces X and Y size by exactly 0.30 mm.
For these angled polygons, the reduction in overall X/Y extents generally
differs: angled corners move according to intersecting offset lines. The
controlled quantity is the edge-normal clearance. The 0.30 mm neighboring
gap applies to corresponding parallel edge segments away from junctions;
the open region around a multi-piece junction has a different shape.

No Z compensation is applied. The original sloping top plane remains fixed,
and each underside remains flat at the same height. Evaluating that same
plane on a smaller footprint changes some vertex heights and extrema because
the vertices move laterally; this is trimming the original solid, not shrinking
or shifting it vertically. The fixed roof transform is computed from the ideal
geometry, independently of the XY inset parameter.

The earlier prototype already contained the default 0.15 mm inset. This
finalization does NOT apply a second inset to those STLs: regeneration always
starts from the ideal mathematical polygons. Default STLs were verified
byte-identical before and after parameterization.

## User's printer setup

- Nozzle: 0.4 mm. Layer height: 0.2 mm.
- Import at 100% scale; arrange as separate parts, flat undersides on the bed.
- No supports are geometrically required. Do not print the assembled puzzle
  in place; the parts are intended as separately printed removable pieces.
- Keep whole-part XY size compensation at zero unless deliberately calibrating
  a separate printer error. The model already includes the chosen clearance.
- The mathematical slopes are not rounded to layer increments. The slicer
  handles 0.2 mm stair-stepping; no model-level Z tolerance is needed.
- A 0.15 mm offset is a path-placement offset, not a 0.15 mm-wide extrusion;
  it does not require a nozzle smaller than 0.4 mm.
- First-layer elephant-foot compensation is separate from whole-part shrink.
  Keep a calibrated setting. Prusa says values around 0.2 mm usually work for
  a default 0.4 mm nozzle and notes that official profiles enable it by default:
  https://help.prusa3d.com/en/article/elephant-foot-compensation_114487

These are nominal geometric clearances, not a guarantee of fit for every
filament/profile. A small physical fit trial remains appropriate. If the fit
is tight through the full height, try `--xy-inset 0.20` (0.40 mm neighboring
gap); if binding occurs only at the first layer, address first-layer expansion.
No new chamfers, lettering, magnets or Z changes were added in this finalization.

## Verification

`python check_clearance.py` measures edge-normal offsets independently from
the inset routine at 0, 0.15 and 0.25 mm for all nine selected pieces; checks
fixed underside heights and unchanged affine top planes; and runs mesh closure,
winding, nondegeneracy and positive-volume checks through the generator.
The default finalized set retains the same meshes as the reviewed prototype.
