import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { galileo, aristotle } from './chains.js';

// Read from localStorage (Settings page), fall back to env vars / defaults.
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
