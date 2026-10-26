import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt.js';
import { unauthorized } from '../utils/errors.js';
import { isSessionRevoked } from '../modules/auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.token;
    if (!token || typeof token !== 'string') {
      throw unauthorized('Not authenticated');
    }
    const payload = verifyJwt(token);
    if (payload.jti && (await isSessionRevoked(payload.jti))) {
      throw unauthorized('Session revoked');
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(unauthorized('Invalid or expired session'));
  }
}