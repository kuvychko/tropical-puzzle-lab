# rat2 provenance

**Source.** Generated in this repository by `generator/scripts/search_rational.py --climb --seed 8 --restarts 6 --evals 2500`, from restart 0. There is no source archive. The exact function is stored in `recipe.json` under `source.rational`.

**Mathematics.** F = P ⊘ Q, which is P − Q classically, where P and Q are max-convention tropical polynomials of seven terms each, over x, y ∈ [−4, 4]. Each piece is a two-dimensional cell of the common refinement, as in `rat1`. Its roof is the plane p − q, and its id is `p.id + q.id`.

**Search.** Random sampling, used for `rat1`, rarely reaches this size without slivers, so this puzzle comes from hill-climbing on the coefficients and slopes. Eight seeds were searched for 20–24 pieces. The first four, run before the last two limits below existed, are not candidates: their best result had half its vertices within a 6 mm height band and one piece covering 27% of the tray.

| Limit | Required | rat2 |
| --- | --- | --- |
| Pieces | 20–24 | 20 |
| Smallest piece, share of tray | ≥ 1.2% | 1.30% |
| Smallest edge | ≥ 6 mm | 7.2 mm |
| Smallest angle | ≥ 20° | 45° |
| Roof tilt, so pieces print roof-down without supports | ≤ 30° | 28.0° |
| Shorter over longer of the valley and ridge curves | ≥ 0.4 | 0.999 |
| Congruent pieces | none | none |
| Largest piece, share of tray | ≤ 15% | 13.7% |
| Middle 50% of vertex heights spans | ≥ 10 mm | 10.2 mm |

**Hardness.** Candidates meeting the limits were ranked by the number of interior roof features, then by wall ambiguity. rat2 has 3 peaks, 2 pits and 3 saddles, tied for the most. Wall ambiguity, the mean number of other pieces with a compatible wall at ±2 mm, is 4.65 over all walls, against 3.06 for new2 and 1.81 for rat1. Lower diversity also rates harder, but this measure is close to new2 (x = 0.248 against 0.233), so both rate 4 of 5. How hard it is in play is untested.

**Physical scale.** X = 18·x and Y = 18·y mm, giving a 144 mm square tray. Roof heights, tray rim, flat thickness and tolerances are copied from rat1.

**Status.** Exploratory puzzle, still under evaluation.
