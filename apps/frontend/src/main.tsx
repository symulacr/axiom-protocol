import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "sonner";
import { COLORS } from "./components/ui.js";
import { App } from "./App";
import { WagmiConfigProvider } from "./config/WagmiConfigProvider";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found in index.html");
}

// QueryClientProvider must wrap WagmiConfigProvider so RainbowKit's react-query hooks resolve.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiConfigProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="bottom-right"
            duration={3000}
            toastOptions={{
              style: {
                background: COLORS.surface,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
              },
            }}
          />
        </BrowserRouter>
      </WagmiConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
);

try {
  if (
    typeof window !== "undefined" &&
    typeof process !== "undefined" &&
    typeof process.on === "function"
  ) {
    process.on("unhandledRejection", (reason: unknown) => {
      const err =
        reason instanceof Error
          ? (reason.stack ?? reason.message)
          : String(reason);
      console.error(
        JSON.stringify({
          level: "error",
          msg: "unhandledRejection",
          err,
          pid: process.pid,
        }),
      );
      process.exit(1);
    });
    process.on("uncaughtException", (err: Error) => {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "uncaughtException",
          err: err.stack ?? err.message,
          pid: process.pid,
        }),
      );
      process.exit(1);
    });
  }
} catch { /* sessionStorage may be unavailable */ }
