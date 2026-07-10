import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { galileo, aristotle } from "./chains.js";
import {
  GALILEO_CHAIN_ID,
  ARISTOTLE_CHAIN_ID,
  resolveRpcUrl,
} from "@axiom/config/networks";

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