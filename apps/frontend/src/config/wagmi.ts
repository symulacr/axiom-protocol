import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";

// 0G Mainnet RPC (chainId 16661). Hardcoded to guarantee mainnet-only,
// no testnet fallback. The user may still override via localStorage "axiom.rpcUrl",
// but only with a known mainnet endpoint (see resolveAristotleRpc below).
const MAINNET_RPC = "https://evmrpc.0g.ai";

// Allowlist of known 0G Mainnet (chainId 16661) EVM RPC endpoints. The
// localStorage "axiom.rpcUrl" override is ONLY honored if it is in this set.
// Any other value (e.g. a stale testnet RPC such as https://evmrpc-testnet.0g.ai)
// is rejected so the frontend can never silently talk to a chain other than 16661.
const MAINNET_RPC_ALLOWLIST = new Set([
  "https://evmrpc.0g.ai",
  "https://rpc.0g.ai",
]);

// Resolve the RPC endpoint for the hard-pinned aristotle (16661) chain.
// Reads the localStorage override and VALIDATES it against the mainnet allowlist.
// If the stored value is missing, empty, malformed, or not a known mainnet RPC,
// it is ignored (and the bad key is cleared) and we fall back to MAINNET_RPC.
// This guarantees the frontend can never talk to a chain other than 16661
// through this override.
function resolveAristotleRpc(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return MAINNET_RPC;
  }
  const stored = window.localStorage.getItem("axiom.rpcUrl");
  if (!stored) return MAINNET_RPC;

  const candidate = stored.trim();
  let allowed = false;
  try {
    const url = new URL(candidate);
    const normalized =
      url.origin + (url.pathname === "/" || url.pathname === "" ? "" : url.pathname);
    allowed = url.protocol === "https:" && MAINNET_RPC_ALLOWLIST.has(normalized);
  } catch {
    allowed = false;
  }

  if (allowed) return candidate;

  // Invalid/unknown override — drop the bad key so we don't keep desyncing.
  try {
    window.localStorage.removeItem("axiom.rpcUrl");
  } catch {
    /* localStorage may be unavailable — ignore */
  }
  return MAINNET_RPC;
}

export const aristotle = defineChain({
  id: ARISTOTLE_CHAIN_ID,
  name: "0G Aristotle Mainnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://evmrpc.0g.ai"],
    },
  },
  blockExplorers: {
    default: {
      name: "0G Explorer",
      url: "https://chainscan.0g.ai",
    },
  },
  testnet: false,
});

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
    connectors: [injected({ target: "metaMask" }), walletConnect({ projectId })],
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof createWagmiConfig>;
  }
}
