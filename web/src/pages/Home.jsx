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
  const [isLoading, setIsLoading] = useState(true);
  const [flyToCoords, setFlyToCoords] = useState(null);
  const [testSending, setTestSending] = useState(false);
  const [testToast, setTestToast] = useState(null);
  const [showPatrolModal, setShowPatrolModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);

  // Fetch cases from /api/cases
  const fetchCases = useCallback(() => {
    setIsLoading(true);
    fetch('/api/cases?limit=100')
      .then((res) => res.json())
      .then((data) => {
        const loadedCases = data.cases || [];
        setCases(loadedCases);
        setIsLoading(false);
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
          setFlyToCoords({ lat, lon });
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
            <span className="logo-icon">🛡️</span>
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
        </div>


        {/* Right Tools & Language Toggle */}
        <div className="ops-header-right">
          <button
            className="btn-header-tool btn-header-highlight"
            onClick={() => setShowChatModal(true)}
            title="Ask SentinelCatch natural language intelligence copilot"
          >
            💬 Ask AI
          </button>

          <button
            className="btn-header-tool"
            onClick={() => setShowPatrolModal(true)}
            title="Open Coastal Patrol Dispatch Planner"
          >
            ⚓ Patrol Planner
          </button>

          <button
            className="btn-header-tool"
            onClick={handleTriggerTest}
            disabled={testSending}
            title={t.sendTestAlert}
          >
            {testSending ? '...' : '⚡ Test Alert'}
          </button>

          <button
            className={`btn-header-tool ${soundEnabled ? 'active' : ''}`}
            onClick={toggleSound}
            title={soundEnabled ? t.soundOn : t.soundOff}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          <button
            className="btn-language-switch"
            onClick={toggleLanguage}
            title="Switch Language (English / Kiswahili)"
          >
            🌐 {language === 'en' ? 'EN' : 'SW'}
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

        {/* Center / Main: MapLibre Viewport (Flat & 3D Globe) */}
        <main className="ops-map-area">
          <MapViewport
            selectedCaseId={selectedCaseId}
            onSelectCase={handleSelectCase}
            cases={cases}
            activeSector={activeSector}
            language={language}
            flyToCoords={flyToCoords}
          />
        </main>

        {/* Tactical Intel Drawer Panel */}
        {selectedCase && (
          <CaseIntelPanel
            caseItem={selectedCase}
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
