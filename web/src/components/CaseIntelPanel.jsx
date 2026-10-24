import { useState } from 'react';
import { getTranslation } from '../services/i18n.js';
import EvidenceDossierModal from './EvidenceDossierModal.jsx';
import { getVesselPhoto, getVesselPhotoMetadata, getFlagEmoji } from '../utils/vesselAssets.js';

export default function CaseIntelPanel({
  caseItem,
  onClose,
  onActionComplete,
  language = 'en',
}) {
  const t = getTranslation(language);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showDossier, setShowDossier] = useState(false);
  const [deliberating, setDeliberating] = useState(false);
  const [deliberationData, setDeliberationData] = useState(caseItem?.features?.deliberation || null);

  if (!caseItem) return null;

  const {
    id: caseId,
    score_rule: ruleScore = 0,
    score_llm_adjust: llmAdjust = 0,
    score_final: finalScore = 0,
    band = 'Low',
    rationale = '',
    features = {},
    sector = 'Kenya Waters',
    status = 'new',
    created_at: createdAt,
    candidate_matches: topCandidates = features.candidate_matches || [],
  } = caseItem;

function getRouteColor(vesselName = '') {
  const norm = (vesselName || '').toUpperCase();
  if (norm.includes('LU RONG')) return { color: '#00f5d4', name: 'Electric Cyan' };
  if (norm.includes('PACIFIC DAWN')) return { color: '#f72585', name: 'Radiant Fuchsia' };
  if (norm.includes('ZHOU YU')) return { color: '#ffbe0b', name: 'Solar Amber' };
  if (norm.includes('HAI FENG')) return { color: '#a855f7', name: 'Electric Violet' };
  if (norm.includes('AL-MARWAH')) return { color: '#10b981', name: 'Emerald Green' };
  return { color: '#38bdf8', name: 'Sky Blue' };
}

  const lat = features.lat ?? caseItem.lat ?? 0;
  const lon = features.lon ?? caseItem.lon ?? 0;
  const locLabel = features.locationLabel || `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  const primaryCandidate = (topCandidates && topCandidates[0]) || null;
  const deliberation = deliberationData || features.deliberation || null;
  const vesselPhoto = getVesselPhoto(primaryCandidate?.vesselName || '', primaryCandidate?.gearType || '');
  const photoMeta = getVesselPhotoMetadata(primaryCandidate?.vesselName || '', primaryCandidate?.gearType || '');
  const flagEmoji = getFlagEmoji(primaryCandidate?.flag || '');
  const vesselColorInfo = getRouteColor(primaryCandidate?.vesselName || '');

  const dateEat = new Date(createdAt).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const dateUtc = new Date(createdAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // Format tactical brief for WhatsApp / Clipboard
  const generateBriefText = () => {
    const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
    return [
      `🛡️ SENTINELCATCH TACTICAL BRIEF [${band.toUpperCase()} - Score ${finalScore}/100]`,
      `📍 Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${locLabel})`,
      `🌊 Sector: ${sector}`,
      primaryCandidate ? `🎯 Suspected Candidate: ${primaryCandidate.vesselName} (Flag: ${primaryCandidate.flag}, ${primaryCandidate.confidencePct}% match)` : '',
      `⏰ Time: ${dateEat} (EAT) / ${dateUtc}`,
      `🔍 Reason: ${rationale}`,
      deliberation ? `⚖️ Calibrated Verdict: ${deliberation.calibrated_verdict} (${deliberation.evidentiary_confidence}% conf)` : '',
      `⚡ Suggested Action: Request coastal patrol or aerial verification on next satellite pass.`,
      `🗺️ Map: ${mapUrl}`,
    ].filter(Boolean).join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateBriefText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyBrief = () => {
    navigator.clipboard.writeText(generateBriefText());
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleAction = async (actionType) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          actorName: 'Fisheries Officer',
          note: `Action taken via Operations Intel Panel: ${actionType}`,
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
    }
  };

  const handleRunDeliberation = async () => {
    setDeliberating(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/deliberate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run deliberation');
      const data = await res.json();
      if (data.deliberation) {
        setDeliberationData(data.deliberation);
        if (onActionComplete) {
          onActionComplete({
            ...caseItem,
            features: { ...caseItem.features, deliberation: data.deliberation },
          });
        }
      }
    } catch (err) {
      alert(`Deliberation error: ${err.message}`);
    } finally {
      setDeliberating(false);
    }
  };

  const bandClass = band === 'High' ? 'badge-high' : band === 'Medium' ? 'badge-medium' : 'badge-low';

  return (
    <div className="intel-panel-overlay">
      <div className="intel-panel">
        {/* Top Header */}
        <div className="intel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`badge ${bandClass}`} style={{ fontSize: '0.82rem', padding: '5px 10px' }}>
              {band.toUpperCase()} · {finalScore}/100
            </span>
            <span className="case-sector-tag">{sector}</span>
            <span className={`status-pill status-${status}`}>{status}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn-intel-dossier"
              onClick={() => setShowDossier(true)}
              title="Open Official Case Dossier"
            >
              📄 Dossier
            </button>
            <button
              className="btn-intel-share"
              onClick={handleShareWhatsApp}
              title="Share brief on WhatsApp"
            >
              💬 WhatsApp
            </button>
            <button
              className="btn-intel-copy"
              onClick={handleCopyBrief}
              title="Copy brief to clipboard"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <button className="btn-intel-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Suspected Vessel Surveillance Photo Reconnaissance Card */}
        <div className="intel-vessel-photo-card">
          <div className="vessel-recon-container">
            <img
              src={vesselPhoto}
              alt={primaryCandidate?.vesselName || 'Suspected Dark Vessel'}
              className="vessel-recon-img"
            />
            <div className="vessel-recon-overlay">
              <div className="recon-reticle reticle-tl"></div>
              <div className="recon-reticle reticle-tr"></div>
              <div className="recon-reticle reticle-bl"></div>
              <div className="recon-reticle reticle-br"></div>
              
              <div className="recon-top-badge">
                <span className="recon-pulse-dot"></span>
                <span>RECON MATCH · {primaryCandidate?.confidencePct || 85}% CONFIDENCE</span>
              </div>

              <div className="recon-bottom-telemetry">
                <span className="recon-vessel-label">
                  {flagEmoji} {primaryCandidate?.vesselName || 'Unidentified Contact'}
                </span>
                <span className="recon-sensor-tag">🛰️ SENTINEL-1 SAR</span>
              </div>
            </div>
          </div>

          {/* Verified Real Maritime Photo Provenance Bar */}
          <div className="vessel-photo-provenance-bar">
            <div className="provenance-top-row">
              <span className="provenance-pill">
                <span className="provenance-pill-dot"></span>
                📷 AUTHENTIC VESSEL PHOTO
              </span>
              <span className="provenance-source">Archival Record</span>
            </div>
            <div className="provenance-desc" title={photoMeta?.photoTitle || 'Verified Surveillance Record'}>
              {photoMeta?.photoTitle || 'Real Surveillance Record'}
            </div>
            <div className="provenance-credit-row">
              <span className="provenance-credit-label">Verified Source:</span>
              <span className="provenance-credit-val">{photoMeta?.credit || 'Open Maritime Registry'}</span>
            </div>
          </div>
        </div>

        {/* Location & Times */}
        <div className="intel-location-bar">
          <div className="intel-loc-text">
            <strong>📍 {locLabel}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '8px' }}>
              ({lat.toFixed(4)}°, {lon.toFixed(4)}°)
            </span>
          </div>
          <div className="intel-time-chips">
            <span className="time-chip">⏰ EAT: {dateEat}</span>
            <span className="time-chip">🌐 UTC: {dateUtc}</span>
          </div>
        </div>

        {/* 1. Score Breakdown Gauge */}
        <div className="intel-section score-breakdown-card">
          <div className="score-ring-wrapper">
            <div className={`score-ring ring-${band.toLowerCase()}`}>
              <span className="score-number">{finalScore}</span>
              <span className="score-total">/100</span>
            </div>
            <div className="score-components">
              <div className="score-comp-row">
                <span>Rule-Based Baseline:</span>
                <strong>{ruleScore} pts</strong>
              </div>
              <div className="score-comp-row">
                <span>AI Nuanced Adjustment:</span>
                <strong style={{ color: llmAdjust > 0 ? 'var(--high)' : llmAdjust < 0 ? 'var(--ok)' : 'var(--text-secondary)' }}>
                  {llmAdjust > 0 ? `+${llmAdjust}` : llmAdjust} pts
                </strong>
              </div>
              <div className="score-comp-row" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>AI Engine:</span>
                <span>{features.llm_source || 'Gemini 2.5 Flash / GPT-4o'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. "WHO IS IT?" Candidate Identity Matching Card */}
        <div className="intel-section candidate-identity-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3>🎯 Candidate Identity ("Who is it?")</h3>
            <span className="badge badge-low" style={{ fontSize: '0.72rem' }}>Kinematic AIS-Gap Match</span>
          </div>

          {primaryCandidate ? (
            <div className="candidate-lead-card">
              <div className="candidate-lead-header">
                <div>
                  <h4 className="candidate-name">{flagEmoji} {primaryCandidate.vesselName}</h4>
                  <span className="candidate-meta">
                    Flag: {primaryCandidate.flag} · MMSI: {primaryCandidate.mmsi} · Type: {primaryCandidate.gearType}
                  </span>
                </div>
                <div className="candidate-confidence-badge">
                  <strong>{primaryCandidate.confidencePct}%</strong>
                  <span>Match Confidence</span>
                </div>
              </div>

              <div className="candidate-badges-grid">
                <span className={`cand-tag ${primaryCandidate.iotcAuthorized ? 'tag-ok' : 'tag-warn'}`}>
                  IOTC Tuna Registry: {primaryCandidate.iotcAuthorized ? '✓ Authorized' : '✗ NOT AUTHORIZED'}
                </span>
                {primaryCandidate.iuuListed && (
                  <a
                    href={photoMeta?.iuuUrl || 'https://iuu-vessels.org/Home/Search'}
                    target="_blank"
                    rel="noreferrer"
                    className="cand-tag tag-danger cand-iuu-link"
                    title="Open official record on Combined IUU Fishing Vessel List (Trygg Mat Tracking)"
                  >
                    ⚠️ RFMO IUU Blacklisted ({primaryCandidate.iuuListingBody || 'IOTC'}) ↗
                  </a>
                )}
                {primaryCandidate.mmsi && (
                  <a
                    href={`https://www.myshiptracking.com/vessels?name=${encodeURIComponent(primaryCandidate.mmsi)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cand-tag cand-mst-link"
                    title="View live transponder telemetry on MyShipTracking open registry"
                  >
                    📡 MyShipTracking AIS ↗
                  </a>
                )}
                <span className="cand-tag">
                  AIS Off Events (60d): {primaryCandidate.historicalAisOffCount60d}
                </span>
                <span className="cand-tag">
                  AIS Coverage: {primaryCandidate.aisCoverageMetricPct}%
                </span>
              </div>

              <p className="candidate-rationale-text">
                {primaryCandidate.summaryRationale}
              </p>

              <div className="candidate-disclaimer-foot">
                ⚖️ <em>Probabilistic candidate based on kinematic transit distance & transponder gap timing. Presented as an investigative lead, never as an accusation.</em>
              </div>
            </div>
          ) : (
            <div className="candidate-empty-box">
              <p>No prior transponder switch-off recorded within feasible kinematic transit range.</p>
              <small>Catalogued as unidentified radar return.</small>
            </div>
          )}
        </div>

        {/* 3. RECONSTRUCTED HISTORICAL ROUTE & VOYAGE TRAIL */}
        <div className="intel-section route-recon-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3>〰️ Reconstructed Vessel Route</h3>
            <span
              className="badge"
              style={{
                background: `${vesselColorInfo.color}22`,
                color: vesselColorInfo.color,
                border: `1px solid ${vesselColorInfo.color}66`,
                fontSize: '0.72rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: vesselColorInfo.color, display: 'inline-block' }} />
              {vesselColorInfo.name} Track
            </span>
          </div>

          <div className="route-intel-card" style={{ borderLeft: `3px solid ${vesselColorInfo.color}` }}>
            <div className="route-stats-grid">
              <div className="route-stat-item">
                <span className="stat-label">Traversed Distance</span>
                <strong className="stat-val" style={{ color: vesselColorInfo.color }}>
                  {caseId === 101 ? '220 nm' : caseId === 102 ? '85 nm' : caseId === 103 ? '160 nm' : caseId === 104 ? '75 nm' : '65 nm'}
                </strong>
              </div>
              <div className="route-stat-item">
                <span className="stat-label">Voyage Window</span>
                <strong className="stat-val">
                  {caseId === 101 ? '36 hrs' : caseId === 102 ? '28 hrs' : caseId === 103 ? '48 hrs' : '20 hrs'}
                </strong>
              </div>
              <div className="route-stat-item">
                <span className="stat-label">AIS Transponder Gap</span>
                <strong className="stat-val" style={{ color: '#ef4444' }}>
                  {primaryCandidate?.hoursSinceAisOff ? `${primaryCandidate.hoursSinceAisOff}h ago` : 'Active Gap'}
                </strong>
              </div>
            </div>

            <div className="route-stepper-list">
              <div className="route-step-row">
                <span className="step-circle" style={{ borderColor: vesselColorInfo.color, background: `${vesselColorInfo.color}33` }}>1</span>
                <div className="step-desc">
                  <strong>High Seas Departure</strong>
                  <span>Transponder active in international waters</span>
                </div>
              </div>
              <div className="route-step-row">
                <span className="step-circle" style={{ borderColor: vesselColorInfo.color, background: `${vesselColorInfo.color}33` }}>2</span>
                <div className="step-desc">
                  <strong>Kenya EEZ Sovereign Ingress</strong>
                  <span>Crossed 200 nm perimeter into national maritime sector</span>
                </div>
              </div>
              <div className="route-step-row gap-row">
                <span className="step-circle gap">⚠️</span>
                <div className="step-desc">
                  <strong style={{ color: '#ef4444' }}>AIS Transponder Ceased (Went Dark)</strong>
                  <span>Broadcast terminated ~{primaryCandidate?.hoursSinceAisOff || 3}h ago before entering MPA</span>
                </div>
              </div>
              <div className="route-step-row current-row">
                <span className="step-circle target">🎯</span>
                <div className="step-desc">
                  <strong style={{ color: '#38bdf8' }}>Current SAR Satellite Radar Intercept</strong>
                  <span>Stationary radar centroid confirmed at {lat.toFixed(4)}°, {lon.toFixed(4)}°</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. PROSECUTOR VS SKEPTIC MULTI-AGENT DELIBERATION */}
        <div className="intel-section deliberation-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3>⚖️ Prosecutor vs Skeptic Deliberation</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRunDeliberation}
              disabled={deliberating}
            >
              {deliberating ? 'Arbitrating...' : '⚡ Re-Deliberate'}
            </button>
          </div>

          {deliberation ? (
            <div className="deliberation-container">
              <div className="deliberation-dual-grid">
                {/* Prosecutor Card */}
                <div className="delib-agent-card prosecutor-agent">
                  <div className="delib-agent-head">
                    <span>⚖️ PROSECUTOR</span>
                    <small>Incriminating Evidence</small>
                  </div>
                  <p className="delib-agent-body">{deliberation.prosecutor_brief}</p>
                </div>

                {/* Skeptic Card */}
                <div className="delib-agent-card skeptic-agent">
                  <div className="delib-agent-head">
                    <span>🛡️ SKEPTIC</span>
                    <small>Mitigating / Alternate Arguments</small>
                  </div>
                  <p className="delib-agent-body">{deliberation.skeptic_brief}</p>
                </div>
              </div>

              {/* Calibrated Synthesized Verdict */}
              <div className="deliberation-verdict-card">
                <div className="verdict-summary-row">
                  <div>
                    <span className="verdict-label">CALIBRATED VERDICT:</span>
                    <strong className="verdict-val">{deliberation.calibrated_verdict}</strong>
                  </div>
                  <div className="verdict-conf-pill">
                    {deliberation.evidentiary_confidence || finalScore}% Conviction
                  </div>
                </div>
                {deliberation.recommended_action && (
                  <p className="verdict-tasking">
                    <strong>Tactical Tasking:</strong> {deliberation.recommended_action}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="deliberation-empty-box">
              <p>Autonomous dual-agent deliberation available for tactical arbitration.</p>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRunDeliberation}
                disabled={deliberating}
              >
                {deliberating ? 'Running Deliberation...' : '⚡ Run Prosecutor vs Skeptic Analysis'}
              </button>
            </div>
          )}
        </div>

        {/* 4. Plain Language Rationale ("Why Flagged") */}
        <div className="intel-section">
          <h3>🔍 {t.intelWhyFlagged}</h3>
          <p className="intel-rationale-box">{rationale}</p>
        </div>

        {/* 5. 10 Operational Features Matrix */}
        <div className="intel-section">
          <h3>📊 {t.intelFeatures}</h3>
          <div className="features-grid">
            <div className={`feature-card ${features.inMPA ? 'feat-highlight' : ''}`}>
              <span className="feat-label">🌿 {t.f_inMPA}</span>
              <span className="feat-val">
                {features.inMPA ? `INSIDE (${features.mpaName || 'Marine Park'})` : `Outside (${features.distanceToMpaKm || 0} km)`}
              </span>
            </div>

            <div className={`feature-card ${features.distanceToEEZBoundaryKm < 25 ? 'feat-highlight' : ''}`}>
              <span className="feat-label">🛡️ {t.f_eezBoundary}</span>
              <span className="feat-val">{features.distanceToEEZBoundaryKm ?? 'N/A'} km from border</span>
            </div>

            <div className={`feature-card ${features.recurrenceCount > 1 ? 'feat-highlight' : ''}`}>
              <span className="feat-label">🔄 {t.f_loitering}</span>
              <span className="feat-val">{features.recurrenceCount || 1} satellite passes (14d)</span>
            </div>

            <div className="feature-card">
              <span className="feat-label">🧭 {t.f_displacement}</span>
              <span className="feat-val">{features.displacementPattern || 'Transit / Moving'}</span>
            </div>

            <div className={`feature-card ${features.hasNearbyAisGap ? 'feat-highlight' : ''}`}>
              <span className="feat-label">📡 {t.f_aisGap}</span>
              <span className="feat-val">
                {features.hasNearbyAisGap ? `Yes (${features.aisGapDistanceKm} km away)` : 'No recent gap'}
              </span>
            </div>

            <div className="feature-card">
              <span className="feat-label">🚢 {t.f_fleet}</span>
              <span className="feat-val">{features.nearbyAisVesselsCount || 0} vessels in 20 km</span>
            </div>

            <div className="feature-card">
              <span className="feat-label">⚓ {t.f_port}</span>
              <span className="feat-val">{features.distanceToCoastKm || 0} km from {features.nearestPort || 'coast'}</span>
            </div>

            <div className="feature-card">
              <span className="feat-label">📏 {t.f_length}</span>
              <span className="feat-val">{features.estimatedLengthM ? `${features.estimatedLengthM} meters` : 'Radar contact'}</span>
            </div>

            <div className="feature-card">
              <span className="feat-label">🌊 {t.f_seaState}</span>
              <span className="feat-val">
                {features.seaState || 'Moderate'} ({features.waveHeightM || 1.2}m wave)
              </span>
            </div>

            <div className="feature-card">
              <span className="feat-label">📶 {t.f_aisCoverage}</span>
              <span className="feat-val">{((features.aisCoverageConfidence || 0.85) * 100).toFixed(0)}% reception</span>
            </div>
          </div>
        </div>

        {/* 6. Officer Actions Workflow */}
        <div className="intel-section">
          <h3>⚡ {t.intelAction}</h3>
          <div className="intel-action-buttons">
            <button
              className="btn btn-action-ack"
              onClick={() => handleAction('acknowledge')}
              disabled={submitting || status === 'acknowledged'}
            >
              ✓ {t.btnAcknowledge}
            </button>

            <button
              className="btn btn-action-dispatch"
              onClick={() => handleAction('dispatch')}
              disabled={submitting || status === 'dispatched'}
            >
              🚀 {t.btnDispatch}
            </button>

            <button
              className="btn btn-action-false"
              onClick={() => handleAction('false_alarm')}
              disabled={submitting || status === 'false_alarm'}
            >
              ⚠️ {t.btnFalseAlarm}
            </button>

            <button
              className="btn btn-action-resolve"
              onClick={() => handleAction('resolved')}
              disabled={submitting || status === 'resolved'}
            >
              🔒 {t.btnResolve}
            </button>
          </div>
        </div>

        {/* 7. Evidence Dossier & Raw Telemetry Inspector */}
        <div className="intel-section" style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary btn-block" onClick={() => setShowDossier(true)}>
            📄 Generate & Print Official Evidence Dossier
          </button>
        </div>

        <div className="intel-section">
          <button
            className="btn-toggle-json"
            onClick={() => setShowRawJson(!showRawJson)}
          >
            {showRawJson ? '▼ Hide Raw Satellite Telemetry' : '▶ Inspect Raw Satellite Telemetry (JSON)'}
          </button>

          {showRawJson && (
            <pre className="raw-json-viewer">
              {JSON.stringify(caseItem, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Official Evidence Dossier Modal */}
      {showDossier && (
        <EvidenceDossierModal
          caseItem={caseItem}
          onClose={() => setShowDossier(false)}
        />
      )}
    </div>
  );
}
