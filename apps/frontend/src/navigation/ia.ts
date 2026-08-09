/**
 * Axiom Protocol — primary information architecture (single source of truth).
 *
 * Primary shell: Home · Chat · Mint (modal action)
 * Deep page only: Agent Detail
 * Legacy peers redirect into this IA.
 */

export const APP_HOME = "/app" as const;
export const APP_CHAT = "/chat" as const;

/** Query flag that opens the mint modal over the current route. */
const MINT_QUERY = "mint" as const;
const MINT_OPEN_VALUE = "1" as const;

type PrimaryNavId = "home" | "chat" | "mint";

type PrimaryNavItem = {
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
