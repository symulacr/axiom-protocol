import type { Response } from 'express';

/** Send a standardized error response. */
export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}
