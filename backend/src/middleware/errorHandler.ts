import { Request, Response, NextFunction } from 'express';

/**
 * Global Express error handler.
 *
 * Catches any error passed via `next(err)` and formats it as a consistent
 * JSON response so raw stack traces never reach the client.
 *
 * Must be registered AFTER all routes (4-argument signature is required by
 * Express to recognise it as an error handler).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const e = err as { message?: string; status?: number; statusCode?: number };

  const statusCode = e.status ?? e.statusCode ?? 500;
  const message = e.message ?? 'An unexpected error occurred.';

  // Log the full error server-side so it's available in the logs.
  console.error('[ErrorHandler]', err);

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
    message,
  });
}
