import { useState, useEffect, useRef, useCallback } from 'react';
import { useOfficer } from '../context/OfficerContext.jsx';

/**
 * StationPatrolChat – real-time station-scoped patrol chat.
 * Officers at the same coastal command station share one live channel.
 * Messages are stored in TiDB (via /api/patrol/station/:id/chat) and
 * broadcast in real-time via the SSE `station_chat_message` event.
 */
export default function StationPatrolChat() {
  const { officer } = useOfficer();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const stationId = officer?.stationId;
  const stationName = officer?.stationName || officer?.stationCode || 'Station';

  // Load message history whenever the panel opens or officer changes
  const loadMessages = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/patrol/station/${stationId}/chat`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('StationPatrolChat load error:', err);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    if (open) {
      loadMessages();
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, loadMessages]);

  // Listen for real-time station_chat_message SSE events
  useEffect(() => {
    const handleNew = (ev) => {
      const msg = ev.detail;
      if (!msg || msg.station_id !== stationId) return;
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (!open) setUnread((u) => u + 1);
    };
    window.addEventListener('sentinelcatch:station_chat_message', handleNew);
    return () => window.removeEventListener('sentinelcatch:station_chat_message', handleNew);
  }, [stationId, open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const sendMessage = async () => {
    if (!input.trim() || !stationId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`/api/patrol/station/${stationId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officerId: officer.id,
          officerName: officer.name,
          message: text,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The SSE event will push the message; also reload for certainty
      await loadMessages();
    } catch (err) {
      console.error('StationPatrolChat send error:', err);
      setInput(text); // restore on error
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render at all if officer not signed in
  if (!officer) return null;

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        className={`station-chat-fab ${open ? 'fab-active' : ''}`}
        onClick={() => { setOpen((o) => !o); if (!open) setUnread(0); }}
        title={`${stationName} Patrol Chat`}
        aria-label="Open Station Patrol Chat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unread > 0 && <span className="chat-fab-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {/* Chat Panel */}
      {open && (
        <div className="station-chat-panel" role="dialog" aria-label="Station Patrol Chat">
          {/* Header */}
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              <span className="chat-station-dot" />
              <span>📡 {stationName} — Patrol Channel</span>
            </div>
            <button className="chat-panel-close" onClick={() => setOpen(false)} title="Close">✕</button>
          </div>

          {/* Officer info bar */}
          <div className="chat-officer-bar">
            <span className="chat-you-label">You:</span>
            <span className="chat-officer-name">{officer.name}</span>
            <span className="chat-officer-role">{officer.role || 'Officer'}</span>
          </div>

          {/* Messages */}
          <div className="chat-messages-list" ref={listRef}>
            {loading && (
              <div className="chat-loading-row">Loading patrol channel…</div>
            )}
            {!loading && messages.length === 0 && (
              <div className="chat-empty-state">
                <span>🔭</span>
                <p>No messages yet. Be the first to broadcast on this patrol channel.</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isMine = msg.officer_id === officer.id || msg.officerId === officer.id;
              const name = msg.officer_name || msg.officerName || 'Officer';
              const text = msg.message || msg.text || '';
              const ts = msg.created_at || msg.timestamp;
              const timeStr = ts
                ? new Date(ts).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })
                : '';
              return (
                <div key={msg.id || i} className={`chat-msg-row ${isMine ? 'msg-mine' : 'msg-other'}`}>
                  {!isMine && <div className="chat-msg-sender">{name}</div>}
                  <div className="chat-msg-bubble">
                    <span className="chat-msg-text">{text}</span>
                    {timeStr && <span className="chat-msg-time">{timeStr}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder="Broadcast to station…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              maxLength={500}
              disabled={sending}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              title="Send"
            >
              {sending ? '…' : '➤'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

