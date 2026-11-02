import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { globalLimiter, writeLimiter } from '../../middleware/rate-limiters.js';
import {
  createCodespace,
  createIssue,
  rerunWorkflowRun,
} from './repo-actions.controller.js';

export const repoActionsRoutes = Router();

repoActionsRoutes.use(requireAuth);

repoActionsRoutes.post(
  '/repos/:id/ci/runs/:runId/rerun',
  globalLimiter,
  writeLimiter,
  rerunWorkflowRun,
);
repoActionsRoutes.post(
  '/repos/:id/issues',
  globalLimiter,
  writeLimiter,
  createIssue,
);
repoActionsRoutes.post(
  '/repos/:id/codespaces',
  globalLimiter,
  writeLimiter,
  createCodespace,
);
