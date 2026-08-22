import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "sonner";
import { COLORS } from "./components/ui.js";
import { App } from "./App";
import { WagmiConfigProvider } from "./config/wagmi";
import { UiStoreProvider } from "./lib/uiStore";
import { getShortcutPath, isIndexablePath } from "./lib/routeRegistry";
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

// SEO policy: public hubs index, app routes
// noindex — kept in sync on every pushState/popstate.
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

/** Alt+1..5 / M / P / T / K route shortcuts — skip editable targets. */
function CommandShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true']"),
      );
      if (
        isEditing ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;

      const path = getShortcutPath(event.key);
      if (!path) return;

      event.preventDefault();
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

// QueryClientProvider must wrap WagmiConfigProvider so RainbowKit's react-query hooks resolve their client
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiConfigProvider>
        <UiStoreProvider>
          <BrowserRouter>
            <App />
            <CommandShortcuts />
          </BrowserRouter>
        </UiStoreProvider>
      </WagmiConfigProvider>
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
    </QueryClientProvider>
  </StrictMode>,
);
