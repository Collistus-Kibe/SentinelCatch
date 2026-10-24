import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

describe('Vessel Surveillance Photo API Endpoints', () => {
  let server;
  let baseUrl;

  test('Start test HTTP server', async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  test('GET /api/status reports vesselPhotos integration status', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.integrations?.vesselPhotos, 'vesselPhotos must be listed under integrations');
    assert.strictEqual(data.integrations.vesselPhotos.status, 'ready');
  });

  test('GET /api/vessels/status returns provider readiness and key configuration', async () => {
    const res = await fetch(`${baseUrl}/api/vessels/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.providersAvailable);
    assert.strictEqual(data.providersAvailable.localSurveillanceArchive, true);
    assert.strictEqual(data.providersAvailable.wikimediaCommons, true);
    assert.ok('vesselFinder' in data.providersAvailable, 'vesselFinder must be in providersAvailable');
    assert.ok(typeof data.hasVesselFinderApiKey === 'boolean');
    assert.ok(data.sampleEndpoint.includes('/api/vessels/photo'));
  });

  test('GET /api/vessels/gallery returns curated surveillance fleet', async () => {
    const res = await fetch(`${baseUrl}/api/vessels/gallery`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.gallery));
    assert.ok(data.gallery.length >= 4, 'Must have at least 4 curated dark vessels');

    const luRong = data.gallery.find((v) => v.vesselName.includes('LU RONG YUAN YU'));
    assert.ok(luRong, 'LU RONG YUAN YU 188 must be in curated gallery');
    assert.strictEqual(luRong.mmsi, '412349012');
    assert.ok(luRong.photoUrl.endsWith('.jpg'));
  });

  test('GET /api/vessels/photo?name=LU RONG YUAN YU 188&format=json resolves suspect photo', async () => {
    const res = await fetch(`${baseUrl}/api/vessels/photo?name=LU%20RONG%20YUAN%20YU%20188&format=json`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.vesselName, 'LU RONG YUAN YU 188');
    assert.strictEqual(data.mmsi, '412349012');
    assert.strictEqual(data.source, 'curated_surveillance_archive');
    assert.ok(data.photoUrl.includes('lu_rong_yuan_yu.jpg'));
  });

  test('GET /api/vessels/photo?mmsi=352001928&format=json resolves HAI FENG 68 by MMSI', async () => {
    const res = await fetch(`${baseUrl}/api/vessels/photo?mmsi=352001928&format=json`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.vesselName, 'HAI FENG 68');
    assert.ok(data.photoUrl.includes('hai_feng.jpg'));
  });

  test('GET /api/vessels/photo with redirect=false handles unidentified vessel gracefully', async () => {
    const res = await fetch(`${baseUrl}/api/vessels/photo?name=UNIDENTIFIED_DARK_GHOST_999&redirect=false&format=json`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.ok(data.photoUrl, 'Must return a fallback image URL');
  });

  test('Teardown test HTTP server', () => {
    server.close();
  });
});
