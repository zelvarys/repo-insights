import { Router } from 'express';
import { postScan, getScans, getScanById } from './scan.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import {
  globalLimiter,
  scanReadLimiter,
} from '../../middleware/rate-limiters.js';

export const scanRoutes = Router();

scanRoutes.use(requireAuth);

const scanLimiter = rateLimit({
  name: 'scan',
  windowSeconds: 60,
  max: 10,
});

scanRoutes.post('/repos/:id/scan', globalLimiter, scanLimiter, postScan);
scanRoutes.get(
  '/repos/:id/scans',
  globalLimiter,
  scanReadLimiter,
  getScans,
);
scanRoutes.get(
  '/scans/:scanId',
  globalLimiter,
  scanReadLimiter,
  getScanById,
);