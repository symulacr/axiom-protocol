/*
  Payment-token metadata (symbol + decimals), resolved ONCE from the backend
  payment config (GET /v1/payment/config → token-contract reads, server-cached
  5 min) and memoized at module scope. The UI never hardcodes a
  token unit — the payment form suffix, the review-sheet confirm CTA and the
  agent-page fact rows all read this one source, so they cannot disagree, and
  they are correct on any deployment (on Galileo the payment token's on-chain
  symbol is axmUSDC, not the previously hardcoded "USDC").
*/
import { useEffect, useState } from "react";
import { apiFetch } from "../utils/apiFetch.js";

export type PaymentTokenMeta = { symbol: string; decimals: number };

/** Neutral unit placeholder while the config fetch is in flight (or when the
 * backend is unreachable — the flow's allowance/execute path needs the same
 * endpoint, so a down backend blocks execution anyway). Every consumer uses
 * this SAME fallback, so the form and the confirm CTA never diverge. */
export const PAYMENT_SYMBOL_PENDING = "…";

type PaymentConfigResponse = {
  paymentToken: string;
  paymentTokenSymbol?: string;
  paymentTokenDecimals?: number;
};

let cached: PaymentTokenMeta | null = null;
let inflight: Promise<PaymentTokenMeta | null> | null = null;

function fetchMeta(): Promise<PaymentTokenMeta | null> {
  inflight ??= apiFetch<PaymentConfigResponse>("/v1/payment/config", {
    method: "GET",
  })
    .then((config) => {
      cached = config.paymentTokenSymbol
        ? {
            symbol: config.paymentTokenSymbol,
            decimals: config.paymentTokenDecimals ?? 6,
          }
        : null;
      return cached;
    })
    .catch(() => {
      inflight = null; // allow a retry on the next mount
      return null;
    });
  return inflight;
}

/** Payment-token metadata; null until the first successful read resolves. */
export function usePaymentToken(): PaymentTokenMeta | null {
  const [meta, setMeta] = useState<PaymentTokenMeta | null>(cached);
  useEffect(() => {
    if (cached) {
      setMeta(cached);
      return;
    }
    let alive = true;
    void fetchMeta().then((resolved) => {
      if (alive) setMeta(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}

/** Display symbol with the shared pending fallback. */
export function paymentSymbolOf(meta: PaymentTokenMeta | null): string {
  return meta?.symbol ?? PAYMENT_SYMBOL_PENDING;
}
