import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load from cwd and project root
dotenv.config();
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const envSchema = z.object({
  // Database (TiDB Cloud MySQL URI, PostgreSQL, or empty for in-memory)
  DATABASE_URL: z.string().optional().default(''),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // GFW (Required for full pipeline)
  GFW_API_TOKEN: z.string().optional().default(''),

  // LLM Dual-Provider Multi-Slot Keys (Gemini & ChatGPT)
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY_1: z.string().optional().default(''),
  GEMINI_API_KEY_2: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY_1: z.string().optional().default(''),
  OPENAI_API_KEY_2: z.string().optional().default(''),
  CHATGPT_API_KEY: z.string().optional().default(''),
  CHATGPT_API_KEY_1: z.string().optional().default(''),
  CHATGPT_API_KEY_2: z.string().optional().default(''),
  LLM_PROVIDER: z.enum(['gemini', 'openai', 'chatgpt', 'hybrid', 'anthropic', 'ollama']).default('gemini'),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // AISStream (Recommended)
  AISSTREAM_API_KEY: z.string().optional().default(''),

  // Copernicus (Optional)
  COPERNICUS_CLIENT_ID: z.string().optional().default(''),
  COPERNICUS_CLIENT_SECRET: z.string().optional().default(''),

  // MapTiler (Optional)
  MAPTILER_KEY: z.string().optional().default(''),

  // Vessel Photo Intelligence (VesselFinder, MyShipTracking, Combined IUU List)
  VESSELFINDER_API_KEY: z.string().optional().default(''),
  MYSHIPTRACKING_API_KEY: z.string().optional().default(''),
  VESSEL_PHOTO_API_KEY: z.string().optional().default(''),
  VESSEL_PHOTO_PROVIDER: z.enum(['auto', 'local', 'vesselfinder', 'iuu_list', 'myshiptracking', 'wikimedia']).default('auto'),

  // Access gate (Optional)
  ACCESS_CODE: z.string().optional().default(''),

  // Operational Config
  ALERT_SCORE_THRESHOLD: z.coerce.number().default(70),
  PIPELINE_INTERVAL_MINUTES: z.coerce.number().default(60),
  BACKFILL_DAYS: z.coerce.number().default(60),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  MAP_STYLE_URL: z.string().default('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'),
});

let config;
try {
  config = envSchema.parse(process.env);
} catch (err) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of err.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export default config;
