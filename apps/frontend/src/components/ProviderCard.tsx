// Axiom Protocol — `ProviderCard` component.

import type { MouseEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAddress } from 'viem';

import type { Provider } from '../hooks/useProviders';
import { Card, Button, MonoLabel, COLORS } from './ui.js';

/** Best-effort EIP-55 checksum; falls back to the raw input on failure. */
function formatAddress(raw: `0x${string}`): string {
  try {
    return getAddress(raw);
  } catch {
    return raw;
  }
}

export function ProviderCard({ provider }: { provider: Provider }): ReactElement {
  const navigate = useNavigate();
  const addressLabel = formatAddress(provider.address);

  const onUse = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    navigate(`/agents/new?provider=${provider.address}`);
  };

  return (
    <Card hover>
      <MonoLabel>{addressLabel}</MonoLabel>
      <div style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: 500 }}>{provider.model}</div>
      <div
        style={{
          fontSize: 11,
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
      <Button variant="secondary" onClick={onUse}>
        Use this provider
      </Button>
    </Card>
  );
}

export default ProviderCard;
