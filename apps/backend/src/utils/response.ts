import type { Response } from "express";

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function sendError(
  res: Response,
  status: number,
  message: string,
  code?: string,
): void {
  const body: { error: string; code?: string; requestId?: string } = {
    error: message,
  };
  if (code !== undefined) body.code = code;
  const requestId = (res.locals as { requestId?: string }).requestId;
  if (requestId !== undefined) body.requestId = requestId;
  res.status(status).json(body);
}
