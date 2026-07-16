import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Who presented a valid API key. Client keys are intentionally weaker. */
export type AuthPrincipal = "none" | "server" | "client" | "disabled";

export type AuthRequest = Request & {
  authPrincipal?: AuthPrincipal;
  authKeyKind?: "server" | "client";
};

function splitKeys(raw: string | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function timingSafeMatch(presented: string, candidates: string[]): boolean {
  const keyBuf = Buffer.from(presented, "utf-8");
  return candidates.some((api) => {
    const apiBuf = Buffer.from(api, "utf-8");
    return keyBuf.length === apiBuf.length && timingSafeEqual(keyBuf, apiBuf);
  });
}

/**
 * API-key auth with capability split:
 * - server key (`AXIOM_API_KEY`): full access
 * - client key (`AXIOM_CLIENT_API_KEY`): browser-safe surface only
 *
 * Use `requireServerAuth` on operator routes (vault execute, etc.).
 */
export function createApiKeyAuth(
  apiKey: string | undefined,
  publicPaths: string[] = ["/health"],
  disableAuth = false,
  clientApiKey?: string,
) {
  const serverKeys = splitKeys(apiKey);
  const clientKeys = splitKeys(clientApiKey).filter((k) => !serverKeys.includes(k));

  if (serverKeys.length === 0 && clientKeys.length === 0) {
    if (!disableAuth) {
      return (_req: Request, res: Response, _next: NextFunction) => {
        res
          .status(503)
          .json({ error: "service unavailable: API key not configured" });
      };
    }
    return (req: Request, _res: Response, next: NextFunction) => {
      (req as AuthRequest).authPrincipal = "disabled";
      next();
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (publicPaths.includes(req.path)) {
      (req as AuthRequest).authPrincipal = "none";
      return next();
    }
    const raw = req.headers["x-api-key"];
    const key = typeof raw === "string" ? raw : "";
    if (timingSafeMatch(key, serverKeys)) {
      (req as AuthRequest).authPrincipal = "server";
      (req as AuthRequest).authKeyKind = "server";
      return next();
    }
    if (timingSafeMatch(key, clientKeys)) {
      (req as AuthRequest).authPrincipal = "client";
      (req as AuthRequest).authKeyKind = "client";
      return next();
    }
    res.status(401).json({ error: "unauthorized" });
  };
}

/** Operator-only: vault execute, privileged payment, etc. */
export function requireServerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const principal = (req as AuthRequest).authPrincipal;
  if (principal === "disabled" || principal === "server") {
    next();
    return;
  }
  res.status(403).json({
    error: "forbidden: server API key required",
    code: "SERVER_KEY_REQUIRED",
  });
}

/** Timing-safe membership test for WebSocket tokens (server or client keys). */
export function timingSafeTokenInList(
  token: string,
  candidates: string[],
): boolean {
  return timingSafeMatch(token, candidates);
}
