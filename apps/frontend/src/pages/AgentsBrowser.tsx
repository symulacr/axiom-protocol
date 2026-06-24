import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgents } from '../hooks/useAgents.js';
import { COLORS, Skeleton, Card, Alert, PageHeader, ConnectedGuard } from '../components/ui.js';

export function AgentsBrowser(): ReactElement {
  const { address } = useAccount();
  const { agents, isLoading, error } = useAgents();
  const count = agents.length;

  if (error !== null) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <Alert variant="error">
          Couldn't load your agents from the chain. Check your connection and try again.
        </Alert>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      </main>
    );
  }

  if (count === 0) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '3rem',
            height: '3rem',
            borderRadius: '50%',
            background: COLORS.bronzeBg,
            border: `1px solid ${COLORS.bronzeBorder}`,
            marginBottom: 'var(--space-lg)',
          }}>
            <span style={{ fontSize: 'var(--text-lg)', color: COLORS.bronzeLight }}>+</span>
          </div>
          <p style={{ color: COLORS.textPrimary, fontSize: 'var(--text-base)', margin: '0 0 0.5rem', fontWeight: 'var(--fw-semibold)' }}>
            No agents yet
          </p>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            Mint your first iNFT to tokenize an AI strategy as an ownable, transferable on-chain asset.
          </p>
          <Link to="/agents/new" style={{
            display: 'inline-block',
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: COLORS.bronze,
            color: '#0f0f0f',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--fw-semibold)',
            textDecoration: 'none',
            transition: 'all 0.18s ease',
          }}>
            Mint your first agent
          </Link>
        </Card>
      </main>
    );
  }

  const countLabel = count === 1 ? '1 iNFT' : `${count} iNFTs`;

  return (
    <main>
      <ConnectedGuard>
      <PageHeader
        title="Your Agents"
        subtitle={`${countLabel} owned by ${address !== undefined ? `${address.slice(0, 6)}\u2026${address.slice(-4)}` : 'this wallet'}`}
      />
      <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
        <p style={{ color: COLORS.textPrimary, fontSize: 'var(--text-lg)', margin: '0 0 0.5rem', fontWeight: 'var(--fw-semibold)' }}>
          {countLabel}
        </p>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          Token-level details are not available on-chain (the contract does not support enumeration). Connect to the backend event store for a full token listing.
        </p>
      </Card>
      </ConnectedGuard>
    </main>
  );
}

export default AgentsBrowser;
