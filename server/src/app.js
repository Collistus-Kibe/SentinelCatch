import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import config from './config.js';
import logger from './logger.js';
import { healthCheck as dbHealthCheck } from './db/index.js';
import notificationsRouter from './routes/notifications.js';
import casesRouter from './routes/cases.js';
import mapRouter from './routes/map.js';
import runRouter from './routes/run.js';
import patrolRouter from './routes/patrol.js';
import chatRouter from './routes/chat.js';
import objectivesRouter from './routes/objectives.js';
import vesselsRouter from './routes/vessels.js';
import officersRouter from './routes/officers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Trust reverse proxy (e.g. Render, AWS, Heroku) so express-rate-limit correctly resolves client IPs
app.set('trust proxy', 1);

// ── Security ─────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://services.arcgisonline.com",
        "https://*.arcgisonline.com",
        "https://*.tile.openstreetmap.org",
        "https://tile.openstreetmap.org",
        "https://*.openstreetmap.org",
        "https://openstreetmap.org",
        "https://*.basemaps.cartocdn.com",
        "https://basemaps.cartocdn.com",
        "https://*.cartocdn.com",
        "https://cartocdn.com",
        "https://*.maptiler.com",
        "https://upload.wikimedia.org",
        "https://*.wikimedia.org",
        "https://static.vesselfinder.net",
        "https://*.vesselfinder.net",
        "https://www.vesselfinder.com",
        "https://tmtracking.blob.core.windows.net",
        "https://iuu-vessels.org",
        "https://*.myshiptracking.com",
        "https://www.myshiptracking.com",
        "https://flagcdn.com",
        "https://*.flagcdn.com",
      ],
      connectSrc: [
        "'self'",
        "https://services.arcgisonline.com",
        "https://*.arcgisonline.com",
        "https://api-doc.globalfishingwatch.org",
        "https://gateway.api.globalfishingwatch.org",
        "https://*.basemaps.cartocdn.com",
        "https://basemaps.cartocdn.com",
        "https://*.cartocdn.com",
        "https://cartocdn.com",
        "https://*.tile.openstreetmap.org",
        "https://tile.openstreetmap.org",
        "https://*.openstreetmap.org",
        "https://*.maptiler.com",
        "https://demotiles.maplibre.org",
        "https://marine-api.open-meteo.com",
        "https://generativelanguage.googleapis.com",
        "https://api.vesselfinder.com",
        "https://api.myshiptracking.com",
        "https://iuu-vessels.org",
        "wss://stream.aisstream.io",
      ],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Access code gate ─────────────────────────
if (config.ACCESS_CODE) {
  app.use((req, res, next) => {
    // Skip health check and static assets
    if (req.path === '/healthz' || !req.path.startsWith('/api/')) return next();

    const code = req.headers['x-access-code'] || req.cookies?.access_code || req.query?.code;
    if (code === config.ACCESS_CODE) {
      return next();
    }
    res.status(401).json({ error: 'Access code required' });
  });
}

// ── Health check ─────────────────────────────
app.get('/healthz', async (_req, res) => {
  const dbOk = await dbHealthCheck();
  const status = dbOk ? 'healthy' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    database: dbOk ? 'connected' : 'unreachable',
  });
});

// ── Status endpoint (Part E active integrations only) ──
app.get('/api/status', async (_req, res) => {
  const dbOk = await dbHealthCheck();
  res.json({
    status: 'operational',
    database: dbOk ? 'connected' : 'unreachable',
    integrations: {
      gfw: {
        configured: !!config.GFW_API_TOKEN,
        status: config.GFW_API_TOKEN ? 'ready' : 'unconfigured',
        required: true,
      },
      llm: {
        configured: !!config.GEMINI_API_KEY,
        status: config.GEMINI_API_KEY ? 'ready' : 'fallback-template',
        provider: config.LLM_PROVIDER,
        model: config.LLM_MODEL,
        required: true,
      },
      aisstream: {
        configured: !!config.AISSTREAM_API_KEY,
        status: config.AISSTREAM_API_KEY ? 'ready' : 'disabled',
        recommended: true,
      },
      openmeteo: {
        configured: true,
        status: 'ready',
        note: 'Open-access marine weather (no key required)',
      },
      copernicus: {
        configured: !!(config.COPERNICUS_CLIENT_ID && config.COPERNICUS_CLIENT_SECRET),
        status: (config.COPERNICUS_CLIENT_ID && config.COPERNICUS_CLIENT_SECRET) ? 'ready' : 'disabled',
        optional: true,
      },
      maptiler: {
        configured: !!config.MAPTILER_KEY,
        status: config.MAPTILER_KEY ? 'active' : 'using-carto-dark-matter',
        optional: true,
      },
      vesselPhotos: {
        configured: !!(config.VESSELFINDER_API_KEY || config.VESSEL_PHOTO_API_KEY),
        provider: config.VESSEL_PHOTO_PROVIDER || 'auto',
        status: 'ready',
        note: 'Curated high-res surveillance archive & Wikimedia active; VesselFinder API userkey supported',
      },
    },
    notifications: {
      channel: 'onsite',
      transport: 'server-sent-events',
      fallback: 'polling',
    },
    map: {
      styleUrl: config.MAP_STYLE_URL,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────
app.use('/api', notificationsRouter);
app.use('/api', casesRouter);
app.use('/api', mapRouter);
app.use('/api', patrolRouter);
app.use('/api', chatRouter);
app.use('/api', runRouter);
app.use('/api', objectivesRouter);
app.use('/api', vesselsRouter);
app.use('/api', officersRouter);

// ── Serve static frontend ────────────────────
const staticDir = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(join(staticDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'SentinelCatch',
      description: 'AI-powered live watch for illegal fishing in Kenya\'s waters',
      version: '0.1.0',
      status: 'operational',
      endpoints: [
        '/healthz',
        '/api/status',
        '/api/stream',
        '/api/notifications',
        '/api/cases',
        '/api/cases/:id/photo',
        '/api/vessels/photo',
        '/api/vessels/gallery',
        '/api/vessels/status',
        '/api/map/layers',
        '/api/patrol/plan',
        '/api/chat',
        '/api/run',
      ],
    });
  });
}

export default app;
