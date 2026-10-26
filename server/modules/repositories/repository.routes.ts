import { Router } from 'express';
import {
  getGitHubRepos,
  postRepository,
  getRepositories,
  getRepository,
} from './repository.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { globalLimiter } from '../../middleware/rate-limiters.js';

export const repositoryRoutes = Router();

// All repo routes require authentication; limiters run per matched route.
repositoryRoutes.use(requireAuth);

// List the user's GitHub repos (not yet tracked) for selection
repositoryRoutes.get('/github', globalLimiter, getGitHubRepos);

// Add a repo to tracking
repositoryRoutes.post('/', globalLimiter, postRepository);

// List tracked repos
repositoryRoutes.get('/', globalLimiter, getRepositories);

// Get one tracked repo
repositoryRoutes.get('/:id', globalLimiter, getRepository);