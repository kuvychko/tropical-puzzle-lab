import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scramble } from '../src/geometry/scramble';
import { type KeyValueStore, loadSession, newSession, pushUndo, redo, saveSession, storageKey, undo } from '../src/sessions/session';
import type { Puzzle } from '../src/types';

const rev2: Puzzle = JSON.parse(readFileSync(new URL('../../puzzles/rev2/puzzle.json', import.meta.url), 'utf-8'));

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('sessions', () => {
  it('round-trips poses, history and seed', () => {
    const store = memoryStore();
    const s = newSession(rev2, 7, scramble(rev2, 7));
    pushUndo(s);
    s.poses[0].x += 10;
    saveSession(s, store);
    const loaded = loadSession(rev2, store);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.session.poses).toEqual(s.poses);
      expect(loaded.session.seed).toBe(7);
      expect(undo(loaded.session)).toBe(true);
      expect(loaded.session.poses[0].x).toBeCloseTo(s.poses[0].x - 10);
      expect(redo(loaded.session)).toBe(true);
      expect(loaded.session.poses[0].x).toBeCloseTo(s.poses[0].x);
    }
  });

  it('rejects a session saved for different geometry', () => {
    const store = memoryStore();
    saveSession(newSession(rev2, 7, scramble(rev2, 7)), store);
    expect(loadSession({ ...rev2, geometryHash: 'changed' }, store).status).toBe('incompatible');
    expect(loadSession({ ...rev2, revision: rev2.revision + 1 }, store).status).toBe('incompatible');
  });

  it('rejects corrupt data and tolerates missing or failing storage', () => {
    const store = memoryStore();
    store.setItem(storageKey(rev2.id), '{not json');
    expect(loadSession(rev2, store).status).toBe('incompatible');
    expect(loadSession(rev2, null).status).toBe('none');
    const failing: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadSession(rev2, failing).status).toBe('none');
    expect(saveSession(newSession(rev2, 1, scramble(rev2, 1)), failing)).toBe(false);
  });
});
