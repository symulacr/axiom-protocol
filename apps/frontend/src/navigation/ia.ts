/**
 * Axiom Protocol — primary information architecture (single source of truth).
 *
 * Primary shell: Home · Chat · Mint (modal action)
 * Deep page only: Agent Detail
 * Legacy peers redirect into this IA.
 */

export const APP_HOME = "/app" as const;
export const APP_CHAT = "/chat" as const;
export const APP_AGENT = (tokenId: string | number | bigint) =>
  `/agents/${tokenId}` as const;

/** Query flag that opens the mint modal over the current route. */
export const MINT_QUERY = "mint" as const;
export const MINT_OPEN_VALUE = "1" as const;

export type PrimaryNavId = "home" | "chat" | "mint";

export type PrimaryNavItem = {
  id: PrimaryNavId;
  label: string;
  /** Route path for link-style items; mint is an action, not a peer page. */
  path?: string;
  kind: "link" | "action";
  shortcut: string;
};

/** Equal-weight destinations shown in the app shell. Mint is CTA, not a route peer. */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { id: "home", label: "Home", path: APP_HOME, kind: "link", shortcut: "H" },
  { id: "chat", label: "Chat", path: APP_CHAT, kind: "link", shortcut: "A" },
  { id: "mint", label: "Mint", kind: "action", shortcut: "N" },
] as const;

/** Paths that must never appear as equal-weight primary nav peers. */
export const REDUNDANT_PEER_PATHS = [
  "/agents",
  "/market",
  "/dashboard",
  "/settings",
  "/agents/new",
] as const;

/**
 * Canonical redirect for legacy or duplicate destinations.
 * Returns null when the path is already primary or a deep page.
 */
export function resolveLegacyRedirect(pathname: string): string | null {
  const bare = pathname.replace(/\/+$/, "") || "/";
  switch (bare) {
    case "/agents":
    case "/dashboard":
    case "/settings":
    case "/market":
      return APP_HOME;
    case "/agents/new":
      return `${APP_HOME}?${MINT_QUERY}=${MINT_OPEN_VALUE}`;
    default:
      return null;
  }
}

export function isMintOpen(search: string | URLSearchParams): boolean {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get(MINT_QUERY) === MINT_OPEN_VALUE;
}

export function withMintOpen(
  search: string | URLSearchParams,
  open: boolean,
): URLSearchParams {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search)
      : new URLSearchParams(search);
  if (open) params.set(MINT_QUERY, MINT_OPEN_VALUE);
  else params.delete(MINT_QUERY);
  return params;
}

/** Labels that primary nav must expose (for structural tests / a11y). */
export function primaryNavLabels(): string[] {
  return PRIMARY_NAV.map((n) => n.label);
}
