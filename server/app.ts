import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isProd } from './config/env.js';
import { logger } from './utils/logger.js';
import { attachRequestId, errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { repositoryRoutes } from './modules/repositories/repository.routes.js';
import { scanRoutes } from './modules/scans/scan.routes.js';
import { metricsRoutes } from './modules/metrics/metrics.routes.js';
import { trackedToolsRoutes } from './modules/tracked-tools/tracked-tools.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (isProd || env.TRUST_PROXY) {
    app.set('trust proxy', env.TRUST_PROXY || 1);
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
      service: 'repo-insights',
      time: new Date().toISOString(),
    });
  });

  app.use('/auth', authRoutes);
  app.use('/repos', repositoryRoutes);
  app.use(scanRoutes);
  app.use(metricsRoutes);
  app.use(trackedToolsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}