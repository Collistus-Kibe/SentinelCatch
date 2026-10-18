import { haversineKm } from '../utils/geo.js';
const haversineDistance = haversineKm;

export const PATROL_BASES = {
  mombasa: {
    id: 'mombasa',
    name: 'Mombasa Base (Kenya Coast Guard / Naval Mtongwe)',
    lat: -4.065,
    lon: 39.664,
    sector: 'Southern / Central Coast',
    defaultAsset: 'Offshore Patrol Vessel (P400 Class)',
    defaultSpeedKnots: 22,
  },
  lamu: {
    id: 'lamu',
    name: 'Lamu Base (Manda Bay / Lamu Port)',
    lat: -2.268,
    lon: 40.902,
    sector: 'Northern Coast / Somali Border',
    defaultAsset: 'Fast Interceptor Craft',
    defaultSpeedKnots: 28,
  },
};

export class PatrolPlanner {
  /**
   * Compute optimized patrol dispatch recommendations and multi-stop route.
   * @param {Array} cases - Active dark vessel cases
   * @param {Object} options - { baseId: 'mombasa'|'lamu', speedKnots: 22 }
   */
  planPatrol(cases = [], options = {}) {
    const baseId = options.baseId && PATROL_BASES[options.baseId] ? options.baseId : 'mombasa';
    const base = PATROL_BASES[baseId];
    const speedKnots = Number(options.speedKnots) || base.defaultSpeedKnots || 22;

    // Filter to active/unresolved incidents
    const actionableCases = cases.filter((c) => c.status !== 'resolved' && c.status !== 'false_alarm');

    if (actionableCases.length === 0) {
      return {
        base,
        speedKnots,
        disclaimer: 'Illustrative operational planning. Real asset speeds subject to sea state and commander discretion.',
        legs: [],
        totalDistanceNM: 0,
        totalTravelTimeHours: 0,
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

    return {
      base,
      speedKnots,
      disclaimer: 'Illustrative patrol route for tactical simulation. Real deployment requires official Kenyan Coast Guard approval.',
      totalDistanceNM: Number(totalDistanceNM.toFixed(1)),
      totalTravelTimeHours,
      totalTravelTimeFormatted: `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`,
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
