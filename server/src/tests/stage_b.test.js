import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import app from '../app.js';
import { getAlertAdapter } from '../alerts/index.js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Stage B Verification: Channel Cleanup & Part E Keys', () => {
  test('Config contains only Part E keys and zero removed channel keys', () => {
    // Assert removed keys are NOT present
    assert.strictEqual(config.TELEGRAM_BOT_TOKEN, undefined);
    assert.strictEqual(config.SMTP_HOST, undefined);
    assert.strictEqual(config.AT_API_KEY, undefined);
    assert.strictEqual(config.VAPID_PUBLIC_KEY, undefined);

    // Assert Part E keys are present
    assert.ok('DATABASE_URL' in config);
    assert.ok('GFW_API_TOKEN' in config);
    assert.ok('GEMINI_API_KEY' in config);
    assert.ok('LLM_PROVIDER' in config);
    assert.ok('LLM_MODEL' in config);
    assert.ok('AISSTREAM_API_KEY' in config);
    assert.ok('MAP_STYLE_URL' in config);
  });

  test('/api/status reports only active integrations with no removed channels', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://localhost:${port}/api/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.status, 'operational');
      assert.ok(data.integrations.gfw, 'GFW integration should be present');
      assert.ok(data.integrations.llm, 'LLM integration should be present');
      assert.ok(data.integrations.openmeteo, 'Open-Meteo should be present');
      assert.ok(data.integrations.aisstream, 'AISStream should be present');

      // Assert removed channels are completely gone
      assert.strictEqual(data.integrations.telegram, undefined);
      assert.strictEqual(data.integrations.email, undefined);
      assert.strictEqual(data.integrations.sms, undefined);
      assert.strictEqual(data.integrations.webpush, undefined);

      assert.strictEqual(data.notifications.channel, 'onsite');
    } finally {
      server.close();
    }
  });

  test('Migration 002 drops push_subscriptions and creates notifications table', async () => {
    const sql = await readFile(
      join(__dirname, '../db/migrations/002_onsite_notifications.sql'),
      'utf-8'
    );
    assert.ok(sql.includes('DROP TABLE IF EXISTS push_subscriptions'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS notifications'));
    assert.ok(sql.includes('broadcast_latency_ms'));
  });

  test('Alert adapter registry exposes only "onsite" adapter', () => {
    const adapter = getAlertAdapter('onsite');
    assert.strictEqual(adapter.name, 'onsite');

    assert.throws(() => {
      getAlertAdapter('telegram');
    }, /not supported/);

    assert.throws(() => {
      getAlertAdapter('email');
    }, /not supported/);
  });
});
