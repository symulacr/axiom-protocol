import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";

// 0G Mainnet RPC (chainId 16661). Hardcoded to guarantee mainnet-only,
// no testnet fallback. The user may still override via localStorage "axiom.rpcUrl".
const MAINNET_RPC = "https://evmrpc.0g.ai";

// Repurposed mainnet alias (kept exported for import compatibility).
// 0G Mainnet — chainId 16661, RPC https://evmrpc.0g.ai, explorer https://chainscan.0g.ai.
export const galileo = defineChain({
  id: ARISTOTLE_CHAIN_ID,
  name: "0G Mainnet",
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
  const storedRpcUrl =
    typeof window !== "undefined" && window.localStorage
      ? (window.localStorage.getItem("axiom.rpcUrl") ?? "")
      : "";

  const aristotleRpc = storedRpcUrl || MAINNET_RPC;

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