import type { Route } from "./models";

export type PublicSeoSlug =
  "agents" | "payments" | "proofs" | "storage" | "developers";

type RouteDefinition = {
  id: string;
  route: Route;
  path: string;
  label?: string;
  shortcut?: string;
  indexable?: boolean;
  publicSlug?: PublicSeoSlug;
};

/** Builder: route id doubles as the canonical Route value; path defaults to `/${id}`. */
const def = (
  id: string,
  extra: Omit<Partial<RouteDefinition>, "id" | "route"> = {},
): RouteDefinition => ({ id, route: id as Route, path: `/${id}`, ...extra });

const ROUTES: RouteDefinition[] = [
  def("landing", { path: "/", indexable: true }),
  // L1-M7 rebrand: the short hub URLs are the CANONICAL registered paths
  // (sitemap, canonical tags, nav links all emit short form); the legacy
  // /public-* and /features/* spellings 308-redirect to them (see below).
  def("agents", { indexable: true, publicSlug: "agents" }),
  def("payments", { indexable: true, publicSlug: "payments" }),
  def("proofs", { indexable: true, publicSlug: "proofs" }),
  def("storage-0g", {
    path: "/storage/0g",
    indexable: true,
    publicSlug: "storage",
  }),
  def("developers", { indexable: true, publicSlug: "developers" }),
  // One nav entry per destination: agent pages are /agents/:tokenId, so /app has a single owner.
  def("dashboard", { path: "/app", label: "Overview", shortcut: "Alt 1" }),
  def("chat", { label: "Chat", shortcut: "Alt 3" }),
  def("transactions", { label: "Transactions", shortcut: "Alt 4" }),
  // U18: demoted from prime IA (no label/shortcut → absent from rail palette); route stays for deep links.
  def("storage"),
  def("mint", { label: "Mint", shortcut: "Alt M" }),
  def("payment", { label: "Payment", shortcut: "Alt P" }),
  def("transfer", { label: "Transfer", shortcut: "Alt T" }),
  def("tick", { label: "Run agent task", shortcut: "Alt K" }),
  def("deposit", { label: "Deposit", shortcut: "Alt D" }),
  def("withdraw", { label: "Withdraw", shortcut: "Alt W" }),
  def("settings"),
  def("staking"),
  // Cross-wallet handoff receive path — public (acceptance signature is the gate), kept out of nav/palette.
  def("transfer-co-sign", { path: "/transfer/co-sign" }),
];

/** PublicSeoSlug → canonical hub path, derived so emitted hrefs can never drift from the registry. */
export const PUBLIC_HUB_PATHS: Record<PublicSeoSlug, string> =
  Object.fromEntries(
    ROUTES.filter(
      (entry): entry is RouteDefinition & { publicSlug: PublicSeoSlug } =>
        Boolean(entry.publicSlug),
    ).map((entry) => [entry.publicSlug, entry.path]),
  ) as Record<PublicSeoSlug, string>;

/** Canonical path lookup keyed by route id — derived from ROUTES so the table stays
 * the single source; prefer over hardcoded strings. Falls back to the id itself. */
export function routePath(id: string): string {
  return ROUTES.find((entry) => entry.id === id)?.path ?? id;
}

const FEATURE_ALIAS_TO_CANONICAL: Record<string, string> = {
  "/features/agents": PUBLIC_HUB_PATHS.agents,
  "/features/payments": PUBLIC_HUB_PATHS.payments,
  "/features/proofs": PUBLIC_HUB_PATHS.proofs,
  "/features/storage": PUBLIC_HUB_PATHS.storage,
  "/features/developers": PUBLIC_HUB_PATHS.developers,
};

/** Pre-L1-M7 published spellings — permanent redirects (SPA Navigate / server
 *  308), no longer 200-render: duplicate-content URLs must consolidate on the
 *  canonical short form. Exact-match keys only: `/agents/:tokenId` keeps its
 *  own resolveRoute rule. */
const LEGACY_HUB_REDIRECTS: Record<string, string> = {
  "/public-agents": PUBLIC_HUB_PATHS.agents,
  "/public-payments": PUBLIC_HUB_PATHS.payments,
  "/public-proofs": PUBLIC_HUB_PATHS.proofs,
  "/public-storage": PUBLIC_HUB_PATHS.storage,
  "/public-developers": PUBLIC_HUB_PATHS.developers,
  ...FEATURE_ALIAS_TO_CANONICAL,
};

/** Redirects that pre-date the rebrand and stay 200-render compat aliases
 *  (inbound short URLs from before wave 1). */
const SHORT_HUB_ALIASES: Record<string, string> = {
  "/agents": PUBLIC_HUB_PATHS.agents,
  "/payments": PUBLIC_HUB_PATHS.payments,
  "/proofs": PUBLIC_HUB_PATHS.proofs,
  "/developers": PUBLIC_HUB_PATHS.developers,
};

/** Compat alias → Route id, derived so one table owns both. Resolved directly
 *  against ROUTES (not resolveRoute) to avoid a circular dependency on this
 *  very table during module init. Legacy redirect spellings are intentionally
 *  NOT included — resolveRoute marks them "redirect", never 200-renders. */
const PUBLIC_ALIASES: Record<string, Route> = Object.fromEntries(
  Object.entries(SHORT_HUB_ALIASES).map(([alias, canonical]) => [
    alias,
    ROUTES.find((entry) => entry.path === canonical)?.route ?? "not-found",
  ]),
);

const PUBLIC_SEO_ROUTES: Record<string, PublicSeoSlug> = Object.fromEntries(
  ROUTES.filter(
    (entry): entry is RouteDefinition & { publicSlug: PublicSeoSlug } =>
      Boolean(entry.publicSlug),
  ).map((entry) => [entry.path, entry.publicSlug]),
);

/** Public hub slug for a request path, following short-URL aliases. Legacy
 *  spellings (handled by redirectHubTarget) intentionally do NOT resolve to a
 *  200-render slug — a redirect must never render duplicate content. */
export function resolvePublicSeoSlug(path: string): PublicSeoSlug | null {
  const cleanPath = path.split("?", 1)[0] ?? path;
  const canonical = SHORT_HUB_ALIASES[cleanPath] ?? cleanPath;
  return PUBLIC_SEO_ROUTES[canonical] ?? null;
}

/** Legacy hub spelling → canonical path it must 308-redirect to, or null.
 *  Consumed by the SPA (<Navigate replace>) and mirrored in dev.mjs /
 *  server.mjs so the redirect fires before the SPA fallback in every mode. */
export function redirectHubTarget(path: string): string | null {
  const cleanPath = path.split("?", 1)[0] ?? path;
  return LEGACY_HUB_REDIRECTS[cleanPath] ?? null;
}

const INDEXABLE_PATHS = new Set(
  ROUTES.filter((entry) => entry.indexable).map((entry) => entry.path),
);

/** Every routable app path (public hubs + internal routes + compat aliases +
 *  legacy redirect spellings — the latter exist only to be redirected). */
export const KNOWN_PATHS = new Set([
  "/",
  ...ROUTES.map((entry) => entry.path),
  ...Object.keys(PUBLIC_ALIASES),
  ...Object.keys(LEGACY_HUB_REDIRECTS),
  "/agents/list",
]);

export function resolveRoute(path: string): Route {
  const cleanPath = path.split("?", 1)[0] ?? path;
  if (cleanPath.startsWith("/agents/")) return "agent";
  // Legacy spellings redirect (App.tsx <Navigate replace> + server 308s);
  // they must never 200-render alongside their canonical short form.
  if (LEGACY_HUB_REDIRECTS[cleanPath]) return "redirect";
  return (
    PUBLIC_ALIASES[cleanPath] ??
    ROUTES.find((entry) => entry.path === cleanPath)?.route ??
    "not-found"
  );
}

export function isIndexablePath(path: string) {
  return INDEXABLE_PATHS.has(path);
}

export function getShortcutPath(key: string) {
  const normalized = key.toLowerCase();
  return ROUTES.find(
    (entry) => entry.shortcut?.replace("Alt ", "").toLowerCase() === normalized,
  )?.path;
}

export function getCommandRouteItems() {
  return ROUTES.filter((entry) => entry.label && entry.shortcut).map(
    (entry) => ({
      id: entry.id,
      label: entry.label!,
      path: entry.path,
      shortcut: entry.shortcut!,
    }),
  );
}

// Flow routes are the operation paths; derive them so the table stays the single source.
const OPERATION_PATHS = new Set(
  (["mint", "payment", "transfer", "tick", "deposit", "withdraw"] as const).map(
    routePath,
  ),
);

export function isOperationPath(path: string) {
  return OPERATION_PATHS.has(path);
}
