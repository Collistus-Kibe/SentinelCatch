import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const OfficerContext = createContext(null);

const STORAGE_KEY = 'sentinelcatch_officer_session';

const DEFAULT_OFFICER = {
  id: 'off-lamu-1',
  name: 'Insp. David Kiprono',
  jobId: 'KCGS-84920',
  stationId: 'lamu',
  stationCode: 'LAM-01',
  stationName: 'Lamu Archipelago Tactical Command',
  stationSector: 'Northern Coast / Somali Border',
  agency: 'Kenya Coast Guard Service (KCGS)',
  rank: 'Inspector / Tactical Commander',
  status: 'on_duty',
};

export function OfficerProvider({ children }) {
  const [officer, setOfficer] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse officer session:', e);
    }
    return DEFAULT_OFFICER;
  });

  const [stations, setStations] = useState([]);
  const [stationDispatches, setStationDispatches] = useState([]);
  const [stationOfficers, setStationOfficers] = useState([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [loadingDispatches, setLoadingDispatches] = useState(false);

  // Fetch available Kenya stations on mount
  useEffect(() => {
    fetch('/api/stations')
      .then((res) => res.json())
      .then((data) => {
        if (data.stations) setStations(data.stations);
      })
      .catch((err) => console.warn('Failed to fetch stations:', err));
  }, []);

  // Fetch station dispatches & active colleagues whenever officer or station changes
  const fetchStationData = useCallback(async (stationId) => {
    if (!stationId) return;
    setLoadingDispatches(true);
    try {
      const [dispRes, rosterRes] = await Promise.all([
        fetch(`/api/patrol/station/${stationId}/dispatches`),
        fetch(`/api/officers/roster?station=${stationId}`),
      ]);
      const dispData = await dispRes.json();
      const rosterData = await rosterRes.json();

      if (dispData.dispatches) setStationDispatches(dispData.dispatches);
      if (rosterData.officers) setStationOfficers(rosterData.officers);
    } catch (err) {
      console.warn('Failed to fetch station patrol data:', err);
    } finally {
      setLoadingDispatches(false);
    }
  }, []);

  useEffect(() => {
    if (officer?.stationId) {
      fetchStationData(officer.stationId);
    }
  }, [officer?.stationId, fetchStationData]);

  // Listen to SSE patrol_dispatch and officer_presence events via window custom event or direct fetch poll
  useEffect(() => {
    const handleSseDispatch = (e) => {
      const data = e.detail;
      if (data && data.stationId === officer?.stationId) {
        if (data.type === 'new_dispatch' && data.dispatch) {
          setStationDispatches((prev) => [data.dispatch, ...prev.filter((d) => d.id !== data.dispatch.id)]);
        } else if (data.type === 'status_update' && data.dispatch) {
          setStationDispatches((prev) =>
            prev.map((d) => (d.id === data.dispatch.id ? { ...d, ...data.dispatch } : d))
          );
        }
      }
    };

    window.addEventListener('sentinelcatch:patrol_dispatch', handleSseDispatch);
    return () => window.removeEventListener('sentinelcatch:patrol_dispatch', handleSseDispatch);
  }, [officer?.stationId]);

  // Sign In / Register Officer
  const signInOfficer = async ({ name, jobId, stationId, agency, rank }) => {
    try {
      const res = await fetch('/api/officers/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, jobId, stationId, agency, rank }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Sign-in failed');
      }
      const data = await res.json();
      setOfficer(data.officer);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.officer));
      setIsAuthModalOpen(false);
      fetchStationData(data.officer.stationId);
      return data.officer;
    } catch (err) {
      console.error('Sign-in error:', err);
      throw err;
    }
  };

  // Sign out / clear session
  const signOutOfficer = () => {
    localStorage.removeItem(STORAGE_KEY);
    setOfficer(null);
  };

  // Quick switch station
  const switchStation = async (stationId) => {
    if (!officer) return;
    const target = stations.find((s) => s.id === stationId);
    if (!target) return;

    return signInOfficer({
      name: officer.name,
      jobId: officer.jobId,
      stationId,
      agency: officer.agency,
      rank: officer.rank,
    });
  };

  // Dispatch a new patrol mission under officer's station
  const dispatchPatrol = async (dispatchPayload) => {
    if (!officer?.stationId) throw new Error('You must be signed into a station to dispatch a patrol');

    const res = await fetch(`/api/patrol/station/${officer.stationId}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officerName: officer.name,
        officerJobId: officer.jobId,
        ...dispatchPayload,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to dispatch patrol');
    }

    const data = await res.json();
    setStationDispatches((prev) => [data.dispatch, ...prev.filter((d) => d.id !== data.dispatch.id)]);
    return data.dispatch;
  };

  // Advance status of a patrol mission (DEPLOYED -> ON_SCENE -> BOARDING -> COMPLETED)
  const updatePatrolStatus = async (dispatchId, newStatus, note = '') => {
    const res = await fetch(`/api/patrol/dispatches/${dispatchId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        note,
        updatedBy: `${officer?.name || 'Officer'} (${officer?.jobId || 'DUTY'})`,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update status');
    }

    const data = await res.json();
    setStationDispatches((prev) =>
      prev.map((d) => (d.id === data.dispatch.id ? { ...d, ...data.dispatch } : d))
    );
    return data.dispatch;
  };

  return (
    <OfficerContext.Provider
      value={{
        officer,
        stations,
        stationDispatches,
        stationOfficers,
        loadingDispatches,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        signInOfficer,
        signOutOfficer,
        switchStation,
        dispatchPatrol,
        updatePatrolStatus,
        refreshStationData: () => fetchStationData(officer?.stationId),
      }}
    >
      {children}
    </OfficerContext.Provider>
  );
}

export function useOfficer() {
  const context = useContext(OfficerContext);
  if (!context) {
    throw new Error('useOfficer must be used within an OfficerProvider');
  }
  return context;
}

export default OfficerContext;

