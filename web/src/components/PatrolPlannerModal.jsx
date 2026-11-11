import { useState, useEffect } from 'react';
import { useOfficer } from '../context/OfficerContext.jsx';

export default function PatrolPlannerModal({ isOpen, onClose, onSelectCase }) {
  const { officer, dispatchPatrol } = useOfficer();
  const [baseId, setBaseId] = useState('mombasa');
  const [assetId, setAssetId] = useState('kcgs_doria');
  const [speedKnots, setSpeedKnots] = useState(22);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  // Sync speed when asset changes
  const handleAssetChange = (newAssetId) => {
    setAssetId(newAssetId);
    if (newAssetId === 'kcgs_doria') setSpeedKnots(22);
    else if (newAssetId === 'kns_shujaa') setSpeedKnots(28);
    else if (newAssetId === 'fast_interceptor') setSpeedKnots(30);
    else if (newAssetId === 'coastal_patrol') setSpeedKnots(20);
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/patrol/plan?base=${baseId}&speed=${speedKnots}&asset=${assetId}`)
      .then((res) => res.json())
      .then((data) => {
        setPlan(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load patrol plan:', err);
        setLoading(false);
      });
  }, [isOpen, baseId, speedKnots, assetId]);

  const handleShareWhatsApp = () => {
    if (!plan || !plan.legs) return;
    const text = [
      `🛡️ SENTINELCATCH PATROL DISPATCH ORDER`,
      `⚓ Base: ${plan.base?.name}`,
      `🚢 Operational Asset: ${plan.asset?.name} (${plan.speedKnots} kts cruise)`,
      `⚡ Total Sweep: ${plan.totalDistanceNM} NM (~${plan.totalTravelTimeFormatted}) | Fuel Est: ~${plan.estimatedFuelLiters} L`,
      `🌊 Sea State: ${plan.seaStateAssessment}`,
      `📜 Legal Authority: ${plan.statutoryAuthority}`,
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
      `SENTINELCATCH NAVAL & COAST GUARD PATROL DISPATCH ORDER`,
      `Deployment Base: ${plan.base?.name}`,
      `Interception Asset: ${plan.asset?.name}`,
      `Cruising Speed: ${plan.speedKnots} knots | Total Distance: ${plan.totalDistanceNM} NM (~${plan.totalTravelTimeFormatted})`,
      `Fuel Consumption Estimate: ~${plan.estimatedFuelLiters} Liters MGO`,
      `Sea State & Swell: ${plan.seaStateAssessment}`,
      `Statutory Authority: ${plan.statutoryAuthority}`,
      `---------------------------------------`,
      ...plan.legs.map(
        (leg) =>
          `Leg ${leg.legIndex}: ${leg.from} -> ${leg.to} | ${leg.distanceNM} NM (${leg.travelTimeFormatted}) | ${leg.objective}`
      ),
      `---------------------------------------`,
      `BOARDING INSPECTION PROTOCOL:`,
      ...(plan.boardingChecklist || []),
      `---------------------------------------`,
      plan.disclaimer,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDeployToStation = async () => {
    if (!plan) return;
    setDeploying(true);
    try {
      await dispatchPatrol({
        assetId: plan.asset?.id || assetId,
        assetName: plan.asset?.name || 'Patrol Interceptor',
        targetVesselName: plan.legs?.[0]?.to || 'Coastal Surveillance Sweep',
        targetCoords: `${plan.base?.lat?.toFixed(4) || '4.0000'}°S, ${plan.base?.lon?.toFixed(4) || '39.7000'}°E`,
        totalDistanceNM: plan.totalDistanceNM,
        estimatedFuelLiters: plan.estimatedFuelLiters,
        etaFormatted: plan.totalTravelTimeFormatted,
        speedKnots: plan.speedKnots,
        legs: plan.legs || [],
        notes: `Sea condition: ${plan.seaStateAssessment || 'Moderate'}. Boarding mandate: ${plan.statutoryAuthority || 'FMDA 2016'}`,
      });
      setDeployed(true);
      setTimeout(() => setDeployed(false), 5000);
    } catch (err) {
      alert(`Station Patrol Dispatch failed: ${err.message}`);
    } finally {
      setDeploying(false);
    }
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
              <h3>Coastal Patrol Dispatch Planner</h3>
              <p className="patrol-subhead">
                Actionable route sweep, fuel estimates, and statutory boarding checklists for Kenya Coast Guard Service & Kenya Navy
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
              <option value="mombasa">Mombasa Base (KCGS HQ / Mtongwe)</option>
              <option value="lamu">Lamu Base (Manda Bay / Lamu Port)</option>
              <option value="shimoni">Shimoni Marine Station (Kisite / TZ Border)</option>
              <option value="malindi">Malindi Protection Base (Ungwana Bay)</option>
            </select>
          </div>

          <div className="patrol-config-item">
            <label>Patrol Asset:</label>
            <select value={assetId} onChange={(e) => handleAssetChange(e.target.value)}>
              <option value="kcgs_doria">KCGS Doria (OPV 54m - Flagship)</option>
              <option value="kns_shujaa">KNS Shujaa (Navy Combat Patrol)</option>
              <option value="fast_interceptor">Fast Interceptor Craft (FIC 12m)</option>
              <option value="coastal_patrol">Coastal Patrol Boat (PB 24m)</option>
            </select>
          </div>

          <div className="patrol-config-item">
            <label>Cruising Speed:</label>
            <div className="speed-buttons">
              {[18, 20, 22, 28, 32].map((s) => (
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
            <button
              className="btn btn-sm btn-station-broadcast"
              onClick={handleDeployToStation}
              disabled={deploying || !officer}
              title={officer ? `Broadcast dispatch order to ${officer.stationName}` : 'Sign in as an officer to broadcast'}
              style={{
                background: deployed ? '#059669' : 'linear-gradient(135deg, #059669, #10b981)',
                border: '1px solid #34d399',
                color: '#fff',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: (deploying || !officer) ? 'not-allowed' : 'pointer',
                opacity: (deploying || !officer) ? 0.6 : 1,
              }}
            >
              {deploying ? 'Deploying...' : deployed ? '✓ Dispatched to Station' : '⚡ Broadcast to Station'}
            </button>
          </div>
        </div>

        {/* Tactical Summary Bar */}
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
              <span className="stat-label">Fuel Consumption Est.</span>
              <strong className="stat-val" style={{ color: '#38bdf8' }}>
                ~{plan.estimatedFuelLiters} L (MGO)
              </strong>
            </div>
            <div className="patrol-stat-card">
              <span className="stat-label">High-Priority Intercepts</span>
              <strong className="stat-val" style={{ color: '#ef4444' }}>
                {plan.legs.length > 1 ? plan.legs.length - 1 : 0} contacts
              </strong>
            </div>
          </div>
        )}

        {/* Operational Context Callout */}
        {plan && (
          <div className="patrol-operational-intel-box">
            <div className="patrol-intel-col">
              <span className="intel-pill-header">🌊 SEA STATE & METEOROLOGICAL COND.</span>
              <p className="intel-box-text">{plan.seaStateAssessment}</p>
            </div>
            <div className="patrol-intel-col">
              <span className="intel-pill-header">📜 STATUTORY BOARDING MANDATE</span>
              <p className="intel-box-text">{plan.statutoryAuthority}</p>
            </div>
          </div>
        )}

        {/* Leg-by-leg Waypoint Table */}
        <div className="patrol-legs-container">
          {loading && <p style={{ padding: '24px', textAlign: 'center' }}>Optimizing tactical interception sweep...</p>}

          {!loading && plan && plan.legs && (
            <div className="legs-list">
              <h4>Sequential Interception Legs</h4>
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

          {/* Statutory Boarding Checklist */}
          {plan && plan.boardingChecklist && (
            <div className="patrol-checklist-section">
              <h5>🛡️ Authorized Officer Boarding & Inspection Checklist (FMDA 2016)</h5>
              <div className="checklist-items-grid">
                {plan.boardingChecklist.map((item, i) => (
                  <div key={i} className="checklist-item-pill">
                    <span className="check-bullet">☑</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
