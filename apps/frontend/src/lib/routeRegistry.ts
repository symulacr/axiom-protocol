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

const ROUTES: RouteDefinition[] = [
  { id: "landing", route: "landing", path: "/", indexable: true },
  {
    id: "public-agents",
    route: "public-agents",
    path: "/agents",
    indexable: true,
    publicSlug: "agents",
  },
  {
    id: "public-payments",
    route: "public-payments",
    path: "/payments",
    indexable: true,
    publicSlug: "payments",
  },
  {
    id: "public-proofs",
    route: "public-proofs",
    path: "/proofs",
    indexable: true,
    publicSlug: "proofs",
  },
  {
    id: "public-storage",
    route: "public-storage",
    path: "/storage/0g",
    indexable: true,
    publicSlug: "storage",
  },
  {
    id: "public-developers",
    route: "public-developers",
    path: "/developers",
    indexable: true,
    publicSlug: "developers",
  },
  {
    id: "dashboard",
    route: "dashboard",
    path: "/app",
    label: "Overview",
    shortcut: "Alt 1",
  },
  // One nav entry per destination: agent pages are /agents/:tokenId, so /app has a single owner.
  {
    id: "chat",
    route: "chat",
    path: "/chat",
    label: "Chat",
    shortcut: "Alt 3",
  },
  {
    id: "transactions",
    route: "transactions",
    path: "/transactions",
    label: "Transactions",
    shortcut: "Alt 4",
  },
  {
    id: "storage",
    route: "storage",
    path: "/storage",
    label: "Storage proof",
    shortcut: "Alt 5",
  },
  {
    id: "mint",
    route: "mint",
    path: "/mint",
    label: "Mint",
    shortcut: "Alt M",
  },
  {
    id: "payment",
    route: "payment",
    path: "/payment",
    label: "Payment",
    shortcut: "Alt P",
  },
  {
    id: "transfer",
    route: "transfer",
    path: "/transfer",
    label: "Transfer proof",
    shortcut: "Alt T",
  },
  {
    id: "tick",
    route: "tick",
    path: "/tick",
    label: "Run tick",
    shortcut: "Alt K",
  },
  {
    id: "deposit",
    route: "deposit",
    path: "/deposit",
    label: "Deposit",
    shortcut: "Alt D",
  },
  {
    id: "withdraw",
    route: "withdraw",
    path: "/withdraw",
    label: "Withdraw",
    shortcut: "Alt W",
  },
  { id: "settings", route: "settings", path: "/settings" },
  { id: "staking", route: "staking", path: "/staking" },
  // Cross-wallet handoff receive path — public (acceptance signature is the gate), kept out of nav/palette.
  {
    id: "transfer-co-sign",
    route: "transfer-co-sign",
    path: "/transfer/co-sign",
  },
];

/** Canonical path lookup keyed by route id — derived from ROUTES so the table stays
 * the single source; prefer over hardcoded strings. Falls back to the id itself. */
export function routePath(id: string): string {
  return ROUTES.find((entry) => entry.id === id)?.path ?? id;
}

const PUBLIC_ALIASES: Record<string, Route> = {
  "/features/agents": "public-agents",
  "/features/payments": "public-payments",
  "/features/proofs": "public-proofs",
  "/features/storage": "public-storage",
  "/features/developers": "public-developers",
};

const FEATURE_ALIAS_TO_CANONICAL: Record<string, string> = {
  "/features/agents": "/agents",
  "/features/payments": "/payments",
  "/features/proofs": "/proofs",
  "/features/storage": "/storage/0g",
  "/features/developers": "/developers",
};

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

export function isOperationPath(path: string) {
  return [
    "/mint",
    "/payment",
    "/transfer",
    "/tick",
    "/deposit",
    "/withdraw",
  ].includes(path);
}
