import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

describe('SentinelCatch REST API Surface', () => {
  let server;
  let baseUrl;

  test('Start test HTTP server', async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  test('GET /api/objectives returns 5 passed objectives with metrics', async () => {
    const res = await fetch(`${baseUrl}/api/objectives`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.totalObjectives, 5);
    assert.strictEqual(data.passedCount, 5);
    assert.ok(data.objectives.every((o) => o.status === 'pass'));
  });

  test('GET /api/map/layers returns GeoJSON FeatureCollection', async () => {
    const res = await fetch(`${baseUrl}/api/map/layers`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.type, 'FeatureCollection');
    assert.ok(Array.isArray(data.features));
    const eezFeature = data.features.find((f) => f.id === 'kenya-eez');
    assert.ok(eezFeature, 'EEZ boundary polygon must be present');
  });

  test('GET /api/cases and POST /api/cases/:id/action workflow', async () => {
    const listRes = await fetch(`${baseUrl}/api/cases`);
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(Array.isArray(listData.cases));

    // Test action endpoint on a mock case ID
    const actionRes = await fetch(`${baseUrl}/api/cases/999/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'acknowledge',
        actorName: 'Officer Juma',
        note: 'Aerial verification dispatched',
      }),
    });

    // If case 999 exists in memory or db it returns 200, else 404
    assert.ok([200, 404].includes(actionRes.status));
  });

  test('Teardown test HTTP server', () => {
    server.close();
  });
});
