import type { MouseEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAddress } from 'viem';

import type { Provider } from '../hooks/useProviders';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Card, Button, MonoLabel, COLORS } from './ui.js';

/** Best-effort EIP-55 checksum; falls back to the raw input on failure. */
function formatAddress(raw: `0x${string}`): string {
  try {
    return getAddress(raw);
  } catch (err) {
    console.warn('[ProviderCard] parse error:', err);
    return raw;
  }
}

export function ProviderCard({ provider }: { provider: Provider }): ReactElement {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const addressLabel = formatAddress(provider.address);

  const onUse = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    navigate(`/agents/new?provider=${provider.address}`);
  };

  return (
    <Card hover style={isMobile ? { width: '100%' } : undefined}>
      <MonoLabel>{addressLabel}</MonoLabel>
      <div style={{ fontSize: 'var(--text-sm)', color: COLORS.textPrimary, fontWeight: 'var(--fw-medium)' }}>{provider.model}</div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: COLORS.textDim,
          fontFamily: "'SF Mono', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={provider.endpoint}
      >
        {provider.endpoint}
      </div>
      {provider.price && (
        <div style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted }}>
          {provider.price} OG/token
        </div>
      )}
      <Button variant="secondary" onClick={onUse}>
        Use this provider
      </Button>
    </Card>
  );
}

export default ProviderCard;
