import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "sonner";
import { App } from "./App";
import { WagmiConfigProvider } from "./config/wagmi";
import { UiStoreProvider } from "./lib/uiStore";
import { isIndexablePath } from "./lib/routeRegistry";
import "./styles/index.css";
import "./styles/axiom-awwwards.css";

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

// SEO policy: public hubs indexable, app routes noindex — kept in sync on every pushState/popstate.
function applyIndexingPolicy() {
  const robots =
    document.querySelector('meta[name="robots"]') ||
    document.head.appendChild(document.createElement("meta"));
  robots.setAttribute("name", "robots");
  robots.setAttribute(
    "content",
    isIndexablePath(window.location.pathname)
      ? "index,follow"
      : "noindex,nofollow",
  );
}
const nativePushState = window.history.pushState.bind(window.history);
window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
  nativePushState(...args);
  applyIndexingPolicy();
}) as History["pushState"];
window.addEventListener("popstate", applyIndexingPolicy);
applyIndexingPolicy();

// QueryClientProvider must wrap WagmiConfigProvider — wagmi's data hooks
// resolve their react-query client internally.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiConfigProvider>
        <UiStoreProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UiStoreProvider>
      </WagmiConfigProvider>
      <Toaster
        position="bottom-right"
        // 5s floor for timed success/info toasts (motion-and-zoom); error and
        // action toasts pass duration: Infinity per-call (toastError in
        // pages/shared.ts, GasTankCard, ChatPage undo) per the U24 policy.
        duration={5000}
        toastOptions={{
          style: {
            background: "var(--panel)",
            color: "var(--text)",
            border: "1px solid var(--line)",
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
