import { useState } from 'react';
import { useNotifications } from '../context/NotificationContext.jsx';

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationDrawer() {
  const {
    notifications,
    unreadCount,
    isDrawerOpen,
    setIsDrawerOpen,
    markAllAsRead,
    sendSystemTest,
    soundEnabled,
    toggleSound,
    desktopNotifEnabled,
    toggleDesktopNotif,
    connectionStatus,
  } = useNotifications();

  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  if (!isDrawerOpen) return null;

  const handleTestAlert = async () => {
    setTesting(true);
    setTestSuccess(false);
    try {
      await sendSystemTest();
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 4000);
    } catch (err) {
      alert(`Test notification failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
      <aside
        className="notification-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Alerts and Notifications"
      >
        <header className="drawer-header">
          <div className="drawer-title-group">
            <h3>Tactical Alerts</h3>
            {unreadCount > 0 && <span className="badge badge-high">{unreadCount} unread</span>}
          </div>
          <button
            className="drawer-close-btn"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close alert drawer"
          >
            ✕
          </button>
        </header>

        {/* Drawer Controls Bar */}
        <div className="drawer-controls">
          <div className="stream-status-pill">
            <span className={`status-dot dot-${connectionStatus}`} />
            <span className="stream-status-text">
              {connectionStatus === 'connected' ? 'SSE Live Stream Active' : connectionStatus}
            </span>
          </div>

          <div className="drawer-actions-row">
            {unreadCount > 0 && (
              <button className="btn-sm btn-ghost" onClick={markAllAsRead}>
                ✓ Mark all read
              </button>
            )}

            <button
              className={`btn-sm ${soundEnabled ? 'btn-active' : 'btn-ghost'}`}
              onClick={toggleSound}
              title="Toggle Alert Chime Sound"
            >
              {soundEnabled ? '🔔 Sound On' : '🔕 Sound Off'}
            </button>

            <button
              className={`btn-sm ${desktopNotifEnabled ? 'btn-active' : 'btn-ghost'}`}
              onClick={toggleDesktopNotif}
              title="Toggle Browser Desktop Alerts"
            >
              🖥️ Desktop
            </button>
          </div>

          {/* System Test Trigger */}
          <div className="test-trigger-box">
            <button
              className="btn btn-secondary btn-full"
              onClick={handleTestAlert}
              disabled={testing}
              id="send-system-test-btn"
            >
              {testing ? 'Broadcasting test...' : '⚡ Send System Test Notification'}
            </button>
            {testSuccess && (
              <p className="test-success-msg">✓ System test alert broadcast across SSE stream!</p>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="drawer-list">
          {notifications.length === 0 ? (
            <div className="drawer-empty-state">
              <span className="empty-icon">🛡️</span>
              <p className="empty-title">No notifications yet</p>
              <p className="empty-subtitle">
                Suspicious radar detections and vessel anomalies will alert here in real time.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isHigh = notif.band === 'High';
              const isSystemTest = notif.type === 'system_test';
              const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(notif.body || notif.headline)}`;

              return (
                <article
                  key={notif.id}
                  className={`notif-card notif-${notif.band?.toLowerCase()} ${isSystemTest ? 'notif-system-test' : ''}`}
                >
                  <div className="notif-header">
                    <span className={`badge badge-${notif.band?.toLowerCase()}`}>
                      {isHigh ? '🚨 High' : notif.band === 'Medium' ? '⚠️ Medium' : 'ℹ️ Low'}
                      {notif.score ? ` • ${notif.score}` : ''}
                    </span>

                    {isSystemTest && <span className="badge badge-stage">System Test</span>}

                    <span className="notif-time">{timeAgo(notif.created_at)}</span>
                  </div>

                  <h4 className="notif-headline">{notif.headline}</h4>

                  {notif.sector && (
                    <div className="notif-meta">
                      <span className="notif-sector">📍 Sector: {notif.sector}</span>
                      {notif.broadcast_latency_ms !== null && notif.broadcast_latency_ms !== undefined && (
                        <span className="notif-latency">⚡ {notif.broadcast_latency_ms}ms</span>
                      )}
                    </div>
                  )}

                  <p className="notif-body-preview">{notif.body?.slice(0, 160)}...</p>

                  <div className="notif-actions">
                    <button
                      className="btn-action"
                      onClick={() => handleCopy(notif.body, notif.id)}
                    >
                      {copiedId === notif.id ? '✓ Copied' : '📋 Copy Brief'}
                    </button>

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-action btn-whatsapp"
                    >
                      💬 WhatsApp
                    </a>

                    {notif.case_id && (
                      <a href={`/case/${notif.case_id}`} className="btn-action btn-inspect">
                        🔍 Inspect
                      </a>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
