import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { galileo, aristotle } from './chains.js';
import { GALILEO_CHAIN_ID, ARISTOTLE_CHAIN_ID, resolveRpcUrl } from "@axiom/config/networks";

// Read from localStorage (Settings page), fall back to env vars / defaults.
const storedWcProjectId =
  typeof window !== 'undefined' && window.localStorage
    ? (window.localStorage.getItem('axiom.wcProjectId') ?? '')
    : '';
const storedRpcUrl =
  typeof window !== 'undefined' && window.localStorage
    ? (window.localStorage.getItem('axiom.rpcUrl') ?? '')
    : '';

const galileoRpc = storedRpcUrl || resolveRpcUrl(GALILEO_CHAIN_ID);
const aristotleRpc = storedRpcUrl || resolveRpcUrl(ARISTOTLE_CHAIN_ID);

export const wagmiConfig = getDefaultConfig({
  appName: 'Axiom Protocol',
  projectId:
    storedWcProjectId ||
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    '00000000000000000000000000000000',
  chains: [galileo, aristotle],
  ssr: false,
  transports: {
    [galileo.id]: http(galileoRpc),
    [aristotle.id]: http(aristotleRpc),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
