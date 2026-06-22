// Axiom Protocol — `<HealthBadge />` header indicator.
//
// A tiny green/red dot rendered next to the ConnectButton in the top
// nav. Every 30 s it pings `${VITE_BACKEND_URL}/v1/health` and flips the dot
// between green (200 + `ok: true`) and red (any other outcome: network
// error, non-2xx, parse error). The backend's health route returns
// `{"ok": true, "signer": "<address>"}`; we only require `ok === true`
// for the green state, so a degraded backend that still returns 200
// with `ok: false` is correctly flagged as red.
//
// The polling is implemented with `setInterval` registered in a
// `useEffect` and torn down in the effect's cleanup function, per the
// React `useEffect` reference:
//   https://react.dev/reference/react/useEffect
//
// The fetch uses the standard browser Fetch API:
//   https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
//
// The API base URL is read from Vite's `VITE_BACKEND_URL` env var (the
// `VITE_` prefix keeps it visible to the browser bundle per Vite's
// env-var convention):
//   https://vitejs.dev/guide/env-and-mode

import { useEffect, useState, type ReactElement } from 'react';

/** Status of the backend health probe; maps directly to the dot color. */
type HealthStatus = 'unknown' | 'ok' | 'down';

const POLL_INTERVAL_MS = 30_000;
/** Default backend loopback for local dev (matches `apps/backend` `pnpm dev`). */
const DEFAULT_API_URL = 'http://127.0.0.1:3000';
/** Total time we wait for the health endpoint before giving up. */
const REQUEST_TIMEOUT_MS = 5_000;

/** Resolved backend base URL (Vite env var, with a local-dev fallback). */
const API_URL = import.meta.env.VITE_BACKEND_URL ?? DEFAULT_API_URL;

/**
 * Probe the backend health endpoint once. Returns `true` only on a
 * 2xx response whose JSON body has `ok === true`. Any other outcome
 * (network error, non-2xx, parse error, shape mismatch, timeout) is
 * reported as `false` so the dot turns red.
 */
async function checkHealth(signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/v1/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: unknown };
    return data?.ok === true;
  } catch {
    return false;
  }
}

export function HealthBadge(): ReactElement {
  // Start in the "unknown" state so we don't flash a green dot before
  // the first probe lands. The first probe runs in the effect below.
  const [status, setStatus] = useState<HealthStatus>('unknown');

  useEffect(() => {
    let cancelled = false;

    // AbortController is recreated on cleanup so each poll's timeout
    // doesn't leak a pending fetch into the next tick.
    let controller: AbortController | undefined;

    const tick = (): void => {
      controller?.abort();
      controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller?.abort(),
        REQUEST_TIMEOUT_MS,
      );
      checkHealth(controller.signal)
        .then((ok) => {
          if (cancelled) return;
          setStatus(ok ? 'ok' : 'down');
        })
        .catch(() => {
          if (cancelled) return;
          setStatus('down');
        })
        .finally(() => clearTimeout(timeoutId));
    };

    // Run one probe immediately so the dot picks up a real color
    // within ~1 s of the page mounting, then poll every 30 s.
    tick();
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      controller?.abort();
    };
  }, []);

  const color =
    status === 'ok' ? '#16a34a' : status === 'down' ? '#dc2626' : '#9ca3af';
  const label =
    status === 'ok'
      ? 'Backend healthy'
      : status === 'down'
        ? 'Backend unreachable'
        : 'Backend status unknown';

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      title={`${label} (${API_URL})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 9999,
        fontSize: 12,
        color: '#374151',
        background: '#f3f4f6',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 2px ${color}33`,
        }}
      />
      <span>{status === 'ok' ? 'API' : status === 'down' ? 'API down' : 'API…'}</span>
    </span>
  );
}

export default HealthBadge;
