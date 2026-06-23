import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { galileo, aristotle } from './chains.js';

/** wagmi v2 + RainbowKit v2 config for the dashboard. */
// Read persisted settings from localStorage so the Settings page actually
// takes effect on the next page load. Falls back to env vars / defaults.
const storedWcProjectId =
  typeof window !== 'undefined' && window.localStorage
    ? (window.localStorage.getItem('axiom.wcProjectId') ?? '')
    : '';
const storedRpcUrl =
  typeof window !== 'undefined' && window.localStorage
    ? (window.localStorage.getItem('axiom.rpcUrl') ?? '')
    : '';

const galileoRpc = storedRpcUrl || 'https://evmrpc-testnet.0g.ai';
const aristotleRpc = storedRpcUrl || 'https://evmrpc.0g.ai';

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
