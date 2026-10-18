import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './index.js';
import logger from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Run all pending SQL migrations in order.
 * Uses a simple schema_migrations tracking table.
 */
async function migrate() {
  // Create tracking table if not exists
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied migrations
  const { rows: applied } = await query('SELECT filename FROM schema_migrations ORDER BY filename');
  const appliedSet = new Set(applied.map(r => r.filename));

  // Read migration files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.debug({ file }, 'Migration already applied, skipping');
      continue;
    }

    logger.info({ file }, 'Applying migration');
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');

    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await query('COMMIT');
      count++;
      logger.info({ file }, 'Migration applied successfully');
    } catch (err) {
      await query('ROLLBACK');
      logger.error({ file, err }, 'Migration failed');
      throw err;
    }
  }

  if (count === 0) {
    logger.info('All migrations already applied');
  } else {
    logger.info({ count }, 'Migrations complete');
  }
}

// Run if called directly
migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
