import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const OfficerContext = createContext(null);

const STORAGE_KEY = 'sentinelcatch_officer_session';

export function OfficerProvider({ children }) {
  // Real authenticated officer session (starts as null if not signed in)
  const [officer, setOfficer] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse officer session:', e);
    }
    return null;
  });

  const [stations, setStations] = useState([]);
  const [stationDispatches, setStationDispatches] = useState([]);
  const [stationOfficers, setStationOfficers] = useState([]);
  // If not signed in, the authentication gate opens automatically
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return !saved;
    } catch {
      return true;
    }
  });
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
      const [dispatchesRes, rosterRes] = await Promise.all([
        fetch(`/api/patrol/station/${stationId}/dispatches`),
        fetch(`/api/officers/roster?station=${stationId}`),
      ]);

      if (dispatchesRes.ok) {
        const dData = await dispatchesRes.json();
        setStationDispatches(dData.dispatches || []);
      }

      if (rosterRes.ok) {
        const rData = await rosterRes.json();
        setStationOfficers(rData.officers || []);
      }
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

  // Listen for real-time SSE patrol updates
  useEffect(() => {
    const handleSseDispatch = (e) => {
      const data = e.detail;
      if (!data) return;

      if (officer && data.stationId === officer.stationId) {
        if (data.type === 'dispatch_created') {
          setStationDispatches((prev) => [data.dispatch, ...prev]);
        } else if (data.type === 'status_updated') {
          setStationDispatches((prev) =>
            prev.map((d) => (d.id === data.dispatch.id ? data.dispatch : d))
          );
        }
      }
    };

    const handleSsePresence = (e) => {
      const data = e.detail;
      if (!data || !officer) return;
      if (data.stationId === officer.stationId) {
        fetchStationData(officer.stationId);
      }
    };

    window.addEventListener('sentinelcatch:patrol_dispatch', handleSseDispatch);
    window.addEventListener('sentinelcatch:officer_presence', handleSsePresence);

    return () => {
      window.removeEventListener('sentinelcatch:patrol_dispatch', handleSseDispatch);
      window.removeEventListener('sentinelcatch:officer_presence', handleSsePresence);
    };
  }, [officer, fetchStationData]);

  // Real officer registration (Sign Up) against TiDB database
  const signUpOfficer = async ({ name, jobId, stationId, agency, rank, pin }) => {
    const res = await fetch('/api/officers/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, jobId, stationId, agency, rank, pin }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to complete officer registration');
    }

    const newOfficer = data.officer;
    setOfficer(newOfficer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOfficer));
      localStorage.setItem('sentinelcatch_officer_name', newOfficer.name);
    } catch {}

    setIsAuthModalOpen(false);
    if (newOfficer.stationId) {
      fetchStationData(newOfficer.stationId);
    }
    return newOfficer;
  };

  // Real officer authentication (Sign In) against TiDB database
  const signInOfficer = async ({ jobId, pin, stationId }) => {
    const res = await fetch('/api/officers/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, pin, stationId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify officer credentials');
    }

    const verifiedOfficer = data.officer;
    setOfficer(verifiedOfficer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(verifiedOfficer));
      localStorage.setItem('sentinelcatch_officer_name', verifiedOfficer.name);
    } catch {}

    setIsAuthModalOpen(false);
    if (verifiedOfficer.stationId) {
      fetchStationData(verifiedOfficer.stationId);
    }
    return verifiedOfficer;
  };

  // Sign out officer
  const signOutOfficer = () => {
    setOfficer(null);
    setStationDispatches([]);
    setStationOfficers([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('sentinelcatch_officer_name');
    } catch {}
    setIsAuthModalOpen(true);
  };

  // Switch Station assignment
  const switchStation = async (newStationId) => {
    if (!officer) return;
    const stObj = stations.find((s) => s.id === newStationId);
    const updated = {
      ...officer,
      stationId: newStationId,
      stationName: stObj ? stObj.name : officer.stationName,
      stationCode: stObj ? stObj.code : officer.stationCode,
      stationSector: stObj ? stObj.sector : officer.stationSector,
    };
    setOfficer(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    fetchStationData(newStationId);
  };

  // Dispatch a new patrol mission to the current station
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

    const result = await res.json();
    if (result.dispatch) {
      setStationDispatches((prev) => [result.dispatch, ...prev]);
    }
    return result;
  };

  // Update status of an active mission
  const updatePatrolStatus = async (dispatchId, status, note = '') => {
    const res = await fetch(`/api/patrol/dispatches/${dispatchId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update dispatch status');
    }

    const result = await res.json();
    if (result.dispatch) {
      setStationDispatches((prev) =>
        prev.map((d) => (d.id === dispatchId ? result.dispatch : d))
      );
    }
    return result;
  };

  return (
    <OfficerContext.Provider
      value={{
        officer,
        isAuthenticated: Boolean(officer && officer.jobId),
        stations,
        stationDispatches,
        stationOfficers,
        loadingDispatches,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => {
          // If officer is signed in, allow closing. If not signed in, keep gate open.
          if (officer && officer.jobId) {
            setIsAuthModalOpen(false);
          }
        },
        signUpOfficer,
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
