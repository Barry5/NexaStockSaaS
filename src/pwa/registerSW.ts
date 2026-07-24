/// <reference lib="webworker" />

let swRegistration: ServiceWorkerRegistration | null = null;
let installPromptEvent: Event | null = null;

export type PWAStatus = {
  canInstall: boolean;
  isUpdateAvailable: boolean;
  isOfflineReady: boolean;
  registration: ServiceWorkerRegistration | null;
};

export type PWAUpdateCallback = (reg: ServiceWorkerRegistration) => void;
type PWACallbacks = { onUpdate: PWAUpdateCallback | null; onOfflineReady: (() => void) | null };

const callbacks: PWACallbacks = { onUpdate: null, onOfflineReady: null };

export function setPWACallbacks(cbs: Partial<PWACallbacks>): void {
  if (cbs.onUpdate) callbacks.onUpdate = cbs.onUpdate;
  if (cbs.onOfflineReady) callbacks.onOfflineReady = cbs.onOfflineReady;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker non supporté par ce navigateur.');
    return null;
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[PWA] Mode développement — enregistrement SW ignoré.');
    return null;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    return swRegistration;
  } catch (err) {
    console.error('[PWA] Échec enregistrement Service Worker:', err);
    return null;
  }
}

export function trackInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
  });

  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    console.log('[PWA] Application installée avec succès.');
  });
}

export function getInstallPrompt(): Event | null {
  return installPromptEvent;
}

export async function showInstallPrompt(): Promise<boolean> {
  if (!installPromptEvent) return false;
  const prompt = installPromptEvent as any;
  await prompt.prompt();
  const result = await prompt.userChoice;
  if (result.outcome === 'accepted') {
    installPromptEvent = null;
    return true;
  }
  return false;
}

export function getRegistration(): ServiceWorkerRegistration | null {
  return swRegistration;
}

export function getPWAStatus(): PWAStatus {
  return {
    canInstall: installPromptEvent !== null,
    isUpdateAvailable: !!swRegistration?.waiting,
    isOfflineReady: swRegistration?.active !== undefined,
    registration: swRegistration,
  };
}

export async function skipWaitingAndReload(): Promise<void> {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    swRegistration.waiting.addEventListener('statechange', (e) => {
      if ((e.target as any)?.state === 'activated') {
        window.location.reload();
      }
    });
  }
}

export function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return Promise.resolve(false);
  if (Notification.permission === 'granted') return Promise.resolve(true);
  if (Notification.permission === 'denied') {
    console.warn('[PWA] Permission notifications refusée.');
    return Promise.resolve(false);
  }
  return Notification.requestPermission().then(p => p === 'granted');
}

export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      ...options,
    });
  } catch (e) {
    console.warn('[PWA] Notification locale échouée:', e);
  }
}
