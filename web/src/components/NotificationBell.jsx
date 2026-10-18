import { useNotifications } from '../context/NotificationContext.jsx';

export default function NotificationBell() {
  const { unreadCount, isDrawerOpen, setIsDrawerOpen, connectionStatus } = useNotifications();

  return (
    <button
      className={`bell-btn ${unreadCount > 0 ? 'has-unread' : ''} ${isDrawerOpen ? 'active' : ''}`}
      onClick={() => setIsDrawerOpen(!isDrawerOpen)}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      title="Open Alert Drawer"
      id="notification-bell-btn"
    >
      <svg
        className="bell-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      {unreadCount > 0 && (
        <span className="bell-badge" id="unread-count-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* SSE Connection heartbeat indicator */}
      <span
        className={`connection-dot dot-${connectionStatus}`}
        title={`Alert stream: ${connectionStatus}`}
      />
    </button>
  );
}
