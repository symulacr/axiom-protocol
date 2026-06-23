// Axiom Protocol — agents browser (`/agents` route).
//
// Lists ERC-721 tokenIds owned by the connected wallet on AxiomAgentNFT
// via the shared `useAgents()` hook. Each row links to `/agents/:tokenId`.

import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgents } from '../hooks/useAgents.js';
import { COLORS, Skeleton, Card, Alert, PageHeader, MonoLabel, SectionTitle } from '../components/ui.js';

export function AgentsBrowser(): ReactElement {
  const { isConnected, address } = useAccount();
  const { agents, isLoading, error } = useAgents();

  if (!isConnected) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ color: COLORS.textMuted, fontSize: 15, margin: 0, fontWeight: 300 }}>
            Connect your wallet to view the iNFTs you own.
          </p>
        </Card>
      </main>
    );
  }

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

  if (isLoading && agents.length === 0) {
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

  if (agents.length === 0) {
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

  return (
    <main>
      <PageHeader
        title="Your Agents"
        subtitle={`${agents.length} iNFT${agents.length === 1 ? '' : 's'} owned by ${address !== undefined ? `${address.slice(0, 6)}\u2026${address.slice(-4)}` : 'this wallet'}`}
      />
      <SectionTitle>Owned Tokens</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {agents.map((agent) => (
          <Link
            key={agent.tokenId.toString()}
            to={`/agents/${agent.tokenId.toString()}`}
            style={{ textDecoration: 'none' }}
          >
            <Card hover style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: COLORS.bronzeBg,
                    border: `1px solid ${COLORS.bronzeBorder}`,
                    color: COLORS.bronzeLight,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  #{agent.tokenId.toString()}
                </span>
                {agent.uri !== '' && <MonoLabel style={{ fontSize: 12 }}>{agent.uri}</MonoLabel>}
              </div>
              <span style={{ color: COLORS.textDim, fontSize: 13 }}>
                View details
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default AgentsBrowser;
