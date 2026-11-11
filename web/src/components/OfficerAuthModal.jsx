import { useState } from 'react';
import { useOfficer } from '../context/OfficerContext.jsx';

const PRESET_OFFICERS = [
  {
    name: 'Insp. David Kiprono',
    jobId: 'KCGS-84920',
    stationId: 'lamu',
    agency: 'Kenya Coast Guard Service (KCGS)',
    rank: 'Inspector / Tactical Commander',
    badge: '⚓ Lamu Tactical Command',
    description: 'Northern sector lead patrolling Kiunga Marine Reserve & Somali border.',
  },
  {
    name: 'Lt. Cmdr. Hassan Bakari',
    jobId: 'KNS-3012',
    stationId: 'mombasa',
    agency: 'Kenya Navy / Multi-Agency Command',
    rank: 'Lieutenant Commander',
    badge: '🚢 Mombasa Central HQ',
    description: 'Central operations lead deploying KCGS Doria across 200nm deep EEZ.',
  },
  {
    name: 'Officer Faith Mwangi',
    jobId: 'KFS-4102',
    stationId: 'malindi',
    agency: 'Kenya Fisheries Service (KeFS)',
    rank: 'Senior Fisheries Inspector',
    badge: '🐟 Malindi Protection Base',
    description: 'Fisheries compliance officer guarding Ungwana Bay & Watamu reserves.',
  },
  {
    name: 'Sgt. Juma Mwashumbe',
    jobId: 'KCGS-6631',
    stationId: 'shimoni',
    agency: 'Kenya Coast Guard Service (KCGS)',
    rank: 'Border Patrol Sergeant',
    badge: '🛡️ Shimoni Border Post',
    description: 'Southern border patrol commanding Pemba Channel & Kisite-Mpunguti.',
  },
];

export default function OfficerAuthModal({ isOpen, onClose }) {
  const { officer, stations, signInOfficer, signOutOfficer, stationOfficers } = useOfficer();

  const [name, setName] = useState(officer?.name || '');
  const [jobId, setJobId] = useState(officer?.jobId || '');
  const [stationId, setStationId] = useState(officer?.stationId || 'lamu');
  const [agency, setAgency] = useState(officer?.agency || 'Kenya Coast Guard Service (KCGS)');
  const [rank, setRank] = useState(officer?.rank || 'Inspector / Tactical Commander');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name and title.');
      return;
    }
    if (!jobId.trim()) {
      setErrorMsg('Please enter your official Job ID / Service Number.');
      return;
    }

    setLoading(true);
    try {
      await signInOfficer({
        name: name.trim(),
        jobId: jobId.trim().toUpperCase(),
        stationId,
        agency,
        rank,
      });
      setSuccessMsg('✓ Officer authenticated successfully.');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to sign in officer.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setName(preset.name);
    setJobId(preset.jobId);
    setStationId(preset.stationId);
    setAgency(preset.agency);
    setRank(preset.rank);
  };

  const activeStationColleagues = stationOfficers.filter((o) => o.stationId === stationId);

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div className="officer-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="officer-modal-header">
          <div className="officer-header-left">
            <div className="officer-crest-badge">
              <span>🇰🇪</span>
            </div>
            <div>
              <h3 className="officer-modal-title">Maritime Officer Authentication</h3>
              <p className="officer-modal-sub">
                Kenya Coastal Command Patrol Network · Station Collaborative Data Sharing
              </p>
            </div>
          </div>
          <button className="btn-intel-close-panel" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Informative Banner */}
        <div className="officer-station-sharing-banner">
          <span className="banner-icon">📡</span>
          <div className="banner-text">
            <strong>Collaborative Station Network:</strong> Officers registered at the same coastal station automatically share live vessel dispatches, tactical patrol sweeps, fuel logs, and intercept orders in real-time.
          </div>
        </div>

        {/* Quick 1-Click Demo Profiles (For National Finals Demo) */}
        <div className="officer-presets-section">
          <span className="presets-label">⚡ Quick 1-Click Duty Profiles (National Finals Demo):</span>
          <div className="presets-chips-grid">
            {PRESET_OFFICERS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                className={`preset-chip-btn ${jobId === preset.jobId ? 'active' : ''}`}
                onClick={() => handleApplyPreset(preset)}
                title={preset.description}
              >
                <span className="preset-chip-badge">{preset.badge}</span>
                <span className="preset-chip-name">{preset.name}</span>
                <span className="preset-chip-id">{preset.jobId}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sign In / Sign Up Form */}
        <form onSubmit={handleSubmit} className="officer-form-body">
          <div className="form-fields-grid">
            <div className="form-group">
              <label htmlFor="officer-name">
                <span>Officer Full Name & Title</span>
                <span className="req-star">*</span>
              </label>
              <input
                id="officer-name"
                type="text"
                className="officer-input"
                placeholder="e.g. Insp. Grace Waweru"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="officer-job-id">
                <span>Job ID / Service Number</span>
                <span className="req-star">*</span>
              </label>
              <input
                id="officer-job-id"
                type="text"
                className="officer-input"
                placeholder="e.g. KCGS-8842 or KFS-3310"
                value={jobId}
                onChange={(e) => setJobId(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="officer-station">
                <span>Assigned Coastal Command Station</span>
                <span className="req-star">*</span>
              </label>
              <select
                id="officer-station"
                className="officer-select"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} ({s.sector})
                  </option>
                ))}
              </select>
              <span className="field-hint">
                You will share real-time patrol dispatches and vessel alerts with all officers at this station.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="officer-agency">Enforcement Agency</label>
              <select
                id="officer-agency"
                className="officer-select"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
              >
                <option value="Kenya Coast Guard Service (KCGS)">Kenya Coast Guard Service (KCGS)</option>
                <option value="Kenya Fisheries Service (KeFS)">Kenya Fisheries Service (KeFS)</option>
                <option value="Kenya Navy / Multi-Agency">Kenya Navy / Multi-Agency Command</option>
                <option value="Kenya Maritime Authority (KMA)">Kenya Maritime Authority (KMA)</option>
                <option value="ODPP Maritime Crimes Division">ODPP Maritime Crimes Division</option>
                <option value="KRA Marine Customs Enforcement">KRA Marine Customs Enforcement</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="officer-rank">Duty Role / Rank</label>
              <input
                id="officer-rank"
                type="text"
                className="officer-input"
                placeholder="e.g. Patrol Commander / Inspector"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
              />
            </div>
          </div>

          {/* Active Station Colleagues Preview */}
          {activeStationColleagues.length > 0 && (
            <div className="station-team-preview">
              <span className="team-preview-title">
                👥 Officers Currently on Duty at this Station ({activeStationColleagues.length}):
              </span>
              <div className="team-badges-wrap">
                {activeStationColleagues.map((colleague, cIdx) => (
                  <span key={cIdx} className="team-officer-pill">
                    <span className="dot-online"></span>
                    <strong>{colleague.name}</strong> ({colleague.jobId}) · {colleague.rank}
                  </span>
                ))}
              </div>
            </div>
          )}

          {errorMsg && <div className="officer-error-box">{errorMsg}</div>}
          {successMsg && <div className="officer-success-box">{successMsg}</div>}

          {/* Bottom Action Buttons */}
          <div className="officer-modal-actions">
            {officer && (
              <button
                type="button"
                className="btn-officer-signout"
                onClick={() => {
                  signOutOfficer();
                  setName('');
                  setJobId('');
                }}
              >
                Sign Out Current Officer
              </button>
            )}

            <div className="actions-right">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-officer-submit" disabled={loading}>
                {loading ? 'Authenticating...' : '✓ Confirm Station Duty & Connect'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

