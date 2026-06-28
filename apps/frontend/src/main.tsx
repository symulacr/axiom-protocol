import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { Toaster } from 'sonner';
import { COLORS } from './components/ui.js';
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
          accentColor: COLORS.bronze,
          accentColorForeground: COLORS.bg,
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
                    background: COLORS.surface,
                    color: COLORS.text,
                    border: `1px solid ${COLORS.border}`,
                  },
                }}
              />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);

try {
  if (typeof window !== "undefined" && typeof process !== "undefined") {
    process.on("unhandledRejection", (reason: unknown) => {
      const err = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
      console.error(JSON.stringify({ level: "error", msg: "unhandledRejection", err, pid: process.pid }));
      process.exit(1);
    });
    process.on("uncaughtException", (err: Error) => {
      console.error(JSON.stringify({ level: "error", msg: "uncaughtException", err: err.stack ?? err.message, pid: process.pid }));
      process.exit(1);
    });
  }
} catch {
  // process/process.on not available (browser environment)
}
// @fix F1-A1: unhandledRejection + uncaughtException handlers added above
