// Mirrors docs/puzzle-format.md (formatVersion 1).

export type Vec2 = [number, number];

export interface Roof {
  /** Height above the underside at the piece origin, mm. */
  z0: number;
  gx: number;
  gy: number;
}

export interface PieceDef {
  id: string;
  /** Convex, counter-clockwise, in mm relative to the piece origin. */
  polygon: Vec2[];
  roof?: Roof;
  thickness?: number;
}

export interface Pose {
  id: string;
  x: number;
  y: number;
  /** Counter-clockwise rotation about the vertical axis, radians. */
  theta: number;
}

export interface Validation {
  contactNoise: number;
  overlapDepth: number;
  outsideDepth: number;
  areaError: number;
  roofMismatch?: number;
  edgeAngleDeg: number;
  edgeMinOverlap: number;
}

export type Variant = 'relief' | 'tiling';

export interface Puzzle {
  formatVersion: 1;
  id: string;
  revision: number;
  name: string;
  description: string;
  variant: Variant;
  geometry: {
    model: 'planar';
    units: 'mm';
    spanMm: number;
    target: { type: 'polygon'; vertices: Vec2[] };
    reliefMm?: number;
    minThicknessMm?: number;
    trayRimMm: number;
  };
  pieces: PieceDef[];
  reference: { poses: Pose[] };
  rules: { translate: boolean; rotate: 'continuous-z'; flip: boolean; snap: boolean };
  validation: Validation;
  scramble: { algorithm: 'v1'; defaultSeed: number };
  provenance: Record<string, unknown>;
  geometryHash: string;
}

export interface PuzzleIndexEntry {
  id: string;
  /** Recipe id; the variants of one construction share footprints and are shown as modes of one puzzle. */
  construction: string;
  revision: number;
  name: string;
  description: string;
  variant: Variant;
  pieceCount: number;
  path: string;
  difficulty: DifficultyRating;
}

/** Precomputed by the generator (`tropical_puzzle_lab/difficulty.py`). */
export interface DifficultyRating {
  /** Leinster–Cobbold diversity D of the pieces, in [1, n]. */
  diversity: number;
  /** (D − 1) / (n − 1), in [0, 1]. */
  x: number;
  /** 1 (easiest) to 5 (hardest). */
  rating: number;
}

/** The rating parameters, copied from the generator's single configuration block. */
export interface DifficultyConfig {
  method: string;
  u: number;
  /** Order of the Leinster–Cobbold diversity. */
  q: number | 'infinity';
  direction: 'lower-diversity-is-harder' | 'higher-diversity-is-harder';
  /** Four increasing cut points on x. */
  thresholds: number[];
}

export interface PuzzleIndex {
  formatVersion: 1;
  difficulty: DifficultyConfig;
  puzzles: PuzzleIndexEntry[];
}
