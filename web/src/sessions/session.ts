// Browser-local sessions: poses, history, seed and timer for one puzzle.
import type { Pose, Puzzle } from '../types';
import { SCRAMBLE_VERSION } from '../geometry/scramble';

export const SESSION_VERSION = 1;
const HISTORY_LIMIT = 200;

export interface Session {
  version: number;
  puzzleId: string;
  revision: number;
  geometryHash: string;
  seed: number;
  scrambleVersion: string;
  poses: Pose[];
  undo: Pose[][];
  redo: Pose[][];
  revealed: boolean;
  /** Optional sticky-edges assist (off by default) and how many times it moved a piece. */
  stickyEdges: boolean;
  snaps: number;
  elapsedMs: number;
  solvedAt: string | null;
}

/** The subset of the Web Storage API sessions use; injectable for tests. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function storageKey(puzzleId: string): string {
  return `tpl:session:${puzzleId}`;
}

export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function newSession(puzzle: Puzzle, seed: number, poses: Pose[], revealed = false, stickyEdges = false): Session {
  return {
    version: SESSION_VERSION,
    puzzleId: puzzle.id,
    revision: puzzle.revision,
    geometryHash: puzzle.geometryHash,
    seed,
    scrambleVersion: SCRAMBLE_VERSION,
    poses,
    undo: [],
    redo: [],
    revealed,
    stickyEdges,
    snaps: 0,
    elapsedMs: 0,
    solvedAt: null,
  };
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'incompatible' }
  | { status: 'ok'; session: Session };

function validPoses(poses: unknown, puzzle: Puzzle): poses is Pose[] {
  return (
    Array.isArray(poses) &&
    poses.length === puzzle.pieces.length &&
    poses.every((p, i) => p && p.id === puzzle.pieces[i].id && [p.x, p.y, p.theta].every(Number.isFinite))
  );
}

export function loadSession(puzzle: Puzzle, store: KeyValueStore | null): LoadResult {
  let text: string | null = null;
  try {
    text = store?.getItem(storageKey(puzzle.id)) ?? null;
  } catch {
    return { status: 'none' };
  }
  if (!text) return { status: 'none' };
  let s: Session;
  try {
    s = JSON.parse(text);
  } catch {
    return { status: 'incompatible' };
  }
  const compatible =
    s?.version === SESSION_VERSION &&
    s.puzzleId === puzzle.id &&
    s.revision === puzzle.revision &&
    s.geometryHash === puzzle.geometryHash &&
    s.scrambleVersion === SCRAMBLE_VERSION &&
    validPoses(s.poses, puzzle) &&
    Array.isArray(s.undo) &&
    Array.isArray(s.redo);
  if (!compatible) return { status: 'incompatible' };
  // Fields added after the first release default to "assist not used".
  s.stickyEdges = s.stickyEdges === true;
  s.snaps = Number.isInteger(s.snaps) && s.snaps > 0 ? s.snaps : 0;
  s.undo = s.undo.filter((p) => validPoses(p, puzzle));
  s.redo = s.redo.filter((p) => validPoses(p, puzzle));
  return { status: 'ok', session: s };
}

export function saveSession(session: Session, store: KeyValueStore | null): boolean {
  try {
    store?.setItem(storageKey(session.puzzleId), JSON.stringify(session));
    return !!store;
  } catch {
    return false;
  }
}

export function clearSession(puzzleId: string, store: KeyValueStore | null): void {
  try {
    store?.removeItem(storageKey(puzzleId));
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

const clone = (poses: Pose[]): Pose[] => poses.map((p) => ({ ...p }));

/** Record the state before a change. */
export function pushUndo(session: Session): void {
  session.undo.push(clone(session.poses));
  if (session.undo.length > HISTORY_LIMIT) session.undo.shift();
  session.redo = [];
}

export function undo(session: Session): boolean {
  const previous = session.undo.pop();
  if (!previous) return false;
  session.redo.push(clone(session.poses));
  session.poses = previous;
  return true;
}

export function redo(session: Session): boolean {
  const next = session.redo.pop();
  if (!next) return false;
  session.undo.push(clone(session.poses));
  session.poses = next;
  return true;
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** One line a collaborator can paste into a note to identify an attempt. */
export function report(puzzle: Puzzle, session: Session, solved: boolean): string {
  return [
    `puzzle=${puzzle.id}`,
    `rev=${puzzle.revision}`,
    `seed=${session.seed}`,
    `scramble=${session.scrambleVersion}`,
    `solved=${solved ? 'yes' : 'no'}`,
    `time=${formatTime(session.elapsedMs)}`,
    `revealed=${session.revealed ? 'yes' : 'no'}`,
    `assist=${session.snaps ? `sticky-edges(${session.snaps})` : 'none'}`,
    `geometry=${puzzle.geometryHash.slice(0, 12)}`,
  ].join(' ');
}
