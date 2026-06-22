import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { galileo, aristotle } from './chains.js';

/**
 * wagmi v2 + RainbowKit v2 config for the Axiom Protocol dashboard.
 *
 * `getDefaultConfig` is the SSR-safe helper RainbowKit ships — it returns a
 * ready-to-use wagmi `Config` with WalletConnect, Injected, and the standard
 * Rainbow wallet connectors pre-wired. The `projectId` is the WalletConnect
 * Cloud project identifier; a placeholder is used in dev so the wallet modal
 * can still open with non-WalletConnect wallets.
 *
 * Two 0G chains are registered as custom viem chains (defined in
 * `./chains.js`):
 *   - Galileo testnet  (chainId 16602, RPC https://evmrpc-testnet.0g.ai)
 *   - Aristotle mainnet (chainId 16661, RPC https://evmrpc.0g.ai)
 *
 * `ssr: false` — the dashboard is a Vite SPA, not server-rendered.
 *
 * Canonical references:
 *  - RainbowKit installation guide (getDefaultConfig, appName, projectId, ssr):
 *    https://www.rainbowkit.com/docs/installation
 *  - wagmi v2 createConfig + http transport (chains, transports keyed by id):
 *    https://wagmi.sh/core/config
 *  - 0G chain ids: https://docs.0g.ai/ai-context
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'Axiom Protocol',
  projectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ??
    '00000000000000000000000000000000',
  chains: [galileo, aristotle],
  ssr: false,
  transports: {
    [galileo.id]: http(),
    [aristotle.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
