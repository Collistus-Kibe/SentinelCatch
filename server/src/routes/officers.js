import { Router } from 'express';
import { z } from 'zod';
import broker from '../alerts/broker.js';
import logger from '../logger.js';

const router = Router();

// Kenya Maritime Stations & Command Bases
export const KENYA_STATIONS = [
  {
    id: 'lamu',
    code: 'LAM-01',
    name: 'Lamu Archipelago Tactical Command',
    baseLocation: 'Manda Bay Naval Base / Lamu Port Gate',
    lat: -2.268,
    lon: 40.902,
    sector: 'Northern Coast / Somali Border',
    primaryAsset: 'Fast Interceptor Craft (FIC 12m)',
    agency: 'Kenya Coast Guard Service (KCGS) & Kenya Navy',
    jurisdiction: 'Kiunga Marine Reserve, Lamu Archipelago, Somali Border Ingress',
  },
  {
    id: 'mombasa',
    code: 'MOM-01',
    name: 'Mombasa Central Operations Center (HQ)',
    baseLocation: 'Mtongwe Naval Base & Kilindini Port Operations',
    lat: -4.065,
    lon: 39.664,
    sector: 'Southern / Central Coast & Deep EEZ',
    primaryAsset: 'KCGS Doria (OPV 54m) & KNS Shujaa',
    agency: 'Kenya Coast Guard Service (KCGS) & Kenya Navy',
    jurisdiction: 'Kilindini Port Roads, Diani Banks, Deep Ocean 200nm EEZ Fairways',
  },
  {
    id: 'malindi',
    code: 'MAL-01',
    name: 'Malindi Fisheries Protection Base',
    baseLocation: 'Ungwana Bay Fisheries MCS Station / Watamu',
    lat: -3.219,
    lon: 40.126,
    sector: 'Central Coast / Ungwana Bay',
    primaryAsset: 'Coastal Patrol Boat (PB 24m)',
    agency: 'Kenya Fisheries Service (KeFS) & KCGS Detachment',
    jurisdiction: 'Ungwana Bay Prawn Breeding Grounds, Watamu Marine Park, Sabaki Estuary',
  },
  {
    id: 'shimoni',
    code: 'SHI-01',
    name: 'Shimoni Border Marine Post',
    baseLocation: 'Shimoni Pier / Wasini Channel Post',
    lat: -4.647,
    lon: 39.382,
    sector: 'South Coast / Pemba Channel',
    primaryAsset: 'Inshore Interceptor Patrol (PB)',
    agency: 'KCGS & Kenya Maritime Authority (KMA)',
    jurisdiction: 'Kisite-Mpunguti Marine Reserve, Pemba Channel, Vanga Border with Tanzania',
  },
  {
    id: 'kiunga',
    code: 'KIU-01',
    name: 'Kiunga Northern Border Outpost',
    baseLocation: 'Kiunga Marine Reserve Station',
    lat: -1.748,
    lon: 41.488,
    sector: 'Northernmost Kenya EEZ / Somali Border',
    primaryAsset: 'Rapid Interceptor Skiff P-104',
    agency: 'Multi-Agency Maritime Security Command',
    jurisdiction: 'Kiunga National Marine Reserve, Northern 200nm Outer Boundary',
  },
];

// In-memory officer roster & station shared patrol dispatches
const activeOfficers = new Map();
const stationDispatches = new Map();

// Seed initial realistic officers and active patrol missions
function seedInitialData() {
  const initialOfficers = [
    {
      id: 'off-lamu-1',
      name: 'Insp. David Kiprono',
      jobId: 'KCGS-84920',
      stationId: 'lamu',
      stationName: 'Lamu Archipelago Tactical Command',
      agency: 'Kenya Coast Guard Service (KCGS)',
      rank: 'Inspector / Tactical Commander',
      status: 'on_duty',
      joinedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      lastActive: new Date().toISOString(),
    },
    {
      id: 'off-lamu-2',
      name: 'Sgt. Fatuma Ali',
      jobId: 'KCGS-89114',
      stationId: 'lamu',
      stationName: 'Lamu Archipelago Tactical Command',
      agency: 'Kenya Coast Guard Service (KCGS)',
      rank: 'Sergeant / Vessel Boarding Lead',
      status: 'on_duty',
      joinedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      lastActive: new Date().toISOString(),
    },
    {
      id: 'off-mombasa-1',
      name: 'Lt. Cmdr. Hassan Bakari',
      jobId: 'KNS-3012',
      stationId: 'mombasa',
      stationName: 'Mombasa Central Operations Center (HQ)',
      agency: 'Kenya Navy / Multi-Agency Command',
      rank: 'Lieutenant Commander',
      status: 'on_duty',
      joinedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      lastActive: new Date().toISOString(),
    },
    {
      id: 'off-malindi-1',
      name: 'Officer Faith Mwangi',
      jobId: 'KFS-4102',
      stationId: 'malindi',
      stationName: 'Malindi Fisheries Protection Base',
      agency: 'Kenya Fisheries Service (KeFS)',
      rank: 'Senior Fisheries Inspector',
      status: 'on_duty',
      joinedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      lastActive: new Date().toISOString(),
    },
  ];

  initialOfficers.forEach((off) => activeOfficers.set(off.jobId, off));

  // Seed sample shared patrol dispatch under Lamu station
  const sampleDispatchLamu = {
    id: 'dsp-lamu-101',
    dispatchCode: 'LAM-PAT-2026-08',
    stationId: 'lamu',
    stationName: 'Lamu Archipelago Tactical Command',
    officerName: 'Insp. David Kiprono',
    officerJobId: 'KCGS-84920',
    assetId: 'fast_interceptor',
    assetName: 'Fast Interceptor Craft (FIC 12m)',
    status: 'ON_SCENE',
    targetVesselName: 'TAI YUAN 227',
    targetCoords: '2.0500°S, 41.2500°E',
    totalDistanceNM: 44.8,
    estimatedFuelLiters: 380,
    etaFormatted: '1h 15m',
    speedKnots: 28,
    notes: 'Interception sweep inside Kiunga Marine Reserve for suspected dark tuna longliner.',
    dispatchedAt: new Date(Date.now() - 3600000 * 1.2).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleDispatchMombasa = {
    id: 'dsp-mom-202',
    dispatchCode: 'MOM-PAT-2026-14',
    stationId: 'mombasa',
    stationName: 'Mombasa Central Operations Center (HQ)',
    officerName: 'Lt. Cmdr. Hassan Bakari',
    officerJobId: 'KNS-3012',
    assetId: 'kcgs_doria',
    assetName: 'KCGS Doria (OPV 54m)',
    status: 'DEPLOYED',
    targetVesselName: 'SL PACIFIC DAWN 02',
    targetCoords: '4.5800°S, 39.5200°E',
    totalDistanceNM: 62.4,
    estimatedFuelLiters: 1250,
    etaFormatted: '2h 10m',
    speedKnots: 22,
    notes: 'Intercepting Sierra Leone-flagged bulk reefer near Shimoni entrance for customs inspection.',
    dispatchedAt: new Date(Date.now() - 3600000 * 0.8).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  stationDispatches.set('lamu', [sampleDispatchLamu]);
  stationDispatches.set('mombasa', [sampleDispatchMombasa]);
}

seedInitialData();

/**
 * GET /api/stations
 * List all Kenya maritime coastal command stations
 */
router.get('/stations', (_req, res) => {
  res.json({
    stations: KENYA_STATIONS,
    total: KENYA_STATIONS.length,
  });
});

/**
 * POST /api/officers/signin
 * Officer sign in / register with Name, Job ID, and Station
 */
const signInSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  jobId: z.string().min(3, 'Job ID / Service number must be at least 3 characters'),
  stationId: z.string().min(2, 'Station selection required'),
  agency: z.string().optional(),
  rank: z.string().optional(),
});

router.post('/officers/signin', (req, res) => {
  const result = signInSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid sign-in details', issues: result.error.issues });
  }

  const { name, jobId, stationId, agency, rank } = result.data;
  const stationObj = KENYA_STATIONS.find((s) => s.id === stationId) || KENYA_STATIONS[0];

  const cleanJobId = jobId.toUpperCase().trim();
  const existing = activeOfficers.get(cleanJobId);

  const officer = {
    id: existing ? existing.id : `off-${Date.now().toString(36)}`,
    name: name.trim(),
    jobId: cleanJobId,
    stationId: stationObj.id,
    stationCode: stationObj.code,
    stationName: stationObj.name,
    stationSector: stationObj.sector,
    agency: agency || existing?.agency || 'Kenya Coast Guard Service (KCGS)',
    rank: rank || existing?.rank || 'Patrol Officer',
    status: 'on_duty',
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };

  activeOfficers.set(cleanJobId, officer);
  logger.info({ officerName: officer.name, jobId: officer.jobId, station: officer.stationName }, 'Officer signed in');

  // Broadcast presence via AlertBroker
  broker.publish('officer_presence', {
    type: 'signin',
    officer,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    officer,
    station: stationObj,
  });
});

/**
 * GET /api/officers/roster
 * Get officers on duty (optionally filter by ?station=...)
 */
router.get('/officers/roster', (req, res) => {
  const { station } = req.query;
  const all = Array.from(activeOfficers.values());

  const filtered = station && station !== 'all'
    ? all.filter((o) => o.stationId === station)
    : all;

  res.json({
    officers: filtered,
    total: filtered.length,
    activeAtStation: station ? filtered.length : all.length,
  });
});

/**
 * GET /api/patrol/station/:stationId/dispatches
 * Get all shared patrol operations for a specific station
 */
router.get('/patrol/station/:stationId/dispatches', (req, res) => {
  const { stationId } = req.params;
  const dispatches = stationDispatches.get(stationId) || [];

  res.json({
    stationId,
    dispatches,
    activeCount: dispatches.filter((d) => d.status !== 'COMPLETED').length,
  });
});

/**
 * POST /api/patrol/station/:stationId/dispatches
 * Create a new patrol dispatch shared among officers of the same station
 */
const dispatchSchema = z.object({
  officerName: z.string().min(2),
  officerJobId: z.string().min(2),
  assetId: z.string().default('fast_interceptor'),
  assetName: z.string().default('Patrol Interceptor'),
  targetVesselName: z.string().optional(),
  targetCoords: z.string().optional(),
  totalDistanceNM: z.number().optional(),
  estimatedFuelLiters: z.number().optional(),
  etaFormatted: z.string().optional(),
  speedKnots: z.number().optional(),
  legs: z.array(z.any()).optional(),
  notes: z.string().optional(),
});

router.post('/patrol/station/:stationId/dispatches', (req, res) => {
  const { stationId } = req.params;
  const stationObj = KENYA_STATIONS.find((s) => s.id === stationId);
  if (!stationObj) {
    return res.status(404).json({ error: 'Station not found' });
  }

  const result = dispatchSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid dispatch parameters', issues: result.error.issues });
  }

  const data = result.data;
  const dispatchId = `dsp-${stationId}-${Date.now().toString(36)}`;
  const dispatchCode = `${stationObj.code}-PAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

  const newDispatch = {
    id: dispatchId,
    dispatchCode,
    stationId,
    stationName: stationObj.name,
    officerName: data.officerName,
    officerJobId: data.officerJobId,
    assetId: data.assetId,
    assetName: data.assetName,
    status: 'DEPLOYED',
    targetVesselName: data.targetVesselName || 'Routine Surveillance Sweep',
    targetCoords: data.targetCoords || `${stationObj.lat.toFixed(4)}°S, ${stationObj.lon.toFixed(4)}°E`,
    totalDistanceNM: data.totalDistanceNM || 35.0,
    estimatedFuelLiters: data.estimatedFuelLiters || 240,
    etaFormatted: data.etaFormatted || '1h 30m',
    speedKnots: data.speedKnots || 22,
    legs: data.legs || [],
    notes: data.notes || `Dispatched from ${stationObj.name} for coastal surveillance.`,
    dispatchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const list = stationDispatches.get(stationId) || [];
  list.unshift(newDispatch);
  stationDispatches.set(stationId, list);

  logger.info({ dispatchCode, station: stationObj.name, officer: data.officerName }, 'Patrol dispatched under station');

  // Broadcast real-time SSE event to all colleagues at this station
  broker.publish('patrol_dispatch', {
    type: 'new_dispatch',
    stationId,
    dispatch: newDispatch,
    broadcastHeadline: `⚓ NEW PATROL DISPATCHED: ${stationObj.name}`,
    broadcastBody: `${data.officerName} (${data.officerJobId}) deployed ${data.assetName} toward ${newDispatch.targetVesselName}.`,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({
    success: true,
    dispatch: newDispatch,
  });
});

/**
 * PATCH /api/patrol/dispatches/:id/status
 * Advance status of a shared patrol dispatch (e.g. DEPLOYED -> ON_SCENE -> BOARDING -> COMPLETED)
 */
router.patch('/patrol/dispatches/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, note, updatedBy } = req.body;

  const validStatuses = ['DEPLOYED', 'ON_SCENE', 'BOARDING', 'COMPLETED', 'ABORTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  let foundDispatch = null;
  let targetStationId = null;

  for (const [sId, list] of stationDispatches.entries()) {
    const item = list.find((d) => d.id === id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
      if (note) item.notes = `${item.notes ? item.notes + ' | ' : ''}${note}`;
      if (updatedBy) item.lastUpdatedBy = updatedBy;
      foundDispatch = item;
      targetStationId = sId;
      break;
    }
  }

  if (!foundDispatch) {
    return res.status(404).json({ error: 'Dispatch record not found' });
  }

  // Broadcast real-time update
  broker.publish('patrol_dispatch', {
    type: 'status_update',
    stationId: targetStationId,
    dispatch: foundDispatch,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    dispatch: foundDispatch,
  });
});

export default router;

