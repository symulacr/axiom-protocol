import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function createApiKeyAuth(
  apiKey: string | undefined,
  publicPaths: string[] = ["/health"],
) {
  if (!apiKey) {
    // No API key configured — skip auth (dev mode)
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (publicPaths.includes(req.path)) return next();
    const key = req.headers["x-api-key"];
    const keyBuf = Buffer.from(typeof key === "string" ? key : "", "utf-8");
    const apiBuf = Buffer.from(apiKey, "utf-8");
    if (keyBuf.length !== apiBuf.length || !timingSafeEqual(keyBuf, apiBuf)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
