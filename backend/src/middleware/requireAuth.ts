import { Request, Response, NextFunction } from 'express';

/**
 * Middleware: requires a valid GitHub access token in the session.
 * Returns 401 if the user is not authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.accessToken && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'GitHub sign-in required.' });
  }
}
