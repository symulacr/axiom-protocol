// Axiom Protocol — Vite entry point.
//
// Wraps the React tree in the three required providers in the order
// recommended by the RainbowKit v2 installation guide:
//
//   QueryClientProvider     — required by both wagmi v2 and RainbowKit v2
//                             (TanStack Query is a peer dependency).
//   WagmiProvider           — supplies the wagmi client (viem transports,
//                             connectors, query/mutation client) to the
//                             rest of the React tree.
//   RainbowKitProvider      — supplies the RainbowKit modal context. Must
//                             be a descendant of WagmiProvider so it can
//                             read the active chain and client.
//
// Sources (canonical):
//   RainbowKit v2 installation guide:
//     https://www.rainbowkit.com/docs/installation
//   wagmi v2 React quickstart:
//     https://wagmi.sh/react/quickstart
//
// `wagmiConfig` is built in apps/frontend/src/config/wagmi.ts (owned by
// Agent C) and re-exports the `getDefaultConfig` output with the 0G
// Galileo testnet and 0G Aristotle mainnet registered as the supported
// chains. `chains` is a tuple the RainbowKitProvider needs to render the
// chain-switcher UI in the ConnectButton modal.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { App } from './App';
import { wagmiConfig } from './config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import './styles/index.css';

const queryClient = new QueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#b8976e',
          accentColorForeground: '#0f0f0f',
          borderRadius: 'medium',
          fontStack: 'system',
          overlayBlur: 'small',
        })}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
