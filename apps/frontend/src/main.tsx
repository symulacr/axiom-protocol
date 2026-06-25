import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { Toaster } from 'sonner';
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
              <Toaster
                position="bottom-right"
                toastOptions={{
                  style: {
                    background: '#1a1a1a',
                    color: '#f5f5f5',
                    border: '1px solid #2a2a2a',
                  },
                }}
              />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
