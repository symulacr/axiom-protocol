// Axiom Protocol — agents browser (`/agents` route).
//
// Lists every ERC-721 tokenId owned by the connected wallet on
// AxiomAgentNFT. Each row links to the corresponding
// `/agents/:tokenId` detail page. The on-chain enumeration is done
// by the shared `useAgents()` hook (apps/frontend/src/hooks/
// useAgents.ts), which multicalls `balanceOf` + per-index
// `tokenOfOwnerByIndex` + per-token `tokenURI` against the
// `erc721Abi` / `axiomAgentNftAbi`.
//
// Canonical references:
//   - EIP-721 (balanceOf, ownerOf, tokenOfOwnerByIndex via
//     ERC-721Enumerable):
//     https://eips.ethereum.org/EIPS/eip-721
//   - wagmi v2 useReadContracts (multicall, allowFailure, isLoading):
//     https://wagmi.sh/react/hooks/useReadContracts
//   - wagmi v2 useAccount (isConnected, address):
//     https://wagmi.sh/react/hooks/useAccount
//   - React Router v6/v7 <Link> (declarative SPA navigation):
//     https://reactrouter.com/en/main/components/link
//
// Connection states:
//   - !isConnected       → "Connect wallet to view your agents".
//   - connected, 0 agents → "No agents yet. Mint one from a vault."
//   - connected, N agents → <ul> of <Link to={`/agents/${id}`}> items.

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
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ color: COLORS.textMuted, fontSize: 15, margin: '0 0 16px', fontWeight: 300 }}>
            You don't own any iNFT agents yet.
          </p>
          <Link to="/agents/new" style={{ color: COLORS.bronzeLight, fontSize: 14, fontWeight: 600 }}>
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
