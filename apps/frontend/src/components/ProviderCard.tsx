// Axiom Protocol — `ProviderCard` component.
//
// A small reusable card that renders a single compute provider's
// address, model, and a "Use this provider" button that navigates to
// `/agents/new?provider=0x...` so the AgentsBrowser / mint flow can
// pre-select the provider when the user creates a new agent.
//
// The address is shown in the standard EIP-55 checksum form (mixed
// case) when `getAddress` recognizes it as a valid 20-byte hex string;
// otherwise the raw input is rendered verbatim. The model and endpoint
// are left-truncated as needed to keep the card width bounded.
//
// Navigation uses the React Router v6+ imperative `useNavigate` hook
// rather than a declarative `<Link>` because the destination is a
// dynamic URL computed from the provider's on-chain address — the
// declarative API is more awkward for the build-the-URL-at-click-time
// case.
//
// Canonical references:
//  - React Router v6+ `useNavigate` (imperative navigation; returns a
//    function that pushes a new entry onto the history stack):
//    https://reactrouter.com/en/main/hooks/use-navigate
//  - React — JSX `onClick` handlers (typed as `MouseEventHandler`):
//    https://react.dev/reference/react-dom/components/common#react-event-object
//  - viem `getAddress` (EIP-55 checksum formatting; the same helper the
//    rest of the Axiom frontend uses to render 0G addresses):
//    https://viem.sh/docs/utilities/getAddress

import type { MouseEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAddress } from 'viem';

import type { Provider } from '../hooks/useProviders';

const buttonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 16px',
  border: `1px solid ${'#b8976e'}`,
  background: 'rgba(184, 151, 110, 0.08)',
  color: '#c5a880',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  transition: 'all 0.18s ease',
  fontFamily: 'inherit',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  minWidth: 260,
  background: '#1a1a1a',
  transition: 'all 0.18s ease',
};

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
    <article style={cardStyle} aria-label={`Provider ${addressLabel}`}>
      <div style={{ fontFamily: "'SF Mono', monospace", fontSize: 13, color: '#c5a880' }}>{addressLabel}</div>
      <div style={{ fontSize: 13, color: '#e5e5e5', fontWeight: 500 }}>{provider.model}</div>
      <div
        style={{
          fontSize: 11,
          color: '#6a6a6a',
          fontFamily: "'SF Mono', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={provider.endpoint}
      >
        {provider.endpoint}
      </div>
      <button type="button" style={buttonStyle} onClick={onUse}>
        Use this provider
      </button>
    </article>
  );
}

export default ProviderCard;
