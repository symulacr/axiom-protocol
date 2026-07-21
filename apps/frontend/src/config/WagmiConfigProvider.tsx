"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { createWagmiConfig } from "./wagmi";
import { COLORS } from "../components/ui.js";

const RainbowKitProvider = lazy(() =>
  import("@rainbow-me/rainbowkit").then((m) => {
    const Provider = m.RainbowKitProvider;
    const theme = m.darkTheme({
      accentColor: COLORS.bronze,
      accentColorForeground: COLORS.bg,
      borderRadius: "medium",
      fontStack: "system",
      overlayBlur: "small",
    });
    return {
      default: ({ children }: { children: ReactNode }) => (
        <Provider theme={theme} locale="en">{children}</Provider>
      ),
    };
  }),
);

const WATCHED_KEYS = new Set(["axiom.wcProjectId", "axiom.rpcUrl"]);

export function WagmiConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(() => createWagmiConfig());

  useEffect(() => {
    const refresh = () => setConfig(createWagmiConfig());

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || WATCHED_KEYS.has(event.key)) {
        refresh();
      }
    };

    const onConfigChanged = () => refresh();

    window.addEventListener("storage", onStorage);
    window.addEventListener("axiom:config-changed", onConfigChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("axiom:config-changed", onConfigChanged);
    };
  }, []);

  return (
    <WagmiProvider config={config}>
      <Suspense fallback={null}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </Suspense>
    </WagmiProvider>
  );
}