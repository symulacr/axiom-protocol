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
  def("storage", { label: "Storage proof", shortcut: "Alt 5" }),
  def("mint", { label: "Mint", shortcut: "Alt M" }),
  def("payment", { label: "Payment", shortcut: "Alt P" }),
  def("transfer", { label: "Transfer proof", shortcut: "Alt T" }),
  def("tick", { label: "Run tick", shortcut: "Alt K" }),
  def("deposit", { label: "Deposit", shortcut: "Alt D" }),
  def("withdraw", { label: "Withdraw", shortcut: "Alt W" }),
  def("settings"),
  def("staking"),
  // Cross-wallet handoff receive path — public (acceptance signature is the gate), kept out of nav/palette.
  def("transfer-co-sign"),
];

/** Canonical path lookup keyed by route id — derived from ROUTES so the table stays
 * the single source; prefer over hardcoded strings. Falls back to the id itself. */
export function routePath(id: string): string {
  return ROUTES.find((entry) => entry.id === id)?.path ?? id;
}

const FEATURE_ALIAS_TO_CANONICAL: Record<string, string> = {
  "/features/agents": "/agents",
  "/features/payments": "/payments",
  "/features/proofs": "/proofs",
  "/features/storage": "/storage/0g",
  "/features/developers": "/developers",
};

/** Alias → Route id, derived from the canonical map so one table owns both. */
const PUBLIC_ALIASES: Record<string, Route> = Object.fromEntries(
  Object.entries(FEATURE_ALIAS_TO_CANONICAL).map(([alias, canonical]) => [
    alias,
    resolveRoute(canonical),
  ]),
);

const PUBLIC_SEO_ROUTES: Record<string, PublicSeoSlug> = Object.fromEntries(
  ROUTES.filter(
    (entry): entry is RouteDefinition & { publicSlug: PublicSeoSlug } =>
      Boolean(entry.publicSlug),
  ).map((entry) => [entry.path, entry.publicSlug]),
);

/** Public hub slug for a request path, following /features/* aliases. */
export function resolvePublicSeoSlug(path: string): PublicSeoSlug | null {
  const cleanPath = path.split("?", 1)[0] ?? path;
  const canonical = FEATURE_ALIAS_TO_CANONICAL[cleanPath] ?? cleanPath;
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
