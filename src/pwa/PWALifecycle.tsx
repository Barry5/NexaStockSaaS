import { useState, useEffect, useCallback } from 'react';
import { Download, RotateCw, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  registerSW,
  trackInstallPrompt,
  showInstallPrompt,
  skipWaitingAndReload,
  setPWACallbacks,
  getRegistration,
  getPWAStatus,
} from './registerSW';

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function PWALifecycle() {
  const isOnline = useOnlineStatus();
  const [canInstall, setCanInstall] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    registerSW();
    trackInstallPrompt();

    const checkStatus = () => {
      const status = getPWAStatus();
      setCanInstall(status.canInstall);
      setUpdateAvailable(status.isUpdateAvailable);
    };

    setPWACallbacks({
      onUpdate: () => {
        setUpdateAvailable(true);
      },
    });

    const interval = setInterval(checkStatus, 3000);
    checkStatus();

    window.addEventListener('beforeinstallprompt', () => {
      setCanInstall(true);
    });
    window.addEventListener('appinstalled', () => {
      setCanInstall(false);
    });

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isOnline && !offlineDismissed) {
      setShowOfflineBanner(true);
    } else if (isOnline) {
      setShowOfflineBanner(false);
      setOfflineDismissed(false);
    }
  }, [isOnline, offlineDismissed]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    const success = await showInstallPrompt();
    if (success) setCanInstall(false);
    setInstalling(false);
  }, []);

  const handleUpdate = useCallback(() => {
    skipWaitingAndReload();
  }, []);

  return (
    <>
      <AnimatePresence>
        {!isOnline && showOfflineBanner && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600/90 backdrop-blur-md text-white text-[11px] font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-lg"
          >
            <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Mode hors ligne — les données non sauvegardées seront synchronisées automatiquement</span>
            <button
              onClick={() => { setShowOfflineBanner(false); setOfflineDismissed(true); }}
              className="ml-2 text-white/70 hover:text-white transition text-xs underline"
            >
              Masquer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {canInstall && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={handleInstall}
          disabled={installing}
          className="fixed bottom-20 lg:bottom-6 right-4 z-[9999] bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-3.5 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          {installing ? 'Installation...' : 'Installer l\'application'}
        </motion.button>
      )}

      {updateAvailable && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={handleUpdate}
          className="fixed bottom-20 lg:bottom-6 right-4 z-[9999] bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition"
        >
          <RotateCw className="w-4 h-4" />
          Mise à jour disponible — Actualiser
        </motion.button>
      )}
    </>
  );
}
