import type { Response } from "express";

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function sendError(
  res: Response,
  status: number,
  message: string,
): void {
  res.status(status).json({ error: message });
}
