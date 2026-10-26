import { Router } from 'express';
import {
  getTrackedTools,
  putTrackedTools,
} from './tracked-tools.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  globalLimiter,
  trackedToolsWriteLimiter,
} from '../../middleware/rate-limiters.js';

export const trackedToolsRoutes = Router();

trackedToolsRoutes.use(requireAuth);

trackedToolsRoutes.get(
  '/repos/:id/tracked-tools',
  globalLimiter,
  getTrackedTools,
);
trackedToolsRoutes.put(
  '/repos/:id/tracked-tools',
  globalLimiter,
  trackedToolsWriteLimiter,
  putTrackedTools,
);