import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Default fallback kept for backwards compat when no repo-root .env is found.
const LEGACY_DEFAULT = join(process.cwd(), "../../.env");
const MAX_UPSTREAM_LEVELS = 4;

// Resolve the repo-root .env deterministically: walk up from this module's own
// location (dist/ or src/ under packages/config) until a .env is found. The old
// default join(process.cwd(), "../../.env") resolves to ~/.env when cwd is the
// repo root, silently missing the single-source root .env.
function resolveRepoRootEnv(): string {
	let dir = import.meta.dirname ?? process.cwd();
	for (let level = 0; level < MAX_UPSTREAM_LEVELS; level++) {
		const candidate = join(dir, ".env");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return LEGACY_DEFAULT;
}

export function loadEnv(rootPath: string = resolveRepoRootEnv()): void {
	try {
		const content = readFileSync(rootPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq < 0) continue;
			const key = trimmed.slice(0, eq).trim();
			const raw = trimmed.slice(eq + 1).trim();
			const val = raw.replace(/^(['"])(.*)\1$/, "$2");
			if (!process.env[key]) process.env[key] = val;
		}
	} catch {
		// a malformed or unreadable .env line is skipped, not fatal
	}
}

export function getEnv(key: string, fallback?: string): string {
	const val = process.env[key];
	if (val !== undefined && val !== "") return val;
	if (fallback !== undefined) return fallback;
	throw new Error(`Missing required env var ${key}`);
}

export function getEnvWithAlias(
	canonical: string,
	aliases: string[],
	fallback?: string,
): string {
	for (const key of [canonical, ...aliases]) {
		const val = process.env[key];
		if (val !== undefined && val !== "") {
			if (key !== canonical) {
				// Sanctioned console.warn: one-time deprecation notice when an
				// alias env var is used (kept for backward compat).
				console.warn(
					`[config] DEPRECATED: env var "${key}" is deprecated, use "${canonical}"`,
				);
			}
			return val;
		}
	}
	if (fallback !== undefined) return fallback;
	throw new Error(
		`Missing required env var: try ${canonical} (or one of ${aliases.join(", ")})`,
	);
}
