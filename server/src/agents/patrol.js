import { haversineKm } from '../utils/geo.js';
const haversineDistance = haversineKm;

export const PATROL_BASES = {
  mombasa: {
    id: 'mombasa',
    name: 'Mombasa Base (Kenya Coast Guard HQ / Naval Mtongwe)',
    lat: -4.065,
    lon: 39.664,
    sector: 'Southern / Central Coast',
    defaultAsset: 'KCGS Doria (OPV 54m)',
    defaultSpeedKnots: 22,
  },
  lamu: {
    id: 'lamu',
    name: 'Lamu Base (Manda Bay Naval Base / Lamu Port Station)',
    lat: -2.268,
    lon: 40.902,
    sector: 'Northern Coast / Somali Border',
    defaultAsset: 'Fast Interceptor Craft (FIC)',
    defaultSpeedKnots: 28,
  },
  shimoni: {
    id: 'shimoni',
    name: 'Shimoni Marine Station (Kisite-Mpunguti / Tanzania Border)',
    lat: -4.647,
    lon: 39.382,
    sector: 'South Coast / Pemba Channel',
    defaultAsset: 'Inshore Interceptor Patrol (PB)',
    defaultSpeedKnots: 24,
  },
  malindi: {
    id: 'malindi',
    name: 'Malindi Fisheries Protection Base (Ungwana Bay / Watamu)',
    lat: -3.219,
    lon: 40.126,
    sector: 'Central Coast / Ungwana Bay',
    defaultAsset: 'Coastal Patrol Boat (PB 24m)',
    defaultSpeedKnots: 20,
  },
};

export const PATROL_ASSETS = {
  kcgs_doria: {
    id: 'kcgs_doria',
    name: 'KCGS Doria (OPV 54m)',
    cruisingSpeedKnots: 22,
    maxSpeedKnots: 35,
    fuelLitersPerNM: 42,
    description: 'Kenya Coast Guard Flagship Offshore Patrol Vessel. High-endurance interdiction with armed boarding detachment and drone reconnaissance capability.',
  },
  kns_shujaa: {
    id: 'kns_shujaa',
    name: 'KNS Shujaa (Offshore Combat Patrol)',
    cruisingSpeedKnots: 28,
    maxSpeedKnots: 34,
    fuelLitersPerNM: 55,
    description: 'Kenya Navy Offshore Combat Patrol Vessel with 76mm naval gun, boarding team, and helicopter deck.',
  },
  fast_interceptor: {
    id: 'fast_interceptor',
    name: 'Fast Interceptor Craft (FIC 12m)',
    cruisingSpeedKnots: 30,
    maxSpeedKnots: 42,
    fuelLitersPerNM: 18,
    description: 'High-speed tactical craft for rapid interception inside territorial waters, estuaries, and Marine Protected Areas.',
  },
  coastal_patrol: {
    id: 'coastal_patrol',
    name: 'Coastal Patrol Boat (PB 24m)',
    cruisingSpeedKnots: 20,
    maxSpeedKnots: 26,
    fuelLitersPerNM: 28,
    description: 'Medium-endurance coastal craft configured for fisheries monitoring, boarding inspections, and maritime border control.',
  },
};

export class PatrolPlanner {
  /**
   * Compute optimized patrol dispatch recommendations and multi-stop route.
   * @param {Array} cases - Active dark vessel cases
   * @param {Object} options - { baseId: 'mombasa'|'lamu', speedKnots: 22 }
   */
  planPatrol(cases = [], options = {}) {
    const rawBaseId = options.baseId || options.baseName;
    const baseId = rawBaseId && PATROL_BASES[rawBaseId] ? rawBaseId : 'mombasa';
    const base = PATROL_BASES[baseId];

    const assetKey = options.assetId && PATROL_ASSETS[options.assetId] ? options.assetId : 'kcgs_doria';
    const selectedAsset = PATROL_ASSETS[assetKey];
    const speedKnots = Number(options.speedKnots) || selectedAsset.cruisingSpeedKnots || base.defaultSpeedKnots || 22;

    const statutoryAuthority = 'Kenya Fisheries Management and Development Act (FMDA) 2016, Sections 148-152 (Power of authorized officers to stop, board, inspect, and seize without warrant).';
    const seaStateAssessment = 'Swell: 1.2m - 1.5m (Moderate SE Indian Ocean Swell), Wind: 14 kts ESE - Favorable for Interception & Boarding Operations';
    const boardingChecklist = [
      '1. AIS Transponder Physical Status (verify whether transponder was intentionally disabled or spoofed)',
      '2. Certificate of Registry, Statutory Navigational Licenses & Flag State Authorizations',
      '3. Fishing Logbook, Electronic Catch Reporting (ERS) & Target Species Declaration',
      '4. Fish Hold Temperature & Cargo Verification (sample catch for banned shark fins / undersized juvenile fish)',
      '5. Cargo Manifest & Bilge Water Inspection (check for contraband transshipment or illicit STS bunkering)',
      '6. Crew Manifest, Master Identification & Seafarer Identification Verification',
    ];

    // Filter to active/unresolved incidents
    const actionableCases = cases.filter((c) => c.status !== 'resolved' && c.status !== 'false_alarm');

    if (actionableCases.length === 0) {
      return {
        base,
        asset: selectedAsset,
        speedKnots,
        disclaimer: 'Illustrative operational planning. Real asset speeds subject to sea state and commander discretion.',
        legs: [],
        totalDistanceNM: 0,
        totalTravelTimeHours: 0,
        totalTravelTimeFormatted: '0h 0m',
        estimatedFuelLiters: 0,
        statutoryAuthority,
        seaStateAssessment,
        boardingChecklist,
        availableBases: Object.values(PATROL_BASES),
        availableAssets: Object.values(PATROL_ASSETS),
        rankedCases: [],
      };
    }

    // Rank cases by tactical urgency (threat score + MPA violation + proximity to border)
    const scoredList = actionableCases.map((c) => {
      const cLat = c.features?.lat ?? c.lat;
      const cLon = c.features?.lon ?? c.lon;
      const distKm = haversineDistance(base.lat, base.lon, cLat, cLon);
      const distNM = distKm / 1.852;

      // Priority formula: high threat + MPA protection + close to EEZ boundary
      let priorityScore = (c.score_final || 50) * 0.5;
      if (c.features?.inMPA) priorityScore += 25;
      if (c.features?.distanceToEEZBoundaryKm < 30) priorityScore += 15;
      // Proximity efficiency penalty
      priorityScore -= distNM * 0.15;

      return {
        caseItem: c,
        lat: cLat,
        lon: cLon,
        distKm: Math.round(distKm),
        distNM: Number(distNM.toFixed(1)),
        priorityScore: Math.round(priorityScore),
        etaFromBaseHours: Number((distNM / speedKnots).toFixed(1)),
      };
    });

    // Sort descending by priority
    scoredList.sort((a, b) => b.priorityScore - a.priorityScore);

    // Build route: Base -> Target 1 -> Target 2 (top 3 priority cases) -> Return to Base
    const selectedTargets = scoredList.slice(0, 3);
    const legs = [];
    let currentPoint = { name: base.name, lat: base.lat, lon: base.lon };
    let totalDistanceNM = 0;

    selectedTargets.forEach((tgt, idx) => {
      const legDistKm = haversineDistance(currentPoint.lat, currentPoint.lon, tgt.lat, tgt.lon);
      const legDistNM = Number((legDistKm / 1.852).toFixed(1));
      const legTimeHours = Number((legDistNM / speedKnots).toFixed(1));
      const minutes = Math.round(legTimeHours * 60);

      legs.push({
        legIndex: idx + 1,
        from: currentPoint.name,
        to: `Target #${tgt.caseItem.id} (${tgt.caseItem.sector || 'Offshore'} - Score ${tgt.caseItem.score_final}/100)`,
        caseId: tgt.caseItem.id,
        lat: tgt.lat,
        lon: tgt.lon,
        distanceNM: legDistNM,
        travelTimeHours: legTimeHours,
        travelTimeFormatted: `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
        objective: tgt.caseItem.features?.inMPA ? 'Immediate MPA Interception' : 'Visual Radar Verification & Boarding',
      });

      totalDistanceNM += legDistNM;
      currentPoint = { name: `Target #${tgt.caseItem.id}`, lat: tgt.lat, lon: tgt.lon };
    });

    // Return to base leg
    const returnDistKm = haversineDistance(currentPoint.lat, currentPoint.lon, base.lat, base.lon);
    const returnDistNM = Number((returnDistKm / 1.852).toFixed(1));
    const returnTimeHours = Number((returnDistNM / speedKnots).toFixed(1));
    const returnMins = Math.round(returnTimeHours * 60);

    legs.push({
      legIndex: legs.length + 1,
      from: currentPoint.name,
      to: `Return to ${base.name}`,
      caseId: null,
      lat: base.lat,
      lon: base.lon,
      distanceNM: returnDistNM,
      travelTimeHours: returnTimeHours,
      travelTimeFormatted: `${Math.floor(returnMins / 60)}h ${returnMins % 60}m`,
      objective: 'Patrol Recovery & Post-Mission Debrief',
    });

    totalDistanceNM += returnDistNM;
    const totalTravelTimeHours = Number((totalDistanceNM / speedKnots).toFixed(1));
    const totalMins = Math.round(totalTravelTimeHours * 60);

    const fuelRate = selectedAsset.fuelLitersPerNM || 35;
    const estimatedFuelLiters = Math.round(totalDistanceNM * fuelRate);

    return {
      base,
      asset: selectedAsset,
      speedKnots,
      disclaimer: 'Illustrative patrol route for tactical simulation. Real deployment requires official Kenyan Coast Guard / Kenya Navy approval.',
      totalDistanceNM: Number(totalDistanceNM.toFixed(1)),
      totalTravelTimeHours,
      totalTravelTimeFormatted: `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`,
      estimatedFuelLiters,
      statutoryAuthority: 'Kenya Fisheries Management and Development Act (FMDA) 2016, Sections 148-152 (Power of authorized officers to stop, board, inspect, and seize without warrant).',
      seaStateAssessment: 'Swell: 1.2m - 1.5m (Moderate SE Indian Ocean Swell), Wind: 14 kts ESE - Favorable for Interception & Boarding Operations',
      boardingChecklist: [
        '1. AIS Transponder Physical Status (verify whether transponder was intentionally disabled or spoofed)',
        '2. Certificate of Registry, Statutory Navigational Licenses & Flag State Authorizations',
        '3. Fishing Logbook, Electronic Catch Reporting (ERS) & Target Species Declaration',
        '4. Fish Hold Temperature & Cargo Verification (sample catch for banned shark fins / undersized juvenile fish)',
        '5. Cargo Manifest & Bilge Water Inspection (check for contraband transshipment or illicit STS bunkering)',
        '6. Crew Manifest, Master Identification & Seafarer Identification Verification',
      ],
      availableBases: Object.values(PATROL_BASES),
      availableAssets: Object.values(PATROL_ASSETS),
      legs,
      rankedCases: scoredList.map((s) => ({
        id: s.caseItem.id,
        sector: s.caseItem.sector,
        score: s.caseItem.score_final,
        band: s.caseItem.band,
        lat: s.lat,
        lon: s.lon,
        distNM: s.distNM,
        etaHours: s.etaFromBaseHours,
        inMPA: Boolean(s.caseItem.features?.inMPA),
        priorityScore: s.priorityScore,
      })),
    };
  }
}

export const patrolPlanner = new PatrolPlanner();
export default patrolPlanner;
