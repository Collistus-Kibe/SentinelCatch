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
  isCollapsed = false,
  onToggleCollapse,
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
    { id: 'all', label: t.sectorAll || 'All' },
    { id: 'Lamu', label: t.sectorLamu || 'Lamu' },
    { id: 'Malindi-Kilifi', label: t.sectorMalindiKilifi || 'Malindi-Kilifi' },
    { id: 'Mombasa', label: t.sectorMombasa || 'Mombasa' },
    { id: 'South Coast/Vanga', label: t.sectorSouthCoast || 'South Coast' },
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
        const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || {};
        const candidateName = (candidate.vesselName || '').toLowerCase();
        const imo = String(candidate.imo || '').toLowerCase();
        const mmsi = String(candidate.mmsi || '').toLowerCase();
        const idMatch = String(c.id).includes(q);
        if (!loc.includes(q) && !rat.includes(q) && !sec.includes(q) && !candidateName.includes(q) && !imo.includes(q) && !mmsi.includes(q) && !idMatch) {
          return false;
        }
      }
      return true;
    });

    // Priority sort: Selected case first if in list, then highest risk score
    return list.sort((a, b) => {
      return (Number(b.score_final) || 0) - (Number(a.score_final) || 0);
    });
  }, [cases, activeSector, bandFilter, statusFilter, searchQuery]);

  if (isCollapsed) {
    return (
      <aside className="case-feed-sidebar is-collapsed-state">
        <button
          className="btn-expand-watchlist"
          onClick={onToggleCollapse}
          title="Expand Vessel Watchlist"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span className="collapsed-v-text">Watchlist ({filteredCases.length})</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="case-feed-sidebar">
      {/* Top Header: ☰ Watchlist [3] ... ✕ */}
      <div className="watchlist-top-bar">
        <div className="watchlist-title-group">
          <button
            className="btn-watchlist-toggle"
            onClick={onToggleCollapse}
            title="Toggle Watchlist Sidebar"
            type="button"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h2 className="watchlist-heading">Watchlist</h2>
          <span className="watchlist-count-badge">{filteredCases.length}</span>
        </div>

        <button
          className="btn-watchlist-close"
          onClick={onToggleCollapse}
          title="Collapse Watchlist"
          type="button"
          aria-label="Collapse Watchlist"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search Input: 🔍 Search vessel, IMO, or location... */}
      <div className="watchlist-search-container">
        <div className="watchlist-search-inner">
          <svg className="search-mag-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="watchlist-search-field"
            placeholder="Search vessel, IMO, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search query"
              type="button"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Select Controls: All risk levels ▾ | All status ▾ */}
      <div className="watchlist-filter-row">
        <div className="select-pill-wrapper">
          <select
            className="watchlist-select-pill"
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            title="Filter by risk level"
          >
            <option value="all">All risk levels</option>
            <option value="High">High risk</option>
            <option value="Medium">Medium risk</option>
            <option value="Low">Low risk</option>
          </select>
          <span className="select-chevron-icon">▾</span>
        </div>

        <div className="select-pill-wrapper">
          <select
            className="watchlist-select-pill"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by status"
          >
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="dispatched">Dispatched</option>
            <option value="false_alarm">False Alarm</option>
            <option value="resolved">Resolved</option>
          </select>
          <span className="select-chevron-icon">▾</span>
        </div>
      </div>

      {/* Compact Sector Tabs Row */}
      <div className="watchlist-sectors-bar">
        {sectors.map((s) => (
          <button
            key={s.id}
            className={`sector-mini-pill ${activeSector === s.id ? 'active' : ''}`}
            onClick={() => onSectorChange(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Scrollable Vessel Cards List */}
      <div className="watchlist-cards-scroll">
        {isLoading && (
          <div className="feed-status-msg">
            <span className="spinner-dot"></span>
            Loading surveillance radar feed...
          </div>
        )}

        {!isLoading && filteredCases.length === 0 && (
          <div className="feed-empty-state">
            <p className="empty-icon">⚓</p>
            <h5>No matching vessels found</h5>
            <p className="empty-sub">Try adjusting search keywords or filters</p>
          </div>
        )}

        {filteredCases.map((c) => {
          const isSelected = selectedCaseId === c.id;
          const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || null;
          const vesselName = candidate?.vesselName || c.features?.locationLabel || `Contact #${c.id}`;
          const vesselPhoto = getVesselPhoto(vesselName, candidate?.gearType || '');
          const score = Number(c.score_final) || 50;
          const band = c.band || 'Medium';

          // Risk pill label & styling
          const bandShort = band === 'High' ? 'HIGH' : band === 'Medium' ? 'MED' : 'LOW';
          const riskPillClass = band === 'High' ? 'risk-pill-high' : band === 'Medium' ? 'risk-pill-med' : 'risk-pill-low';
          const cardStripeClass = band === 'High' ? 'stripe-high' : band === 'Medium' ? 'stripe-med' : 'stripe-low';

          // Location & time label
          const locText = c.features?.locationLabel || (c.sector ? `${c.sector}, Kenya` : 'Kenya EEZ');
          const timeText = timeAgo(c.created_at);

          return (
            <div
              key={c.id}
              className={`watchlist-item-card ${cardStripeClass} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onSelectCase(c.id)}
            >
              {/* Vessel Photo Thumbnail */}
              <div className="card-thumb-frame">
                <img
                  src={vesselPhoto}
                  alt={vesselName}
                  className="card-thumb-img"
                  loading="lazy"
                />
              </div>

              {/* Card Main Info */}
              <div className="card-main-meta">
                <div className="card-header-row">
                  <h3 className="card-vessel-title" title={vesselName}>
                    {vesselName}
                  </h3>
                  <span className={`risk-pill ${riskPillClass}`}>
                    {bandShort} · {score}
                  </span>
                </div>

                <div className="card-sub-row card-loc-row">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="sub-text-ellipsis" title={locText}>{locText}</span>
                </div>

                <div className="card-sub-row card-time-row">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="sub-text-muted">Last seen: {timeText}</span>
                </div>
              </div>

              {/* Right Chevron */}
              <div className="card-chevron-indicator" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
