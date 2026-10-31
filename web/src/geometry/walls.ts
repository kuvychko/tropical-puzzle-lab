// Optional "wall match" assist: which walls of other pieces could stand against a given
// side wall. It reads only the shapes of the pieces, as someone holding two printed pieces
// together would, so it takes no poses and never looks at the reference solution.
import type { PieceDef, Puzzle } from '../types';

/** Height tolerances offered to the player, mm, from a mild hint to nearly a solver. */
export const WALL_MATCH_STOPS_MM = [5, 3, 2, 1, 0.5, 0.25] as const;
export const DEFAULT_WALL_MATCH_MM = 2;

/** Wall k runs from polygon vertex k to the next one. */
export interface WallRef {
  piece: number;
  wall: number;
}

function topAt(piece: PieceDef, k: number): number {
  const [u, v] = piece.polygon[k];
  return piece.roof ? piece.roof.z0 + piece.roof.gx * u + piece.roof.gy * v : piece.thickness ?? 0;
}

/** Heights of the wall's top edge at its start and end, mm above the underside. */
export function wallHeights(piece: PieceDef, wall: number): [number, number] {
  return [topAt(piece, wall), topAt(piece, (wall + 1) % piece.polygon.length)];
}

/**
 * Walls of other pieces whose top edge agrees with this wall's at both ends, within tolMm.
 * Polygons are counter-clockwise, so neighbouring walls run in opposite directions: the
 * start of one meets the end of the other. Turning a piece about z leaves these heights
 * unchanged, so the answer does not depend on where the pieces are.
 */
export function matchingWalls(puzzle: Puzzle, pieceIndex: number, wall: number, tolMm: number): WallRef[] {
  const [start, end] = wallHeights(puzzle.pieces[pieceIndex], wall);
  const found: WallRef[] = [];
  puzzle.pieces.forEach((piece, i) => {
    if (i === pieceIndex) return;
    piece.polygon.forEach((_, k) => {
      const [otherStart, otherEnd] = wallHeights(piece, k);
      if (Math.abs(start - otherEnd) <= tolMm && Math.abs(end - otherStart) <= tolMm) found.push({ piece: i, wall: k });
    });
  });
  return found;
}
