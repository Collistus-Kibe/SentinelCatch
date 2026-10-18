import config from './config.js';
import logger from './logger.js';
import app from './app.js';
import orchestrator from './orchestrator.js';

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.NODE_ENV }, '🚀 SentinelCatch server started');
  logger.info({ url: `http://localhost:${PORT}/healthz` }, 'Health check endpoint');
  orchestrator.start();
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down gracefully');
  orchestrator.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
});
