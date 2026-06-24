import { useCallback, useState, type ReactElement } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { usePoll } from '../hooks/usePoll.js';
import { BACKEND_URL } from '../config/env.js';

type HealthStatus = 'unknown' | 'ok' | 'down';

async function checkHealth(signal: AbortSignal): Promise<boolean> {
  try {
    const data = await apiFetch<{ ok?: unknown }>('/health', { signal, timeout: 5000 });
    return data?.ok === true;
  } catch {
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

  usePoll(checkHealth, handleResult, handleError, {
    intervalMs: 30000,
    enabled: true,
  });

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
      title={`${label} (${BACKEND_URL})`}
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
