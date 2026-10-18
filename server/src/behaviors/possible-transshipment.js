/**
 * Behavior: Possible Transshipment
 * Identifies unmatched radar contact stationary within 2 km of an AIS vessel,
 * or near confirmed loitering/encounter events in Kenya waters.
 */

import { haversineKm } from '../utils/geo.js';

export const possibleTransshipmentBehavior = {
  id: 'possible-transshipment',
  name: 'Suspected Unauthorized Transshipment',
  description: 'Unmatched radar detection stationary or loitering in close proximity (<2 km) to an active AIS vessel, indicating possible at-sea transfer.',

  /**
   * Filter candidates for transshipment
   * @param {Array} unmatchedDetections - Detections already confirmed dark
   * @param {Array} aisVessels - Active AIS vessels at that time
   * @param {Array} encounterEvents - GFW encounter or loitering events
   * @returns {Array} candidates meeting transshipment criteria
   */
  detectCandidates(unmatchedDetections, aisVessels = [], encounterEvents = []) {
    const rendezvousCandidates = [];

    for (const dark of unmatchedDetections) {
      let nearestAis = null;
      let minDistanceKm = Infinity;

      // 1. Search for AIS vessels within 2 km
      for (const ais of aisVessels) {
        const d = haversineKm(dark.lat, dark.lon, ais.lat, ais.lon);
        if (d < minDistanceKm) {
          minDistanceKm = d;
          nearestAis = ais;
        }
      }

      // 2. Check if near any loitering or encounter event (< 5 km)
      let nearEncounterEvent = null;
      for (const ev of encounterEvents) {
        const evLat = ev.lat || ev.latitude;
        const evLon = ev.lon || ev.longitude;
        if (evLat && evLon) {
          const d = haversineKm(dark.lat, dark.lon, evLat, evLon);
          if (d <= 5.0) {
            nearEncounterEvent = ev;
            break;
          }
        }
      }

      if (minDistanceKm <= 2.5 || nearEncounterEvent) {
        rendezvousCandidates.push({
          ...dark,
          behavior: 'possible-transshipment',
          rendezvous: {
            nearestAisMmsi: nearestAis?.mmsi || null,
            nearestAisName: nearestAis?.ship_name || null,
            distanceKm: Math.round(minDistanceKm * 10) / 10,
            hasEncounterEvent: Boolean(nearEncounterEvent),
          },
        });
      }
    }

    return rendezvousCandidates;
  },

  weights: {
    baseSuspicion: 50,
    rendezvousDistanceKm2: 25,
    hasEncounterEvent: 15,
    inMPA: 20,
    nearEEZBoundary: 10,
  },
};

export default possibleTransshipmentBehavior;
