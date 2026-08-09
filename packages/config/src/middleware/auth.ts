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
 * Browser/client keys may only hit these path prefixes (method-aware where needed).
 * Everything else requires the server API key.
 */
export const CLIENT_ALLOWED_ROUTES: ReadonlyArray<{
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
	// Public market data skills only — not forensics, not unbroker execute
	{
		match: (p) =>
			p.startsWith("/v1/skills/evm/") ||
			p.startsWith("/v1/skills/stocks/") ||
			p.startsWith("/v1/skills/osint/"),
	},
];

export function isClientPathAllowed(method: string, path: string): boolean {
	const m = method.toUpperCase();
	// Strip query string for matching
	const pathOnly = path.split("?")[0] ?? path;
	return CLIENT_ALLOWED_ROUTES.some((rule) => {
		if (rule.methods && !rule.methods.includes(m)) return false;
		return rule.match(pathOnly);
	});
}

/**
 * API-key auth with capability split:
 * - server key (`AXIOM_API_KEY`): full access
 * - client key (`AXIOM_CLIENT_API_KEY`): only CLIENT_ALLOWED_ROUTES
 *
 * Use `requireServerAuth` on operator routes; `enforceClientPathAllowlist`
 * must be mounted after createApiKeyAuth.
 */
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

/** Deny client-key access outside the allowlist. Server/disabled/none pass. */
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

/** Operator-only: vault execute, privileged payment, forensics, etc. */
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
