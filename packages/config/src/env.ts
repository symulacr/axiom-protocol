import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(
  rootPath: string = join(process.cwd(), "../../.env"),
): void {
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
