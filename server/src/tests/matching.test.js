import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { darkVesselBehavior } from '../behaviors/dark-vessel.js';
import { isInsideKenyaEEZ, isPointInPolygon, KENYA_EEZ_POLYGON } from '../geo/kenya_eez.js';
import { haversineKm, getRelativeLocationDescription } from '../utils/geo.js';

describe('Spatial Matching & Kenya EEZ Containment', () => {
  test('isInsideKenyaEEZ correctly identifies points inside and outside', () => {
    // Inside: 30 km east of Mombasa (-4.05, 40.0)
    assert.strictEqual(isInsideKenyaEEZ(-4.05, 40.0), true);

    // Inside: East of Lamu (-2.25, 41.2)
    assert.strictEqual(isInsideKenyaEEZ(-2.25, 41.2), true);

    // Outside: Inland Kenya (-1.28, 36.82 - Nairobi)
    assert.strictEqual(isInsideKenyaEEZ(-1.28, 36.82), false);

    // Outside: Deep in the southern ocean beyond border (-6.0, 40.0)
    assert.strictEqual(isInsideKenyaEEZ(-6.0, 40.0), false);

    // Outside: Beyond eastern EEZ limit (0.0, 48.0)
    assert.strictEqual(isInsideKenyaEEZ(0.0, 48.0), false);
  });

  test('darkVesselBehavior isolates SAR contacts lacking AIS within 5km/30min', () => {
    const sarPassTime = new Date('2026-10-15T03:15:00Z').toISOString();

    const sarDetections = [
      {
        id: 101,
        lat: -3.85,
        lon: 40.45,
        detected_at: sarPassTime,
        length_m: 65,
      },
      {
        id: 102,
        lat: -2.50,
        lon: 41.10,
        detected_at: sarPassTime,
        length_m: 45,
      },
    ];

    // AIS ship matches candidate 101 (within 1.5 km and 5 min)
    const aisPositions = [
      {
        mmsi: '634001234',
        lat: -3.84,
        lon: 40.46,
        received_at: new Date('2026-10-15T03:10:00Z').toISOString(),
      },
    ];

    const unmatched = darkVesselBehavior.detectCandidates(sarDetections, aisPositions, {
      spatialToleranceKm: 5.0,
      temporalToleranceMin: 30,
    });

    assert.strictEqual(unmatched.length, 1, 'Only candidate 102 should remain unmatched');
    assert.strictEqual(unmatched[0].id, 102);
  });

  test('getRelativeLocationDescription generates accurate nautical distance & bearing', () => {
    // Location 40 km East of Mombasa (-4.0547, 40.02)
    const loc = getRelativeLocationDescription(-4.0547, 40.02);
    assert.ok(loc.label.includes('Mombasa'));
    assert.ok(loc.distanceKm > 20 && loc.distanceKm < 60);
    assert.strictEqual(loc.compass, 'E');
  });
});
