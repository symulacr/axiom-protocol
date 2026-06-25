import { type ReactElement } from 'react';
import { BACKEND_URL } from '../config/env.js';
import { COLORS } from './ui.js';
import { useHealth } from '../hooks/useHealth.js';

export function HealthBadge(): ReactElement {
  const { data, isLoading, isError } = useHealth();

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

  const status = !data ? (isLoading ? 'unknown' : 'down') : data.ok ? 'ok' : 'down';

  const dotColor =
    status === 'ok' ? COLORS.success : status === 'down' ? COLORS.danger : COLORS.textDim;
  const label =
    status === 'ok'
      ? 'Backend healthy'
      : status === 'down'
        ? 'Backend unreachable'
        : 'Checking backend status';
  const statusText =
    status === 'ok' ? 'Online' : status === 'down' ? 'Offline' : 'Connecting';

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
          background: dotColor,
          boxShadow: `0 0 6px ${dotColor}66`,
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
      />
      <span>{statusText}</span>
      {data && (
        <>
          <span aria-hidden="true" style={{ width: 1, height: 14, background: COLORS.border, margin: '0 2px' }} />
          <span>#{data.chainHead}</span>
          <span style={{ color: data.oracle === 'up' ? COLORS.success : COLORS.danger }}>
            Oracle {data.oracle === 'up' ? '✓' : '✗'}
          </span>
        </>
      )}
    </span>
  );
}

export default HealthBadge;
