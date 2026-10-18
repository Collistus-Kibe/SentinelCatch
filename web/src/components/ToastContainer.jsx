import { useNotifications } from '../context/NotificationContext.jsx';

export default function ToastContainer() {
  const { toasts, removeToast, setIsDrawerOpen } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="assertive" role="alert">
      {toasts.map((toast) => {
        const isSystemTest = toast.type === 'system_test';
        return (
          <div
            key={toast.toastId}
            className={`toast-card toast-${toast.band?.toLowerCase()} ${isSystemTest ? 'toast-test' : ''}`}
            onClick={() => {
              setIsDrawerOpen(true);
              removeToast(toast.toastId);
            }}
          >
            <div className="toast-icon">
              {isSystemTest ? '⚡' : toast.band === 'High' ? '🚨' : '⚠️'}
            </div>

            <div className="toast-content">
              <div className="toast-header-row">
                <span className="toast-badge">{isSystemTest ? 'System Test' : `${toast.band} Alert`}</span>
                {toast.score && <span className="toast-score">{toast.score}/100</span>}
              </div>
              <h5 className="toast-headline">{toast.headline}</h5>
              {toast.sector && <p className="toast-subtext">📍 {toast.sector}</p>}
            </div>

            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.toastId);
              }}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
