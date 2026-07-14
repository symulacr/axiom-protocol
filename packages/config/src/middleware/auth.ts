import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Accepts a request whose `x-api-key` matches ANY configured key.
// `apiKey` is the server-to-server secret; `clientApiKey` (optional) is a
// separate, intentionally-public browser token. Either may be comma-separated.
export function createApiKeyAuth(
  apiKey: string | undefined,
  publicPaths: string[] = ["/health"],
  disableAuth = false,
  clientApiKey?: string,
) {
  const accepted = [apiKey, clientApiKey]
    .filter((k): k is string => typeof k === "string" && k.length > 0)
    .flatMap((k) => k.split(",").map((s) => s.trim()).filter(Boolean));

  if (accepted.length === 0) {
    if (!disableAuth) {
      return (_req: Request, res: Response, _next: NextFunction) => {
        res.status(503).json({ error: "service unavailable: API key not configured" });
      };
    }
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (publicPaths.includes(req.path)) return next();
    const key = req.headers["x-api-key"];
    const keyBuf = Buffer.from(typeof key === "string" ? key : "", "utf-8");
    const ok = accepted.some((api) => {
      const apiBuf = Buffer.from(api, "utf-8");
      return keyBuf.length === apiBuf.length && timingSafeEqual(keyBuf, apiBuf);
    });
    if (!ok) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
