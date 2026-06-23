// Axiom Protocol — `<HealthBadge />` header indicator.
//
// Green/red dot that polls `${VITE_BACKEND_URL}/v1/health` every 30 s
// and flips between green (200 + `ok: true`) and red (any other outcome).

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
    status === 'ok' ? '#6b9e6b' : status === 'down' ? '#c85a5a' : '#6a6a6a';
  const label =
    status === 'ok'
      ? 'Backend healthy'
      : status === 'down'
        ? 'Backend unreachable'
        : 'Checking backend status';

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      title={`${label} (${API_URL})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        color: '#8a8a8a',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid #2a2a2a',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}66`,
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
      />
      <span>{status === 'ok' ? 'Online' : status === 'down' ? 'Offline' : 'Connecting'}</span>
    </span>
  );
}

export default HealthBadge;
