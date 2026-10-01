import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

function isStandalone() {
  return (
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true) // iOS Safari
  );
}

// Captures the browser's install prompt so we can surface our own
// "Install THE 100" banner/button and trigger the native prompt on demand.
export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      // Report the install moment so the admin "Installed" count updates as soon
      // as a user installs (not only when they next open it standalone).
      api.post('/api/session/installed').catch(() => {});
    };

    if (isStandalone()) {
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canInstall = !!deferredPrompt && !isInstalled;

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    return true;
  }, [deferredPrompt]);

  return { canInstall, isInstalled, install };
}