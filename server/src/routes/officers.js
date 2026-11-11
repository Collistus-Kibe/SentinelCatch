import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
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

// Fallback in-memory store in case TiDB is still connecting (starts empty - NO DEMO/MOCK DATA)
const memOfficers = new Map();
const memDispatches = new Map();

// Zod validation schemas
const signUpSchema = z.object({
  name: z.string().trim().min(3, 'Full official name must be at least 3 characters'),
  jobId: z
    .string()
    .trim()
    .min(3, 'Job ID / Service Number must be at least 3 characters')
    .transform((val) => val.toUpperCase()),
  stationId: z.string().trim().min(1, 'Station is required'),
  agency: z.string().trim().min(2, 'Agency is required'),
  rank: z.string().trim().min(2, 'Duty Rank / Title is required'),
  pin: z.string().trim().min(4, 'Service PIN / Password must be at least 4 characters'),
});

const signInSchema = z.object({
  jobId: z
    .string()
    .trim()
    .min(3, 'Job ID / Service Number is required')
    .transform((val) => val.toUpperCase()),
  pin: z.string().trim().min(4, 'Service PIN / Password is required'),
  stationId: z.string().trim().optional(),
});

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

/**
 * GET /api/stations
 * List all Kenyan coastal stations & operating sectors
 */
router.get('/stations', (req, res) => {
  res.json({
    success: true,
    count: KENYA_STATIONS.length,
    stations: KENYA_STATIONS,
  });
});

/**
 * POST /api/officers/signup
 * Register a new real officer in TiDB database
 */
router.post('/officers/signup', async (req, res) => {
  const result = signUpSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.issues[0]?.message || 'Invalid registration details',
      issues: result.error.issues,
    });
  }

  const { name, jobId, stationId, agency, rank, pin } = result.data;

  const stationObj = KENYA_STATIONS.find((s) => s.id === stationId);
  if (!stationObj) {
    return res.status(400).json({ error: `Invalid station ID: ${stationId}` });
  }

  const officerId = `off-${jobId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  try {
    // Check if officer with this Job ID already exists in DB
    const checkRes = await query('SELECT id, job_id FROM officers WHERE job_id = $1 LIMIT 1', [jobId]);
    if (checkRes.rows && checkRes.rows.length > 0) {
      return res.status(409).json({
        error: `Officer with Job ID "${jobId}" is already registered. Please sign in with your Service PIN.`,
      });
    }

    // Insert new officer into TiDB
    await query(
      `INSERT INTO officers (id, name, job_id, station_id, station_name, station_code, agency, rank_role, pin, status, last_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [officerId, name, jobId, stationObj.id, stationObj.name, stationObj.code, agency, rank, pin, 'on_duty']
    );

    const safeOfficer = {
      id: officerId,
      name,
      jobId,
      stationId: stationObj.id,
      stationCode: stationObj.code,
      stationName: stationObj.name,
      stationSector: stationObj.sector,
      agency,
      rank,
      status: 'on_duty',
      lastActive: new Date().toISOString(),
    };

    // Update in-memory fallback cache
    memOfficers.set(jobId, { ...safeOfficer, pin });

    logger.info({ jobId, station: stationObj.code }, 'Real officer registered in TiDB database');

    // Broadcast SSE presence
    try {
      broker.emit('officer_presence', {
        type: 'registered',
        officer: safeOfficer,
        stationId: stationObj.id,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return res.status(201).json({
      success: true,
      message: `Officer ${name} (${jobId}) registered successfully.`,
      officer: safeOfficer,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Database error during signup, falling back to memory');

    // Check memory fallback
    if (memOfficers.has(jobId)) {
      return res.status(409).json({
        error: `Officer with Job ID "${jobId}" is already registered. Please sign in with your Service PIN.`,
      });
    }

    const safeOfficer = {
      id: officerId,
      name,
      jobId,
      stationId: stationObj.id,
      stationCode: stationObj.code,
      stationName: stationObj.name,
      stationSector: stationObj.sector,
      agency,
      rank,
      status: 'on_duty',
      lastActive: new Date().toISOString(),
    };

    memOfficers.set(jobId, { ...safeOfficer, pin });

    return res.status(201).json({
      success: true,
      message: `Officer ${name} (${jobId}) registered successfully (local store).`,
      officer: safeOfficer,
    });
  }
});

/**
 * POST /api/officers/signin
 * Authenticate real officer credentials against TiDB database
 */
router.post('/officers/signin', async (req, res) => {
  const result = signInSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.issues[0]?.message || 'Invalid sign-in credentials',
      issues: result.error.issues,
    });
  }

  const { jobId, pin, stationId: redeployStationId } = result.data;

  try {
    const dbRes = await query(
      'SELECT id, name, job_id, station_id, station_name, station_code, agency, rank_role, pin, status FROM officers WHERE job_id = $1 LIMIT 1',
      [jobId]
    );

    let officerRow = dbRes.rows?.[0];

    // If not in DB, check mem fallback
    if (!officerRow && memOfficers.has(jobId)) {
      officerRow = memOfficers.get(jobId);
    }

    if (!officerRow) {
      return res.status(404).json({
        error: `No officer found with Job ID "${jobId}". Please complete official registration first.`,
      });
    }

    // Verify PIN
    if (String(officerRow.pin).trim() !== String(pin).trim()) {
      return res.status(401).json({
        error: 'Invalid Service PIN / credentials. Please check your credentials.',
      });
    }

    // Optional redeployment to another station
    let activeStationId = officerRow.station_id || officerRow.stationId;
    if (redeployStationId && KENYA_STATIONS.some((s) => s.id === redeployStationId)) {
      activeStationId = redeployStationId;
    }

    const stationObj = KENYA_STATIONS.find((s) => s.id === activeStationId) || KENYA_STATIONS[0];

    // Update last_active and station in DB
    try {
      await query(
        'UPDATE officers SET status = $1, station_id = $2, station_name = $3, station_code = $4, last_active = NOW() WHERE job_id = $5',
        ['on_duty', stationObj.id, stationObj.name, stationObj.code, jobId]
      );
    } catch {}

    const safeOfficer = {
      id: officerRow.id,
      name: officerRow.name,
      jobId: officerRow.job_id || officerRow.jobId,
      stationId: stationObj.id,
      stationCode: stationObj.code,
      stationName: stationObj.name,
      stationSector: stationObj.sector,
      agency: officerRow.agency,
      rank: officerRow.rank_role || officerRow.rank,
      status: 'on_duty',
      lastActive: new Date().toISOString(),
    };

    memOfficers.set(jobId, { ...safeOfficer, pin });

    logger.info({ jobId, station: stationObj.code }, 'Real officer authenticated');

    // Broadcast SSE presence
    try {
      broker.emit('officer_presence', {
        type: 'online',
        officer: safeOfficer,
        stationId: stationObj.id,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return res.json({
      success: true,
      message: `Officer ${safeOfficer.name} verified and connected to ${stationObj.name}.`,
      officer: safeOfficer,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Database error during signin');

    if (memOfficers.has(jobId)) {
      const memObj = memOfficers.get(jobId);
      if (String(memObj.pin).trim() !== String(pin).trim()) {
        return res.status(401).json({ error: 'Invalid Service PIN / credentials.' });
      }
      return res.json({
        success: true,
        message: `Officer ${memObj.name} verified.`,
        officer: memObj,
      });
    }

    return res.status(500).json({ error: 'Database authentication service unavailable.' });
  }
});

/**
 * GET /api/officers/roster
 * Get real on-duty officers for a station
 */
router.get('/officers/roster', async (req, res) => {
  const { station } = req.query;

  try {
    let sql = 'SELECT id, name, job_id, station_id, station_name, station_code, agency, rank_role, status, last_active FROM officers WHERE status = $1';
    let params = ['on_duty'];

    if (station && station !== 'all') {
      sql += ' AND station_id = $2';
      params.push(station);
    }

    sql += ' ORDER BY last_active DESC LIMIT 50';

    const dbRes = await query(sql, params);
    const dbOfficers = (dbRes.rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      jobId: r.job_id,
      stationId: r.station_id,
      stationName: r.station_name,
      stationCode: r.station_code,
      agency: r.agency,
      rank: r.rank_role,
      status: r.status,
      lastActive: r.last_active,
    }));

    if (dbOfficers.length > 0) {
      return res.json({ success: true, count: dbOfficers.length, officers: dbOfficers });
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Roster DB query fallback');
  }

  // Memory fallback
  const memList = Array.from(memOfficers.values())
    .filter((o) => !station || station === 'all' || o.stationId === station)
    .map(({ pin, ...safe }) => safe);

  res.json({
    success: true,
    count: memList.length,
    officers: memList,
  });
});

/**
 * GET /api/patrol/station/:stationId/dispatches
 * Retrieve real shared patrol orders for a specific station
 */
router.get('/patrol/station/:stationId/dispatches', async (req, res) => {
  const { stationId } = req.params;

  try {
    const dbRes = await query(
      'SELECT * FROM patrol_dispatches WHERE station_id = $1 ORDER BY created_at DESC LIMIT 30',
      [stationId]
    );

    if (dbRes.rows && dbRes.rows.length > 0) {
      const dispatches = dbRes.rows.map((r) => ({
        id: r.id,
        dispatchCode: r.dispatch_code,
        stationId: r.station_id,
        stationName: r.station_name,
        officerName: r.officer_name,
        officerJobId: r.officer_job_id,
        assetId: r.asset_id,
        assetName: r.asset_name,
        targetVesselName: r.target_vessel_name,
        targetCoords: r.target_coords,
        totalDistanceNM: r.total_distance_nm,
        estimatedFuelLiters: r.estimated_fuel_liters,
        etaFormatted: r.eta_formatted,
        speedKnots: r.speed_knots,
        legs: typeof r.legs === 'string' ? JSON.parse(r.legs) : r.legs || [],
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      }));

      return res.json({ success: true, count: dispatches.length, dispatches });
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Dispatches DB query fallback');
  }

  const list = (memDispatches.get(stationId) || []).slice(0, 30);
  res.json({
    success: true,
    count: list.length,
    dispatches: list,
  });
});

/**
 * POST /api/patrol/station/:stationId/dispatches
 * Create and broadcast a real station-wide patrol dispatch
 */
router.post('/patrol/station/:stationId/dispatches', async (req, res) => {
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
    totalDistanceNM: data.totalDistanceNM || 35,
    estimatedFuelLiters: data.estimatedFuelLiters || 450,
    etaFormatted: data.etaFormatted || '1h 30m',
    speedKnots: data.speedKnots || 22,
    legs: data.legs || [],
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
  };

  try {
    await query(
      `INSERT INTO patrol_dispatches (id, dispatch_code, station_id, station_name, officer_name, officer_job_id, asset_id, asset_name, target_vessel_name, target_coords, total_distance_nm, estimated_fuel_liters, eta_formatted, speed_knots, legs, status, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
      [
        dispatchId,
        dispatchCode,
        stationId,
        stationObj.name,
        data.officerName,
        data.officerJobId,
        data.assetId,
        data.assetName,
        newDispatch.targetVesselName,
        newDispatch.targetCoords,
        newDispatch.totalDistanceNM,
        newDispatch.estimatedFuelLiters,
        newDispatch.etaFormatted,
        newDispatch.speedKnots,
        JSON.stringify(newDispatch.legs),
        'DEPLOYED',
        newDispatch.notes,
      ]
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to insert dispatch into DB, using mem');
  }

  // Memory store
  const existing = memDispatches.get(stationId) || [];
  memDispatches.set(stationId, [newDispatch, ...existing]);

  // Broadcast real-time dispatch via SSE
  try {
    broker.emit('patrol_dispatch', {
      type: 'dispatch_created',
      dispatch: newDispatch,
      stationId,
      stationCode: stationObj.code,
      broadcastBy: data.officerName,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to broadcast dispatch event');
  }

  res.status(201).json({
    success: true,
    message: `Patrol dispatch ${dispatchCode} logged and broadcast to ${stationObj.name}`,
    dispatch: newDispatch,
  });
});

/**
 * PATCH /api/patrol/dispatches/:id/status
 * Update status of an active mission
 */
router.patch('/patrol/dispatches/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const validStatuses = ['DEPLOYED', 'ON_SCENE', 'BOARDING', 'COMPLETED', 'ABORTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    await query('UPDATE patrol_dispatches SET status = $1 WHERE id = $2', [status, id]);
  } catch (err) {
    logger.debug({ err: err.message }, 'Dispatch status update DB fallback');
  }

  // Update in memory
  let updatedDispatch = null;
  for (const [sId, list] of memDispatches.entries()) {
    const idx = list.findIndex((d) => d.id === id);
    if (idx !== -1) {
      list[idx].status = status;
      if (note) list[idx].notes = `${list[idx].notes || ''}\n[Status update: ${status}] ${note}`.trim();
      updatedDispatch = list[idx];
      break;
    }
  }

  // Broadcast update
  if (updatedDispatch) {
    try {
      broker.emit('patrol_dispatch', {
        type: 'status_updated',
        dispatch: updatedDispatch,
        stationId: updatedDispatch.stationId,
        timestamp: new Date().toISOString(),
      });
    } catch {}
  }

  res.json({
    success: true,
    status,
    message: `Dispatch ${id} status updated to ${status}`,
    dispatch: updatedDispatch,
  });
});

// Station Patrol Comms & Chat Store
const memStationChats = new Map();

/**
 * GET /api/patrol/station/:stationId/chat
 * Retrieve live tactical patrol messages for a specific station
 */
router.get('/patrol/station/:stationId/chat', (req, res) => {
  const { stationId } = req.params;
  const messages = memStationChats.get(stationId) || [];
  res.json({ success: true, count: messages.length, messages });
});

/**
 * POST /api/patrol/station/:stationId/chat
 * Send a patrol coordination message to all officers at the same station
 */
router.post('/patrol/station/:stationId/chat', (req, res) => {
  const { stationId } = req.params;
  const { officerName, officerJobId, rank, message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const stationObj = KENYA_STATIONS.find((s) => s.id === stationId);
  const stationName = stationObj ? stationObj.name : stationId;

  const chatItem = {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    stationId,
    stationName,
    officerName: officerName || 'Duty Officer',
    officerJobId: officerJobId || 'KCGS',
    rank: rank || 'Tactical Officer',
    message: message.trim(),
    timestamp: new Date().toISOString(),
  };

  const existing = memStationChats.get(stationId) || [];
  memStationChats.set(stationId, [...existing, chatItem].slice(-100)); // Keep last 100

  // Broadcast real-time to all connected officers via SSE
  try {
    broker.emit('station_chat_message', chatItem);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to broadcast station chat message');
  }

  res.status(201).json({ success: true, message: chatItem });
});

export default router;
