import { useCallback, useState, type ReactElement } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { usePoll } from '../hooks/usePoll.js';
import { BACKEND_URL } from '../config/env.js';
import { COLORS } from './ui.js';

type HealthStatus = 'unknown' | 'ok' | 'down';

async function checkHealth(signal: AbortSignal): Promise<boolean> {
  try {
    const data = await apiFetch<{ ok?: unknown }>('/health', { signal, timeout: 5000 });
    return data?.ok === true;
  } catch (err) {
    console.warn('[HealthBadge] Health check failed:', err);
    return false;
  }
}

export function HealthBadge(): ReactElement {
  const [status, setStatus] = useState<HealthStatus>('unknown');

  const handleResult = useCallback((ok: boolean) => {
    setStatus(ok ? 'ok' : 'down');
  }, []);

  const handleError = useCallback(() => {
    setStatus('down');
  }, []);

  const isLocalhost = BACKEND_URL.includes('127.0.0.1') || BACKEND_URL.includes('localhost');
  if (isLocalhost) {
    return (
      <span role="status" aria-label="Local development" title={`Backend: ${BACKEND_URL}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px',
          borderRadius: 'var(--radius-xl)', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-medium)',
          color: COLORS.textMuted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.border}` }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.textDim }} />
        <span>Local</span>
      </span>
    );
  }

  usePoll(checkHealth, handleResult, handleError, {
    intervalMs: 30000,
    enabled: true,
  });

  const color =
    status === 'ok' ? COLORS.success : status === 'down' ? COLORS.danger : COLORS.textDim;
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
      title={`${label} (${BACKEND_URL})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 10px',
        borderRadius: 'var(--radius-xl)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--fw-medium)',
        color: COLORS.textMuted,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${COLORS.border}`,
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
