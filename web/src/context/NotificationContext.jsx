import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { playAlertChime, unlockAudio } from '../services/sound.js';

const NotificationContext = createContext(null);

const STORAGE_KEYS = {
  LAST_READ: 'sentinelcatch_last_read',
  SOUND_ENABLED: 'sentinelcatch_sound_enabled',
  DESKTOP_NOTIF: 'sentinelcatch_desktop_notif',
  OFFICER_NAME: 'sentinelcatch_officer_name',
  SECTORS: 'sentinelcatch_sectors',
  LANGUAGE: 'sentinelcatch_language',
};

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected | polling
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());
  
  // Settings in localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) === 'true';
  });
  const [desktopNotifEnabled, setDesktopNotifEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.DESKTOP_NOTIF) === 'true';
  });
  const [officerName, setOfficerName] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.OFFICER_NAME) || '';
  });
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en';
  });

  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pollIntervalRef = useRef(null);
  const lastEventIdRef = useRef(null);

  // Sync unread count
  const recalculateUnread = useCallback((items) => {
    const lastReadStr = localStorage.getItem(STORAGE_KEYS.LAST_READ);
    const lastRead = lastReadStr ? new Date(lastReadStr).getTime() : 0;
    const count = items.filter((n) => new Date(n.created_at).getTime() > lastRead).length;
    setUnreadCount(count);

    // Update document title if backgrounded
    if (document.hidden && count > 0) {
      document.title = `(${count}) SentinelCatch`;
    } else {
      document.title = 'SentinelCatch';
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.LAST_READ, new Date().toISOString());
    setUnreadCount(0);
    document.title = 'SentinelCatch';
  }, []);

  // Add toast
  const addToast = useCallback((notification) => {
    const toastId = notification.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const toast = { ...notification, toastId };

    setToasts((prev) => [toast, ...prev.slice(0, 4)]);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
    }, 8000);
  }, []);

  const removeToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  // Handle incoming notification
  const handleIncomingNotification = useCallback(
    (notif) => {
      setNotifications((prev) => {
        // Prevent duplicate IDs
        if (prev.some((item) => item.id === notif.id)) return prev;
        const updated = [notif, ...prev];
        recalculateUnread(updated);
        return updated;
      });

      // Sound chime if enabled and High band
      if (soundEnabled && (notif.band === 'High' || notif.type === 'system_test')) {
        playAlertChime();
      }

      // High-priority toast banner
      if (notif.band === 'High' || notif.type === 'system_test') {
        addToast(notif);
      }

      // Mobile & Desktop System Notification (Supports ServiceWorker for Android & iOS PWAs)
      if ('Notification' in window && Notification.permission === 'granted') {
        const notifTitle = notif.headline || 'SentinelCatch Alert';
        const notifBody = notif.body?.slice(0, 160) || 'New dark vessel detection in Kenya EEZ';
        const notifOptions = {
          body: notifBody,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `case-${notif.case_id || notif.id}`,
          vibrate: [200, 100, 200],
          data: { url: '/' },
        };

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => {
              reg.showNotification(notifTitle, notifOptions);
            })
            .catch(() => {
              try {
                new Notification(notifTitle, notifOptions);
              } catch {}
            });
        } else {
          try {
            new Notification(notifTitle, notifOptions);
          } catch {}
        }
      }
    },
    [soundEnabled, desktopNotifEnabled, addToast, recalculateUnread]
  );

  // Initial fetch of recent notifications
  const fetchRecentNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=50');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        recalculateUnread(data.notifications || []);
      }
    } catch (err) {
      console.warn('Initial notifications fetch error:', err);
    }
  }, [recalculateUnread]);

  // Connect to SSE Stream
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus('connecting');
    const url = lastEventIdRef.current
      ? `/api/stream?lastEventId=${lastEventIdRef.current}`
      : '/api/stream';

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
      setLastHeartbeat(Date.now());
      // Clear fallback polling if active
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    });

    es.addEventListener('notification', (e) => {
      setLastHeartbeat(Date.now());
      if (e.lastEventId) {
        lastEventIdRef.current = e.lastEventId;
      }
      try {
        const data = JSON.parse(e.data);
        handleIncomingNotification(data);
      } catch (err) {
        console.warn('Malformed notification event:', err);
      }
    });

    es.addEventListener('patrol_dispatch', (e) => {
      setLastHeartbeat(Date.now());
      try {
        const data = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent('sentinelcatch:patrol_dispatch', { detail: data }));
        if (data.broadcastHeadline) {
          addToast({
            id: `pat-${Date.now()}`,
            headline: data.broadcastHeadline,
            body: data.broadcastBody,
            band: 'High',
            type: 'patrol_dispatch',
          });
        }
      } catch (err) {
        console.warn('Malformed patrol dispatch event:', err);
      }
    });

    es.addEventListener('officer_presence', (e) => {
      setLastHeartbeat(Date.now());
      try {
        const data = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent('sentinelcatch:officer_presence', { detail: data }));
      } catch (err) {
        console.warn('Malformed officer presence event:', err);
      }
    });

    es.addEventListener('station_chat_message', (e) => {
      setLastHeartbeat(Date.now());
      try {
        const data = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent('sentinelcatch:station_chat_message', { detail: data }));
      } catch (err) {
        console.warn('Malformed station chat message event:', err);
      }
    });

    es.addEventListener('connected', () => {
      setConnectionStatus('connected');
      setLastHeartbeat(Date.now());
    });

    es.addEventListener('error', () => {
      setConnectionStatus('disconnected');
      es.close();

      // Exponential backoff reconnect: 1s, 2s, 4s, ..., up to 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;

      // Start fallback polling if disconnected for > 15s
      if (reconnectAttemptsRef.current > 3 && !pollIntervalRef.current) {
        setConnectionStatus('polling');
        pollIntervalRef.current = setInterval(fetchRecentNotifications, 30000);
      }

      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
    });
  }, [handleIncomingNotification, fetchRecentNotifications]);

  // Reset tab title on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (unreadCount === 0) {
        document.title = 'SentinelCatch';
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [unreadCount]);

  // Establish SSE connection on mount
  useEffect(() => {
    fetchRecentNotifications();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      clearTimeout(reconnectTimeoutRef.current);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [connectSSE, fetchRecentNotifications]);

  // Sound toggle handler with autoplay unlock
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(next));
      if (next) {
        unlockAudio();
        playAlertChime(); // Play test confirmation chime
      }
      return next;
    });
  }, []);

  // Desktop notification toggle handler
  const toggleDesktopNotif = useCallback(async () => {
    if (!desktopNotifEnabled) {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setDesktopNotifEnabled(true);
          localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIF, 'true');
        } else {
          alert('Notification permission was denied in your browser settings.');
        }
      } else {
        alert('Browser does not support the Notification API.');
      }
    } else {
      setDesktopNotifEnabled(false);
      localStorage.setItem(STORAGE_KEYS.DESKTOP_NOTIF, 'false');
    }
  }, [desktopNotifEnabled]);

  // Trigger system test notification
  const sendSystemTest = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Failed to trigger system test notification:', err);
      throw err;
    }
  }, []);

  const value = {
    notifications,
    unreadCount,
    isDrawerOpen,
    setIsDrawerOpen,
    toasts,
    removeToast,
    connectionStatus,
    soundEnabled,
    toggleSound,
    desktopNotifEnabled,
    toggleDesktopNotif,
    officerName,
    setOfficerName: (name) => {
      setOfficerName(name);
      localStorage.setItem(STORAGE_KEYS.OFFICER_NAME, name);
    },
    language,
    setLanguage: (lang) => {
      setLanguage(lang);
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    },
    toggleLanguage: () => {
      const next = language === 'en' ? 'sw' : 'en';
      setLanguage(next);
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, next);
    },
    markAllAsRead,
    sendSystemTest,
    lastHeartbeat,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

export default NotificationContext;
