import { useState, useEffect } from 'react';

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone PWA mode
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      // Attempt automatic landscape orientation lock when running as installed PWA
      try {
        if (window.screen?.orientation?.lock) {
          window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch {}
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert(
        'To install SentinelCatch on your phone:\n\n• On iPhone (Safari): Tap the Share button (square with arrow) -> "Add to Home Screen".\n• On Android (Chrome): Tap the 3-dots menu -> "Install app" or "Add to Home screen".'
      );
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  return (
    <button
      type="button"
      className="btn-install-pwa"
      onClick={handleInstallClick}
      title="Install SentinelCatch Web App on your phone or PC with custom icon"
    >
      <span className="pwa-icon">📲</span>
      <span className="pwa-label">Install App</span>
    </button>
  );
}
