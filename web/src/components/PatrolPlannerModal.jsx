import { useState, useEffect } from 'react';

export default function PatrolPlannerModal({ isOpen, onClose, onSelectCase }) {
  const [baseId, setBaseId] = useState('mombasa');
  const [speedKnots, setSpeedKnots] = useState(22);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/patrol/plan?base=${baseId}&speed=${speedKnots}`)
      .then((res) => res.json())
      .then((data) => {
        setPlan(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load patrol plan:', err);
        setLoading(false);
      });
  }, [isOpen, baseId, speedKnots]);

  const handleShareWhatsApp = () => {
    if (!plan || !plan.legs) return;
    const text = [
      `🛡️ SENTINELCATCH PATROL DISPATCH ORDER`,
      `⚓ Base: ${plan.base?.name}`,
      `⚡ Cruising Speed: ${plan.speedKnots} knots | Total Sweep: ${plan.totalDistanceNM} NM (~${plan.totalTravelTimeFormatted})`,
      `---------------------------------------`,
      ...plan.legs.map(
        (leg) =>
          `Leg ${leg.legIndex}: ${leg.from} ➔ ${leg.to}\n  Dist: ${leg.distanceNM} NM | ETA: ${leg.travelTimeFormatted} | Obj: ${leg.objective}`
      ),
      `---------------------------------------`,
      `⚠️ ${plan.disclaimer}`,
    ].join('\n\n');

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handleCopy = () => {
    if (!plan || !plan.legs) return;
    const text = [
      `SENTINELCATCH PATROL DISPATCH ORDER`,
      `Base: ${plan.base?.name}`,
      `Cruising Speed: ${plan.speedKnots} knots | Total Distance: ${plan.totalDistanceNM} NM (~${plan.totalTravelTimeFormatted})`,
      `---------------------------------------`,
      ...plan.legs.map(
        (leg) =>
          `Leg ${leg.legIndex}: ${leg.from} -> ${leg.to} | ${leg.distanceNM} NM (${leg.travelTimeFormatted}) | ${leg.objective}`
      ),
      `---------------------------------------`,
      plan.disclaimer,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div className="patrol-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="patrol-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚓</span>
            <div>
              <h3>Patrol Dispatch Planner</h3>
              <p className="patrol-subhead">
                Actionable route sweep and dispatch priorities for authorized enforcement assets
              </p>
            </div>
          </div>
          <button className="btn-intel-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="patrol-config-bar">
          <div className="patrol-config-item">
            <label>Deployment Base:</label>
            <select value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="mombasa">Mombasa Base (Mtongwe / Kilindini)</option>
              <option value="lamu">Lamu Base (Manda Bay Naval Base)</option>
            </select>
          </div>

          <div className="patrol-config-item">
            <label>Asset Cruising Speed:</label>
            <div className="speed-buttons">
              {[18, 22, 28, 32].map((s) => (
                <button
                  key={s}
                  className={`btn-speed ${speedKnots === s ? 'active' : ''}`}
                  onClick={() => setSpeedKnots(s)}
                >
                  {s} kts
                </button>
              ))}
            </div>
          </div>

          <div className="patrol-actions-right">
            <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied' : '📋 Copy Brief'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleShareWhatsApp}>
              💬 WhatsApp Order
            </button>
          </div>
        </div>

        {/* Disclaimer Callout */}
        <div className="patrol-disclaimer-callout">
          <strong>ℹ️ Illustrative Operational Dispatch:</strong>
          <span> Asset speeds (illustrated at {speedKnots} knots) and target sequences assume standard sea state. Answers the operational question: <em>"So what does the officer do?"</em></span>
        </div>

        {/* Route Summary Stats */}
        {plan && (
          <div className="patrol-stats-row">
            <div className="patrol-stat-card">
              <span className="stat-label">Total Patrol Sweep</span>
              <strong className="stat-val">{plan.totalDistanceNM} NM</strong>
            </div>
            <div className="patrol-stat-card">
              <span className="stat-label">Estimated Transit Time</span>
              <strong className="stat-val" style={{ color: 'var(--accent-cyan)' }}>
                {plan.totalTravelTimeFormatted}
              </strong>
            </div>
            <div className="patrol-stat-card">
              <span className="stat-label">High-Priority Targets</span>
              <strong className="stat-val">{plan.legs.length > 1 ? plan.legs.length - 1 : 0} contacts</strong>
            </div>
            <div className="patrol-stat-card">
              <span className="stat-label">Primary Departure Base</span>
              <strong className="stat-val" style={{ fontSize: '0.85rem' }}>
                {plan.base?.name?.split('(')[0]}
              </strong>
            </div>
          </div>
        )}

        {/* Leg-by-leg Waypoint Table */}
        <div className="patrol-legs-container">
          {loading && <p style={{ padding: '24px', textAlign: 'center' }}>Optimizing patrol sweep route...</p>}

          {!loading && plan && plan.legs && (
            <div className="legs-list">
              <h4>Leg-by-Leg Interception Sweep</h4>
              {plan.legs.map((leg) => (
                <div key={leg.legIndex} className="leg-card">
                  <div className="leg-badge">Leg {leg.legIndex}</div>
                  <div className="leg-body">
                    <div className="leg-title-row">
                      <strong>{leg.to}</strong>
                      <span className="leg-time-tag">⏱️ {leg.travelTimeFormatted} ({leg.distanceNM} NM)</span>
                    </div>
                    <div className="leg-sub">
                      <span>From: {leg.from}</span>
                      <span className="leg-obj">🎯 Objective: {leg.objective}</span>
                    </div>
                  </div>
                  {leg.caseId && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        onClose();
                        if (onSelectCase) onSelectCase(leg.caseId);
                      }}
                    >
                      Inspect Case #{leg.caseId}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
