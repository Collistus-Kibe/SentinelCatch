import llmClient from '../integrations/llm.js';
import logger from '../logger.js';

export class DeliberationEngine {
  /**
   * Run multi-agent deliberation (Investigator, Prosecutor, Skeptic) on a dark vessel incident.
   * @param {Object} caseItem - Full case record including features, radar detection, and candidate vessels
   * @returns {Promise<Object>} Deliberation verdict containing both arguments and calibrated score
   */
  async deliberate(caseItem) {
    const {
      score_final: scoreFinal,
      band,
      features = {},
      sector = 'Kenya EEZ',
      candidate_matches: candidates = [],
    } = caseItem;

    const lat = features.lat || 0;
    const lon = features.lon || 0;
    const topCandidate = (features.candidate_matches && features.candidate_matches[0]) || (candidates && candidates[0]) || null;

    // Build the prompt for Prosecutor vs Skeptic deliberation
    const prompt = `
You are the Lead Arbitrator for Kenya Maritime Domain Awareness.
Conduct a structured multi-agent deliberation between two specialized agents on this dark vessel incident:

1. PROSECUTOR AGENT: Advocates the case for illicit activity, unauthorized fishing, or intentional dark operations.
2. SKEPTIC AGENT: Advocates reasonable alternative explanations, innocent passage, sensor limitations, weather artifacts, or artisanal exceptions.

INCIDENT INTELLIGENCE & TELEMETRY:
- Threat Band: ${band} (${scoreFinal}/100)
- Sector: ${sector} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)
- Inside Marine Protected Area: ${features.inMPA ? `YES (${features.mpaName || 'Marine Park'})` : `NO (${features.distanceToMpaKm || 0} km away)`}
- Distance to Outer EEZ Boundary: ${features.distanceToEEZBoundaryKm || 0} km
- Distance to Shore / Port: ${features.distanceToCoastKm || 0} km from ${features.nearestPort || 'coast'}
- Loitering Recurrence: ${features.recurrenceCount || 1} satellite radar detections in 14 days
- Nearby AIS Fleet: ${features.nearbyAisVesselsCount || 0} commercial fishing vessels within 20 km
- Nearby AIS Gap Event: ${features.hasNearbyAisGap ? `YES (${features.aisGapDistanceKm} km)` : 'NO'}
- Sea State & Clutter: Wave height ${features.waveHeightM || 1.2}m (penalty: ${features.seaPenalty || 0} pts)
- Estimated Vessel Length: ${features.estimatedLengthM ? `${features.estimatedLengthM}m` : 'Unknown radar reflection'}
- Suspected Candidate Vessel: ${topCandidate ? `${topCandidate.vesselName} (Flag: ${topCandidate.flag}, IOTC Authorized: ${topCandidate.iotcAuthorized}, IUU Listed: ${topCandidate.iuuListed}, ${topCandidate.historicalAisOffCount60d} AIS gaps in 60d)` : 'Unidentified radar centroid'}

TASK:
Produce an impartial, high-conviction deliberation with:
1. "prosecutor_brief": 2 concise paragraphs stating the primary incriminating facts and operational risks.
2. "skeptic_brief": 2 concise paragraphs stating the mitigating circumstances, sensor uncertainties, or innocent explanations.
3. "calibrated_verdict": A balanced final decision ("High Threat Incursion" | "Probable Clutter / False Alarm" | "Ambiguous / Verification Required").
4. "evidentiary_confidence": Integer percentage (40 to 95).
5. "recommended_action": Concrete tactical tasking for patrol deployment or aerial reconnaissance.

RESPOND ONLY IN VALID JSON matching this structure:
{
  "prosecutor_brief": "string",
  "skeptic_brief": "string",
  "calibrated_verdict": "string",
  "evidentiary_confidence": 78,
  "recommended_action": "string",
  "prosecutor_points": ["point 1", "point 2", "point 3"],
  "skeptic_points": ["point 1", "point 2", "point 3"]
}
`;

    try {
      const response = await llmClient.generate({ prompt, jsonMode: true });
      if (response && response.text) {
        let rawText = response.text.trim();
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          rawText = rawText.slice(firstBrace, lastBrace + 1);
        } else {
          if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
          } else if (rawText.startsWith('```')) {
            rawText = rawText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
          }
        }
        try {
          const parsed = JSON.parse(rawText);
          return {
            ...parsed,
            generated_by: `Autonomous Multi-Agent Deliberation (${response.provider} ${response.model})`,
            deliberated_at: new Date().toISOString(),
          };
        } catch {
          // Fall through to deterministic deliberation
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'AI Deliberation error; using rule-based synthesis');
    }

    return this.generateDeterministicDeliberation(caseItem, topCandidate);
  }

  generateDeterministicDeliberation(caseItem, topCandidate) {
    const { features = {}, score_final: scoreFinal } = caseItem;

    const prosecutorPoints = [];
    const skepticPoints = [];

    // Prosecutor arguments
    prosecutorPoints.push('Contact verified via Sentinel-1 Synthetic Aperture Radar without corresponding AIS broadcast.');
    if (features.inMPA) {
      prosecutorPoints.push(`Operating strictly inside the boundary of ${features.mpaName || 'Marine Protected Area'}, an unlawful zone for commercial gear.`);
    }
    if (features.recurrenceCount > 1) {
      prosecutorPoints.push(`Recurrent loitering confirmed across ${features.recurrenceCount} radar passes, inconsistent with innocent transit.`);
    }
    if (topCandidate && !topCandidate.iotcAuthorized) {
      prosecutorPoints.push(`Kinematically matched to candidate '${topCandidate.vesselName}' which lacks mandatory IOTC tuna authorization in this ocean.`);
    } else {
      prosecutorPoints.push('Target coordinates intersect primary offshore commercial longline and purse seine grounds.');
    }

    // Skeptic arguments
    if (features.distanceToCoastKm < 10) {
      skepticPoints.push('Nearshore location (<10 km from coast) may represent artisanal fishing craft exempt from mandatory Class A AIS.');
    } else {
      skepticPoints.push('Satellite constellation AIS revisit gaps can result in momentary transponder broadcast loss.');
    }
    if (features.waveHeightM > 2.0) {
      skepticPoints.push(`Moderate-to-rough sea state (${features.waveHeightM}m wave height) creates surface clutter that can generate radar centroid anomalies.`);
    } else {
      skepticPoints.push('Lack of AIS does not prove illegal fishing without visual confirmation of deployed nets or longlines.');
    }
    skepticPoints.push('Radar return alone lacks biometric or vessel registry proof without on-water inspection.');

    const verdict = scoreFinal >= 75 ? 'High Probability Dark Incursion' : scoreFinal >= 50 ? 'Ambiguous / Verification Required' : 'Probable Clutter / Artisanal Craft';

    return {
      prosecutor_brief: `The evidence demonstrates an intentional dark vessel contact. ${prosecutorPoints.join(' ')}`,
      skeptic_brief: `Alternative explanations must be considered before deploying high-cost assets. ${skepticPoints.join(' ')}`,
      calibrated_verdict: verdict,
      evidentiary_confidence: Math.min(88, Math.max(50, scoreFinal)),
      recommended_action: scoreFinal >= 70 ? 'Dispatch nearest coastal patrol asset for intercept and visual inspection.' : 'Log coordinates and monitor on next Sentinel-1 satellite pass.',
      prosecutor_points: prosecutorPoints,
      skeptic_points: skepticPoints,
      generated_by: 'Deterministic Multi-Agent Deliberation Engine',
      deliberated_at: new Date().toISOString(),
    };
  }
}

export const deliberationEngine = new DeliberationEngine();
export default deliberationEngine;
