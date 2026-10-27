// Explanation of the difficulty rating. Every parameter shown here is read from the `difficulty`
// block of index.json, which tpl-export copies from the generator's configuration, so the page
// cannot drift from the implementation.
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { escapeHtml } from '../player/player';
import type { DifficultyConfig, PuzzleIndex } from '../types';
import { fetchIndex, pips } from './rating';

const base = import.meta.env.BASE_URL;

const tex = (source: string, displayMode = false): string => katex.renderToString(source, { displayMode, throwOnError: false });
const math = (source: string): string => tex(source, true);

/** The diversity formula for uniform weights at the configured order, and what it means. */
function orderSection(q: DifficultyConfig['q']): string {
  if (q === 'infinity') {
    return `<p>We use ${tex('q = \\infty')} with uniform weights ${tex('p_i = 1/n')}:</p>
      ${math('D = {}^{\\infty}\\!D^{Z} = \\frac{n}{\\max_i \\sum_j Z_{ij}}.')}
      <p>This is the most conservative order: it is set by the piece with the most look-alikes.</p>`;
  }
  if (q === 2) {
    return `<p>We use ${tex('q = 2')} with uniform weights ${tex('p_i = 1/n')}:</p>
      ${math('D = {}^{2}\\!D^{Z} = \\frac{n^2}{\\sum_i \\sum_j Z_{ij}},')}
      <p>the reciprocal of the mean similarity between two pieces drawn at random (with replacement). It weighs every pair equally,
      so it is less dominated by the single most crowded piece than ${tex('q = \\infty')}.</p>`;
  }
  if (q === 1) {
    return `<p>We use ${tex('q = 1')} (the limit) with uniform weights ${tex('p_i = 1/n')}:</p>
      ${math('D = {}^{1}\\!D^{Z} = \\exp\\Bigl(-\\frac1n \\sum_i \\log \\frac1n \\sum_j Z_{ij}\\Bigr).')}`;
  }
  return `<p>We use ${tex(`q = ${q}`)} with uniform weights ${tex('p_i = 1/n')}:</p>
    ${math(`D = {}^{${q}}\\!D^{Z} = \\Bigl(\\frac1n \\sum_i \\Bigl(\\frac1n \\sum_j Z_{ij}\\Bigr)^{${q} - 1}\\Bigr)^{\\frac{1}{1-${q}}}.`)}`;
}

function ratingFor(k: number, config: DifficultyConfig): number {
  return config.direction === 'lower-diversity-is-harder' ? 5 - k : 1 + k;
}

/** One row per rating: the x interval that maps to it. */
function mappingRows(config: DifficultyConfig): string {
  const cuts = [0, ...config.thresholds, 1];
  return [0, 1, 2, 3, 4]
    .map((k) => ({ k, rating: ratingFor(k, config) }))
    .sort((a, b) => a.rating - b.rating)
    .map(({ k, rating }) => {
      const upper = k === 4 ? `x \\le ${cuts[k + 1]}` : `x < ${cuts[k + 1]}`;
      return `<tr><td>${pips(rating)} ${rating}</td><td>${tex(`${cuts[k]} \\le ${upper}`)}</td></tr>`;
    })
    .join('');
}

function puzzleRows(index: PuzzleIndex): string {
  return index.puzzles
    .map((e) => `<tr>
      <td><a href="${base}?puzzle=${encodeURIComponent(e.id)}">${escapeHtml(e.name)}</a></td>
      <td>${e.variant === 'relief' ? 'relief' : 'flat tiling'}</td>
      <td class="num">${e.pieceCount}</td>
      <td class="num">${e.difficulty.diversity.toFixed(3)}</td>
      <td class="num">${e.difficulty.x.toFixed(3)}</td>
      <td>${pips(e.difficulty.rating)} ${e.difficulty.rating}</td>
    </tr>`)
    .join('');
}

function content(index: PuzzleIndex): string {
  const c = index.difficulty;
  const lowerHarder = c.direction === 'lower-diversity-is-harder';
  return `
    <p>Every puzzle gets a rating from 1 (easiest) to 5 (hardest), computed from the shapes of its pieces alone.
    The rating measures how many genuinely different pieces a puzzle has.
    ${lowerHarder
      ? 'Pieces that look alike give fewer clues about where each one belongs, so <b>less diversity means a higher rating</b>.'
      : 'More distinct pieces mean more to keep track of, so <b>more diversity means a higher rating</b>.'}
    It is a heuristic that is still being calibrated against play. It ignores, for example, how the roof heights constrain a relief puzzle.</p>
    <p>Each piece is taken as the solid the player draws: its footprint polygon extruded from the table up to its
    sloped roof (relief puzzles) or to a uniform thickness (flat puzzles). Every such piece is a convex polyhedron.</p>

    <h2>1. Intrinsic volumes</h2>
    <p>A convex body ${tex('K \\subset \\mathbb{R}^3')} has four intrinsic volumes ${tex('V_0, \\dots, V_3')}, the coefficients
    of the Steiner formula for the volume of its ${tex('\\varepsilon')}-neighbourhood:</p>
    ${math('\\operatorname{vol}(K + \\varepsilon B) = \\sum_{j=0}^{3} \\omega_{3-j}\\, V_j(K)\\, \\varepsilon^{3-j},')}
    <p>where ${tex('\\omega_k')} is the volume of the unit ball in ${tex('\\mathbb{R}^k')}. For a convex polyhedron ${tex('P')} they are</p>
    ${math('V_0(P) = 1, \\qquad V_1(P) = \\frac{1}{2\\pi} \\sum_{e} \\ell_e\\,(\\pi - \\theta_e), \\qquad V_2(P) = \\tfrac12\\,\\operatorname{area}(\\partial P), \\qquad V_3(P) = \\operatorname{vol}(P),')}
    <p>where the sum runs over the edges ${tex('e')}, with length ${tex('\\ell_e')} and interior dihedral angle ${tex('\\theta_e')}.
    ${tex('V_1')} is twice the mean width. A unit cube has ${tex('(V_0, V_1, V_2, V_3) = (1, 3, 3, 1)')}.</p>
    <p><b>Why these?</b> Hadwiger's theorem says every continuous, rigid-motion-invariant valuation on convex bodies is a linear combination
    of ${tex('V_0, \\dots, V_3')}, so they are a complete set of additive, position-independent shape measurements.</p>

    <h2>2. Removing scale</h2>
    <p>${tex('V_j')} has units of length${tex('^j')}, so we take ${tex('j')}-th roots and divide by a length for the whole puzzle,
    ${tex('L = \\bigl(\\sum_i V_3(P_i)\\bigr)^{1/3}')}:</p>
    ${math('d(P) = \\Bigl(V_0(P),\\ \\frac{V_1(P)}{L},\\ \\frac{V_2(P)^{1/2}}{L},\\ \\frac{V_3(P)^{1/3}}{L}\\Bigr) \\in \\mathbb{R}^4.')}
    <p>Scaling the whole puzzle leaves every ${tex('d(P_i)')} unchanged, and moving a piece rigidly does not change its vector.
    (${tex('V_0')} is the same for every piece, so it never affects distances.)</p>

    <h2>3. Distance and similarity</h2>
    ${math(`d_{ij} = \\lVert d(P_i) - d(P_j) \\rVert_2, \\qquad Z_{ij} = e^{-u\\, d_{ij}}, \\qquad u = ${c.u}.`)}
    <p>${tex('Z_{ii} = 1')}, and ${tex('Z_{ij} \\to 0')} as two pieces become very different. Larger ${tex('u')} means only near-identical pieces count as similar.</p>

    <h2>4. Leinster–Cobbold diversity</h2>
    <p>For a probability distribution ${tex('p')} on the pieces and a similarity matrix ${tex('Z')}, the Leinster–Cobbold diversity of order ${tex('q')} is</p>
    ${math('{}^{q}\\!D^{Z}(p) = \\Bigl(\\sum_{i} p_i\\, (Zp)_i^{\\,q-1}\\Bigr)^{\\frac{1}{1-q}},')}
    <p>with the limits ${tex('{}^{1}\\!D^{Z}(p) = \\exp\\bigl(-\\sum_i p_i \\log (Zp)_i\\bigr)')} and
    ${tex('{}^{\\infty}\\!D^{Z}(p) = 1 / \\max_{i:\\,p_i>0} (Zp)_i')}. It is non-increasing in ${tex('q')}:
    small ${tex('q')} counts rare pieces fully, large ${tex('q')} pays attention mainly to the most common kind.</p>
    ${orderSection(c.q)}
    <p>In every case ${tex('1 \\le D \\le n')}, and ${tex('D')} is the <i>effective number of distinct pieces</i>: it is 1 when all pieces are
    identical and ${tex('n')} when they are all completely dissimilar (${tex('Z = I')}).</p>

    <h2>5. From diversity to a rating</h2>
    ${math('x = \\frac{D - 1}{n - 1} \\in [0, 1].')}
    <p>${tex('x')} is then cut at ${c.thresholds.join(', ')}:</p>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Rating</th><th>Normalised diversity</th></tr></thead>
      <tbody>${mappingRows(c)}</tbody>
    </table></div>

    <h2>Ratings of the current puzzles</h2>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Puzzle</th><th>Variant</th><th class="num">${tex('n')}</th><th class="num">${tex('D')}</th><th class="num">${tex('x')}</th><th>Rating</th></tr></thead>
      <tbody>${puzzleRows(index)}</tbody>
    </table></div>`;
}

export async function renderDifficultyPage(root: HTMLElement): Promise<void> {
  document.title = 'Difficulty rating · Tropical Puzzle Lab';
  root.innerHTML = `
    <div class="gallery doc">
      <a class="back" href="${base}">← Gallery</a>
      <header class="intro"><h1>How difficulty is rated</h1></header>
      <div data-doc><p class="loading">Loading…</p></div>
    </div>`;
  const doc = root.querySelector<HTMLElement>('[data-doc]')!;
  try {
    doc.innerHTML = content(await fetchIndex());
  } catch (error) {
    doc.innerHTML = `<p class="error">Could not load the ratings (${escapeHtml(String(error))}).</p>`;
  }
}
