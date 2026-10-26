import { rateLimit } from './rate-limit.middleware.js';

export const globalLimiter = rateLimit({
  name: 'global',
  windowSeconds: 60,
  max: 300,
});

export const metricsLimiter = rateLimit({
  name: 'metrics',
  windowSeconds: 60,
  max: 120,
});

export const scanReadLimiter = rateLimit({
  name: 'scan-read',
  windowSeconds: 60,
  max: 120,
});

export const trackedToolsWriteLimiter = rateLimit({
  name: 'tracked-tools-write',
  windowSeconds: 60,
  max: 20,
});
