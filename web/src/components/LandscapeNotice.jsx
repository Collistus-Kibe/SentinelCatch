import { useState, useEffect } from 'react';

export default function LandscapeNotice() {
  const [isPortraitOnMobile, setIsPortraitOnMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Mobile screen width threshold
      const isMobileSize = window.innerWidth <= 900;
      // Portrait mode check
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitOnMobile(isMobileSize && isPortrait);

      // If switched to landscape, automatically lock or clear dismissed
      if (!isPortrait) {
        try {
          if (window.screen?.orientation?.lock) {
            window.screen.orientation.lock('landscape').catch(() => {});
          }
        } catch {}
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortraitOnMobile || dismissed) return null;

  return (
    <div className="mobile-rotate-overlay">
      <div className="rotate-content-box">
        <div className="rotate-animation-container">
          <div className="phone-device-icon">
            <span className="phone-screen-radar">🛰️</span>
          </div>
          <span className="rotate-indicator-arrow">🔄</span>
        </div>

        <h3 className="rotate-title">Rotate Device Horizontally</h3>
        <p className="rotate-desc">
          SentinelCatch tactical radar, maritime maps, and patrol interception feeds require horizontal widescreen display (landscape mode).
        </p>

        <div className="rotate-action-row">
          <button
            type="button"
            className="btn-rotate-dismiss"
            onClick={() => setDismissed(true)}
          >
            Continue in Portrait anyway
          </button>
        </div>
      </div>
    </div>
  );
}
