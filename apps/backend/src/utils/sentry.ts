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
