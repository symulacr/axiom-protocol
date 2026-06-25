import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgents } from '../hooks/useAgents.js';
import { COLORS, Skeleton, Card, Alert, ErrorAlert, PageHeader, ConnectedGuard } from '../components/ui.js';

export function AgentsBrowser(): ReactElement {
  const { address } = useAccount();
  const { agents, isLoading, error } = useAgents();
  const count = agents.length;
  const [searchTerm, setSearchTerm] = useState('');
  const filteredAgents = useMemo(
    () => searchTerm
      ? agents.filter(a =>
          a.tokenId?.toString().includes(searchTerm) ||
          a.owner?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : agents,
    [searchTerm, agents]
  );

  if (error !== null) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <ErrorAlert message="Couldn't load your agents from the chain. Check your connection and try again." />
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
      <p style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
        <Link to="/" style={{ color: COLORS.textDim, textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back
        </Link>
      </p>
      <ConnectedGuard>
      <PageHeader
        title="Your Agents"
        subtitle={`${countLabel} owned by ${address !== undefined ? `${address.slice(0, 6)}\u2026${address.slice(-4)}` : 'this wallet'}`}
      />
      <label htmlFor="agent-search" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)' }}>Search Agents</label>
      <input
        id="agent-search"
        type="text"
        placeholder="Search agents by ID or owner..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
          border: `1px solid ${COLORS.border}`, background: COLORS.surface,
          color: COLORS.text, marginBottom: 16, boxSizing: 'border-box' }}
      />
      {agents.length === 0 ? (
        <p style={{ color: COLORS.textDim, textAlign: 'center', margin: 'var(--space-2xl) 0' }}>No agents found for this wallet</p>
      ) : filteredAgents.length === 0 ? (
        <p style={{ color: COLORS.textDim, textAlign: 'center', margin: 'var(--space-2xl) 0' }}>No agents match your search</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredAgents.map(agent => (
            <Link
              key={agent.tokenId}
              to={`/agents/${agent.tokenId}`}
              className="agent-card"
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                background: COLORS.surface,
                color: COLORS.text,
                textDecoration: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: `1px solid ${COLORS.border}`,
                transition: 'border-color 0.18s ease',
              }}

            >
              <span style={{ fontWeight: 'var(--fw-semibold)' }}>Agent #{agent.tokenId}</span>
              <span style={{ color: COLORS.textDim, fontSize: '0.875rem' }}>
                {agent.owner?.slice(0, 6)}...{agent.owner?.slice(-4)}
              </span>
            </Link>
          ))}
        </div>
      )}
      </ConnectedGuard>
    </main>
  );
}

export default AgentsBrowser;
