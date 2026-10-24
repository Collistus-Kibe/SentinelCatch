import { query } from '../db/index.js';
import { haversineKm } from '../utils/geo.js';
import { distanceToEEZBoundaryKm, checkMPAIntersection } from '../geo/kenya_eez.js';
import openMeteoClient from '../integrations/openmeteo.js';
import llmClient from '../integrations/llm.js';
import AlertAgent from './alert.js';
import identityMatcher from './identity.js';
import deliberationEngine from './deliberation.js';
import logger from '../logger.js';

// In-memory case repository for development / test environments without PostgreSQL
const inMemoryCases = new Map();

export class ReasoningAgent {
  /**
   * Evaluate an array of unmatched detections, compute 10 operational features,
   * score with rule-based baseline and LLM adjustment, and store cases.
   *
   * @param {Array} detections - Unmatched candidate detections from Detection Agent
   * @param {Object} context - Optional historical context: { pastDetections, aisGaps, liveShips, isBackfill }
   * @returns {Promise<Array>} Scored cases
   */
  static async processCandidates(detections, context = {}) {
    logger.info({ count: detections.length }, 'Reasoning Agent evaluating candidate detections...');
    const cases = [];

    // Ensure seed cases exist first so we know what is already active
    if (inMemoryCases.size === 0) {
      this.getInMemoryCases();
    }

    // Build assigned vessels set from existing active cases to strictly prevent duplicates
    const assignedVessels = new Set(context.assignedVessels || []);
    for (const c of inMemoryCases.values()) {
      const vName = c.candidate_matches?.[0]?.vesselName || c.features?.candidate_matches?.[0]?.vesselName;
      if (vName) assignedVessels.add(vName.toUpperCase().trim());
    }

    for (const det of detections) {
      try {
        const assessed = await this.evaluateDetection(det, { ...context, assignedVessels });
        if (assessed?.features?.candidate_matches?.[0]?.vesselName) {
          assignedVessels.add(assessed.features.candidate_matches[0].vesselName.toUpperCase().trim());
        }
        cases.push(assessed);
      } catch (err) {
        logger.error({ err: err.message, detectionId: det.id }, 'Error evaluating detection in Reasoning Agent');
      }
    }

    return cases;
  }

  /**
   * Evaluate a single detection and compute all 10 features
   */
  static async evaluateDetection(det, context = {}) {
    const lat = Number(det.lat);
    const lon = Number(det.lon);

    // Spatial Track Correlation / Deduplication:
    // If an existing active contact is already within 10 km, update it instead of creating a duplicate contact
    const existingCase = Array.from(inMemoryCases.values()).find((c) => {
      const cLat = Number(c.features?.lat ?? c.lat);
      const cLon = Number(c.features?.lon ?? c.lon);
      if (isNaN(cLat) || isNaN(cLon)) return false;
      return haversineKm(lat, lon, cLat, cLon) < 10.0;
    });

    if (existingCase) {
      existingCase.features.recurrenceCount = (existingCase.features.recurrenceCount || 1) + 1;
      existingCase.updated_at = new Date().toISOString();
      const existingVessel = existingCase.candidate_matches?.[0]?.vesselName || existingCase.features?.candidate_matches?.[0]?.vesselName;
      if (existingVessel && context.assignedVessels) {
        context.assignedVessels.add(existingVessel.toUpperCase().trim());
      }
      return existingCase;
    }

    // ──────────────────────────────────────────────
    // 1. Feature Extraction (10 Operational Features)
    // ──────────────────────────────────────────────

    // F1: Loitering recurrence (detections in 10 km radius over past 14 days)
    const recurrenceCount = await this.calculateRecurrence(lat, lon, det.detected_at, context.pastDetections);

    // F2: EEZ boundary proximity (< 25 km increases suspicion)
    const distToEEZBoundary = distanceToEEZBoundaryKm(lat, lon);

    // F3: Displacement pattern (stationary vs transit)
    const displacementPattern = recurrenceCount > 1 ? 'Stationary Loitering' : 'Single Radar Return / Transit';

    // F4: AIS gap context (proximity to recent GFW AIS gap events)
    const aisGapInfo = this.checkAisGapProximity(lat, lon, context.aisGaps || []);

    // F5: Fleet proximity (active AIS vessels within 20 km)
    const nearbyFleet = this.countNearbyVessels(lat, lon, context.liveShips || [], 20.0);

    // F6: Port & shore proximity (< 10 km lowers score)
    const distanceToCoastKm = det.distanceToCoastKm ?? 50;
    const nearestPort = det.nearestPort || 'Open Coast';

    // F7: Marine Protected Area (MPA) intersection
    const mpaCheck = checkMPAIntersection(lat, lon);

    // F8: Estimated vessel length from radar backscatter
    const estimatedLengthM = det.length_m || (det.raw?.length_m ?? null);

    // F9: Sea state impact from Open-Meteo
    const marineConditions = await openMeteoClient.getMarineConditions(lat, lon);

    // F10: AIS coverage confidence (higher in cell with regular traffic, default ~0.85)
    const aisCoverageConfidence = this.estimateAisCoverage(lat, lon, distanceToCoastKm);

    const features = {
      lat,
      lon,
      locationLabel: det.locationLabel,
      sector: det.sector,
      distanceToCoastKm,
      nearestPort,
      distanceToEEZBoundaryKm: distToEEZBoundary,
      inMPA: mpaCheck.inside,
      mpaName: mpaCheck.mpaName,
      distanceToMpaKm: mpaCheck.distanceKm,
      recurrenceCount,
      displacementPattern,
      hasNearbyAisGap: aisGapInfo.hasGap,
      aisGapDistanceKm: aisGapInfo.distanceKm,
      nearbyAisVesselsCount: nearbyFleet,
      estimatedLengthM,
      seaState: marineConditions.seaState,
      waveHeightM: marineConditions.waveHeightM,
      seaPenalty: marineConditions.penalty,
      aisCoverageConfidence,
    };

    // ──────────────────────────────────────────────
    // 2. Base Rule-Based Scoring (0 - 100)
    // ──────────────────────────────────────────────
    let ruleScore = 40; // Base unmatched radar suspicion

    if (features.inMPA) ruleScore += 25; // Critical violation: illegal fishing in MPA
    if (distToEEZBoundary < 25) ruleScore += 15; // Border skirmishing
    if (recurrenceCount > 1) ruleScore += 15; // Repeated loitering
    if (aisGapInfo.hasGap) ruleScore += 10; // Corroborated AIS signal loss
    if (estimatedLengthM && estimatedLengthM > 35) ruleScore += 10; // Large industrial vessel

    // Mitigations
    if (distanceToCoastKm < 10) ruleScore -= 25; // Harbour / coastal artisanal negative control
    if (features.seaPenalty) ruleScore -= features.seaPenalty; // Rough sea clutter reduction
    if (estimatedLengthM && estimatedLengthM < 15) ruleScore -= 15; // Likely small local boat

    ruleScore = Math.max(0, Math.min(100, Math.round(ruleScore)));

    // ──────────────────────────────────────────────
    // 3. LLM Nuanced Adjustment (-15 to +15) & Rationale
    // ──────────────────────────────────────────────
    const llmResult = await llmClient.assessCase(features, ruleScore);

    const finalScore = Math.max(
      0,
      Math.min(100, ruleScore + (llmResult.score_adjustment ?? 0))
    );

    // Candidate Identity Matching ("Who is it?")
    let candidateMatches = [];
    try {
      candidateMatches = await identityMatcher.matchCandidates(
        { ...det, sector: det.sector || features.sector },
        context.liveShips || [],
        context.assignedVessels || new Set()
      );
      if (candidateMatches[0]?.vesselName && context.assignedVessels) {
        context.assignedVessels.add(candidateMatches[0].vesselName.toUpperCase().trim());
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Candidate identity matching fallback');
    }

    // Classify severity band
    let band = 'Low';
    if (finalScore >= 70) band = 'High';
    else if (finalScore >= 45) band = 'Medium';

    // Autonomous Multi-Agent Deliberation (Prosecutor vs Skeptic) for High cases
    let deliberation = null;
    if (band === 'High' && !context.isBackfill) {
      try {
        deliberation = await deliberationEngine.deliberate({
          score_final: finalScore,
          band,
          sector: det.sector,
          features: { ...features, lat, lon },
          candidate_matches: candidateMatches,
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'Deliberation engine fallback');
      }
    }

    const caseRecord = {
      detection_id: det.id,
      behavior: det.behavior || 'dark-vessel',
      score_rule: ruleScore,
      score_llm_adjust: llmResult.score_adjustment ?? 0,
      score_final: finalScore,
      band,
      rationale: llmResult.rationale,
      candidate_matches: candidateMatches,
      features: {
        ...features,
        lat,
        lon,
        candidate_matches: candidateMatches,
        deliberation,
        key_factors: llmResult.key_factors || [],
        llm_source: llmResult.source || 'fallback',
      },
      sector: det.sector,
      status: 'new',
      created_at: det.detected_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store in-memory
    const caseKey = `${det.hash || det.id || Date.now()}`;
    inMemoryCases.set(caseKey, caseRecord);

    // Persist to PostgreSQL if available
    try {
      const sql = `
        INSERT INTO cases (
          detection_id, behavior, score_rule, score_llm_adjust, score_final,
          band, rationale, features, sector, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `;
      const res = await query(sql, [
        caseRecord.detection_id || null,
        caseRecord.behavior,
        caseRecord.score_rule,
        caseRecord.score_llm_adjust,
        caseRecord.score_final,
        caseRecord.band,
        caseRecord.rationale,
        JSON.stringify(caseRecord.features),
        caseRecord.sector,
        caseRecord.status,
        caseRecord.created_at,
        caseRecord.updated_at,
      ]);
      caseRecord.id = res?.insertId || res?.rows?.[0]?.id || caseRecord.id || (inMemoryCases.size + 1);
    } catch {
      caseRecord.id = caseRecord.id || (inMemoryCases.size + 1);
    }

    // ──────────────────────────────────────────────
    // 4. Trigger Alert Agent
    // ──────────────────────────────────────────────
    await AlertAgent.processCase(caseRecord, Boolean(context.isBackfill));

    return caseRecord;
  }

  static async calculateRecurrence(lat, lon, detectedAt, pastDetections = []) {
    let count = 1;
    const targetTime = new Date(detectedAt).getTime();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    // Check provided past detections
    for (const p of pastDetections) {
      const pTime = new Date(p.detected_at).getTime();
      if (pTime < targetTime && targetTime - pTime <= fourteenDaysMs) {
        if (haversineKm(lat, lon, p.lat, p.lon) <= 10.0) {
          count++;
        }
      }
    }

    // Try DB query if available
    try {
      const targetTime = new Date(detectedAt).getTime();
      const fourteenDaysAgo = new Date(targetTime - 14 * 24 * 60 * 60 * 1000).toISOString();
      const res = await query(
        `SELECT COUNT(*) as count FROM detections
         WHERE detected_at < $1 AND detected_at >= $2
           AND ABS(lat - $3) < 0.1 AND ABS(lon - $4) < 0.1`,
        [detectedAt, fourteenDaysAgo, lat, lon]
      );
      const dbCount = Number(res.rows[0]?.count || 0);
      return Math.max(count, dbCount + 1);
    } catch {
      return count;
    }
  }

  static checkAisGapProximity(lat, lon, aisGaps = []) {
    let minDistanceKm = Infinity;
    for (const gap of aisGaps) {
      const gLat = gap.lat || gap.latitude;
      const gLon = gap.lon || gap.longitude;
      if (gLat && gLon) {
        const d = haversineKm(lat, lon, gLat, gLon);
        if (d < minDistanceKm) {
          minDistanceKm = d;
        }
      }
    }

    const hasGap = minDistanceKm <= 15.0;
    return {
      hasGap,
      distanceKm: hasGap ? Math.round(minDistanceKm * 10) / 10 : null,
    };
  }

  static countNearbyVessels(lat, lon, vessels = [], radiusKm = 20.0) {
    let count = 0;
    for (const v of vessels) {
      if (v.lat !== undefined && v.lon !== undefined) {
        if (haversineKm(lat, lon, v.lat, v.lon) <= radiusKm) {
          count++;
        }
      }
    }
    return count;
  }

  static estimateAisCoverage(lat, lon, distanceToCoastKm) {
    // Coastal waters < 50 km have higher terrestrial AIS receiver coverage (~0.95).
    // Outer EEZ > 150 km relies strictly on satellite AIS constellations (~0.75 - 0.85).
    if (distanceToCoastKm < 50) return 0.95;
    if (distanceToCoastKm < 150) return 0.85;
    return 0.78;
  }

  static getInMemoryCases() {
    if (inMemoryCases.size === 0) {
      const now = new Date();
      const seedCases = [
        {
          id: 101,
          detection_id: 1,
          behavior: 'dark-vessel',
          score_rule: 90,
          score_llm_adjust: 2,
          score_final: 92,
          band: 'High',
          sector: 'Lamu',
          status: 'new',
          created_at: new Date(now - 45 * 60 * 1000).toISOString(),
          rationale: 'Industrial trawler (68m) detected inside Kiunga Marine National Reserve boundary with 3 recurrent passes over 14 days and zero corresponding AIS transponder signals.',
          features: {
            lat: -2.15,
            lon: 41.55,
            locationLabel: '52 km E of Lamu (Kiunga Reserve Sector)',
            sector: 'Lamu',
            distanceToCoastKm: 48,
            nearestPort: 'Lamu Port',
            distanceToEEZBoundaryKm: 75,
            inMPA: true,
            mpaName: 'Kiunga Marine National Reserve',
            distanceToMpaKm: 0,
            recurrenceCount: 3,
            displacementPattern: 'Stationary Loitering',
            hasNearbyAisGap: true,
            aisGapDistanceKm: 4.2,
            nearbyAisVesselsCount: 0,
            estimatedLengthM: 68,
            seaState: 'Smooth to Slight',
            waveHeightM: 1.1,
            seaPenalty: 0,
            aisCoverageConfidence: 0.92,
            key_factors: ['Inside Kiunga Marine Reserve', 'Recurrent loitering (3 passes)', 'Industrial vessel length (68m)', 'Corroborated by AIS gap'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'LU RONG YUAN YU 188',
                mmsi: '412349012',
                flag: 'China',
                callsign: 'BZYW8',
                gearType: 'Tuna Longliner',
                lengthM: 44.5,
                confidencePct: 88,
                distanceKmToRadar: 18,
                hoursSinceAisOff: 2.5,
                requiredSpeedKnots: 9.8,
                iotcAuthorized: false,
                iuuListed: true,
                iuuListingBody: 'Combined RFMO IUU (IOTC/WCPFC)',
                historicalAisOffCount60d: 5,
                aisCoverageMetricPct: 41,
                mpaViolationHistory: true,
                attributionDisclaimer: 'Probabilistic candidate based on kinematic trajectory and AIS-off timing. Never an accusation.',
                summaryRationale: '88% probability: Switched AIS off 2.5h ago at 18 km. Requires 9.8 kts transit. NOT in IOTC authorized registry. WARNING: Flagged on Combined RFMO IUU list. 5 AIS gaps in 60d.',
              },
              {
                vesselName: 'HAI FENG 68',
                mmsi: '352001928',
                flag: 'Panama',
                callsign: 'HO3891',
                gearType: 'Trawler',
                lengthM: 38.0,
                confidencePct: 62,
                distanceKmToRadar: 27,
                hoursSinceAisOff: 3.3,
                requiredSpeedKnots: 8.2,
                iotcAuthorized: false,
                iuuListed: false,
                iuuListingBody: null,
                historicalAisOffCount60d: 3,
                aisCoverageMetricPct: 58,
                mpaViolationHistory: true,
                attributionDisclaimer: 'Probabilistic candidate based on kinematic trajectory and AIS-off timing. Never an accusation.',
                summaryRationale: '62% probability: AIS transponder ceased 3.3h ago at 27 km. 3 previous gap events recorded in 60d.',
              },
            ],
            deliberation: {
              prosecutor_brief: 'The contact exhibits high-conviction indicators of illicit fishing: a 68m industrial vessel operating inside the Kiunga Marine National Reserve boundary without active AIS transponder broadcast. Three distinct radar returns over 14 days confirm recurrent loitering rather than innocent transit. Kinematic vector strongly correlates with LU RONG YUAN YU 188 which deactivated AIS 2.5 hours prior and is unlisted on the IOTC authorized registry with prior RFMO IUU sanctions.',
              skeptic_brief: 'While the radar detection is inside the reserve limits, satellite-derived AIS reception in coastal Lamu archipelago can suffer up to 15% packet latency during afternoon convective weather. Wave height of 1.1m is benign, but nearby dhow traffic and shallow mangrove channels can occasionally induce multipath radar ghosting. The 20m variance between estimated radar return (68m) and the candidate vessel (44.5m) warrants visual aerial verification before punitive action.',
              calibrated_verdict: 'High Threat Incursion',
              evidentiary_confidence: 88,
              recommended_action: 'Task Lamu Naval Base interceptor for immediate visual and boarding inspection at GPS -2.0500, 41.2500; initiate RFMO query.',
              prosecutor_points: [
                'Confirmed position inside Kiunga Marine National Reserve',
                'Recurrent loitering with 3 distinct satellite radar passes over 14 days',
                'Candidate vessel LU RONG YUAN YU 188 is flagged on Combined RFMO IUU blacklist and lacks IOTC tuna authorization',
              ],
              skeptic_points: [
                'Radar return length estimation (68m) exceeds candidate registered length (44.5m) by 23.5m',
                'Coastal shadow effect near archipelago islands can reduce single-station VHF AIS line-of-sight',
                'Requires forward visual confirmation prior to legal detention under Fisheries Management Act 2016',
              ],
            },
          },
        },
        {
          id: 102,
          detection_id: 2,
          behavior: 'possible-transshipment',
          score_rule: 85,
          score_llm_adjust: 1,
          score_final: 86,
          band: 'High',
          sector: 'South Coast/Vanga',
          status: 'new',
          created_at: new Date(now - 3 * 3600 * 1000).toISOString(),
          rationale: 'Suspected unauthorized transshipment. Unmatched radar contact stationary within 1.4 km of an active AIS cargo vessel near the Kenya-Tanzania maritime boundary.',
          features: {
            lat: -4.75,
            lon: 39.75,
            locationLabel: '32 km SE of Shimoni / Vanga',
            sector: 'South Coast/Vanga',
            distanceToCoastKm: 18,
            nearestPort: 'Shimoni/Vanga',
            distanceToEEZBoundaryKm: 32,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 12.5,
            recurrenceCount: 2,
            displacementPattern: 'Stationary Rendezvous',
            hasNearbyAisGap: true,
            aisGapDistanceKm: 1.4,
            nearbyAisVesselsCount: 1,
            estimatedLengthM: 52,
            seaState: 'Calm',
            waveHeightM: 0.7,
            seaPenalty: 0,
            aisCoverageConfidence: 0.95,
            key_factors: ['Proximity to AIS vessel (1.4 km)', 'Stationary rendezvous behavior', 'Near maritime border'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'PACIFIC DAWN 02',
                mmsi: '667001421',
                flag: 'Sierra Leone',
                callsign: '9LA2201',
                gearType: 'Reefer / Cargo Carrier',
                lengthM: 52.0,
                confidencePct: 82,
                distanceKmToRadar: 12,
                hoursSinceAisOff: 2.1,
                requiredSpeedKnots: 11.5,
                iotcAuthorized: false,
                iuuListed: false,
                iuuListingBody: null,
                historicalAisOffCount60d: 4,
                aisCoverageMetricPct: 35,
                mpaViolationHistory: false,
                attributionDisclaimer: 'Probabilistic candidate based on kinematic trajectory and AIS-off timing. Never an accusation.',
                summaryRationale: '82% probability: Switched AIS off 2.1h ago at 12 km. Proximity to paired cargo vessel suggests unmonitored transshipment or bunkering transfer.',
              },
            ],
            deliberation: {
              prosecutor_brief: 'Radar return indicates a 52m vessel stationary within 1.4 km of an active cargo carrier 18 km off Shimoni, near the Tanzania border. This rendezvous signature is standard operational tradecraft for at-sea transshipment of catch or illegal bunkering to circumvent landing declarations.',
              skeptic_brief: 'Both vessels are anchored in a recognized shelter bay off Shimoni during tidal change. Radio communication records indicate mutual assistance or mechanical standby cannot be ruled out until maritime police inspect ship manifests.',
              calibrated_verdict: 'Suspected Illegal Transshipment',
              evidentiary_confidence: 81,
              recommended_action: 'Dispatch Mombasa coast guard patrol craft to conduct boarding and cargo manifest check.',
              prosecutor_points: [
                'Stationary tandem rendezvous within 1.4 km of cargo vessel',
                'Operates 18 km from Kenya-Tanzania maritime boundary',
                'Candidate PACIFIC DAWN 02 has 4 documented AIS gap events in 60 days',
              ],
              skeptic_points: [
                'Sheltered anchorage zone frequently utilized for swell protection',
                'No recorded pollution discharge or gear deployment telemetry',
                'Border proximity means vessel could be entering Tanzanian jurisdiction with legitimate clearances',
              ],
            },
          },
        },
        {
          id: 103,
          detection_id: 3,
          behavior: 'dark-vessel',
          score_rule: 80,
          score_llm_adjust: -1,
          score_final: 79,
          band: 'High',
          sector: 'Malindi-Kilifi',
          status: 'acknowledged',
          created_at: new Date(now - 8 * 3600 * 1000).toISOString(),
          rationale: 'Longliner contact operating 16 km inside the outer eastern EEZ border, consistent with border-skirting unauthorized driftnet fishing.',
          features: {
            lat: -3.45,
            lon: 44.10,
            locationLabel: '420 km E of Watamu (Outer EEZ)',
            sector: 'Malindi-Kilifi',
            distanceToCoastKm: 420,
            nearestPort: 'Kilifi',
            distanceToEEZBoundaryKm: 16,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 410,
            recurrenceCount: 1,
            displacementPattern: 'Slow Drift',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 0,
            estimatedLengthM: 45,
            seaState: 'Moderate',
            waveHeightM: 1.8,
            seaPenalty: 5,
            aisCoverageConfidence: 0.78,
            key_factors: ['EEZ boundary skirmishing (<25 km)', 'Industrial length (45m)', 'Satellite-only AIS zone'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'ZHOU YU 926',
                mmsi: '413398102',
                flag: 'China',
                callsign: 'BB8812',
                gearType: 'Squid Jigger / Longliner',
                lengthM: 48.0,
                confidencePct: 79,
                distanceKmToRadar: 22,
                hoursSinceAisOff: 3.8,
                requiredSpeedKnots: 10.5,
                iotcAuthorized: false,
                iuuListed: true,
                iuuListingBody: 'IOTC IUU List 2024',
                historicalAisOffCount60d: 6,
                aisCoverageMetricPct: 29,
                mpaViolationHistory: true,
                attributionDisclaimer: 'Probabilistic candidate based on kinematic trajectory and AIS-off timing. Never an accusation.',
                summaryRationale: '79% probability: Switched AIS off 3.8h ago. NOT authorized in IOTC tuna registry. Listed on IOTC IUU list 2024 with 6 prior gap events.',
              },
            ],
            deliberation: {
              prosecutor_brief: 'Contact is 16 km inside the outer EEZ boundary, 420 km offshore in the deep pelagic tuna fairway. Operates dark without IOTC authorization. Matched to ZHOU YU 926 which was blacklisted on the IOTC 2024 IUU list.',
              skeptic_brief: 'Outer EEZ boundary is 420 km offshore where terrestrial AIS coverage is zero and satellite AIS revisit frequency can experience multi-hour orbits. High seas transit across the corner of the EEZ without fishing gear deployed is permitted under UNCLOS innocent passage.',
              calibrated_verdict: 'Outer EEZ Skirting Incursion',
              evidentiary_confidence: 77,
              recommended_action: 'Task long-range aerial surveillance or notify regional IOTC patrol coordinating vessel.',
              prosecutor_points: [
                'Located in high-value yellowfin tuna spawning migratory corridor',
                'Vessel candidate is sanctioned on official IOTC IUU Registry',
                'Operates dark with 6 AIS shutoff events in last 60 days',
              ],
              skeptic_points: [
                'Satellite AIS constellation gap in outer EEZ can produce temporary telemetry blackouts',
                'Single radar return: speed or direction of longline sets not yet established by multi-pass radar',
                'Long distance (420 km) makes surface intercept cost-prohibitive without air support',
              ],
            },
          },
        },
        {
          id: 104,
          detection_id: 4,
          behavior: 'dark-vessel',
          score_rule: 65,
          score_llm_adjust: -3,
          score_final: 62,
          band: 'Medium',
          sector: 'Malindi-Kilifi',
          status: 'new',
          created_at: new Date(now - 18 * 3600 * 1000).toISOString(),
          rationale: 'Single radar return detected in transit 32 km East of Malindi. Moderate sea state (2.2m waves) reduces radar backscatter confidence.',
          features: {
            lat: -3.45,
            lon: 40.75,
            locationLabel: '65 km E of Malindi (Deep Channel)',
            sector: 'Malindi-Kilifi',
            distanceToCoastKm: 32,
            nearestPort: 'Malindi',
            distanceToEEZBoundaryKm: 180,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 28,
            recurrenceCount: 1,
            displacementPattern: 'Transit / Moving',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 2,
            estimatedLengthM: 32,
            seaState: 'Moderate (Wave 2.2m)',
            waveHeightM: 2.2,
            seaPenalty: 5,
            aisCoverageConfidence: 0.90,
            key_factors: ['Single pass (no loitering)', 'Moderate sea clutter penalty'],
            llm_source: 'Gemini 2.5 Flash',
          },
        },
        {
          id: 105,
          detection_id: 5,
          behavior: 'dark-vessel',
          score_rule: 25,
          score_llm_adjust: -3,
          score_final: 22,
          band: 'Low',
          sector: 'Mombasa',
          status: 'false_alarm',
          created_at: new Date(now - 28 * 3600 * 1000).toISOString(),
          rationale: 'Radar return 7 km off Kilindini harbour. Proximity to port and small craft profile (<15m) indicates local artisanal dhow or pilot tender.',
          features: {
            lat: -4.18,
            lon: 39.92,
            locationLabel: '24 km SE of Mombasa Port',
            sector: 'Mombasa',
            distanceToCoastKm: 7,
            nearestPort: 'Mombasa (Kilindini)',
            distanceToEEZBoundaryKm: 140,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 8.5,
            recurrenceCount: 1,
            displacementPattern: 'Harbour Approach',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 5,
            estimatedLengthM: 14,
            seaState: 'Calm',
            waveHeightM: 0.8,
            seaPenalty: 0,
            aisCoverageConfidence: 0.98,
            key_factors: ['Harbour negative control (<10 km)', 'Small craft profile (14m)'],
            llm_source: 'Gemini 2.5 Flash',
          },
        },
      ];

      for (const c of seedCases) {
        inMemoryCases.set(String(c.id), c);
      }
    }
    return Array.from(inMemoryCases.values());
  }
}

export default ReasoningAgent;
