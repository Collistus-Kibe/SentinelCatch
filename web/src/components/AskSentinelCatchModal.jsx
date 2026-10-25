import { useState } from 'react';

export default function AskSentinelCatchModal({ isOpen, onClose, onSelectCase }) {
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Hello, Officer. I am **Ask SentinelCatch**, your tactical maritime domain copilot.\n\nAsk me anything about current dark vessel detections, coastal sector statistics, Marine Protected Area incursions, or candidate identity matches.',
      linkedCaseIds: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const quickQuestions = [
    'Which sector had the most dark detections this week?',
    'Are there any vessels operating inside Marine Protected Areas?',
    'Show me the highest threat cases and their suspected identities',
    'What is the recommended patrol route from Mombasa?',
  ];

  const handleSend = async (queryText) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: data.answer || 'Query completed.',
          linkedCaseIds: data.linkedCaseIds || [],
          suggestedFollowUps: data.suggestedFollowUps || [],
          source: data.source,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `⚠️ Query error: ${err.message}. Please check network connection.`,
          linkedCaseIds: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="copilot-icon-wrap" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00f5d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </span>
            <div>
              <h3>Maritime Intelligence Copilot</h3>
              <p className="chat-subhead">
                Tactical read-only domain intelligence querying across live radar, AIS gaps, and RFMO registries
              </p>
            </div>
          </div>
          <button className="btn-intel-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="chat-suggestions-bar">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quick Prompts:</span>
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              className="btn-suggestion-chip"
              onClick={() => handleSend(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div className="chat-messages-area">
          {messages.map((m, idx) => (
            <div key={idx} className={`chat-bubble-row ${m.sender === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
              <div className="chat-bubble">
                <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {m.text}
                </div>

                {/* Clickable Linked Cases */}
                {m.linkedCaseIds && m.linkedCaseIds.length > 0 && (
                  <div className="chat-linked-cases">
                    <span className="linked-label">🎯 Clickable Incident Leads:</span>
                    <div className="linked-pills">
                      {m.linkedCaseIds.map((cId) => (
                        <button
                          key={cId}
                          className="btn-case-pill"
                          onClick={() => {
                            onClose();
                            if (onSelectCase) onSelectCase(cId);
                          }}
                        >
                          Inspect Case #{cId} ➔
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {m.source && (
                  <span className="chat-source-tag">Engine: {m.source}</span>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-bubble-row bubble-assistant">
              <div className="chat-bubble chat-loading">
                <span>Analyzing radar telemetry & querying read-only tools...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          className="chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            type="text"
            className="chat-input-field"
            placeholder="Ask about sectors, dark contacts, MPAs, or patrol options..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            {loading ? '...' : 'Query Intel ➔'}
          </button>
        </form>
      </div>
    </div>
  );
}
