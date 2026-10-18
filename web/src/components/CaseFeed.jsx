import { useState, useMemo } from 'react';
import { getTranslation } from '../services/i18n.js';

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

  const sectors = [
    { id: 'all', label: t.sectorAll },
    { id: 'Lamu', label: t.sectorLamu },
    { id: 'Malindi-Kilifi', label: t.sectorMalindiKilifi },
    { id: 'Mombasa', label: t.sectorMombasa },
    { id: 'South Coast/Vanga', label: t.sectorSouthCoast },
  ];

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
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
        const idMatch = String(c.id).includes(q);
        if (!loc.includes(q) && !rat.includes(q) && !sec.includes(q) && !idMatch) {
          return false;
        }
      }
      return true;
    });
  }, [cases, activeSector, bandFilter, statusFilter, searchQuery]);

  return (
    <aside className="case-feed-sidebar">
      {/* Sector Quick Tabs */}
      <div className="feed-header">
        <div className="sector-scroll-bar">
          {sectors.map((s) => (
            <button
              key={s.id}
              className={`sector-tab-btn ${activeSector === s.id ? 'active' : ''}`}
              onClick={() => onSectorChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search & Band Filters */}
        <div className="feed-filter-row">
          <input
            type="text"
            className="feed-search-input"
            placeholder="Search vessels, ports, sector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="feed-filter-select"
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
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

      {/* Case Cards List */}
      <div className="case-cards-list">
        {isLoading && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading maritime intelligence cases...
          </div>
        )}

        {!isLoading && filteredCases.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🌊</p>
            <p>{t.noCasesFound}</p>
          </div>
        )}

        {filteredCases.map((c) => {
          const isSelected = selectedCaseId === c.id;
          const bandClass = c.band === 'High' ? 'badge-high' : c.band === 'Medium' ? 'badge-medium' : 'badge-low';
          const locLabel = c.features?.locationLabel || `${c.sector || 'Open Ocean'}`;
          const candidate = c.candidate_matches?.[0] || c.features?.candidate_matches?.[0] || null;

          return (
            <div
              key={c.id}
              className={`case-card ${isSelected ? 'case-card-selected' : ''}`}
              onClick={() => onSelectCase(c.id)}
            >
              <div className="case-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${bandClass}`}>
                    {c.band.toUpperCase()} · {c.score_final}/100
                  </span>
                  <span className="case-sector-tag">{c.sector}</span>
                </div>
                <span className="case-time-ago">{timeAgo(c.created_at)}</span>
              </div>

              <div className="case-card-body">
                <div className="case-location-title">
                  📍 {locLabel}
                </div>

                {candidate && (
                  <div className="case-candidate-chip">
                    🎯 <strong>{candidate.vesselName}</strong> ({candidate.confidencePct}% match)
                    {candidate.iuuListed && <span className="tag-danger-micro">IUU</span>}
                  </div>
                )}

                <p className="case-rationale-snippet">
                  {c.rationale}
                </p>
              </div>

              <div className="case-card-footer">
                <span className={`status-pill status-${c.status || 'new'}`}>
                  {c.status || 'new'}
                </span>
                {c.features?.inMPA && (
                  <span className="badge-mpa-tag">🌿 Inside MPA</span>
                )}
                {c.features?.deliberation && (
                  <span className="badge-delib-tag">⚖️ Deliberated</span>
                )}
                {c.features?.recurrenceCount > 1 && (
                  <span className="badge-loiter-tag">🔄 {c.features.recurrenceCount} Passes</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
