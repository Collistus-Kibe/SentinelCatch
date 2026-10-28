import { useState } from 'react';
import { getTranslation } from '../services/i18n.js';
import EvidenceDossierModal from './EvidenceDossierModal.jsx';
import { getVesselPhoto, getFlagEmoji, EVIDENCE_ASSETS } from '../utils/vesselAssets.js';

export default function CaseIntelPanel({
  caseItem,
  activeView = 'tactical',
  onClose,
  onActionComplete,
  language = 'en',
}) {
  const t = getTranslation(language);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [showDossier, setShowDossier] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    risk: true,
    movement: true,
    evidence: true,
  });

  if (!caseItem) return null;

  const {
    id: caseId,
    score_final: finalScore = 86,
    band = 'High',
    rationale = '',
    features = {},
    status = 'new',
    created_at: createdAt,
    candidate_matches: topCandidates = features.candidate_matches || [],
  } = caseItem;

  const primaryCandidate = (topCandidates && topCandidates[0]) || null;
  const vesselName = primaryCandidate?.vesselName || features.locationLabel || 'SL PACIFIC DAWN 02';
  const vesselType = primaryCandidate?.gearType || 'Bulk Carrier';
  const imo = primaryCandidate?.imo || '9876543';
  const mmsi = primaryCandidate?.mmsi || '265789012';
  const flag = primaryCandidate?.flag || 'Unknown';
  const speed = primaryCandidate?.speedKnots ? `${primaryCandidate.speedKnots} knots` : '12.5 knots';
  const heading = primaryCandidate?.headingLabel || '210° (SSW)';
  const matchPct = primaryCandidate?.confidencePct || 82;

  const lat = features.lat ?? caseItem.lat ?? -4.5800;
  const lon = features.lon ?? caseItem.lon ?? 39.5200;
  const latStr = `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}°${lon < 0 ? 'W' : 'E'}`;
  const locFormatted = `${latStr}, ${lonStr}`;

  const vesselPhoto = getVesselPhoto(vesselName, vesselType);
  const flagEmoji = getFlagEmoji(flag);

  const dateUtc = createdAt
    ? new Date(createdAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'Oct 27, 2026 14:58 UTC';

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Format tactical brief for sharing
  const generateBriefText = () => {
    return [
      `🛡️ SENTINELCATCH VESSEL DOSSIER: ${vesselName}`,
      `Risk Assessment: ${band.toUpperCase()} (${finalScore}/100)`,
      `Type: ${vesselType} | IMO: ${imo} | MMSI: ${mmsi}`,
      `Position: ${locFormatted}`,
      `Observed: ${dateUtc}`,
      `SAR/AIS Match: ${matchPct}%`,
      `Analysis: ${rationale}`,
    ].join('\n');
  };

  const handleCopyBrief = () => {
    navigator.clipboard.writeText(generateBriefText());
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    setShowActionsDropdown(false);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateBriefText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setShowActionsDropdown(false);
  };

  const handleAction = async (actionType) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          actorName: 'Maritime Officer',
          note: `Action taken via Vessel Intelligence: ${actionType}`,
        }),
      });

      if (!res.ok) throw new Error('Action failed');
      const data = await res.json();
      if (onActionComplete) {
        onActionComplete(data.updatedCase || { ...caseItem, status: data.status });
      }
    } catch (err) {
      alert(`Error updating case status: ${err.message}`);
    } finally {
      setSubmitting(false);
      setShowActionsDropdown(false);
    }
  };

  // Risk indicators list
  const riskFactors = (features.key_factors && features.key_factors.length > 0)
    ? features.key_factors
    : [
        'Operating in restricted zone (possible IUU)',
        'Irregular route pattern',
        'No AIS–Radar match (last 6 hrs)',
        'Suspected dark transshipment of black goods',
      ];

  // Movement history nodes
  const movementHistory = [
    { time: 'Oct 27, 2026 14:58', coords: `${latStr}, ${lonStr}`, tag: '(current)' },
    { time: 'Oct 27, 2026 11:22', coords: '4.6120°S, 39.7610°E', tag: '' },
    { time: 'Oct 27, 2026 06:10', coords: '4.8301°S, 39.4320°E', tag: '' },
  ];

  return (
    <aside className="case-intel-sidebar">
      {/* 1. Header Row: ⚠️ Vessel Name ... ✕ */}
      <div className="intel-panel-header">
        <div className="intel-header-title-row">
          <div className="intel-title-icon-badge" title="High Risk Anomaly Alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 className="intel-vessel-headline" title={vesselName}>
            {vesselName}
          </h2>
        </div>

        <button
          className="btn-intel-close-panel"
          onClick={onClose}
          title="Close Intelligence Panel"
          type="button"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* 2. Sub-Header: HIGH RISK badge · 86/100 · 🚢 Bulk Carrier */}
      <div className="intel-subheader-row">
        <div className="intel-risk-score-group">
          <span className={`intel-risk-badge ${band === 'High' ? 'badge-risk-high' : band === 'Medium' ? 'badge-risk-med' : 'badge-risk-low'}`}>
            {band.toUpperCase()} RISK
          </span>
          <span className="intel-score-label">
            Risk score <strong className="intel-score-val">{finalScore}</strong> / 100
          </span>
        </div>

        <div className="intel-vessel-type-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
          <span>{vesselType}</span>
        </div>
      </div>

      <div className="intel-scroll-body">
        {/* 3. Main Vessel Surveillance Photo */}
        <div className="intel-photo-wrapper">
          <img
            src={vesselPhoto}
            alt={vesselName}
            className="intel-vessel-photo-main"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/vessels/pacific_dawn.jpg';
            }}
          />
        </div>

        {/* 4. Telemetry 2-Column Matrix */}
        <div className="intel-telemetry-matrix">
          <div className="telemetry-col">
            <div className="telemetry-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                IMO
              </span>
              <span className="tel-val">{imo}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                MMSI
              </span>
              <span className="tel-val">{mmsi}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">
                <span className="tel-flag-emoji">{flagEmoji}</span>
                Flag
              </span>
              <span className="tel-val">{flag}</span>
            </div>
          </div>

          <div className="telemetry-col">
            <div className="telemetry-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Last seen
              </span>
              <span className="tel-val">{dateUtc}</span>
            </div>
            <div className="telemetry-item telemetry-coords-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Location
              </span>
              <span className="tel-val tel-coords-display">
                {locFormatted}
                <button
                  className="btn-copy-mini-coords"
                  onClick={() => {
                    navigator.clipboard.writeText(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  title="Copy exact GPS decimal coordinates for naval/maritime dispatch"
                  type="button"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Speed
              </span>
              <span className="tel-val">{speed}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                Heading
              </span>
              <span className="tel-val">{heading}</span>
            </div>
          </div>
        </div>

        {/* 5. Circular SAR/AIS Match Gauge Card */}
        <div className="intel-match-gauge-card" onClick={() => setShowDossier(true)}>
          <div className="match-gauge-circle-wrap">
            <svg className="circular-progress-svg" viewBox="0 0 36 36">
              <path
                className="circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle-fill-progress"
                strokeDasharray={`${matchPct}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="match-percent-text">{matchPct}%</span>
          </div>

          <div className="match-gauge-meta">
            <h4 className="match-gauge-title">SAR/AIS match</h4>
            <p className="match-gauge-desc">Position, course and vessel type align</p>
          </div>

          <div className="match-gauge-chevron" aria-hidden="true">
            ›
          </div>
        </div>

        {/* 6. Expandable Section: Risk Indicators */}
        <div className="intel-accordion-section">
          <div className="accordion-header" onClick={() => toggleSection('risk')}>
            <div className="accordion-header-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Risk indicators</span>
            </div>
            <span className="accordion-chevron">{expandedSections.risk ? '▾' : '▸'}</span>
          </div>

          {expandedSections.risk && (
            <div className="accordion-content">
              <ul className="risk-factors-list">
                {riskFactors.map((factor, idx) => (
                  <li key={idx} className="risk-factor-item">
                    <span className="factor-bullet-dot"></span>
                    <span className="factor-text">{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 7. Expandable Section: Movement History */}
        <div className="intel-accordion-section">
          <div className="accordion-header" onClick={() => toggleSection('movement')}>
            <div className="accordion-header-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Movement history</span>
            </div>
            <div className="accordion-header-right">
              <button
                className="btn-view-full-track"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDossier(true);
                }}
                type="button"
              >
                View full track ↗
              </button>
              <span className="accordion-chevron">{expandedSections.movement ? '▾' : '▸'}</span>
            </div>
          </div>

          {expandedSections.movement && (
            <div className="accordion-content">
              <div className="movement-timeline">
                {movementHistory.map((item, index) => (
                  <div key={index} className="timeline-node-row">
                    <div className="timeline-dot-track">
                      <span className={`timeline-dot ${index === 0 ? 'dot-active' : ''}`} />
                      {index < movementHistory.length - 1 && <span className="timeline-stem" />}
                    </div>
                    <div className="timeline-node-info">
                      <span className="timeline-time">{item.time}</span>
                      <span className="timeline-coords">
                        {item.coords} {item.tag && <strong className="current-tag">{item.tag}</strong>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 8. Expandable Section: Detection Evidence */}
        <div className="intel-accordion-section">
          <div className="accordion-header" onClick={() => toggleSection('evidence')}>
            <div className="accordion-header-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Detection evidence</span>
            </div>
            <span className="accordion-chevron">{expandedSections.evidence ? '▾' : '▸'}</span>
          </div>

          {expandedSections.evidence && (
            <div className="accordion-content">
              <div className="evidence-chips-grid">
                {/* Optical Chip */}
                <div className="evidence-chip-card" onClick={() => setShowDossier(true)}>
                  <div className="evidence-thumb-box">
                    <img
                      src={EVIDENCE_ASSETS.optical}
                      alt="Satellite optical capture"
                      className="evidence-thumb-img"
                    />
                  </div>
                  <div className="evidence-chip-meta">
                    <span className="evidence-type-title">Satellite (optical)</span>
                    <span className="evidence-time-str">Oct 27, 2026 14:35 UTC</span>
                  </div>
                </div>

                {/* Thermal Chip */}
                <div className="evidence-chip-card" onClick={() => setShowDossier(true)}>
                  <div className="evidence-thumb-box">
                    <img
                      src={EVIDENCE_ASSETS.thermal}
                      alt="Thermal infrared FLIR"
                      className="evidence-thumb-img"
                    />
                  </div>
                  <div className="evidence-chip-meta">
                    <span className="evidence-type-title">Thermal (infrared)</span>
                    <span className="evidence-time-str">Oct 27, 2026 14:42 UTC</span>
                  </div>
                </div>

                {/* AIS Record Chip */}
                <div className="evidence-chip-card" onClick={() => setShowDossier(true)}>
                  <div className="evidence-thumb-box evidence-ais-box">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="evidence-chip-meta">
                    <span className="evidence-type-title">AIS record</span>
                    <span className="evidence-time-str">Oct 27, 2026 14:55 UTC</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 9. Recommended Action Alert Box */}
        <div className="intel-recommended-box">
          <div className="rec-box-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            <strong>Recommended action</strong>
          </div>
          <p className="rec-box-desc">
            Investigate possible unauthorized activity. Coordinate with Kenya Maritime Authority (KMA), Coast Guard, and regional partners.
          </p>
        </div>
      </div>

      {/* 10. Sticky Bottom Actions Bar */}
      <div className="intel-bottom-actions-bar">
        <button
          className="btn-intel-generate-report"
          onClick={() => setShowDossier(true)}
          type="button"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Generate incident report</span>
        </button>

        <div className="intel-dropdown-container">
          <button
            className="btn-intel-actions-menu"
            onClick={() => setShowActionsDropdown((prev) => !prev)}
            type="button"
          >
            <span>Actions</span>
            <span className="menu-arrow">▾</span>
          </button>

          {showActionsDropdown && (
            <div className="actions-dropdown-menu">
              <button
                className="dropdown-menu-item"
                onClick={() => handleAction('acknowledge')}
                disabled={submitting}
              >
                ✓ Acknowledge Target
              </button>
              <button
                className="dropdown-menu-item item-dispatch"
                onClick={() => handleAction('dispatch')}
                disabled={submitting}
              >
                🚀 Dispatch Patrol Interceptor
              </button>
              <button
                className="dropdown-menu-item"
                onClick={() => handleAction('false_alarm')}
                disabled={submitting}
              >
                ⚠️ Flag False Alarm
              </button>
              <button
                className="dropdown-menu-item"
                onClick={() => handleAction('resolved')}
                disabled={submitting}
              >
                🔒 Mark Case Resolved
              </button>
              <hr className="dropdown-divider" />
              <button
                className="dropdown-menu-item"
                onClick={handleShareWhatsApp}
              >
                📱 Share via WhatsApp
              </button>
              <button
                className="dropdown-menu-item"
                onClick={handleCopyBrief}
              >
                {copied ? '✓ Copied Brief' : '📋 Copy Brief to Clipboard'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Official Evidence Dossier & Report Modal */}
      {showDossier && (
        <EvidenceDossierModal
          caseItem={caseItem}
          onClose={() => setShowDossier(false)}
        />
      )}
    </aside>
  );
}
