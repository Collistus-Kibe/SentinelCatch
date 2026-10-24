import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

describe('Vessel Trajectory & Historical Route APIs', () => {
  let server;
  let baseUrl;

  test('Start test HTTP server', async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  test('GET /api/map/tracks returns GeoJSON FeatureCollection with distinct vessel routes', async () => {
    const res = await fetch(`${baseUrl}/api/map/tracks`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.type, 'FeatureCollection');
    assert.ok(Array.isArray(data.features));

    const lineTracks = data.features.filter((f) => f.properties?.type === 'vessel_track');
    assert.ok(lineTracks.length >= 4, 'Must have at least 4 vessel routes');

    // Verify each line track has a distinct color and geometry
    const colors = new Set();
    lineTracks.forEach((track) => {
      assert.strictEqual(track.geometry.type, 'LineString');
      assert.ok(track.geometry.coordinates.length >= 2, 'Route must have at least 2 coordinates');
      assert.ok(track.properties.color, 'Route must have a color');
      assert.ok(track.properties.vesselName, 'Route must have a vessel name');
      assert.ok(track.properties.totalDistanceNm > 0, 'Route must have distance');
      colors.add(track.properties.color);
    });

    assert.ok(colors.size >= 4, 'Each primary ship must have a distinct color');

    // Check LU RONG YUAN YU 188 has Electric Cyan
    const luRongTrack = lineTracks.find((t) => t.properties.vesselName.includes('LU RONG YUAN YU'));
    assert.ok(luRongTrack, 'LU RONG YUAN YU track must exist');
    assert.strictEqual(luRongTrack.properties.color, '#00f5d4');
  });

  test('GET /api/map/tracks/:caseId returns detailed waypoints for case 101', async () => {
    const res = await fetch(`${baseUrl}/api/map/tracks/101`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.track.caseId, 101);
    assert.ok(data.track.waypoints.length >= 4);

    const gapPoint = data.track.waypoints.find((wp) => wp.isGapPoint);
    assert.ok(gapPoint, 'Track must contain the AIS shutoff gap waypoint');
    assert.strictEqual(gapPoint.aisStatus, 'disabled');
  });

  test('GET /api/map/layers includes track and waypoint features', async () => {
    const res = await fetch(`${baseUrl}/api/map/layers`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const trackLines = data.features.filter((f) => f.properties?.type === 'vessel_track');
    const waypoints = data.features.filter((f) => f.properties?.type === 'vessel_track_waypoint');

    assert.ok(trackLines.length >= 4, 'Map layers must include vessel track lines');
    assert.ok(waypoints.length >= 10, 'Map layers must include route waypoints');
    assert.ok(data.meta.tracksCount >= 4, 'Meta tracksCount must be reported');
  });

  test('Teardown test HTTP server', () => {
    server.close();
  });
});
