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
  def("public-agents", { indexable: true, publicSlug: "agents" }),
  def("public-payments", { indexable: true, publicSlug: "payments" }),
  def("public-proofs", { indexable: true, publicSlug: "proofs" }),
  def("public-storage", {
    path: "/storage/0g",
    indexable: true,
    publicSlug: "storage",
  }),
  def("public-developers", { indexable: true, publicSlug: "developers" }),
  // One nav entry per destination: agent pages are /agents/:tokenId, so /app has a single owner.
  def("dashboard", { path: "/app", label: "Overview", shortcut: "Alt 1" }),
  def("chat", { label: "Chat", shortcut: "Alt 3" }),
  def("transactions", { label: "Transactions", shortcut: "Alt 4" }),
  // U18: demoted from prime IA (no label/shortcut → absent from rail palette); route stays for deep links.
  def("storage"),
  def("mint", { label: "Mint", shortcut: "Alt M" }),
  def("payment", { label: "Payment", shortcut: "Alt P" }),
  def("transfer", { label: "Transfer proof", shortcut: "Alt T" }),
  def("tick", { label: "Run agent task", shortcut: "Alt K" }),
  def("deposit", { label: "Deposit", shortcut: "Alt D" }),
  def("withdraw", { label: "Withdraw", shortcut: "Alt W" }),
  def("settings"),
  def("staking"),
  // Cross-wallet handoff receive path — public (acceptance signature is the gate), kept out of nav/palette.
  def("transfer-co-sign", { path: "/transfer/co-sign" }),
];

/** PublicSeoSlug → canonical hub path, derived so emitted hrefs can never drift from the registry. */
export const PUBLIC_HUB_PATHS: Record<PublicSeoSlug, string> = Object.fromEntries(
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

/** Pre-wave-1 published short URLs — kept as inbound compat aliases.
 *  Exact-match keys only: `/agents/:tokenId` keeps its own resolveRoute rule. */
const SHORT_HUB_ALIASES: Record<string, string> = {
  "/agents": PUBLIC_HUB_PATHS.agents,
  "/payments": PUBLIC_HUB_PATHS.payments,
  "/proofs": PUBLIC_HUB_PATHS.proofs,
  "/developers": PUBLIC_HUB_PATHS.developers,
};

const ALIAS_TO_CANONICAL: Record<string, string> = {
  ...FEATURE_ALIAS_TO_CANONICAL,
  ...SHORT_HUB_ALIASES,
};

/** Alias → Route id, derived from the canonical map so one table owns both.
 *  Resolved directly against ROUTES (not resolveRoute) to avoid a circular
 *  dependency on this very table during module init. */
const PUBLIC_ALIASES: Record<string, Route> = Object.fromEntries(
  Object.entries(ALIAS_TO_CANONICAL).map(([alias, canonical]) => [
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

/** Public hub slug for a request path, following /features/* and short-URL aliases. */
export function resolvePublicSeoSlug(path: string): PublicSeoSlug | null {
  const cleanPath = path.split("?", 1)[0] ?? path;
  const canonical = ALIAS_TO_CANONICAL[cleanPath] ?? cleanPath;
  return PUBLIC_SEO_ROUTES[canonical] ?? null;
}

const INDEXABLE_PATHS = new Set(
  ROUTES.filter((entry) => entry.indexable).map((entry) => entry.path),
);

/** Every routable app path (public hubs + internal routes + compat aliases). */
export const KNOWN_PATHS = new Set([
  "/",
  ...ROUTES.map((entry) => entry.path),
  ...Object.keys(PUBLIC_ALIASES),
  "/agents/list",
]);

export function resolveRoute(path: string): Route {
  const cleanPath = path.split("?", 1)[0] ?? path;
  if (cleanPath.startsWith("/agents/")) return "agent";
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
