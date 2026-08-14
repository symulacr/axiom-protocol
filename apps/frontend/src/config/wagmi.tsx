"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { zeroGMainnet, zeroGTestnet } from "viem/chains";
import { COLORS } from "../components/ui.js";

/** Supported 0G chains — viem's built-in definitions (not hand-rolled). */
const CHAINS = {
  [zeroGMainnet.id]: zeroGMainnet, // Aristotle mainnet 16661
  [zeroGTestnet.id]: zeroGTestnet, // Galileo testnet 16602
} as const;

// Per-chain RPC allowlist for the localStorage override — a stale override can
// never silently move the app to another chain's RPC (which would zero out
// every read/write). The resolved chain's own default RPC is always accepted.
const RPC_ALLOWLISTS: Record<number, readonly string[]> = {
  [zeroGMainnet.id]: ["https://evmrpc.0g.ai", "https://rpc.0g.ai"],
  [zeroGTestnet.id]: ["https://evmrpc-testnet.0g.ai"],
};

/**
 * Chain is env-driven: VITE_CHAIN_ID selects the network (16661 mainnet,
 * 16602 Galileo), VITE_EVM_RPC overrides the RPC endpoint. Default = mainnet
 * 16661 so a build without VITE_ vars keeps the historical prod behavior.
 */
function resolveChainId(): number {
  const raw = import.meta.env.VITE_CHAIN_ID;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && CHAINS[parsed as keyof typeof CHAINS]) {
      return parsed;
    }
  }
  return zeroGMainnet.id;
}

export const APP_CHAIN_ID = resolveChainId();
export const APP_CHAIN = CHAINS[APP_CHAIN_ID as keyof typeof CHAINS];

/** 0G Mainnet (Aristotle 16661) — viem's built-in chain definition. */
export const aristotle = zeroGMainnet;

// Validates the localStorage override against the SELECTED chain's allowlist;
// clears bad keys and falls back to VITE_EVM_RPC ?? the chain default.
function resolveRpc(chainId: number): string {
  const envRpc =
    chainId === APP_CHAIN_ID ? import.meta.env.VITE_EVM_RPC : undefined;
  const fallback = APP_CHAIN.rpcUrls.default.http[0] ?? "https://evmrpc.0g.ai";
  if (typeof window === "undefined" || !window.localStorage) {
    return envRpc || fallback;
  }
  const stored = window.localStorage.getItem("axiom.rpcUrl");
  if (!stored) return envRpc || fallback;

  const candidate = stored.trim();
  const allowed = (() => {
    try {
      const url = new URL(candidate);
      const normalized =
        url.origin +
        (url.pathname === "/" || url.pathname === "" ? "" : url.pathname);
      return (
        url.protocol === "https:" &&
        (RPC_ALLOWLISTS[chainId]?.includes(normalized) ?? false)
      );
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
  return envRpc || fallback;
}

function createWagmiConfig() {
  const storedWcProjectId =
    typeof window !== "undefined" && window.localStorage
      ? (window.localStorage.getItem("axiom.wcProjectId") ?? "")
      : "";

  const projectId =
    storedWcProjectId ||
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";

  return createConfig({
    chains: [APP_CHAIN],
    ssr: false,
    transports: {
      [zeroGMainnet.id]: http(resolveRpc(zeroGMainnet.id)),
      [zeroGTestnet.id]: http(resolveRpc(zeroGTestnet.id)),
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
