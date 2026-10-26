import { Router } from 'express';
import {
  redirectToGithub,
  githubCallback,
  getMe,
  logout,
} from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

export const authRoutes = Router();

const authLimiter = rateLimit({
  name: 'auth',
  windowSeconds: 60,
  max: 300,
});

authRoutes.use(authLimiter);

authRoutes.get('/github', redirectToGithub);
authRoutes.get('/github/callback', githubCallback);
authRoutes.get('/me', requireAuth, getMe);
authRoutes.post('/logout', logout);