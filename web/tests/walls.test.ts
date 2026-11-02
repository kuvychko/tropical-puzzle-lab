import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { transform } from '../src/geometry/polygon';
import { matchingWalls, WALL_MATCH_STOPS_MM, wallHeights } from '../src/geometry/walls';
import type { Puzzle, Vec2 } from '../src/types';

const load = (id: string): Puzzle => JSON.parse(readFileSync(new URL(`../../puzzles/${id}/puzzle.json`, import.meta.url), 'utf-8'));
const RELIEF = ['new1', 'new2', 'new3', 'new4', 'rat1', 'rat2', 'rev2'].map(load);
const close = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;

/** Pairs of walls that coincide in the reference assembly. Only tests may look at `reference`. */
function neighbours(puzzle: Puzzle): { piece: number; wall: number; other: number; otherWall: number }[] {
  const placed = puzzle.pieces.map((p, i) => transform(p.polygon, puzzle.reference.poses[i]));
  const found = [];
  for (let a = 0; a < placed.length; a++) {
    for (let k = 0; k < placed[a].length; k++) {
      const start = placed[a][k];
      const end = placed[a][(k + 1) % placed[a].length];
      for (let b = 0; b < placed.length; b++) {
        if (a === b) continue;
        for (let m = 0; m < placed[b].length; m++) {
          if (close(start, placed[b][(m + 1) % placed[b].length]) && close(end, placed[b][m])) found.push({ piece: a, wall: k, other: b, otherWall: m });
        }
      }
    }
  }
  return found;
}

const allWalls = (puzzle: Puzzle) => puzzle.pieces.flatMap((p, piece) => p.polygon.map((_, wall) => ({ piece, wall })));

describe('wall match', () => {
  it('reads the height at each end of a wall', () => {
    const piece = { id: 'P', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] as Vec2[], roof: { z0: 5, gx: 1, gy: 0 } };
    expect(wallHeights(piece, 0)).toEqual([5, 15]);
    expect(wallHeights(piece, 3)).toEqual([5, 5]);
  });

  it.each(RELIEF.map((p) => [p.id, p] as const))('always offers the true neighbour in %s', (_, puzzle) => {
    const pairs = neighbours(puzzle);
    expect(pairs.length).toBeGreaterThan(0);
    for (const mm of WALL_MATCH_STOPS_MM) {
      for (const { piece, wall, other, otherWall } of pairs) {
        expect(matchingWalls(puzzle, piece, wall, mm)).toContainEqual({ piece: other, wall: otherWall });
      }
    }
  });

  it('never offers a wall of the same piece', () => {
    for (const puzzle of RELIEF) {
      for (const { piece, wall } of allWalls(puzzle)) {
        expect(matchingWalls(puzzle, piece, wall, 5).every((c) => c.piece !== piece)).toBe(true);
      }
    }
  });

  it('only narrows as the tolerance tightens', () => {
    const puzzle = load('new2');
    for (const { piece, wall } of allWalls(puzzle)) {
      for (let s = 1; s < WALL_MATCH_STOPS_MM.length; s++) {
        const loose = matchingWalls(puzzle, piece, wall, WALL_MATCH_STOPS_MM[s - 1]);
        for (const c of matchingWalls(puzzle, piece, wall, WALL_MATCH_STOPS_MM[s])) expect(loose).toContainEqual(c);
      }
    }
  });

  it('does not use the reference solution', () => {
    const puzzle = load('new2');
    const blind = { ...puzzle, reference: undefined } as unknown as Puzzle;
    for (const { piece, wall } of allWalls(puzzle)) {
      expect(matchingWalls(blind, piece, wall, 2)).toEqual(matchingWalls(puzzle, piece, wall, 2));
    }
  });

  it('gives the documented strength on new2', () => {
    const puzzle = load('new2');
    const interior = neighbours(puzzle);
    const meanPieces = (mm: number) =>
      interior.reduce((sum, { piece, wall }) => sum + new Set(matchingWalls(puzzle, piece, wall, mm).map((c) => c.piece)).size, 0) / interior.length;
    expect(meanPieces(5)).toBeCloseTo(7.52, 1);
    expect(meanPieces(2)).toBeCloseTo(3.53, 1);
    expect(meanPieces(1)).toBeCloseTo(1.58, 1);
    expect(meanPieces(0.25)).toBeCloseTo(1.03, 1);
  });
});
