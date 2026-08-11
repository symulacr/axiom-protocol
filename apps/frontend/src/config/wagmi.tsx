"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { zeroGMainnet } from "viem/chains";
import { COLORS } from "../components/ui.js";

// Hardcoded mainnet-only RPC; the localStorage override is allowlisted below, never a testnet fallback
const MAINNET_RPC = "https://evmrpc.0g.ai";

// Override honored only in this allowlist — rejects stale testnet RPCs so the app can never silently leave chain 16661
const MAINNET_RPC_ALLOWLIST = new Set([MAINNET_RPC, "https://rpc.0g.ai"]);

// Validates the override, clears bad keys, falls back to MAINNET_RPC
function resolveAristotleRpc(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return MAINNET_RPC;
  }
  const stored = window.localStorage.getItem("axiom.rpcUrl");
  if (!stored) return MAINNET_RPC;

  const candidate = stored.trim();
  const allowed = (() => {
    try {
      const url = new URL(candidate);
      const normalized =
        url.origin +
        (url.pathname === "/" || url.pathname === "" ? "" : url.pathname);
      return url.protocol === "https:" && MAINNET_RPC_ALLOWLIST.has(normalized);
    } catch {
      return false;
    }
  })();

  if (allowed) return candidate;

  // Invalid/unknown override — drop the bad key so we don't keep desyncing.
  try {
    window.localStorage.removeItem("axiom.rpcUrl");
  } catch {
		void 0;
  }
  return MAINNET_RPC;
}

/** 0G Mainnet (Aristotle 16661) — uses viem's built-in chain definition, not a hand-rolled config. */
export const aristotle = zeroGMainnet;

export function createWagmiConfig() {
  const storedWcProjectId =
    typeof window !== "undefined" && window.localStorage
      ? (window.localStorage.getItem("axiom.wcProjectId") ?? "")
      : "";

  const aristotleRpc = resolveAristotleRpc();

  const projectId =
    storedWcProjectId ||
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";

  return createConfig({
    chains: [aristotle],
    ssr: false,
    transports: {
      [aristotle.id]: http(aristotleRpc),
    },
    connectors: [
      injected({ target: "metaMask" }),
      walletConnect({ projectId }),
    ],
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof createWagmiConfig>;
  }
}

const RainbowKitProvider = lazy(() =>
	import("@rainbow-me/rainbowkit").then((m) => {
		const Provider = m.RainbowKitProvider;
		const theme = m.darkTheme({
			accentColor: COLORS.bronze,
			accentColorForeground: COLORS.bg,
			borderRadius: "medium",
			fontStack: "system",
			overlayBlur: "small",
		});
		return {
			default: ({ children }: { children: ReactNode }) => (
				<Provider theme={theme} locale="en">
					{children}
				</Provider>
			),
		};
	}),
);

const WATCHED_KEYS = new Set(["axiom.wcProjectId", "axiom.rpcUrl"]);

export function WagmiConfigProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState(() => createWagmiConfig());

	useEffect(() => {
		const refresh = () => setConfig(createWagmiConfig());

		const onStorage = (event: StorageEvent) => {
			if (event.key === null || WATCHED_KEYS.has(event.key)) {
				refresh();
			}
		};

		const onConfigChanged = () => refresh();

		window.addEventListener("storage", onStorage);
		window.addEventListener("axiom:config-changed", onConfigChanged);

		return () => {
			window.removeEventListener("storage", onStorage);
			window.removeEventListener("axiom:config-changed", onConfigChanged);
		};
	}, []);

	return (
		<WagmiProvider config={config}>
			<Suspense fallback={null}>
				<RainbowKitProvider>{children}</RainbowKitProvider>
			</Suspense>
		</WagmiProvider>
	);
}
