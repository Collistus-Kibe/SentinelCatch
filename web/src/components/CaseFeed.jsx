import { useState, useMemo } from 'react';
import { getTranslation } from '../services/i18n.js';
import { getVesselPhoto, getFlagEmoji } from '../utils/vesselAssets.js';

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

export default function CaseFeed({
  cases = [],
  selectedCaseId,
  onSelectCase,
  activeSector,
  onSectorChange,
  language = 'en',
  isLoading = false,
}) {
  const t = getTranslation(language);
  const [bandFilter, setBandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Count cases per sector
  const sectorCounts = useMemo(() => {
    const counts = { all: cases.length, Lamu: 0, 'Malindi-Kilifi': 0, Mombasa: 0, 'South Coast/Vanga': 0 };
    cases.forEach((c) => {
      if (counts[c.sector] !== undefined) {
        counts[c.sector] += 1;
      }
    });
    return counts;
  }, [cases]);

  const sectors = [
    {
      id: 'all',
      label: t.sectorAll,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        </svg>
      ),
      count: sectorCounts.all,
    },
    {
      id: 'Lamu',
      label: t.sectorLamu,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      ),
      count: sectorCounts.Lamu,
    },
    {
      id: 'Malindi-Kilifi',
      label: t.sectorMalindiKilifi,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="5" r="3" />
          <line x1="12" y1="22" x2="12" y2="8" />
          <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
        </svg>
      ),
      count: sectorCounts['Malindi-Kilifi'],
    },
    {
      id: 'Mombasa',
      label: t.sectorMombasa,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      ),
      count: sectorCounts.Mombasa,
    },
    {
      id: 'South Coast/Vanga',
      label: t.sectorSouthCoast,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
      count: sectorCounts['South Coast/Vanga'],
    },
  ];

  const filteredCases = useMemo(() => {
    const list = cases.filter((c) => {
      // Sector filter
      if (activeSector && activeSector !== 'all' && c.sector !== activeSector) {
        return false;
      }
      // Band filter
      if (bandFilter !== 'all' && c.band !== bandFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const loc = (c.features?.locationLabel || '').toLowerCase();
        const rat = (c.rationale || '').toLowerCase();
        const sec = (c.sector || '').toLowerCase();
        const candidateName = (c.candidate_matches?.[0]?.vesselName || c.features?.candidate_matches?.[0]?.vesselName || '').toLowerCase();
        const idMatch = String(c.id).includes(q);
        if (!loc.includes(q) && !rat.includes(q) && !sec.includes(q) && !candidateName.includes(q) && !idMatch) {
          return false;
        }
      }
      return true;
    });

    // Strictly sort from Highest Threat Score to Lowest Threat Score in each tab
    return list.sort((a, b) => (Number(b.score_final) || 0) - (Number(a.score_final) || 0));
  }, [cases, activeSector, bandFilter, statusFilter, searchQuery]);

  return (
    <aside className="case-feed-sidebar">
      {/* Sector Navigation Header */}
      <div className="feed-header">
        <div className="sector-nav-container">
          <div className="sector-scroll-bar">
            {sectors.map((s) => (
              <button
                key={s.id}
                className={`sector-tab-btn ${activeSector === s.id ? 'active' : ''}`}
                onClick={() => onSectorChange(s.id)}
                title={`Filter by ${s.label} (${s.count} contacts)`}
              >
                <span className="sector-btn-icon">{s.icon}</span>
                <span className="sector-btn-text">{s.label}</span>
                <span className="sector-btn-badge">{s.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search & Band Filters */}
        <div className="feed-filter-row">
          <div className="search-input-wrapper">
            <input
              type="text"
              className="feed-search-input"
              placeholder="Search vessel, sector, port..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-selects-group">
            <select
              className="feed-filter-select"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              title="Filter by severity threat band"
            >
              <option value="all">{t.bandAll}</option>
              <option value="High">{t.bandHigh}</option>
              <option value="Medium">{t.bandMedium}</option>
              <option value="Low">{t.bandLow}</option>
            </select>

            <select
              className="feed-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              title="Filter by enforcement status"
            >
              <option value="all">All Status</option>
              <option value="new">{t.statusNew}</option>
              <option value="acknowledged">{t.statusAcknowledged}</option>
              <option value="dispatched">{t.statusDispatched}</option>
              <option value="false_alarm">{t.statusFalseAlarm}</option>
              <option value="resolved">{t.statusResolved}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Case Cards List (Minimised, high-density layout with smooth scrolling) */}
      <div className="case-cards-list">
        {isLoading && (
          <div className="feed-status-msg">
            <span className="spinner-dot"></span>
            Loading maritime radar telemetry...
          </div>
        )}

        {!isLoading && filteredCases.length === 0 && (
          <div className="feed-empty-state">
            <p className="empty-icon">🌊</p>
            <h5>No contacts in this view</h5>
            <p className="empty-sub">{t.noCasesFound}</p>
          </div>
        )}

        {filteredCases.map((c) => {
          const isSelected = selectedCaseId === c.id;
          const bandClass = c.band === 'High' ? 'badge-high' : c.band === 'Medium' ? 'badge-medium' : 'badge-low';
          const locLabel = c.features?.locationLabel || `${c.sector || 'Open Ocean'}`;
          const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || null;
          const vesselPhoto = getVesselPhoto(candidate?.vesselName || '', candidate?.gearType || '');
          const flag = getFlagEmoji(candidate?.flag || '');

          return (
            <div
              key={c.id}
              className={`case-card case-card-compact ${isSelected ? 'case-card-selected' : ''}`}
              onClick={() => onSelectCase(c.id)}
            >
              <div className="case-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`badge ${bandClass}`}>
                    {c.band.toUpperCase()} · {c.score_final}
                  </span>
                  <span className="case-sector-tag">{c.sector}</span>
                </div>
                <span className="case-time-ago">{timeAgo(c.created_at)}</span>
              </div>

              {/* Minimized Vessel Row & Thumbnail */}
              <div className="case-card-vessel-preview">
                <div className="case-thumb-container">
                  <img
                    src={vesselPhoto}
                    alt={candidate?.vesselName || 'Dark Contact'}
                    className="case-card-vessel-img"
                    loading="lazy"
                  />
                  {candidate?.iuuListed && (
                    <span className="case-card-iuu-flag">IUU</span>
                  )}
                </div>

                <div className="case-card-vessel-info">
                  <div className="case-location-title" title={locLabel}>
                    {locLabel}
                  </div>

                  {candidate ? (
                    <div className="case-candidate-row">
                      <span className="candidate-flag-emoji">{flag}</span>
                      <strong className="candidate-vessel-title">{candidate.vesselName}</strong>
                      <span className="candidate-match-pill">{candidate.confidencePct}% match</span>
                    </div>
                  ) : (
                    <div className="case-candidate-row">
                      <span className="candidate-vessel-title text-muted">Unidentified Radar Centroid</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="case-card-footer">
                <span className={`status-pill status-${c.status || 'new'}`}>
                  {c.status || 'new'}
                </span>
                {c.features?.inMPA && (
                  <span className="badge-mpa-tag">MPA</span>
                )}
                {c.features?.recurrenceCount > 1 && (
                  <span className="badge-recurrence-tag">{c.features.recurrenceCount} Passes</span>
                )}
                {c.features?.deliberation && (
                  <span className="badge-delib-tag">Deliberated</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
