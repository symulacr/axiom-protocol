import { useEffect, useState } from "react";
import { apiFetch } from "../utils/apiFetch.js";
import { APP_CHAIN_ID } from "../config/wagmi.js";

export interface LandingStats {
  /** Total minted agents (on-chain registry); null while loading or on error. */
  agentsOnline: number | null;
  /** Chain the build is configured for (APP_CHAIN_ID) — never hardcoded. */
  networkChain: number;
}

/**
 * Fetches `/v1/agents/stats` (client-reachable, 60s backend cache) for the
 * real on-chain mint count and exposes the configured chain id. The count
 * stays null ("—") when the request fails — a fabricated fallback read as
 * live data, and a hardcoded mainnet chain id on a testnet build, were
 * the papercut this replaces.
 */
export function useLandingStats(): LandingStats {
  const [stats, setStats] = useState<LandingStats>({
    agentsOnline: null,
    networkChain: APP_CHAIN_ID,
  });
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ totalMinted?: number }>("/v1/agents/stats")
      .then((res) => {
        if (cancelled) return;
        if (
          typeof res.totalMinted === "number" &&
          Number.isFinite(res.totalMinted)
        ) {
          setStats({
            agentsOnline: res.totalMinted,
            networkChain: APP_CHAIN_ID,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
