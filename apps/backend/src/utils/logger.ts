type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  component?: string;
  [key: string]: unknown;
}

function safeSerialize(v: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(v, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

function formatLog(entry: LogEntry): string {
  const ts = new Date().toISOString();
  const component = entry.component ? ` [${entry.component}]` : "";
  const extra = Object.entries(entry)
    .flatMap(([k, v]) => {
      if (["level", "message", "component"].includes(k)) return [];
      return [` ${k}=${typeof v === "string" ? v : safeSerialize(v)}`];
    })
    .join("");
  return `${ts} ${entry.level.toUpperCase()}${component} ${entry.message}${extra}`;
}

export function createLogger(component: string) {
  // This file IS the logging abstraction — wrapping console.* is its purpose.
  const write =
    (level: LogLevel, out: (...args: unknown[]) => void) =>
    (message: string, extra?: Record<string, unknown>) =>
      out(formatLog({ level, message, component, ...extra }));
  return {
    info: write("info", console.log),
    warn: write("warn", console.warn),
    error: write("error", console.error),
    debug: write("debug", console.debug),
  };
}

// ---- Sentry (absorbed): memoized dynamic loader keeps @sentry/node off the boot graph ----

type SentryModule = typeof import("@sentry/node");

// Memoized dynamic import keeps @sentry/node off the boot import graph; it is
// parsed/loaded only when AXIOM_SENTRY_DSN is set (or after a prior init).
let loaded: Promise<SentryModule | null> | null = null;

export function initSentry(env: {
  AXIOM_SENTRY_DSN?: string;
}): Promise<SentryModule | null> {
  if (!env.AXIOM_SENTRY_DSN) return Promise.resolve(null);
  loaded ??= import("@sentry/node").then((Sentry) => {
    Sentry.init({
      dsn: env.AXIOM_SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
    });
    return Sentry;
  });
  return loaded;
}

/** Resolves once initSentry has loaded Sentry, or null if it never ran. */
export function getSentry(): Promise<SentryModule | null> {
  return loaded ?? Promise.resolve(null);
}
