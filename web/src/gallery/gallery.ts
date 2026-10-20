// Gallery: one card per puzzle. Thumbnails show the frame and a scrambled layout, never the reference assembly.
import { bounds, transform } from '../geometry/polygon';
import { scramble } from '../geometry/scramble';
import { escapeHtml } from '../player/player';
import { browserStore, loadSession } from '../sessions/session';
import type { Puzzle, PuzzleIndexEntry, Vec2 } from '../types';

const base = import.meta.env.BASE_URL;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}puzzles/${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function thumbnail(puzzle: Puzzle): string {
  const poses = scramble(puzzle, puzzle.scramble.defaultSeed);
  const pieces = puzzle.pieces.map((p, i) => transform(p.polygon, poses[i]));
  const target = puzzle.geometry.target.vertices;
  const box = bounds([...target, ...pieces.flat()]);
  const pad = 6;
  const points = (poly: Vec2[]) => poly.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join(' ');
  return `<svg viewBox="${box.minX - pad} ${-box.maxY - pad} ${box.maxX - box.minX + 2 * pad} ${box.maxY - box.minY + 2 * pad}" role="img" aria-label="Scrambled pieces beside the empty tray">
    <polygon class="thumb-target" points="${points(target)}" />
    ${pieces.map((p) => `<polygon class="thumb-piece" points="${points(p)}" />`).join('')}
  </svg>`;
}

function progress(puzzle: Puzzle): string {
  const loaded = loadSession(puzzle, browserStore());
  if (loaded.status !== 'ok') return '';
  return loaded.session.solvedAt ? '<span class="progress solved">Solved</span>' : '<span class="progress">In progress</span>';
}

export async function renderGallery(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <div class="gallery">
      <header class="intro">
        <h1>Tropical Puzzle Lab</h1>
        <p>Each piece is one region of a tropical polynomial: the maximum of a few affine functions.
        In the relief puzzles a piece's sloped top is its affine function, so a finished assembly forms one continuous, bowl-shaped roof.
        Fill the square tray with every piece. Pieces can be moved and turned, but not flipped, and nothing snaps into place.</p>
      </header>
      <div class="cards" data-cards><p class="loading">Loading puzzles…</p></div>
      <footer class="foot">An experimental tool for studying puzzle construction and difficulty.
        <a href="https://github.com/kuvychko/tropical-puzzle-lab">Source on GitHub</a></footer>
    </div>`;
  const cards = root.querySelector<HTMLElement>('[data-cards]')!;
  try {
    const index = await fetchJson<{ puzzles: PuzzleIndexEntry[] }>('index.json');
    const puzzles = await Promise.all(index.puzzles.map((e) => fetchJson<Puzzle>(e.path)));
    cards.innerHTML = puzzles
      .map((p) => `
        <a class="card" href="${base}?puzzle=${encodeURIComponent(p.id)}">
          ${thumbnail(p)}
          <div class="card-body">
            <h2>${escapeHtml(p.name)} <span class="badge">${p.variant === 'relief' ? 'relief' : 'flat tiling'}</span></h2>
            <p>${escapeHtml(p.description)}</p>
            <p class="meta">${p.pieces.length} pieces · ${escapeHtml(p.id)} rev ${p.revision} ${progress(p)}</p>
          </div>
        </a>`)
      .join('');
  } catch (error) {
    cards.innerHTML = `<p class="error">Could not load the puzzle list (${escapeHtml(String(error))}).</p>`;
  }
}
