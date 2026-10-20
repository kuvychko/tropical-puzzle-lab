# Tropical puzzle Rev 2 — finalized geometry

This revision implements the revised puzzle-design brief: nine pieces, more
interior regions, asymmetric slopes, and less immediately obvious placement.
The earlier coefficient-changing sets remain a separate teaching extension;
they are not the Rev 2 developed here.

## Open and inspect

Open `viewer.html` in any browser, offline. Select the recommended Rev 2,
the alternative, or the Rev 1 reference. Switch assembled/exploded and
oblique/top/low views, or lift a selected piece. The default is one material
without labels. Enable the teaching checkbox to show labels and highlight
fully interior pieces. No external JavaScript libraries are required.

Static renderings:
- `generated/rev2-render.png`: recommended assembly and exploded view.
- `generated/candidate-comparison.png`: two finalists versus Rev 1.

## Final print set

Use the ten STL files in `PRINT-REV2/`: nine pieces and one tray. The selected
Rev 2 geometry is frozen. Clearance is a named generator parameter, default
`--xy-inset 0.15` mm per edge. No Z clearance is applied. See `PRINTING.md`.

## Other source files

Use `generated/tray.stl` and the nine STLs in
`generated/rev2-recommended/`. The alternative is a separate complete set.
All STL coordinates are in millimeters. Every printed part starts at z=0;
the pieces retain their assembled x/y coordinates. For an assembled CAD view,
raise the pieces by the 3 mm tray floor. The interactive viewer already does so.

The tray is geometrically identical to Rev 1: 144 mm cavity, 152 mm outside,
3 mm floor, 4 mm walls, 7 mm rim above the floor. No need to print two trays.
Nominal neighbor gap is 0.30 mm (0.15 mm inset per side); wall gap is 0.15 mm.
These are fit-coupon starting values, not printer-calibrated clearances.
Underside letters, bottom chamfers, and a fit coupon are not yet modeled.

## Reproduce

Python 3.10+, NumPy and Matplotlib:

```sh
python -m pip install -r requirements.txt
python generate.py --xy-inset 0.15
python build_viewer.py
```

`search-results.json` freezes the candidate selection. To reproduce the search:

```sh
python search.py
python generate.py --xy-inset 0.15
python build_viewer.py
```

The random seed is 20260928. There are 1,800 proposal trials, including rejected
support selections; 15 candidates pass all filters. This is a limited heuristic
search, not global optimization of puzzle difficulty. The top 12 are recorded.

Run `python check_clearance.py` to verify 0, 0.15 and 0.25 mm offsets and
unchanged top planes and bottom heights. This check uses temporary outputs.

`geometry_core.py` contains clipping, inset, manifold mesh generation and STL
export. `search.py` proposes integer slopes and coefficients and ranks candidates.
`generate.py` builds the two shortlisted designs and static renders.
`reference-rev1.json` embeds the original nine-piece geometry for comparison.

## Verified / not verified

Verified: nine active cells; four interior pieces; whole-domain coverage;
active-plane equality at every ideal cell vertex; closed oriented meshes with
no degenerate triangles and positive signed volume; positive part thickness.
Static renders were inspected. Viewer syntax and control paths were exercised
with a mocked DOM; a live-browser visual/layout check was not available.

Not verified: physical fit, slicer behavior, human solving difficulty, unique
assembly, or a false assembly that fits in 2D but fails in 3D. Similar silhouettes
are a measured design proxy, not interchangeable parts.

Read `DESIGN-AND-HANDOFF.md` for the mathematical model, design tradeoffs, and
the next concrete tasks for Claude Code.
