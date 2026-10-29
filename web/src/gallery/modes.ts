// The variants of one construction are shown as modes of one puzzle. Each mode keeps its own
// session: switching only links to the other variant and never carries poses across.
import type { PuzzleIndex, PuzzleIndexEntry, Variant } from '../types';

const base = import.meta.env.BASE_URL;

export const MODES: [Variant, string][] = [['relief', 'Relief'], ['tiling', 'Flat']];

export type Modes = Partial<Record<Variant, PuzzleIndexEntry>>;

/** Index entries grouped by construction, in index order. */
export function constructions(index: PuzzleIndex): Modes[] {
  const groups = new Map<string, Modes>();
  for (const entry of index.puzzles) {
    const modes = groups.get(entry.construction) ?? {};
    modes[entry.variant] = entry;
    groups.set(entry.construction, modes);
  }
  return [...groups.values()];
}

export function puzzleHref(id: string): string {
  return `${base}?puzzle=${encodeURIComponent(id)}`;
}

/** The player's Relief | Flat switch. With a single mode it is just a label. */
export function modeSwitchHtml(modes: Modes, current: Variant): string {
  return `<nav class="modes" aria-label="Mode">${MODES.filter(([v]) => modes[v])
    .map(([v, label]) => (v === current
      ? `<a aria-current="page" href="${puzzleHref(modes[v]!.id)}">${label}</a>`
      : `<a href="${puzzleHref(modes[v]!.id)}" title="Switch to ${label.toLowerCase()} (its own saved progress)">${label}</a>`))
    .join('')}</nav>`;
}
