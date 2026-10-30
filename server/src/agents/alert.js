import { dispatchAlert } from '../alerts/index.js';
import { query } from '../db/index.js';
import { getRelativeLocationDescription, formatUTC, formatEAT, haversineKm } from '../utils/geo.js';
import config from '../config.js';
import logger from '../logger.js';

export class AlertAgent {
  /**
   * Evaluate a case and dispatch an on-site alert if criteria are met.
   * Enforces 10 km / 7-day deduplication and score delta threshold (+10).
   * @param {Object} caseRecord
   * @param {boolean} isBackfill - If true, backfilled historical cases never generate alerts
   * @returns {Promise<{ alerted: boolean, reason: string, notificationId?: number }>}
   */
  static async processCase(caseRecord, isBackfill = false) {
    if (isBackfill) {
      return { alerted: false, reason: 'Backfilled historical cases do not trigger live alerts' };
    }

    const {
      id: caseId,
      score_final: score,
      band,
      rationale,
      features = {},
      created_at: caseCreatedAt,
    } = caseRecord;

    const lat = caseRecord.lat ?? features.lat;
    const lon = caseRecord.lon ?? features.lon;

    if (lat === undefined || lon === undefined) {
      logger.warn({ caseId }, 'Case missing coordinates; cannot generate geotagged alert');
      return { alerted: false, reason: 'Missing coordinates' };
    }

    // Only alert for High and Medium cases
    if (band === 'Low' && score < config.ALERT_SCORE_THRESHOLD) {
      return { alerted: false, reason: 'Score below alert threshold' };
    }

    // ──────────────────────────────────────────────
    // Deduplication check: 10 km / 7 days
    // ──────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let existingRecentRows = [];
    try {
      const existingRecent = await query(
        `SELECT n.id, n.case_id, n.score, n.lat, n.lon, n.created_at
         FROM notifications n
         WHERE n.created_at >= $1
           AND n.type IN ('case_new', 'case_update')
         ORDER BY n.created_at DESC`,
        [sevenDaysAgo]
      );
      existingRecentRows = existingRecent?.rows || [];
    } catch {
      try {
        const fallback = await query(
          `SELECT n.id, n.case_id, n.score, n.lat, n.lon, n.created_at
           FROM notifications n
           WHERE n.created_at >= $1
           ORDER BY n.created_at DESC`,
          [sevenDaysAgo]
        );
        existingRecentRows = fallback?.rows || [];
      } catch {
        existingRecentRows = [];
      }
    }

    let isDuplicateArea = false;
    let previousScore = 0;

    for (const pastNotif of existingRecentRows) {
      if (pastNotif.lat && pastNotif.lon) {
        const dist = haversineKm(lat, lon, pastNotif.lat, pastNotif.lon);
        if (dist <= 10) {
          isDuplicateArea = true;
          previousScore = pastNotif.score || 0;
          break;
        }
      }
    }

    const isUpdate = isDuplicateArea;
    const scoreDelta = score - previousScore;

    // Dedupe rule: if within 10 km in last 7 days, only alert if score increases by 10 or more
    if (isUpdate && scoreDelta < 10) {
      logger.info(
        { caseId, previousScore, currentScore: score, scoreDelta },
        'Alert suppressed: recent alert in 10 km radius and score did not rise by >=10'
      );
      return { alerted: false, reason: 'Deduplicated: score delta < +10 within 10 km / 7 days' };
    }

    // ──────────────────────────────────────────────
    // Tactical Brief Compilation
    // ──────────────────────────────────────────────
    const locationInfo = getRelativeLocationDescription(lat, lon);
    const timeUtc = formatUTC(caseCreatedAt || new Date());
    const timeEat = formatEAT(caseCreatedAt || new Date());

    let suggestedAction = 'Request patrol or aerial check; verify on the next satellite pass.';
    if (band === 'Medium') {
      suggestedAction = 'Monitor next SAR pass; cross-check with coastal radar and local port logs.';
    } else if (band === 'Low') {
      suggestedAction = 'Routine record; continue background surveillance.';
    }

    const mapLink = `https://www.google.com/maps?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
    const caseLink = `${config.PUBLIC_BASE_URL}/case/${caseId}`;

    const brief = [
      `🛡️ SENTINELCATCH ALERT [${band.toUpperCase()} - Score ${score}/100]`,
      `📍 Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}° (${locationInfo.label})`,
      `⏰ Time: ${timeEat} (EAT) / ${timeUtc}`,
      `🔍 Reason: ${rationale}`,
      `⚡ Suggested Action: ${suggestedAction}`,
      `🔗 Case: ${caseLink}`,
      `🗺️ Map: ${mapLink}`,
    ].join('\n');

    const headline = `${band} Alert: Dark Vessel ${locationInfo.label}`;
    const notificationType = isUpdate ? 'case_update' : 'case_new';

    let dispatchResult = { success: false, error: 'Unknown' };
    try {
      dispatchResult = await dispatchAlert({
        caseId,
        type: notificationType,
        band,
        headline,
        body: brief,
        lat,
        lon,
        sector: locationInfo.sector,
        score,
        caseCreatedAt,
      });
    } catch (err) {
      logger.warn({ err: err.message, caseId }, 'Alert dispatch notification warning');
      dispatchResult = { success: false, error: err.message };
    }

    return {
      alerted: Boolean(dispatchResult.success),
      reason: dispatchResult.success ? 'Alert broadcast successfully' : (dispatchResult.error || 'Failed'),
      notificationId: dispatchResult.id,
      broadcastLatencyMs: dispatchResult.broadcastLatencyMs,
    };
  }
}

export default AlertAgent;
