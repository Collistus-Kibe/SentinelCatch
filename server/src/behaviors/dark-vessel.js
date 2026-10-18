/**
 * Behavior: Dark Vessel
 * Isolates satellite radar detections (Sentinel-1 SAR) lacking matching AIS signals in Kenya EEZ.
 */

import { haversineKm } from '../utils/geo.js';

export const darkVesselBehavior = {
  id: 'dark-vessel',
  name: 'Dark Vessel Incursion',
  description: 'Industrial-scale vessel detected on satellite radar operating without an active AIS transponder inside Kenya waters.',

  /**
   * Filter and match candidate detections
   * @param {Array} sarDetections
   * @param {Array} aisPositions
   * @param {Object} options - { spatialToleranceKm: 5, temporalToleranceMin: 30 }
   * @returns {Array} unmatched SAR detections
   */
  detectCandidates(sarDetections, aisPositions, options = {}) {
    const spatialTol = options.spatialToleranceKm ?? 5.0;
    const temporalTolMs = (options.temporalToleranceMin ?? 30) * 60 * 1000;

    const unmatched = [];

    for (const sar of sarDetections) {
      const sarTime = new Date(sar.detected_at).getTime();
      let hasAisMatch = false;

      for (const ais of aisPositions) {
        const aisTime = new Date(ais.timestamp || ais.received_at).getTime();
        // Check temporal window
        if (Math.abs(sarTime - aisTime) <= temporalTolMs) {
          // Check spatial distance
          const distance = haversineKm(sar.lat, sar.lon, ais.lat, ais.lon);
          if (distance <= spatialTol) {
            hasAisMatch = true;
            break;
          }
        }
      }

      if (!hasAisMatch) {
        unmatched.push({
          ...sar,
          behavior: 'dark-vessel',
          matched: false,
        });
      }
    }

    return unmatched;
  },

  /**
   * Feature weights used by the rule-scoring engine
   */
  weights: {
    baseSuspicion: 40,
    inMPA: 25,
    nearEEZBoundary: 15,
    recurrentLoitering: 15,
    nearbyAisGap: 10,
    nearPortPenalty: -25,
    seaClutterPenalty: -10,
    smallCraftPenalty: -15,
  },
};

export default darkVesselBehavior;
