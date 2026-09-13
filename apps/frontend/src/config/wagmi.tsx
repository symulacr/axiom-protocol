"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { zeroGMainnet } from "viem/chains";
import { resolveRpcAllowlist } from "@axiom/config";

/** 0G Galileo testnet (16602) — no viem chain definition ships one, so it is
 *  defined locally from the verified endpoints (docs.0g.ai ai-context +
 *  docs/deployments/galileo-v3-2026-08-31.json). Dev lane only; mainnet stays
 *  the default. */
const zeroGGalileo = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: {
    default: {
      name: "0G Scan (Galileo)",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
});

/** Supported 0G chains — mainnet default; Galileo testnet retained as the
 *  first-class dev lane (select via VITE_CHAIN_ID=16602). */
const CHAINS = {
  [zeroGMainnet.id]: zeroGMainnet, // Aristotle mainnet 16661
  [zeroGGalileo.id]: zeroGGalileo, // Galileo testnet 16602 (dev)
} as const;

// Per-chain RPC allowlist for the localStorage override — a stale override can
// never silently move the app to another chain's RPC (which would zero out
// every read/write). Single-sourced from @axiom/config's network registry
// (OPT-11): the registry's evmRpc + fallbacks (+ mainnet's same-org rpc.0g.ai)
// are the sanctioned set; the resolved chain's own default RPC is always accepted.
const RPC_ALLOWLISTS: Record<number, readonly string[]> = {
  [zeroGMainnet.id]: resolveRpcAllowlist(zeroGMainnet.id),
  [zeroGGalileo.id]: resolveRpcAllowlist(zeroGGalileo.id),
};

/**
 * Chain is env-driven: VITE_CHAIN_ID selects the network (16661 mainnet default,
 * 16602 Galileo dev lane), VITE_EVM_RPC overrides the RPC endpoint. Default =
 * mainnet 16661 so a build without VITE_ vars keeps the historical prod behavior.
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

/** Default RPC endpoint for the selected chain — the single source readout
 *  surfaces (e.g. Settings connection rows) consume instead of duplicating
 *  the literal. */
export const APP_CHAIN_DEFAULT_RPC =
  APP_CHAIN.rpcUrls.default.http[0] ?? "https://evmrpc.0g.ai";

/** Chain ids the app is configured for, derived from the chain registry. */
export type AppChainId = keyof typeof CHAINS;

function chainDefaultRpc(chainId: number): string {
  return (
    CHAINS[chainId as keyof typeof CHAINS]?.rpcUrls.default.http[0] ??
    "https://evmrpc.0g.ai"
  );
}

// Validates the localStorage override against the SELECTED chain's allowlist;
// clears bad keys and falls back to VITE_EVM_RPC ?? the chain default.
function resolveRpc(chainId: number): string {
  const envRpc =
    chainId === APP_CHAIN_ID ? import.meta.env.VITE_EVM_RPC : undefined;
  const fallback = chainDefaultRpc(chainId);
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
    // One resolved RPC per registered chain — transports cover both so a
    // VITE_CHAIN_ID=16602 dev build gets the same override/allowlist rules.
    rpcByChain: Object.fromEntries(
      Object.keys(CHAINS).map((id) => [Number(id), resolveRpc(Number(id))]),
    ) as Record<number, string>,
  };
}

function createWagmiConfig(inputs: ReturnType<typeof resolveWagmiInputs>) {
  return createConfig({
    // A build targets exactly ONE env-selected chain, so the config keeps a
    // 1-tuple type (mutations may omit `chain`) even though the registry
    // carries both chains for the transports map.
    chains: [APP_CHAIN] as [typeof APP_CHAIN],
    ssr: false,
    transports: {
      [zeroGMainnet.id]: http(inputs.rpcByChain[zeroGMainnet.id]),
      [zeroGGalileo.id]: http(inputs.rpcByChain[zeroGGalileo.id]),
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
  const key = JSON.stringify([inputs.projectId, inputs.rpcByChain]);
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
