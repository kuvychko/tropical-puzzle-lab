# Tropical Puzzle Lab

**Proposed repository:** `tropical-puzzle-lab`  
**Visibility:** Public from the first commit  
**Status:** Project proposal, 19 October 2026

## Purpose

Build a collaborative environment for generating tropical geometry puzzles and solving them virtually. The immediate purpose is to let Igor and Madeline quickly try constructions, discuss their behavior, and identify what makes a puzzle interesting or difficult before investing in additional physical prototypes.

The first deliverable is a GitHub Pages website containing a small curated puzzle collection, beginning with the existing **rev2 puzzle**. Visitors should be able to open a link and attempt a puzzle without installing software.

Longer term, the same puzzle descriptions should support parametric generation, automated solving, and research into puzzle difficulty. Difficulty classification is a research question, not a promised feature of the first release.

## Name and public description

**Tropical Puzzle Lab** describes both the subject and the experimental nature of the project. The repository name `tropical-puzzle-lab` leaves room for different puzzle families, human experiments, and automated solvers.

Suggested GitHub description:

> Generate, explore, and solve tropical geometry puzzles in the browser—a laboratory for studying puzzle construction and difficulty.

The README should introduce the mathematical idea, link directly to the playable website, explain the controls, and distinguish working features from planned capabilities. Document contributions and mathematical provenance accurately; agree on collaborator credit before publishing attribution text. Select an explicit license before inviting reuse.

## First milestone

**A public, shareable GitHub Pages puzzle gallery with rev2 playable end to end.**

The gallery may initially contain only rev2. Additional puzzles should be added once the player works reliably; a minimum collection size should not delay the first useful release.

The milestone is complete when Madeline can:

1. Open a direct link to rev2 on a desktop browser.
2. Read concise rules and begin from a scrambled arrangement without first seeing the solution.
3. Translate and rotate pieces comfortably, with no flipping or snapping.
4. See the target outline and feedback when pieces overlap.
5. Undo moves, restart, and resume after reloading the page.
6. Complete the puzzle within documented geometric tolerances.
7. Report observations using a stable puzzle ID and scramble seed.

## First puzzle: existing rev2

Use the previously generated rev2 construction as the first published puzzle, rather than replacing it with a new example. Import its authoritative source geometry and construction parameters into the shared puzzle format.

Before implementation, locate and inspect the existing rev2 files. This proposal does not specify its polynomial, piece count, dimensions, or topology because those source details have not been inspected here. Preserve its identity and record any adaptation needed for virtual play.

Prefer the ideal mathematical geometry over fabrication meshes with print clearances. If only manufacturing files remain, document their clearances and reconstruction choices rather than silently treating them as an exact partition.

**Geometry checkpoint:** The proposed initial controls assume a planar assembly with in-plane rotation and an optional 3D presentation. Confirm that this matches rev2. If rev2 requires genuinely spatial assembly, retain rev2 as the first puzzle and revise the motion model explicitly before implementing controls; do not silently flatten the puzzle. In three dimensions, “no flipping” needs a precise operational definition because a rigid piece can turn over through rotation.

## Agreed play rules

| Aspect | Rule |
| --- | --- |
| Motion | Translation and rotation are allowed. |
| Flipping | Not allowed. Under the planar model, each piece retains its designated face-up orientation. |
| Piece appearance | All pieces use the same neutral appearance; selection may use a temporary outline. |
| Target | Target outline remains visible. |
| Snapping | None: no automatic alignment, attraction, or correction. |
| Collision | Pieces may pass through one another during manipulation. |
| Overlap feedback | Proposed default: overlapping pieces turn red while overlap persists. |
| Contact | Boundary contact alone is not overlap. |
| Completion | Any valid assembly within tolerances is accepted, including alternatives to the reference solution. |

The camera may orbit independently of piece motion. For planar play, camera movement must never enable a piece to flip or leave its assembly plane.

## Capabilities and scope

| Capability | First release | Subsequent development |
| --- | --- | --- |
| Construction | Import rev2; local generation/export workflow | Parametric families and browser parameter controls |
| Discovery | Gallery, neutral thumbnails, direct puzzle links | Larger collections and family filters |
| Interaction | Drag, continuous rotation, fine adjustment, camera controls | Additional motion models if required |
| Feedback | Target outline, red overlap indication, completion check | Optional diagnostic views |
| Sessions | Restart, undo/redo, local save/resume | Portable session export and replay |
| Reproducibility | Stable puzzle revision and scramble seed | Batch experiments and comparison tools |
| Difficulty | Informal observations; optional basic active timer | Human studies, solver metrics, difficulty models |
| Physical output | Preserve source provenance | Shared exports for printing and virtual play |

Out of scope for the first release: automated solving, a difficulty classifier, multiplayer, accounts, a backend service, a physics engine, and a general-purpose geometry editor. Mobile interaction is a later refinement; desktop mouse and keyboard use is the initial target.

## Interaction design

Use dragging for translation and a rotation handle for continuous rotation. Provide fine keyboard adjustments without snapping angles to geometrically meaningful directions. Keep camera gestures distinct from piece manipulation, and provide an obvious top-view/reset-camera action.

Dragging through another piece is allowed. Overlap feedback is informative, not a motion constraint. Selection and camera control must remain usable when pieces overlap.

Separate two actions:

- **Explode:** move pieces away from the reference assembly for illustration. This preserves arrangement clues and belongs in an explicit exploration mode.
- **Scramble:** independently randomize positions and allowed orientations for a solving attempt. This is the default entry into play.

Do not show the reference assembly during loading or in gallery thumbnails. If a reveal action is included, make it explicit and record that it was used. The public source may contain the reference solution; this is an experimental tool, not a system intended to prevent deliberate inspection of answers.

## Completion and geometric feedback

Without snapping, completion must tolerate ordinary mouse-placement error. The validator should evaluate the current geometry rather than compare each piece against its reference pose.

For planar puzzles, check:

- Pairwise interior overlap, excluding shared boundaries.
- Piece area outside the target.
- Uncovered target area.

Use documented scale-relative tolerances. Consider a maximum boundary-distance criterion as well as area thresholds so a long, narrow mismatch does not pass merely because its area is small. Tolerance selection is an implementation experiment, not a fixed value in this proposal.

Acceptance must not move or rotate pieces. Use a consistent numerical policy for overlap coloring and completion so a visibly invalid configuration is not simultaneously declared solved. Distinguish harmless numerical noise from meaningful overlap.

If rev2 requires volumetric assembly, replace planar area checks with suitable solid-intersection and coverage checks; a rendering mesh alone is not a reliable geometric validator.

## Architecture

Keep three concerns separate:

1. **Local construction and export:** recover rev2, generate future puzzles, validate reference assemblies, and export reproducible puzzle definitions.
2. **Shared puzzle format:** the contract used by the generator, browser player, and future automated solver.
3. **Browser application:** load definitions, render pieces, manage interaction, evaluate placements, and save sessions.

A proposed implementation is Python for local construction and TypeScript with Three.js for the browser. Treat this as an implementation direction rather than a requirement to port geometry code immediately. Keep geometric operations separate from rendering so they can be checked independently.

Deploy the browser build as static assets on GitHub Pages. Puzzle generation initially happens before deployment; a hosted Python service is not required. Use direct links such as `?puzzle=rev2` that survive a reload on static hosting. Configure asset paths for a repository subdirectory.

## Puzzle and session formats

Use a versioned JSON puzzle definition, with separate geometry assets if needed. The minimum logical fields are:

| Field group | Purpose |
| --- | --- |
| Identity | Stable puzzle ID, puzzle revision, display name, format version |
| Geometry model | Planar or spatial; coordinates, scale, units, and conventions |
| Target | Boundary or solid representation used by the validator |
| Pieces | Stable IDs and local-coordinate geometry; optional rendering meshes |
| Rules | Allowed translations/rotations and explicit flipping policy |
| Validation | Scale-relative tolerance policy |
| Provenance | Source recipe, generator version, source revision, adaptation notes |
| Starting state | Default scramble seed and scramble algorithm version |

Store the reference assembly for construction checks and optional reveal behavior, without making completion depend on matching it. Preserve exact or higher-precision construction data where available; rendered triangles should not be the sole mathematical record.

A session is a separate object containing the puzzle ID and revision, piece poses, scramble seed, timer state if enabled, and any reveal use. Save undo history if practical. Reject or clearly migrate incompatible saved sessions when puzzle geometry changes.

Initial saves stay in the visitor's browser. They are not automatically shared across computers or sent to a server. Session export can be added when comparing attempts becomes useful.

## Proposed repository layout

```text
tropical-puzzle-lab/
├── README.md
├── LICENSE
├── docs/
│   ├── project.md
│   ├── puzzle-rules.md
│   ├── puzzle-format.md
│   └── research-notes.md
├── generator/
│   ├── src/
│   └── tests/
├── puzzles/
│   └── rev2/
│       ├── recipe.json
│       ├── puzzle.json
│       └── provenance.md
├── web/
│   ├── src/
│   │   ├── gallery/
│   │   ├── player/
│   │   ├── geometry/
│   │   └── sessions/
│   └── package.json
└── .github/
    └── workflows/
        └── pages.yml
```

This is a proposed layout, not a claim that these files already exist. Recipe fields depend on the recovered rev2 source. Keep `puzzles/` authoritative and copy its published assets into the web build automatically; avoid maintaining duplicate puzzle definitions by hand. Add a solver directory when solver development begins.

## Implementation sequence

### 1. Recover and specify rev2

- Locate source geometry and construction parameters.
- Confirm dimensionality and permitted motion.
- Separate ideal geometry from print-specific clearances.
- Export rev2 with a stable ID and provenance.
- Validate its reference assembly and review it visually.

### 2. Build the player around rev2

- Render the target and neutral pieces.
- Implement selection, translation, rotation, and camera controls.
- Add scramble, restart, and undo/redo.
- Add overlap feedback and tolerance-based completion.
- Confirm that manipulation is comfortable before interpreting solve times.

### 3. Publish the first shareable release

- Add the gallery and direct puzzle links.
- Add local session persistence and concise instructions.
- Deploy on GitHub Pages from the public repository.
- Verify fresh loading, direct-link reload, save/resume, and completion on a second desktop browser.
- Share rev2 for an initial trial and record interface feedback separately from puzzle feedback.

### 4. Expand the experiment

- Add a few deliberately varied puzzles and, if useful, a trivial control puzzle for testing interface overhead.
- Record construction parameters and observations without assigning unsupported difficulty labels.
- Add portable session export when needed.
- Bring selected generation parameters into the browser only after the construction workflow stabilizes.

## Verification priorities

Focus automated checks on geometry and state behavior that could invalidate an experiment: edge contact versus overlap, target coverage, out-of-bounds placement, acceptance tolerances, known valid assemblies, and save/resume compatibility. Use direct interactive testing for selection, camera gestures, rotation, and fine placement.

The public release should preserve construction reproducibility and make experimental limitations clear. It need not have a polished difficulty model or a large catalog to be useful.

## Research direction

Future questions include whether difficulty depends on the number of plausible placements, branching and backtracking, near-symmetry, boundary clues, or the need to use tropical structure such as balancing conditions. These are hypotheses to investigate, not established predictors.

Human difficulty and automated solver effort should initially be measured separately. Human performance includes perception and interaction costs; solver effort depends on representation, heuristics, and the search algorithm. A later classifier should state which population, interface rules, and outcome it predicts.

The immediate objective is simpler: make rev2 playable, let collaborators try it, and use those observations to guide the next construction.
