import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isProd, resolveTrustProxy } from './config/env.js';
import { pool } from './config/database.js';
import { redis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { attachRequestId, errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { repositoryRoutes } from './modules/repositories/repository.routes.js';
import { scanRoutes } from './modules/scans/scan.routes.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { trackedToolsRoutes } from './modules/tracked-tools/tracked-tools.routes.js';
import { insightsRoutes } from './modules/insights/insights.routes.js';

const frontendDir = path.resolve(process.cwd(), 'dist/frontend');
const frontendIndex = path.join(frontendDir, 'index.html');
const API_ONLY_PREFIXES = ['/auth', '/health', '/ready', '/scans'];

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  const trustProxy = resolveTrustProxy(env.TRUST_PROXY, isProd);
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }
  app.use(attachRequestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'repositron',
      time: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, res) => {
    try {
      await Promise.all([pool.query('SELECT 1'), redis.ping()]);
      res.json({
        status: 'ready',
        service: 'repositron',
        time: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn(`Readiness check failed: ${(err as Error).message}`);
      res.status(503).json({ status: 'not_ready' });
    }
  });

  if (isProd) {
    if (!existsSync(frontendIndex)) {
      throw new Error(`Frontend build not found at ${frontendIndex}`);
    }

    app.use(
      express.static(frontendDir, {
        index: false,
        setHeaders(res, filePath) {
          const normalized = filePath.split(path.sep).join('/');
          if (normalized.includes('/assets/')) {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable',
            );
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
        },
      }),
    );

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!req.headers.accept?.includes('text/html')) return next();
      if (path.extname(req.path)) return next();
      if (API_ONLY_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
        return next();
      }

      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(frontendIndex, (err) => {
        if (err) next(err);
      });
    });
  }

  app.use('/auth', authRoutes);
  app.use('/repos', repositoryRoutes);
  app.use(scanRoutes);
  app.use(metricsRoutes);
  app.use(trackedToolsRoutes);
  app.use(insightsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}