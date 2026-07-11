import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import {
  GALILEO_CHAIN_ID,
  ARISTOTLE_CHAIN_ID,
  resolveRpcUrl,
} from "@axiom/config/networks";

export const galileo = defineChain({
  id: GALILEO_CHAIN_ID,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://evmrpc-testnet.0g.ai"],
    },
  },
  blockExplorers: {
    default: {
      name: "0G Explorer",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
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

  const galileoRpc = storedRpcUrl || resolveRpcUrl(GALILEO_CHAIN_ID);
  const aristotleRpc = storedRpcUrl || resolveRpcUrl(ARISTOTLE_CHAIN_ID);

  const projectId =
    storedWcProjectId ||
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";

  return createConfig({
    chains: [galileo, aristotle],
    ssr: false,
    transports: {
      [galileo.id]: http(galileoRpc),
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