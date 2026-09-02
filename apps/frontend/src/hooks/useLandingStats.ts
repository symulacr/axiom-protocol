import { useEffect, useState } from "react";
import { apiFetch } from "../utils/apiFetch.js";

export interface LandingStats {
  /** Total agents online; null while loading. */
  agentsOnline: number | null;
  /** Chain id (default 16661 = Aristotle mainnet); null while loading. */
  networkChain: number | null;
}

const PLACEHOLDER: LandingStats = { agentsOnline: 7412, networkChain: 16661 };

/**
 * Fetches `/v1/agents?limit=1` on mount and returns the total count + chain id.
 * Falls back to placeholder values when the request fails or returns a non-numeric total.
 * Used by the signed-out Landing to populate the hero meta strip + journey card meta.
 */
export function useLandingStats(): LandingStats {
  const [stats, setStats] = useState<LandingStats>({
    agentsOnline: null,
    networkChain: null,
  });
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ total?: number }>("/v1/agents?limit=1")
      .then((res) => {
        if (cancelled) return;
        if (typeof res.total === "number" && Number.isFinite(res.total)) {
          setStats({
            agentsOnline: res.total,
            networkChain: PLACEHOLDER.networkChain,
          });
        } else {
          setStats(PLACEHOLDER);
        }
      })
      .catch(() => {
        if (!cancelled) setStats(PLACEHOLDER);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
