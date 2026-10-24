import { Router } from 'express';
import vesselPhotoService from '../integrations/vesselPhotos.js';
import iuuDatabaseService from '../integrations/iuuDatabase.js';
import reasoningAgent from '../agents/reasoning.js';
import { query } from '../db/index.js';
import logger from '../logger.js';

const router = Router();

/**
 * GET /api/vessels/photo
 * Retrieve or redirect to a verified photograph of a suspected vessel.
 * Query Parameters:
 * - name: string (e.g. "LU RONG YUAN YU 188")
 * - mmsi: string (e.g. "412349012")
 * - gearType: string (e.g. "Tuna Longliner")
 * - redirect: "true" | "false" (default: "true")
 * - format: "json" | "image"
 */
router.get('/vessels/photo', async (req, res) => {
  try {
    const name = req.query.name || '';
    const mmsi = req.query.mmsi || '';
    const imo = req.query.imo || '';
    const gearType = req.query.gearType || '';
    const shouldRedirect = req.query.redirect !== 'false' && req.query.format !== 'json' && !req.headers.accept?.includes('application/json');

    const photoRecord = await vesselPhotoService.getVesselPhoto({ name, mmsi, imo, gearType });

    if (shouldRedirect) {
      return res.redirect(photoRecord.photoUrl);
    }

    res.json({
      success: true,
      ...photoRecord,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to resolve vessel photo');
    res.status(500).json({ error: 'Failed to resolve vessel photo', message: err.message });
  }
});

/**
 * GET /api/cases/:id/photo
 * Directly fetch the suspected vessel surveillance photo for a specific case ID.
 */
router.get('/cases/:id/photo', async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) {
    return res.status(400).json({ error: 'Valid numeric case ID required' });
  }

  try {
    let targetCase = null;

    // Try in-memory first
    const memoryCases = reasoningAgent.getInMemoryCases();
    targetCase = memoryCases.find((c) => c.id === caseId);

    // Try DB if not in memory
    if (!targetCase) {
      try {
        const dbRes = await query('SELECT * FROM cases WHERE id = $1', [caseId]);
        targetCase = dbRes.rows[0];
      } catch (err) {
        logger.debug({ err: err.message }, 'DB lookup for case photo');
      }
    }

    if (!targetCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (typeof targetCase.features === 'string') {
      try { targetCase.features = JSON.parse(targetCase.features); } catch {}
    }

    const candidate = targetCase.candidate_matches?.[0] || targetCase.features?.candidate_matches?.[0] || null;
    const name = candidate?.vesselName || '';
    const mmsi = candidate?.mmsi || '';
    const imo = candidate?.imo || '';
    const gearType = candidate?.gearType || '';

    const shouldRedirect = req.query.redirect !== 'false' && req.query.format !== 'json' && !req.headers.accept?.includes('application/json');
    const photoRecord = await vesselPhotoService.getVesselPhoto({ name, mmsi, imo, gearType });

    if (shouldRedirect) {
      return res.redirect(photoRecord.photoUrl);
    }

    res.json({
      caseId,
      ...photoRecord,
    });
  } catch (err) {
    logger.error({ err, caseId }, 'Failed to resolve case vessel photo');
    res.status(500).json({ error: 'Failed to resolve case photo' });
  }
});

/**
 * GET /api/vessels/gallery
 * Returns curated high-resolution surveillance photo gallery of known suspect vessels.
 */
router.get('/vessels/gallery', (_req, res) => {
  res.json({
    gallery: vesselPhotoService.getCuratedGallery(),
    provider: vesselPhotoService.provider,
    apiKeyConfigured: vesselPhotoService.isApiKeyConfigured(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/vessels/iuu
 * Check if a vessel is on the Combined IUU Fishing Vessel List (Trygg Mat Tracking / RFMOs).
 */
router.get('/vessels/iuu', (req, res) => {
  const name = req.query.name || '';
  const mmsi = req.query.mmsi || '';
  const imo = req.query.imo || '';

  const match = iuuDatabaseService.findIuuMatch({ name, mmsi, imo });
  if (match) {
    return res.json({
      listed: true,
      match,
    });
  }

  res.json({
    listed: false,
    message: 'Vessel is not listed on the Combined IUU Fishing Vessel List',
  });
});

/**
 * GET /api/vessels/status
 * Check configuration status for vessel photo providers and API keys.
 */
router.get('/vessels/status', async (_req, res) => {
  const verification = await vesselPhotoService.verifyVesselFinderKey();
  res.json({
    provider: vesselPhotoService.provider,
    hasVesselFinderApiKey: vesselPhotoService.isVesselFinderConfigured(),
    hasMyShipTrackingApiKey: vesselPhotoService.isMyShipTrackingConfigured(),
    apiKeyConfigured: vesselPhotoService.isApiKeyConfigured(),
    vesselFinderVerification: verification,
    providersAvailable: {
      localSurveillanceArchive: true,
      combinedIuuVesselList: true,
      vesselFinder: vesselPhotoService.isVesselFinderConfigured(),
      myShipTracking: true,
      wikimediaCommons: true,
    },
    openDatabases: {
      combinedIuuList: 'https://iuu-vessels.org (Trygg Mat Tracking / RFMO International IUU Database)',
      myShipTracking: 'https://www.myshiptracking.com (AIS Open Fleet Registry)',
      wikimediaCommons: 'https://commons.wikimedia.org (Open Maritime Commons)',
    },
    sampleEndpoint: '/api/vessels/photo?name=LU%20RONG%20YUAN%20YU%20188&mmsi=412349012',
  });
});

export default router;
