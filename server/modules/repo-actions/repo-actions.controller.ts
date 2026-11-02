import type { Request, Response, NextFunction } from 'express';
import { badRequest, unauthorized } from '../../utils/errors.js';
import { parseRepoIdParam } from '../repositories/repository.schema.js';
import {
  parseCreateCodespaceBody,
  parseCreateIssueBody,
  parseRunId,
} from './repo-actions.schema.js';
import {
  createCodespace as createRepoCodespace,
  createIssue as createRepoIssue,
  rerunWorkflow,
} from './repo-actions.service.js';

function repoId(req: Request): string {
  try {
    return parseRepoIdParam(req.params.id);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
}

function workflowRunId(value: string | undefined): number {
  try {
    return parseRunId(value);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
}

export async function rerunWorkflowRun(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.userId) throw unauthorized();
    const result = await rerunWorkflow(
      repoId(req),
      req.userId,
      workflowRunId(req.params.runId),
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createIssue(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.userId) throw unauthorized();
    let input;
    try {
      input = parseCreateIssueBody(req.body);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    const result = await createRepoIssue(
      repoId(req),
      req.userId,
      input.title,
      input.body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createCodespace(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.userId) throw unauthorized();
    let input;
    try {
      input = parseCreateCodespaceBody(req.body);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    const result = await createRepoCodespace(
      repoId(req),
      req.userId,
      input.ref,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
