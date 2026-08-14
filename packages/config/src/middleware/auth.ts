import type { Request, Response, NextFunction } from "express";

type AuthPrincipal = "none" | "server" | "client" | "disabled";

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

export function timingSafeMatch(
  presented: string,
  candidates: string[],
): boolean {
  const keyBuf = Buffer.from(presented, "utf-8");
  const tsEqual = (a: Uint8Array, b: Uint8Array): boolean =>
    (
      globalThis.crypto as unknown as {
        timingSafeEqual(x: Uint8Array, y: Uint8Array): boolean;
      }
    ).timingSafeEqual.call(globalThis.crypto, a, b);
  return candidates.some((api) => {
    const apiBuf = Buffer.from(api, "utf-8");
    return keyBuf.length === apiBuf.length && tsEqual(keyBuf, apiBuf);
  });
}

// client keys may only hit these prefixes (method-aware); everything else needs the server key
const CLIENT_ALLOWED_ROUTES: ReadonlyArray<{
  methods?: readonly string[];
  match: (path: string) => boolean;
}> = [
  { match: (p) => p === "/health" || p.startsWith("/health/") },
  { match: (p) => p === "/v1/routes" || p === "/v1/config" },
  { match: (p) => p === "/v1/payment/config" },
  {
    methods: ["GET"],
    match: (p) => p === "/v1/events" || p.startsWith("/v1/events?"),
  },
  {
    methods: ["GET", "POST"],
    match: (p) =>
      p.startsWith("/v1/agents") ||
      p.startsWith("/v1/archive/") ||
      p === "/v1/chat/completions" ||
      p === "/v1/orchestrator/tick",
  },
  // In-process oracle surface (mint registration + health); browser keys reach it same-origin.
  {
    methods: ["GET", "POST"],
    match: (p) => p.startsWith("/oracle"),
  },
  // Public market data skills only — unbroker transfer ops stay server-gated
  {
    match: (p) =>
      p.startsWith("/v1/skills/evm/") ||
      p.startsWith("/v1/skills/stocks/") ||
      p.startsWith("/v1/skills/osint/"),
  },
];

export function isClientPathAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const pathOnly = path.split("?")[0] ?? path;
  return CLIENT_ALLOWED_ROUTES.some((rule) => {
    if (rule.methods && !rule.methods.includes(m)) return false;
    return rule.match(pathOnly);
  });
}

// server key (AXIOM_API_KEY) full access; client key (AXIOM_CLIENT_API_KEY) only CLIENT_ALLOWED_ROUTES; requireServerAuth guards operator routes
export function createApiKeyAuth(
  apiKey: string | undefined,
  publicPaths: string[] = ["/health"],
  disableAuth = false,
  clientApiKey?: string,
) {
  const serverKeys = splitKeys(apiKey);
  const clientKeys = splitKeys(clientApiKey).filter(
    (k) => !serverKeys.includes(k),
  );

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

export function enforceClientPathAllowlist(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const principal = (req as AuthRequest).authPrincipal;
  if (principal !== "client") {
    next();
    return;
  }
  if (isClientPathAllowed(req.method, req.path)) {
    next();
    return;
  }
  res.status(403).json({
    error: "forbidden: client API key cannot access this route",
    code: "CLIENT_PATH_DENIED",
    path: req.path,
  });
}

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

export function timingSafeTokenInList(
  token: string,
  candidates: string[],
): boolean {
  return timingSafeMatch(token, candidates);
}
