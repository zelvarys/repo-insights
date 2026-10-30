import type { Request, Response, NextFunction } from 'express';
import { badRequest } from '../../utils/errors.js';
import { parseRepoIdParam } from '../repositories/repository.schema.js';
import type { ActivityRange } from './activity.js';
import {
  getRepoActivity,
  getRepoCi,
  getRepoConcentration,
  getRepoDependencies,
  getRepoOverview,
  getRepoStructure,
  queueDependencyRefresh,
} from './insights.service.js';

function repoId(req: Request): string {
  try {
    return parseRepoIdParam(req.params.id);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
}

function queryString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    throw badRequest(`Invalid ${name}`);
  }
  return value.trim();
}

function positiveInt(
  value: unknown,
  name: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw badRequest(`Invalid ${name}`);
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > max) throw badRequest(`Invalid ${name}`);
  return parsed;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`Invalid ${name}`);
}

function activityRange(value: unknown): ActivityRange {
  if (value === undefined) return 365;
  if (value === '90' || value === '180' || value === '365') {
    return Number(value) as ActivityRange;
  }
  throw badRequest('Invalid range');
}

function ciRange(value: unknown): 30 | 90 | 365 {
  if (value === undefined) return 90;
  if (value === '30' || value === '90' || value === '365') {
    return Number(value) as 30 | 90 | 365;
  }
  throw badRequest('Invalid range');
}

export async function getStructure(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getRepoStructure(repoId(req)));
  } catch (err) {
    next(err);
  }
}

export async function getActivity(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getRepoActivity(repoId(req), activityRange(req.query.range)));
  } catch (err) {
    next(err);
  }
}

export async function getConcentration(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getRepoConcentration(repoId(req)));
  } catch (err) {
    next(err);
  }
}

export async function getCi(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(
      await getRepoCi(repoId(req), {
        workflow: queryString(req.query.workflow, 'workflow'),
        branch: queryString(req.query.branch, 'branch'),
        range: ciRange(req.query.range),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getDependencies(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(
      await getRepoDependencies(repoId(req), {
        page: positiveInt(req.query.page, 'page', 1, 10_000),
        perPage: positiveInt(req.query.perPage, 'perPage', 50, 100),
        outdated: optionalBoolean(req.query.outdated, 'outdated'),
        hasAdvisory: optionalBoolean(req.query.hasAdvisory, 'hasAdvisory'),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function refreshDependencies(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await queueDependencyRefresh(repoId(req));
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getRepoOverview(repoId(req)));
  } catch (err) {
    next(err);
  }
}
