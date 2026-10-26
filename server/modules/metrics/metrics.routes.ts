import { Router } from 'express';
import { getMetrics } from './metrics.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  globalLimiter,
  metricsLimiter,
} from '../../middleware/rate-limiters.js';

export const metricsRoutes = Router();

metricsRoutes.use(requireAuth);
metricsRoutes.use(globalLimiter);
metricsRoutes.use(metricsLimiter);

metricsRoutes.get('/repos/:id/metrics', getMetrics);