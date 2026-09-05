"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { zeroGMainnet } from "viem/chains";

/** Supported 0G chains — mainnet only (testnet retired 2026-09-05). */
const CHAINS = {
  [zeroGMainnet.id]: zeroGMainnet, // Aristotle mainnet 16661
} as const;

// Per-chain RPC allowlist for the localStorage override — a stale override can
// never silently move the app to another chain's RPC (which would zero out
// every read/write). The resolved chain's own default RPC is always accepted.
const RPC_ALLOWLISTS: Record<number, readonly string[]> = {
  [zeroGMainnet.id]: ["https://evmrpc.0g.ai", "https://rpc.0g.ai"],
};

/**
 * Chain is env-driven: VITE_CHAIN_ID selects the network (16661 mainnet,
 * 16602 Galileo), VITE_EVM_RPC overrides the RPC endpoint. Default = mainnet
 * 16661 so a build without VITE_ vars keeps the historical prod behavior.
 */
function resolveChainId(): AppChainId {
  const raw = import.meta.env.VITE_CHAIN_ID;
  if (raw) {
    const parsed = Number(raw);
    // Narrowing validated by the CHAINS registry lookup above.
    if (Number.isInteger(parsed) && CHAINS[parsed as keyof typeof CHAINS]) {
      return parsed as AppChainId;
    }
  }
  return zeroGMainnet.id;
}

export const APP_CHAIN_ID = resolveChainId();
export const APP_CHAIN = CHAINS[APP_CHAIN_ID as keyof typeof CHAINS];

/** Chain ids the app is configured for, derived from the chain registry. */
export type AppChainId = keyof typeof CHAINS;

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

// Inputs that legitimately require config recreation when they change.
function resolveWagmiInputs() {
  const storedWcProjectId =
    typeof window !== "undefined" && window.localStorage
      ? (window.localStorage.getItem("axiom.wcProjectId") ?? "")
      : "";

  const projectId =
    storedWcProjectId ||
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";
  if (
    projectId === "00000000000000000000000000000000" &&
    import.meta.env.MODE === "production"
  ) {
    console.warn(
      "WalletConnect uses the placeholder projectId — set VITE_WALLETCONNECT_PROJECT_ID or WalletConnect pairing will fail.",
    );
  }

  return {
    projectId,
    mainnetRpc: resolveRpc(zeroGMainnet.id),
  };
}

function createWagmiConfig(inputs: ReturnType<typeof resolveWagmiInputs>) {
  return createConfig({
    chains: [APP_CHAIN],
    ssr: false,
    transports: {
      [zeroGMainnet.id]: http(inputs.mainnetRpc),
    },
    connectors: [
      // Bare injected() = mipd/EIP-6963 discovery lists every installed
      // wallet; a pinned target (e.g. "metaMask") requires provider.isMetaMask
      // and throws ProviderNotFoundError on anything else (Rabby, Brave).
      injected(),
      walletConnect({ projectId: inputs.projectId }),
    ],
  });
}

// Module-level memo: StrictMode double-mounts reuse one instance instead of
// initializing the WalletConnect provider twice.
let cached: {
  key: string;
  config: ReturnType<typeof createWagmiConfig>;
} | null = null;

function getWagmiConfig(): ReturnType<typeof createWagmiConfig> {
  const inputs = resolveWagmiInputs();
  const key = JSON.stringify([inputs.projectId, inputs.mainnetRpc]);
  if (cached?.key === key) return cached.config;
  cached = { key, config: createWagmiConfig(inputs) };
  return cached.config;
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof createWagmiConfig>;
  }
}

const WATCHED_KEYS = new Set(["axiom.wcProjectId", "axiom.rpcUrl"]);

export function WagmiConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(() => getWagmiConfig());

  useEffect(() => {
    const refresh = () => setConfig(getWagmiConfig());

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

  return <WagmiProvider config={config}>{children}</WagmiProvider>;
}
