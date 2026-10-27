import { useState, useEffect, useCallback } from 'react';
import MapViewport from '../components/MapViewport.jsx';
import CaseFeed from '../components/CaseFeed.jsx';
import CaseIntelPanel from '../components/CaseIntelPanel.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import PatrolPlannerModal from '../components/PatrolPlannerModal.jsx';
import AskSentinelCatchModal from '../components/AskSentinelCatchModal.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import { getTranslation } from '../services/i18n.js';

export default function Home() {
  const {
    connectionStatus,
    soundEnabled,
    toggleSound,
    language,
    toggleLanguage,
    sendSystemTest,
  } = useNotifications();

  const t = getTranslation(language);

  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeSector, setActiveSector] = useState('all');
  const [activeView, setActiveView] = useState('tactical'); // 'tactical' | 'traceback'
  const [isLoading, setIsLoading] = useState(true);
  const [flyToCoords, setFlyToCoords] = useState(null);
  const [testSending, setTestSending] = useState(false);
  const [testToast, setTestToast] = useState(null);
  const [showPatrolModal, setShowPatrolModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [zuluTime, setZuluTime] = useState(() => new Date().toISOString().slice(11, 19) + 'Z');

  useEffect(() => {
    const timer = setInterval(() => {
      setZuluTime(new Date().toISOString().slice(11, 19) + 'Z');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch cases from /api/cases
  const fetchCases = useCallback(() => {
    setIsLoading(true);
    fetch('/api/cases?limit=100')
      .then((res) => res.json())
      .then((data) => {
        const loadedCases = data.cases || [];
        setCases(loadedCases);
        setIsLoading(false);
        // Automatically synchronize default selected case on first load
        setSelectedCaseId((prev) => {
          if (prev) return prev;
          if (loadedCases.length > 0) {
            setSelectedCase(loadedCases[0]);
            return loadedCases[0].id;
          }
          return null;
        });
      })
      .catch((err) => {
        console.error('Failed to load cases:', err);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Handle case selection
  const handleSelectCase = useCallback(
    (caseId) => {
      setSelectedCaseId(caseId);
      const found = cases.find((c) => c.id === caseId);
      if (found) {
        setSelectedCase(found);
        const lat = found.features?.lat ?? found.lat;
        const lon = found.features?.lon ?? found.lon;
        if (lat !== undefined && lon !== undefined) {
          setFlyToCoords({ lat, lon, caseId });
        }
      }
    },
    [cases]
  );

  // Update case status after action
  const handleActionComplete = useCallback((updated) => {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setSelectedCase((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  // Quick system test
  const handleTriggerTest = async () => {
    setTestSending(true);
    try {
      const res = await sendSystemTest();
      setTestToast(`✓ System test delivered via SSE in ${res.roundTripMs}ms`);
      setTimeout(() => setTestToast(null), 4000);
    } catch (err) {
      alert(`Test alert error: ${err.message}`);
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="operations-layout">
      {/* Top Operations Header */}
      <header className="ops-header">
        <div className="ops-header-left">
          <div className="logo-group">
            <span className="logo-icon-svg" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00f5d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <circle cx="12" cy="11" r="2.8" />
                <path d="M12 8.2v1M12 13.8v1M9.2 11h1M13.8 11h1" />
              </svg>
            </span>
            <div>
              <h1 className="ops-title">SentinelCatch</h1>
              <span className="ops-subtitle">{t.tagline}</span>
            </div>
          </div>

          <div className="connection-chip">
            <span
              className={`status-dot ${connectionStatus === 'connected' ? 'dot-ok' : 'dot-warn'}`}
            ></span>
            <span>{connectionStatus === 'connected' ? 'LIVE SSE' : connectionStatus.toUpperCase()}</span>
          </div>

          <div className="zulu-time-chip" title="Active Zulu Time [UTC Clock]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>UTC {zuluTime}</span>
          </div>

          <div className="sensor-telemetry-chip hidden-mobile" title="Surveillance Coverage: 245,000 sq km (Kenya EEZ)">
            <span className="telemetry-pulse-dot"></span>
            <span>245,000 SQ KM · AIS / SAR ACTIVE</span>
          </div>
        </div>

        {/* God's Eye C2 Mode Switch: Tactical Operations vs Trajectory Trace-Back */}
        <div className="view-mode-tabs" role="tablist">
          <button
            className={`view-mode-tab ${activeView === 'tactical' ? 'active' : ''}`}
            onClick={() => setActiveView('tactical')}
            role="tab"
            aria-selected={activeView === 'tactical'}
            title="Real-Time Tactical Radar & Coastline Surveillance"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            <span>Tactical Operations</span>
          </button>
          <button
            className={`view-mode-tab ${activeView === 'traceback' ? 'active' : ''}`}
            onClick={() => setActiveView('traceback')}
            role="tab"
            aria-selected={activeView === 'traceback'}
            title="Forensic Provenance & Vessel Origin Trace-Back Analysis"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Trajectory Trace-Back</span>
          </button>
        </div>

        {/* Right Tools & Language Toggle */}
        <div className="ops-header-right">
          <button
            className="btn-header-tool btn-header-highlight"
            onClick={() => setShowChatModal(true)}
            title="Open Maritime Tactical Copilot & Domain Intelligence Query"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            <span>Maritime Copilot</span>
          </button>

          <button
            className="btn-header-tool"
            onClick={() => setShowPatrolModal(true)}
            title="Open Coastal Patrol Dispatch Planner"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span>Patrol Planner</span>
          </button>

          <button
            className="btn-header-tool"
            onClick={handleTriggerTest}
            disabled={testSending}
            title={t.sendTestAlert}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
              <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
              <circle cx="12" cy="12" r="2" />
              <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
              <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
            </svg>
            <span>{testSending ? 'Broadcasting...' : 'Test Alert'}</span>
          </button>

          <button
            className={`btn-header-tool ${soundEnabled ? 'active' : ''}`}
            onClick={toggleSound}
            title={soundEnabled ? t.soundOn : t.soundOff}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {soundEnabled ? (
                <>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </>
              ) : (
                <>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>

          <button
            className="btn-language-switch"
            onClick={toggleLanguage}
            title="Switch Language (English / Kiswahili)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{language === 'en' ? 'EN' : 'SW'}</span>
          </button>

          <NotificationBell />
        </div>
      </header>

      {/* Main Workspace (Feed + Map + Intel) */}
      <div className="ops-workspace">
        {/* Left Side: Tactical Case Feed */}
        <CaseFeed
          cases={cases}
          selectedCaseId={selectedCaseId}
          onSelectCase={handleSelectCase}
          activeSector={activeSector}
          onSectorChange={setActiveSector}
          language={language}
          isLoading={isLoading}
        />

        {/* Center / Main: MapLibre Viewport (Flat & Fixed 3D Perspective) */}
        <main className="ops-map-area">
          <MapViewport
            selectedCaseId={selectedCaseId}
            onSelectCase={handleSelectCase}
            cases={cases}
            activeSector={activeSector}
            activeView={activeView}
            language={language}
            flyToCoords={flyToCoords}
          />
        </main>

        {/* Tactical Intel Drawer Panel */}
        {selectedCase && (
          <CaseIntelPanel
            caseItem={selectedCase}
            activeView={activeView}
            onClose={() => {
              setSelectedCase(null);
              setSelectedCaseId(null);
            }}
            onActionComplete={handleActionComplete}
            language={language}
          />
        )}
      </div>

      {testToast && <div className="ops-test-banner">{testToast}</div>}

      {/* Patrol Planner Modal */}
      <PatrolPlannerModal
        isOpen={showPatrolModal}
        onClose={() => setShowPatrolModal(false)}
        onSelectCase={handleSelectCase}
      />

      {/* Ask SentinelCatch Copilot Chat Modal */}
      <AskSentinelCatchModal
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
        onSelectCase={handleSelectCase}
      />
    </div>
  );
}
