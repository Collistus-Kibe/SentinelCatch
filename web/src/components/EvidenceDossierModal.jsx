import { useState, useEffect } from 'react';
import { getVesselPhoto, getVesselPhotoMetadata } from '../utils/vesselAssets.js';

export default function EvidenceDossierModal({ caseItem, onClose }) {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!caseItem?.id) return;
    setLoading(true);
    fetch(`/api/cases/${caseItem.id}/dossier`)
      .then((res) => res.json())
      .then((data) => {
        setDossier(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load evidence dossier:', err);
        setLoading(false);
      });
  }, [caseItem?.id]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    if (!dossier) return;
    const text = [
      `================================================================================`,
      `REPUBLIC OF KENYA - MULTI-AGENCY MARITIME SURVEILLANCE DOSSIER`,
      `CLASSIFICATION: ${dossier.classification}`,
      `DOSSIER REFERENCE: ${dossier.dossierId}`,
      `DATE: ${dossier.target.detectedAtEat} (EAT) / ${dossier.target.detectedAtUtc}`,
      `SECTOR: ${dossier.target.sector}`,
      `THREAT ASSESSMENT: ${dossier.target.threatBand.toUpperCase()} (${dossier.target.scoreFinal}/100)`,
      `COORDINATES: ${dossier.target.coordinates.lat.toFixed(4)}°N, ${dossier.target.coordinates.lon.toFixed(4)}°E`,
      `SATELLITE SENSOR: ${dossier.target.satelliteSensor}`,
      `--------------------------------------------------------------------------------`,
      `1. PROBABLE CANDIDATE IDENTIFICATION ("WHO IS IT?"):`,
      dossier.candidateMatches && dossier.candidateMatches.length > 0
        ? dossier.candidateMatches.map((m, idx) => `  Candidate #${idx+1}: ${m.vesselName} (Flag: ${m.flag}, MMSI: ${m.mmsi}) - ${m.confidencePct}% Confidence\n  IOTC Tuna Registry: ${m.iotcAuthorized ? 'AUTHORIZED' : 'NOT AUTHORIZED'}\n  RFMO IUU Listed: ${m.iuuListed ? `YES (${m.iuuListingBody})` : 'NO'}\n  AIS Gaps (60d): ${m.historicalAisOffCount60d}\n  Rationale: ${m.summaryRationale}`).join('\n\n')
        : '  No high-probability candidate isolated.',
      `--------------------------------------------------------------------------------`,
      `2. PROSECUTOR VS SKEPTIC MULTI-AGENT DELIBERATION:`,
      `  [PROSECUTOR - THE STATE'S CASE]:`,
      `  ${dossier.deliberation?.prosecutor_brief || 'Intentional dark vessel operation without mandatory AIS transmission in coastal EEZ.'}`,
      ``,
      `  [SKEPTIC - DEFENSE & ALTERNATIVE HYPOTHESES]:`,
      `  ${dossier.deliberation?.skeptic_brief || 'Potential satellite revisit coverage shadows or small artisanal boat exemption.'}`,
      ``,
      `  [CALIBRATED VERDICT]: ${dossier.deliberation?.calibrated_verdict || 'Verification Required'} (${dossier.deliberation?.evidentiary_confidence || dossier.target.scoreFinal}% Confidence)`,
      `  [RECOMMENDED ACTION]: ${dossier.deliberation?.recommended_action || 'Patrol intercept and boarding inspection.'}`,
      `--------------------------------------------------------------------------------`,
      `3. LEGAL ADMISSIBILITY & SYSTEM LIMITATIONS:`,
      `  ${dossier.legalDisclaimer}`,
      `================================================================================`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!caseItem) return null;

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div className="dossier-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Control Bar (Hidden when printing) */}
        <div className="dossier-control-bar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-high">📄 Official Case File</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Case #{caseItem.id} · {caseItem.sector}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyText}>
              {copied ? '✓ Copied' : '📋 Copy Text'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              🖨️ Print / Save PDF
            </button>
            <button className="btn-intel-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Printable Case Dossier Content */}
        <div className="dossier-print-container">
          {loading && (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Compiling official maritime surveillance dossier...
            </div>
          )}

          {!loading && dossier && (
            <article className="dossier-paper">
              {/* Document Header */}
              <header className="dossier-header">
                <div className="dossier-emblem">🛡️</div>
                <div className="dossier-title-block">
                  <h2>REPUBLIC OF KENYA</h2>
                  <h3>KENYA MARITIME SURVEILLANCE & ENFORCEMENT SUPPORT</h3>
                  <div className="dossier-ref-tag">
                    <span>DOSSIER REF: <strong>{dossier.dossierId}</strong></span>
                    <span>CLASSIFICATION: <strong>{dossier.classification}</strong></span>
                  </div>
                </div>
              </header>

              <hr className="dossier-divider" />

              {/* Section 1: Incident Coordinates & Sensor Platform */}
              <section className="dossier-section">
                <h4 className="dossier-section-title">1. INCIDENT TELEMETRY & SATELLITE RADAR VERIFICATION</h4>
                <div className="dossier-grid-2">
                  <div className="dossier-kv">
                    <span className="kv-label">Radar Centroid Coordinates:</span>
                    <strong className="kv-val">{dossier.target.coordinates.lat.toFixed(4)}°N, {dossier.target.coordinates.lon.toFixed(4)}°E</strong>
                  </div>
                  <div className="dossier-kv">
                    <span className="kv-label">Coastal EEZ Sector:</span>
                    <strong className="kv-val">{dossier.target.sector}</strong>
                  </div>
                  <div className="dossier-kv">
                    <span className="kv-label">Detection Timestamp (EAT):</span>
                    <strong className="kv-val">{dossier.target.detectedAtEat} (UTC+3)</strong>
                  </div>
                  <div className="dossier-kv">
                    <span className="kv-label">Satellite Platform:</span>
                    <strong className="kv-val">{dossier.target.satelliteSensor}</strong>
                  </div>
                  <div className="dossier-kv">
                    <span className="kv-label">Threat Severity Assessment:</span>
                    <strong className="kv-val" style={{ color: dossier.target.threatBand === 'High' ? 'var(--high)' : 'var(--accent-cyan)' }}>
                      {dossier.target.threatBand.toUpperCase()} ({dossier.target.scoreFinal}/100)
                    </strong>
                  </div>
                  <div className="dossier-kv">
                    <span className="kv-label">Estimated Vessel Length:</span>
                    <strong className="kv-val">{dossier.target.estimatedLengthM}</strong>
                  </div>
                </div>
              </section>

              {/* Section 2: Candidate Identity Attribution */}
              <section className="dossier-section">
                <h4 className="dossier-section-title">2. CANDIDATE IDENTITY ATTRIBUTION ("WHO IS IT?")</h4>
                <p className="dossier-note">
                  Corroborated by cross-referencing kinematic AIS transponder gap switch-offs against the Indian Ocean Tuna Commission (IOTC) authorized registry and regional RFMO IUU blacklists.
                </p>

                {dossier.candidateMatches && dossier.candidateMatches.length > 0 ? (
                  <div className="candidate-dossier-cards">
                    {dossier.candidateMatches.map((cand, idx) => {
                      const photoUrl = getVesselPhoto(cand.vesselName, cand.gearType, cand.mmsi);
                      const photoMeta = getVesselPhotoMetadata(cand.vesselName, cand.gearType, cand.mmsi);
                      return (
                        <div key={cand.mmsi || idx} className="candidate-dossier-card">
                          <div className="cand-top">
                            <span className="cand-rank">Probable Match #{idx + 1}</span>
                            <span className="cand-conf">{cand.confidencePct}% Confidence</span>
                          </div>
                          <div className="cand-dossier-body">
                            <div className="cand-dossier-photo-wrap">
                              <img
                                src={photoUrl}
                                alt={cand.vesselName}
                                className="cand-dossier-photo"
                              />
                              <div className="cand-dossier-photo-tag">📷 Authentic Maritime Photo</div>
                            </div>
                            <div className="cand-dossier-details">
                              <div className="cand-main-info">
                                <h5>{cand.vesselName}</h5>
                                <span className="cand-flag">Flag: {cand.flag} · MMSI: {cand.mmsi} · Type: {cand.gearType || 'Fishing Vessel'}</span>
                              </div>
                              <div className="cand-tags-row">
                                <span className={`cand-tag ${cand.iotcAuthorized ? 'tag-ok' : 'tag-warn'}`}>
                                  IOTC Registry: {cand.iotcAuthorized ? '✓ Authorized' : '✗ NOT AUTHORIZED'}
                                </span>
                                {cand.iuuListed && (
                                  <a
                                    href={photoMeta?.iuuUrl || 'https://iuu-vessels.org/Home/Search'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="cand-tag tag-danger"
                                    title="Open official record on Combined IUU Fishing Vessel List (Trygg Mat Tracking)"
                                  >
                                    ⚠️ RFMO IUU Blacklisted ({cand.iuuListingBody || 'IOTC'}) ↗
                                  </a>
                                )}
                                {cand.mmsi && (
                                  <a
                                    href={`https://www.myshiptracking.com/vessels?name=${encodeURIComponent(cand.mmsi)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="cand-tag"
                                    title="View live transponder telemetry on MyShipTracking open registry"
                                  >
                                    📡 MyShipTracking AIS ↗
                                  </a>
                                )}
                                <span className="cand-tag">
                                  AIS Gaps (60d): {cand.historicalAisOffCount60d}
                                </span>
                                <span className="cand-tag">
                                  AIS Coverage: {cand.aisCoverageMetricPct}%
                                </span>
                              </div>
                              <p className="cand-rationale">{cand.summaryRationale}</p>
                              <div className="cand-photo-provenance-caption">
                                <strong>Photographic Record:</strong> {photoMeta.photoTitle} · <span className="cand-credit-text">Attribution: {photoMeta.credit}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                    No prior AIS gap recorded in feasible kinematic range. Target catalogued as unknown radar centroid.
                  </p>
                )}
              </section>

              {/* Section 3: Prosecutor vs Skeptic Autonomous Deliberation */}
              <section className="dossier-section">
                <h4 className="dossier-section-title">3. AUTONOMOUS MULTI-AGENT DELIBERATION (PROSECUTOR VS SKEPTIC)</h4>
                
                <div className="deliberation-box-grid">
                  <div className="delib-box prosecutor-box">
                    <div className="delib-head">
                      <span>⚖️ PROSECUTOR (THE STATE'S CASE)</span>
                      <small>Incriminating Evidence</small>
                    </div>
                    <p>{dossier.deliberation?.prosecutor_brief || 'Target isolated operating dark without AIS broadcast in high-value territorial waters.'}</p>
                    {dossier.deliberation?.prosecutor_points && (
                      <ul>
                        {dossier.deliberation.prosecutor_points.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="delib-box skeptic-box">
                    <div className="delib-head">
                      <span>🛡️ SKEPTIC (DEFENSE & ALTERNATE HYPOTHESES)</span>
                      <small>Mitigating Factors</small>
                    </div>
                    <p>{dossier.deliberation?.skeptic_brief || 'Satellite AIS receiver gaps or small wooden artisanal craft not bound by Class A requirements.'}</p>
                    {dossier.deliberation?.skeptic_points && (
                      <ul>
                        {dossier.deliberation.skeptic_points.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="verdict-banner">
                  <div className="verdict-title">
                    <span>CALIBRATED ARBITRATION VERDICT:</span>
                    <strong>{dossier.deliberation?.calibrated_verdict || 'Verification Required'}</strong>
                  </div>
                  <div className="verdict-conf">
                    Confidence: <strong>{dossier.deliberation?.evidentiary_confidence || dossier.target.scoreFinal}%</strong>
                  </div>
                  <div className="verdict-action">
                    Recommended Action: <em>{dossier.deliberation?.recommended_action || 'Task nearest coastal patrol craft for visual radar verification.'}</em>
                  </div>
                </div>
              </section>

              {/* Section 4: 10 Computed Operational Features */}
              <section className="dossier-section">
                <h4 className="dossier-section-title">4. OPERATIONAL FEATURE EXTRACTION MATRIX</h4>
                <table className="dossier-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Operational Measurement</th>
                      <th>Enforcement Implication</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Marine Protected Area (MPA)</td>
                      <td>{dossier.features?.inMPA ? `INSIDE (${dossier.features.mpaName})` : `Outside (${dossier.features?.distanceToMpaKm || 0} km)`}</td>
                      <td>{dossier.features?.inMPA ? 'CRITICAL: Commercial trawling/longlining prohibited' : 'Standard EEZ zone'}</td>
                    </tr>
                    <tr>
                      <td>Outer EEZ Boundary Proximity</td>
                      <td>{dossier.features?.distanceToEEZBoundaryKm || 0} km from border</td>
                      <td>{dossier.features?.distanceToEEZBoundaryKm < 25 ? 'High risk: Border skirting / rapid escape vector' : 'Interior EEZ operations'}</td>
                    </tr>
                    <tr>
                      <td>Loitering Recurrence (14d)</td>
                      <td>{dossier.features?.recurrenceCount || 1} satellite radar passes</td>
                      <td>{dossier.features?.recurrenceCount > 1 ? 'Persistent fishing pattern confirmed' : 'Single transit pass'}</td>
                    </tr>
                    <tr>
                      <td>Distance to Coast / Port</td>
                      <td>{dossier.features?.distanceToCoastKm || 0} km from {dossier.features?.nearestPort || 'coast'}</td>
                      <td>{dossier.features?.distanceToCoastKm < 10 ? 'Nearshore artisanal craft / anchorage zone' : 'Deep offshore industrial zone'}</td>
                    </tr>
                    <tr>
                      <td>Sea State Clutter (Open-Meteo)</td>
                      <td>{dossier.features?.seaState || 'Moderate'} ({dossier.features?.waveHeightM || 1.2}m wave)</td>
                      <td>Radar sea clutter penalty: {dossier.features?.seaPenalty || 0} pts applied</td>
                    </tr>
                    <tr>
                      <td>Nearby Commercial AIS Fleet</td>
                      <td>{dossier.features?.nearbyAisVesselsCount || 0} active vessels in 20 km</td>
                      <td>Active fishing grounds indicator</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Section 5: Chain of Custody & Audit Log */}
              <section className="dossier-section">
                <h4 className="dossier-section-title">5. OFFICER ACTION AUDIT LOG & CHAIN OF CUSTODY</h4>
                <div className="dossier-timeline">
                  {dossier.auditEvents && dossier.auditEvents.length > 0 ? (
                    dossier.auditEvents.map((ev, i) => (
                      <div key={i} className="timeline-item">
                        <span className="timeline-dot"></span>
                        <div className="timeline-content">
                          <div className="tl-head">
                            <strong>{ev.action?.toUpperCase() || 'LOGGED'}</strong>
                            <small>{new Date(ev.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })} EAT</small>
                          </div>
                          <span className="tl-actor">Officer / Actor: {ev.actor_name || 'System Pipeline'}</span>
                          {ev.note && <p className="tl-note">{ev.note}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Detection ingested and logged.</p>
                  )}
                </div>
              </section>

              {/* Section 6: Limitations & Non-Accusation Disclosure */}
              <footer className="dossier-footer">
                <div className="legal-disclosure-box">
                  <strong>STATUTORY DISCLOSURE & LIMITATIONS:</strong>
                  <p>{dossier.legalDisclaimer}</p>
                </div>
                <div className="dossier-signature-row">
                  <div className="sig-block">
                    <span>Generated By:</span>
                    <strong>SentinelCatch Autonomous Surveillance Engine</strong>
                  </div>
                  <div className="sig-block">
                    <span>Reviewing Officer Signature:</span>
                    <div className="sig-line">_____________________________</div>
                  </div>
                </div>
              </footer>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
