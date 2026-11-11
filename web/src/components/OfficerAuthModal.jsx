import { useState } from 'react';
import { useOfficer } from '../context/OfficerContext.jsx';

export default function OfficerAuthModal({ isOpen, onClose }) {
  const { officer, stations, signInOfficer, signUpOfficer, signOutOfficer, stationOfficers } =
    useOfficer();

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState(officer ? 'signin' : 'signup');

  // Form fields
  const [name, setName] = useState('');
  const [jobId, setJobId] = useState(officer?.jobId || '');
  const [pin, setPin] = useState('');
  const [stationId, setStationId] = useState(officer?.stationId || 'lamu');
  const [agency, setAgency] = useState(officer?.agency || 'Kenya Coast Guard Service (KCGS)');
  const [rank, setRank] = useState(officer?.rank || 'Patrol Inspector / Tactical Commander');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const isAccessGate = !officer;

  const handleClose = () => {
    if (isAccessGate) {
      setErrorMsg('Authentication required. Please sign in or register to access maritime operations.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    onClose();
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!jobId.trim()) {
      setErrorMsg('Please enter your official Job ID / Service Number.');
      return;
    }
    if (!pin.trim()) {
      setErrorMsg('Please enter your Service Security PIN / Password.');
      return;
    }

    setLoading(true);
    try {
      const res = await signInOfficer({
        jobId: jobId.trim().toUpperCase(),
        pin: pin.trim(),
        stationId,
      });
      setSuccessMsg(`✓ Verified. Welcome on duty, ${res.name}.`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to authenticate officer.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your official full name and title.');
      return;
    }
    if (!jobId.trim()) {
      setErrorMsg('Please enter your official Job ID / Service Number.');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      setErrorMsg('Security PIN must be at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await signUpOfficer({
        name: name.trim(),
        jobId: jobId.trim().toUpperCase(),
        stationId,
        agency,
        rank: rank.trim() || 'Tactical Officer',
        pin: pin.trim(),
      });
      setSuccessMsg(`✓ Registered. Welcome on duty, ${res.name}.`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to register officer.');
    } finally {
      setLoading(false);
    }
  };

  const activeStationColleagues = stationOfficers.filter((o) => o.stationId === stationId);

  return (
    <div className="dossier-modal-overlay" onClick={handleClose}>
      <div className="officer-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="officer-modal-header">
          <div className="officer-header-left">
            <div className="officer-crest-badge">
              <span>🇰🇪</span>
            </div>
            <div>
              <h3 className="officer-modal-title">
                {isAccessGate ? 'Official Maritime Security Gate' : 'Officer Station Authentication'}
              </h3>
              <p className="officer-modal-sub">
                Kenya Coastal Command Patrol Network · TiDB Cloud Collaborative Store
              </p>
            </div>
          </div>
          {!isAccessGate && (
            <button className="btn-intel-close-panel" onClick={handleClose} type="button">
              ✕
            </button>
          )}
        </div>

        {/* Security Gate Notice */}
        {isAccessGate && (
          <div className="officer-station-sharing-banner gate-notice">
            <span className="banner-icon">🔒</span>
            <div className="banner-text">
              <strong>Official Access Gate:</strong> Sign in with your registered Service ID and PIN, or create a new officer account to connect to your assigned coastal base. Officers at the same station share live vessel dispatches and patrol intel in real-time.
            </div>
          </div>
        )}

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="officer-tabs-row">
          <button
            type="button"
            className={`officer-tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            <span>🔐 Officer Sign In</span>
          </button>
          <button
            type="button"
            className={`officer-tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            <span>📝 Register New Officer</span>
          </button>
        </div>

        {/* Form Body */}
        {mode === 'signin' ? (
          <form className="officer-form-body" onSubmit={handleSignIn}>
            <div className="form-fields-grid">
              <div className="form-group form-group-full">
                <label htmlFor="signin-job-id">
                  <span>Job ID / Service Number</span>
                  <span className="req-star">*</span>
                </label>
                <input
                  id="signin-job-id"
                  type="text"
                  className="officer-input"
                  placeholder="e.g. KCGS-84920 or KFS-4102"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value.toUpperCase())}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="signin-pin">
                  <span>Service Security PIN / Password</span>
                  <span className="req-star">*</span>
                </label>
                <input
                  id="signin-pin"
                  type="password"
                  className="officer-input"
                  placeholder="Enter your security PIN or password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                />
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="signin-station">
                  <span>Duty Station Assignment</span>
                </label>
                <select
                  id="signin-station"
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
                  Live patrol dispatches and tactical sweeps will synchronize with this station.
                </span>
              </div>
            </div>

            {/* Active Station Colleagues Preview */}
            {activeStationColleagues.length > 0 && (
              <div className="station-team-preview">
                <span className="team-preview-title">
                  👥 Officers On Duty at Selected Station ({activeStationColleagues.length}):
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

            <div className="officer-modal-actions">
              {officer ? (
                <button
                  type="button"
                  className="btn-officer-signout"
                  onClick={() => {
                    signOutOfficer();
                    setName('');
                    setJobId('');
                    setPin('');
                  }}
                >
                  Sign Out Current Officer
                </button>
              ) : (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  No account yet?{' '}
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={() => setMode('signup')}
                  >
                    Register here
                  </button>
                </div>
              )}

              <div className="actions-right">
                {!isAccessGate && (
                  <button type="button" className="btn-cancel" onClick={handleClose}>
                    Close
                  </button>
                )}
                <button type="submit" className="btn-officer-submit" disabled={loading}>
                  {loading ? 'Verifying with TiDB...' : '✓ Sign In & Connect'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form className="officer-form-body" onSubmit={handleSignUp}>
            <div className="form-fields-grid">
              <div className="form-group form-group-full">
                <label htmlFor="signup-name">
                  <span>Officer Full Name & Title</span>
                  <span className="req-star">*</span>
                </label>
                <input
                  id="signup-name"
                  type="text"
                  className="officer-input"
                  placeholder="e.g. Insp. James Omari or Lt. Cmdr. Sarah Kiptoo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-job-id">
                  <span>Job ID / Service Number</span>
                  <span className="req-star">*</span>
                </label>
                <input
                  id="signup-job-id"
                  type="text"
                  className="officer-input"
                  placeholder="e.g. KCGS-8842"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-pin">
                  <span>Service Security PIN / Password</span>
                  <span className="req-star">*</span>
                </label>
                <input
                  id="signup-pin"
                  type="password"
                  className="officer-input"
                  placeholder="Min 4 characters (e.g. 1234)"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                />
              </div>

              <div className="form-group form-group-full">
                <label htmlFor="signup-station">
                  <span>Assigned Coastal Command Station</span>
                  <span className="req-star">*</span>
                </label>
                <select
                  id="signup-station"
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
                  Your credentials and live patrol sweeps will be tied to this station in TiDB.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="signup-agency">Enforcement Agency</label>
                <select
                  id="signup-agency"
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
                <label htmlFor="signup-rank">Duty Role / Specialization</label>
                <input
                  id="signup-rank"
                  type="text"
                  className="officer-input"
                  placeholder="e.g. Tactical Boarding Lead / Inspector"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  required
                />
              </div>
            </div>

            {errorMsg && <div className="officer-error-box">{errorMsg}</div>}
            {successMsg && <div className="officer-success-box">{successMsg}</div>}

            <div className="officer-modal-actions">
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Already registered?{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  onClick={() => setMode('signin')}
                >
                  Sign In here
                </button>
              </div>

              <div className="actions-right">
                {!isAccessGate && (
                  <button type="button" className="btn-cancel" onClick={handleClose}>
                    Close
                  </button>
                )}
                <button type="submit" className="btn-officer-submit" disabled={loading}>
                  {loading ? 'Registering in TiDB...' : '✓ Register Officer in TiDB'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
