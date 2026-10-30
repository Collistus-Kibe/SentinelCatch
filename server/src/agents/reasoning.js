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
            lat: -1.9500,
            lon: 41.3200,
            locationLabel: 'Kiunga Marine Reserve (Lamu Sector)',
            sector: 'Lamu',
            distanceToCoastKm: 12,
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
              recommended_action: 'Task Lamu Naval Base interceptor for immediate visual and boarding inspection at GPS -1.9500, 41.3200; initiate RFMO query.',
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
          created_at: new Date(now - 1 * 3600 * 1000).toISOString(),
          rationale: 'Suspected unauthorized at-sea transshipment and dark contraband transfer. Unmatched radar contact loitering with an active AIS cargo vessel near the Kenya-Tanzania maritime boundary.',
          features: {
            lat: -4.5800,
            lon: 39.5200,
            locationLabel: '4.5800° S, 39.5200° E',
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
            estimatedLengthM: 185,
            seaState: 'Calm',
            waveHeightM: 0.7,
            seaPenalty: 0,
            aisCoverageConfidence: 0.95,
            key_factors: [
              'Operating in restricted zone (possible IUU)',
              'Irregular route pattern',
              'No AIS–Radar match (last 6 hrs)',
              'Suspected black goods / contraband transshipment',
            ],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'SL PACIFIC DAWN 02',
                mmsi: '265789012',
                imo: '9876543',
                flag: 'Unknown',
                callsign: '9LA2201',
                gearType: 'Bulk Carrier',
                lengthM: 185.0,
                confidencePct: 82,
                speedKnots: 12.5,
                heading: 210,
                headingLabel: '210° (SSW)',
                distanceKmToRadar: 1.2,
                hoursSinceAisOff: 6.0,
                requiredSpeedKnots: 12.5,
                iotcAuthorized: false,
                iuuListed: true,
                iuuListingBody: 'Combined RFMO IUU & Dark Goods Watchlist',
                historicalAisOffCount60d: 4,
                aisCoverageMetricPct: 35,
                mpaViolationHistory: true,
                attributionDisclaimer: 'Probabilistic candidate based on kinematic trajectory and AIS-off timing. Never an accusation.',
                summaryRationale: '82% probability: SAR/AIS position, course and vessel type align. Switched AIS transponder off 6h ago. Proximity to paired cargo vessel suggests illicit transshipment of black goods and unmonitored catch.',
              },
            ],
            deliberation: {
              prosecutor_brief: 'Radar return indicates a 185m bulk carrier rendezvous stationary within 1.4 km of an unflagged vessel 18 km off Shimoni/Vanga near the Tanzania maritime border. Contact exhibits irregular loitering patterns and disabled AIS for >6 hours, indicative of illicit transshipment of black goods and evasion of port customs inspections.',
              skeptic_brief: 'Vessel is positioned in deep navigable passage off the South Coast fairway. Single radar return corroboration should be confirmed by forward patrol boat boarding to inspect cargo manifests and fish holds.',
              calibrated_verdict: 'High Threat Dark Rendezvous & Transshipment',
              evidentiary_confidence: 86,
              recommended_action: 'Investigate possible unauthorized activity. Coordinate with KMA and regional partners.',
              prosecutor_points: [
                'Operating in restricted zone (possible IUU)',
                'Irregular route pattern with erratic drift vector',
                'No AIS–Radar match (last 6 hrs)',
                'Suspected illicit transshipment of contraband and unauthorized catch',
              ],
              skeptic_points: [
                'Vessel may be drifting in standby waiting for pilot clearance',
                'Atmospheric fading may cause intermittent VHF reception near coastal hills',
                'Requires visual forward verification prior to interdiction',
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
          score_rule: 62,
          score_llm_adjust: 2,
          score_final: 64,
          band: 'Medium',
          sector: 'South Coast/Vanga',
          status: 'new',
          created_at: new Date(now - 6 * 3600 * 1000).toISOString(),
          rationale: 'Unidentified contact detected 26 km SE of Shimoni / Vanga off Tanga approach corridor. Kinematic vector consistent with regional transit or unmonitored coastal transfer.',
          features: {
            lat: -4.85,
            lon: 39.42,
            locationLabel: 'Tanga, Tanzania',
            sector: 'South Coast/Vanga',
            distanceToCoastKm: 26,
            nearestPort: 'Tanga',
            distanceToEEZBoundaryKm: 85,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 18,
            recurrenceCount: 1,
            displacementPattern: 'Coastal Fairway Transit',
            hasNearbyAisGap: true,
            aisGapDistanceKm: 3.1,
            nearbyAisVesselsCount: 2,
            estimatedLengthM: 62,
            seaState: 'Calm to Slight',
            waveHeightM: 0.9,
            seaPenalty: 0,
            aisCoverageConfidence: 0.94,
            key_factors: ['Border transit corridor (Kenya-Tanzania)', 'Intermittent AIS transmission', 'Unmatched radar echo'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: '26 km SE of Shimoni / Vanga',
                mmsi: '677018291',
                flag: 'Tanzania',
                callsign: '5IZ88',
                gearType: 'Coastal Feeder',
                lengthM: 62.0,
                confidencePct: 68,
                speedKnots: 9.4,
                heading: 175,
                headingLabel: '175° (S)',
                distanceKmToRadar: 3.1,
                hoursSinceAisOff: 6.0,
                requiredSpeedKnots: 9.4,
                iotcAuthorized: false,
                iuuListed: false,
                historicalAisOffCount60d: 2,
                aisCoverageMetricPct: 70,
                attributionDisclaimer: 'Probabilistic correlation based on radar displacement.',
                summaryRationale: '68% match probability: Radar contact transiting southbound across the border zone.',
              },
            ],
          },
        },
        {
          id: 106,
          detection_id: 6,
          behavior: 'normal-transit',
          score_rule: 30,
          score_llm_adjust: 2,
          score_final: 32,
          band: 'Low',
          sector: 'Mombasa',
          status: 'acknowledged',
          created_at: new Date(now - 3 * 3600 * 1000).toISOString(),
          rationale: 'Active AIS coastal cargo vessel KIUNGA MARINE transiting Mombasa approach fairway with compliant broadcasting.',
          features: {
            lat: -4.08,
            lon: 39.75,
            locationLabel: 'Mombasa, Kenya',
            sector: 'Mombasa',
            distanceToCoastKm: 14,
            nearestPort: 'Mombasa',
            distanceToEEZBoundaryKm: 120,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 15,
            recurrenceCount: 1,
            displacementPattern: 'Standard Channel Transit',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 4,
            estimatedLengthM: 58,
            seaState: 'Calm',
            waveHeightM: 0.8,
            seaPenalty: 0,
            aisCoverageConfidence: 0.98,
            key_factors: ['Active compliant AIS', 'Normal commercial speed (8.4 kts)'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'KIUNGA MARINE',
                mmsi: '634002819',
                imo: '9128491',
                flag: 'Kenya',
                callsign: '5MZ91',
                gearType: 'Coastal Cargo',
                lengthM: 58.0,
                confidencePct: 96,
                speedKnots: 8.4,
                heading: 145,
                headingLabel: '145° (SE)',
                distanceKmToRadar: 0.2,
                hoursSinceAisOff: 0,
                requiredSpeedKnots: 8.4,
                iotcAuthorized: false,
                iuuListed: false,
                historicalAisOffCount60d: 0,
                aisCoverageMetricPct: 98,
                attributionDisclaimer: 'Verified active AIS broadcast.',
                summaryRationale: 'Compliant commercial coastal cargo carrier en route to Mombasa harbour.',
              },
            ],
          },
        },
        {
          id: 107,
          detection_id: 7,
          behavior: 'normal-transit',
          score_rule: 28,
          score_llm_adjust: 0,
          score_final: 28,
          band: 'Low',
          sector: 'South Coast/Vanga',
          status: 'acknowledged',
          created_at: new Date(now - 9 * 3600 * 1000).toISOString(),
          rationale: 'Commercial general cargo vessel MV OCEAN SPIRIT maintaining regular course in international fairway toward Dar es Salaam.',
          features: {
            lat: -5.10,
            lon: 40.08,
            locationLabel: '35 km E of Pemba Island (Fairway)',
            sector: 'South Coast/Vanga',
            distanceToCoastKm: 42,
            nearestPort: 'Dar es Salaam',
            distanceToEEZBoundaryKm: 90,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 40,
            recurrenceCount: 1,
            displacementPattern: 'Fairway Transit',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 3,
            estimatedLengthM: 68,
            seaState: 'Calm',
            waveHeightM: 0.7,
            seaPenalty: 0,
            aisCoverageConfidence: 0.95,
            key_factors: ['Compliant AIS voyage plan', 'Clear separation from protected areas'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'MV OCEAN SPIRIT',
                mmsi: '677019283',
                imo: '9238491',
                flag: 'Tanzania',
                callsign: '5IT90',
                gearType: 'General Cargo',
                lengthM: 68.0,
                confidencePct: 94,
                speedKnots: 7.5,
                heading: 310,
                headingLabel: '310° (NW)',
                distanceKmToRadar: 0.5,
                hoursSinceAisOff: 0,
                requiredSpeedKnots: 7.5,
                iotcAuthorized: false,
                iuuListed: false,
                historicalAisOffCount60d: 0,
                aisCoverageMetricPct: 96,
                attributionDisclaimer: 'Verified AIS commercial vessel.',
                summaryRationale: 'Compliant cargo carrier voyaging along East African coastal lane.',
              },
            ],
          },
        },
        {
          id: 108,
          detection_id: 8,
          behavior: 'dark-vessel',
          score_rule: 76,
          score_llm_adjust: 2,
          score_final: 78,
          band: 'High',
          sector: 'South Coast/Vanga',
          status: 'new',
          created_at: new Date(now - 12 * 3600 * 1000).toISOString(),
          rationale: 'General cargo vessel ALPHA TRADER detected with disabled transponder near Zanzibar Channel. Suspected illicit transshipment or contraband movements.',
          features: {
            lat: -5.85,
            lon: 39.35,
            locationLabel: 'Zanzibar Channel',
            sector: 'South Coast/Vanga',
            distanceToCoastKm: 18,
            nearestPort: 'Zanzibar Port',
            distanceToEEZBoundaryKm: 65,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 22,
            recurrenceCount: 2,
            displacementPattern: 'Channel Loitering',
            hasNearbyAisGap: true,
            aisGapDistanceKm: 2.2,
            nearbyAisVesselsCount: 1,
            estimatedLengthM: 74,
            seaState: 'Calm',
            waveHeightM: 0.8,
            seaPenalty: 0,
            aisCoverageConfidence: 0.92,
            key_factors: ['Zanzibar channel loitering', 'Disabled transponder', 'Customs illicit goods watchlist'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'ALPHA TRADER',
                mmsi: '354921008',
                imo: '9348120',
                flag: 'Panama',
                callsign: 'HP2910',
                gearType: 'General Cargo',
                lengthM: 74.0,
                confidencePct: 84,
                speedKnots: 11.2,
                heading: 190,
                headingLabel: '190° (S)',
                distanceKmToRadar: 2.2,
                hoursSinceAisOff: 5.5,
                requiredSpeedKnots: 11.2,
                iotcAuthorized: false,
                iuuListed: true,
                iuuListingBody: 'Customs Illicit Goods Watchlist',
                historicalAisOffCount60d: 5,
                aisCoverageMetricPct: 38,
                attributionDisclaimer: 'High threat anomaly detection.',
                summaryRationale: 'Blacklisted on contraband surveillance registry. Deactivated AIS 5.5h ago in Zanzibar channel.',
              },
            ],
          },
        },
        {
          id: 109,
          detection_id: 9,
          behavior: 'normal-transit',
          score_rule: 40,
          score_llm_adjust: 1,
          score_final: 41,
          band: 'Low',
          sector: 'Mombasa',
          status: 'acknowledged',
          created_at: new Date(now - 16 * 3600 * 1000).toISOString(),
          rationale: 'Reefer vessel FJORD STAR operating on scheduled approach to Mombasa container terminal.',
          features: {
            lat: -4.12,
            lon: 39.82,
            locationLabel: 'Mombasa, Kenya',
            sector: 'Mombasa',
            distanceToCoastKm: 16,
            nearestPort: 'Mombasa',
            distanceToEEZBoundaryKm: 135,
            inMPA: false,
            mpaName: null,
            distanceToMpaKm: 12,
            recurrenceCount: 1,
            displacementPattern: 'Terminal Approach',
            hasNearbyAisGap: false,
            aisGapDistanceKm: null,
            nearbyAisVesselsCount: 4,
            estimatedLengthM: 64,
            seaState: 'Calm',
            waveHeightM: 0.9,
            seaPenalty: 0,
            aisCoverageConfidence: 0.97,
            key_factors: ['Commercial reefer container schedule', 'Clear AIS reception'],
            llm_source: 'Gemini 2.5 Flash',
            candidate_matches: [
              {
                vesselName: 'FJORD STAR',
                mmsi: '636018291',
                imo: '9082341',
                flag: 'Liberia',
                callsign: 'A8LK9',
                gearType: 'Reefer Vessel',
                lengthM: 64.0,
                confidencePct: 92,
                speedKnots: 9.8,
                heading: 45,
                headingLabel: '045° (NE)',
                distanceKmToRadar: 0.4,
                hoursSinceAisOff: 0,
                requiredSpeedKnots: 9.8,
                iotcAuthorized: false,
                iuuListed: false,
                historicalAisOffCount60d: 0,
                aisCoverageMetricPct: 97,
                attributionDisclaimer: 'Verified commercial reefer.',
                summaryRationale: 'Regular reefer shipment approaching Kilindini port.',
              },
            ],
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
