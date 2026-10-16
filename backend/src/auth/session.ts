import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthUser } from '../types';

export const SESSION_COOKIE = 'ri_session';
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function setSessionCookie(res: Response, user: AuthUser): void {
  const token = jwt.sign(user, config.jwtSecret, { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // JS in the browser can't read it -> safer against XSS token theft
    sameSite: 'lax', // localhost:3000 and localhost:4000 are the same "site", so this works in dev
    secure: config.isProd,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function readSession(req: Request): AuthUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as AuthUser;
    return { id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = readSession(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.user = user;
  next();
}

/** Short-lived signed value for the OAuth `state` parameter (CSRF protection). */
export function signState(payload: Record<string, unknown>): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' });
}

export function verifyState<T>(state: string): T | null {
  try {
    return jwt.verify(state, config.jwtSecret) as T;
  } catch {
    return null;
  }
}
