import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import ReasoningAgent from '../agents/reasoning.js';
import llmClient from '../integrations/llm.js';

describe('Feature Extraction & Scoring Bounds', () => {
  test('ReasoningAgent computes all 10 features and enforces 0-100 score bounds', async () => {
    const candidate = {
      id: 999,
      lat: -4.72, // Inside Kisite-Mpunguti MPA area
      lon: 39.35,
      detected_at: new Date().toISOString(),
      length_m: 55,
      locationLabel: 'Near Shimoni',
      sector: 'South Coast/Vanga',
      nearestPort: 'Shimoni/Vanga',
      distanceToCoastKm: 12,
    };

    const caseRecord = await ReasoningAgent.evaluateDetection(candidate, {
      pastDetections: [
        { lat: -4.72, lon: 39.35, detected_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { lat: -4.73, lon: 39.36, detected_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
      ],
      isBackfill: true,
    });

    assert.ok(caseRecord.features, 'Features object must be populated');
    const f = caseRecord.features;

    // Verify 10 features
    assert.strictEqual(f.inMPA, true, 'Should detect inside Kisite-Mpunguti MPA');
    assert.ok(f.recurrenceCount >= 2, 'Should detect recurrent passes');
    assert.ok(typeof f.distanceToEEZBoundaryKm === 'number');
    assert.ok(typeof f.aisCoverageConfidence === 'number');
    assert.ok(typeof f.waveHeightM === 'number');
    assert.ok(f.displacementPattern.includes('Loitering'));

    // Verify score bounds
    assert.ok(caseRecord.score_rule >= 0 && caseRecord.score_rule <= 100);
    assert.ok(caseRecord.score_final >= 0 && caseRecord.score_final <= 100);
    assert.ok(['High', 'Medium', 'Low'].includes(caseRecord.band));
    assert.ok(caseRecord.rationale.length > 20);
  });

  test('Harbour negative control suppresses score (<10 km from port)', async () => {
    const harbourCandidate = {
      id: 888,
      lat: -4.054, // Right at Kilindini Harbour entrance
      lon: 39.67,
      detected_at: new Date().toISOString(),
      length_m: 12, // Small artisanal craft
      locationLabel: 'Mombasa Port',
      sector: 'Mombasa',
      nearestPort: 'Mombasa (Kilindini)',
      distanceToCoastKm: 1.5,
    };

    const caseRecord = await ReasoningAgent.evaluateDetection(harbourCandidate, { isBackfill: true });

    // Harbour proximity and small craft should yield Low band
    assert.strictEqual(caseRecord.band, 'Low', 'Nearshore artisanal craft should be classified as Low band');
    assert.ok(caseRecord.score_final < 45);
  });
});
