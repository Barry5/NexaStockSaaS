const SESSION_KEY = 'nexastock_session';

export interface StoredSession {
  isLoggedIn: boolean;
  activeTenantId: string;
  activeUserId: string;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

function getDefaultSession(): StoredSession {
  return { isLoggedIn: false, activeTenantId: '', activeUserId: '' };
}

export function loadSession(): StoredSession {
  const storage = getStorage();
  if (!storage) return getDefaultSession();

  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSession;
      if (parsed && parsed.isLoggedIn) return parsed;
    }
  } catch {
    // Ignore invalid cached session data.
  }
  return getDefaultSession();
}

export function saveSession(session: StoredSession) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures.
  }
}
