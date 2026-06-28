import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther } from 'viem';
import { useAgents } from '../hooks/useAgents.js';
import { useVaultDataBatch, type VaultDataEntry } from '../hooks/useVaultDataBatch.js';
import { usePerformanceBatch } from '../hooks/usePerformanceBatch.js';
import type { PerformanceMetrics } from '@axiom/config/types/performance';
import { COLORS, Skeleton, Card, ErrorAlert, PageHeader, ConnectedGuard, Input, Button } from '../components/ui.js';

interface AgentCardStatusProps {
  vaultData: VaultDataEntry | undefined;
  metrics: PerformanceMetrics | undefined;
}

function AgentCardStatus({ vaultData, metrics }: AgentCardStatusProps) {
  if (!vaultData || vaultData.depositsWei === undefined) return null;
  const balance = formatEther(vaultData.depositsWei);
  const hasBalance = parseFloat(balance) > 0;
  const lastAction = metrics && metrics.totalTicks > 0
    ? metrics.buyCount > metrics.sellCount ? 'Mostly buy' : metrics.sellCount > metrics.buyCount ? 'Mostly sell' : 'Mixed'
    : null;
  return (
    <span style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, display: 'flex', gap: 'var(--space-sm)' }}>
      <span>{hasBalance ? `${parseFloat(balance).toFixed(2)} 0G` : 'No funds'}</span>
      {lastAction && (
        <span style={{ color: COLORS.textMuted }} title="Summary of all historical ticks; for the latest action, open the agent detail.">
          · {lastAction}
        </span>
      )}
    </span>
  );
}

export function AgentsBrowser(): ReactElement {
  const { isConnected } = useAccount();
  const { agents, isLoading, error } = useAgents();
  const tokenIds = useMemo(() => agents.map(a => a.tokenId), [agents]);
  const { data: vaultDataMap } = useVaultDataBatch(tokenIds);
  const { data: perfMap } = usePerformanceBatch(tokenIds);
  const count = agents.length;
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setSearchTerm(e.target.value);
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedSearch(e.target.value), 200);
  }

  useEffect(() => () => clearTimeout(debounceTimerRef.current), []);

  const filteredAgents = useMemo(
    () => debouncedSearch
      ? agents.filter(a =>
          a.tokenId?.toString().includes(debouncedSearch) ||
          a.owner?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (a.dataDescription && a.dataDescription.toLowerCase().includes(debouncedSearch.toLowerCase()))
        )
      : agents,
    [debouncedSearch, agents]
  );

  if (error !== null) {
    return (
      <main>
        <PageHeader title="Your Agents" />
        <ErrorAlert message="Couldn't load your agents from the chain. Check your connection and try again." onRetry={() => window.location.reload()} />
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
        <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'left' }}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--fw-semibold)', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>
            Axiom Protocol
          </h2>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0 }}>
            Own your AI strategy on-chain
          </p>
          <p style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)', margin: '0.5rem 0 0', lineHeight: '1.4' }}>
            Mint an ERC-7857 iNFT to tokenize your AI strategy as a transferable on-chain asset. Connect your wallet to get started.
          </p>
        </div>
        <PageHeader title="Your Agents" />
        {!isConnected ? (
          <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
            <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-lg)' }}>
              Connect your wallet to get started
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ConnectButton />
            </div>
          </Card>
        ) : (
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
          <Link to="/agents/new">
            <Button variant="primary">Mint your first agent</Button>
          </Link>
        </Card>
        )}
      </main>
    );
  }


  return (
    <main>
      <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'left' }}>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--fw-semibold)', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>
          Axiom Protocol
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0 }}>
          Own your AI strategy on-chain
        </p>
        <p style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)', margin: '0.5rem 0 0', lineHeight: '1.4' }}>
          Your agents are listed below. Click to view details, execute strategies, or transfer.
        </p>
      </div>
      <ConnectedGuard>
      <PageHeader
        title="Your Agents"
        action={<Link to="/agents/new"><Button variant="secondary">+ Mint</Button></Link>}
      />
      <label htmlFor="agent-search" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)' }}>Search Agents</label>
      <Input
        id="agent-search"
        ref={searchRef}
        type="text"
        placeholder="Search agents by ID or owner... (⌘K)"
        value={searchTerm}
        onChange={handleSearchChange}
        style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
      />
      {agents.length === 0 ? (
        <p style={{ color: COLORS.textDim, textAlign: 'center', margin: 'var(--space-2xl) 0' }}>No agents found for this wallet</p>
      ) : filteredAgents.length === 0 ? (
        <p style={{ color: COLORS.textDim, textAlign: 'center', margin: 'var(--space-2xl) 0' }}>No agents match your search</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredAgents.map(agent => (
            <div
              key={agent.tokenId}
              className="agent-card"
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                background: COLORS.surface,
                color: COLORS.text,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: `1px solid ${COLORS.border}`,
                transition: 'border-color 0.18s ease',
                overflow: 'hidden',
                minWidth: 0,
                gap: 'var(--space-md)',
              }}
            >
              <Link
                to={`/agents/${agent.tokenId}`}
                style={{ overflow: 'hidden', minWidth: 0, textDecoration: 'none', color: 'inherit', flex: 1 }}
              >
                {agent.dataDescription && agent.dataDescription !== '' && (
                  <span style={{ color: COLORS.text, fontWeight: 'var(--fw-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', minWidth: 0 }}>{agent.dataDescription}</span>
                )}
                <span style={{ color: COLORS.textMuted, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', minWidth: 0 }}>Agent #{agent.tokenId.toString()}</span>
                <AgentCardStatus vaultData={vaultDataMap.get(agent.tokenId.toString())} metrics={perfMap.get(agent.tokenId.toString())} />
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
                <span style={{ color: COLORS.textDim, fontSize: '0.875rem' }}>
                  {agent.owner?.slice(0, 6)}...{agent.owner?.slice(-4)}
                </span>
                <Link to={`/agents/${agent.tokenId}#execute`}>
                  <Button variant="ghost" style={{ fontSize: 'var(--text-xs)', padding: '0.25rem 0.5rem' }}>Execute ▶</Button>
                </Link>
                <Link to={`/agents/${agent.tokenId}#payments`}>
                  <Button variant="ghost" style={{ fontSize: 'var(--text-xs)', padding: '0.25rem 0.5rem' }}>Payments</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      </ConnectedGuard>
    </main>
  );
}

export default AgentsBrowser;
