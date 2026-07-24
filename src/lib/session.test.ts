import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, saveSession } from './session';

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as Storage;
}

describe('session helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  it('returns a default session when nothing is stored', () => {
    expect(loadSession()).toEqual({ isLoggedIn: false, activeTenantId: '', activeUserId: '' });
  });

  it('persists and restores a logged-in session', () => {
    const session = { isLoggedIn: true, activeTenantId: 'tenant-1', activeUserId: 'user-1' };
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });
});
