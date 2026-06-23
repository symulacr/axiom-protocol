import type { Request, Response, NextFunction } from "express";

export function createApiKeyAuth(apiKey: string | undefined) {
  if (!apiKey) {
    // No API key configured — skip auth (dev mode)
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next();
    const key = req.headers["x-api-key"];
    if (key !== apiKey) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
