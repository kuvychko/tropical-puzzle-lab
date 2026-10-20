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

export interface Puzzle {
  formatVersion: 1;
  id: string;
  revision: number;
  name: string;
  description: string;
  variant: 'relief' | 'tiling';
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
  revision: number;
  name: string;
  description: string;
  variant: 'relief' | 'tiling';
  pieceCount: number;
  path: string;
}
