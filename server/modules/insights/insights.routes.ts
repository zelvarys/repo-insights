import { Router } from 'express';
import {
  getActivity,
  getCi,
  getConcentration,
  getDependencies,
  getOverview,
  getStructure,
  refreshDependencies,
} from './insights.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  dependencyRefreshLimiter,
  globalLimiter,
  insightsLimiter,
} from '../../middleware/rate-limiters.js';

export const insightsRoutes = Router();

insightsRoutes.use(requireAuth);

insightsRoutes.get(
  '/repos/:id/structure',
  globalLimiter,
  insightsLimiter,
  getStructure,
);
insightsRoutes.get(
  '/repos/:id/activity',
  globalLimiter,
  insightsLimiter,
  getActivity,
);
insightsRoutes.get(
  '/repos/:id/concentration',
  globalLimiter,
  insightsLimiter,
  getConcentration,
);
insightsRoutes.get('/repos/:id/ci', globalLimiter, insightsLimiter, getCi);
insightsRoutes.get(
  '/repos/:id/dependencies',
  globalLimiter,
  insightsLimiter,
  getDependencies,
);
insightsRoutes.post(
  '/repos/:id/dependencies/refresh',
  globalLimiter,
  dependencyRefreshLimiter,
  refreshDependencies,
);
insightsRoutes.get(
  '/repos/:id/overview',
  globalLimiter,
  insightsLimiter,
  getOverview,
);
