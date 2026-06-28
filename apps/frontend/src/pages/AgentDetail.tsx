import { lazy, Suspense, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgentMetadata } from '../hooks/useAgentMetadata.js';
import { useAgentEvents } from '../hooks/useAgentEvents.js';
import { usePerformance } from '../hooks/usePerformance.js';
import { useHealth } from '../hooks/useHealth.js';
const EventTimeline = lazy(() => import('../components/EventTimeline.js').then(m => ({ default: m.EventTimeline })));
const ExecutePanel = lazy(() => import('../components/ExecutePanel.js').then(m => ({ default: m.ExecutePanel })));
const PaymentPanel = lazy(() => import('../components/PaymentPanel.js').then(m => ({ default: m.PaymentPanel })));
const TransferModal = lazy(() => import('../components/TransferModal.js').then(m => ({ default: m.TransferModal })));
const DepositForm = lazy(() => import('../components/DepositForm.js').then(m => ({ default: m.DepositForm })));
const PerformanceMetrics = lazy(() => import('../components/PerformanceMetrics.js').then(m => ({ default: m.PerformanceMetrics })));
const TradeHistory = lazy(() => import('../components/TradeHistory.js').then(m => ({ default: m.TradeHistory })));
import { EmptyState } from '../components/EmptyState.js';
import {
  COLORS,
  Skeleton,
  Card,
  Button,
  SectionTitle,
  MonoLabel,
  Alert,
  ErrorAlert,
  PageHeader,
  HelpTip,
  ConnectedGuard,
} from '../components/ui.js';
import { PLACEHOLDER, truncateHex, parseTokenId } from '../utils/format.js';

export function AgentDetail(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  const { address, isConnected } = useAccount();

  const metadata = useAgentMetadata(tokenId ?? 0n);
  const { data, isLoading: metaLoading, error: metaError } = metadata;

  const { events: agentEvents } = useAgentEvents(tokenId);
  const { metrics, history: perfHistory } = usePerformance(tokenId);
  const health = useHealth();

  const [transferOpen, setTransferOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    const hash = window.location.hash.slice(1);
    return ['overview', 'execute', 'payments', 'activity', 'performance'].includes(hash) ? hash : 'overview';
  });

  const tokenIdBigInt = tokenId ?? 0n;

  if (tokenId === null) {
    return (
      <main>
        <Alert variant="error" style={{ marginBottom: 'var(--space-lg)' }}>
          Invalid token ID in the URL. The ID must be a positive integer.
        </Alert>
      </main>
    );
  }

  return (
    <main>
      <ConnectedGuard>
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <Link to="/agents" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', textDecoration: 'none' }}>← Agents</Link>
      </div>

      <PageHeader
        title={data?.dataDescription ?? `Agent #${tokenId.toString()}`}
      />

      <nav aria-label="Agent sections" style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 'var(--space-sm)' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'execute', label: 'Execute' },
          { id: 'payments', label: 'Payments' },
          { id: 'activity', label: 'Activity' },
          { id: 'performance', label: 'Performance' },
        ].map(s => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              type="button"
              style={{
                background: 'none',
                color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
                textDecoration: 'none',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                border: 'none',
                borderBottom: isActive ? `2px solid ${COLORS.bronzeLight}` : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.18s ease, border-color 0.18s ease',
              }}
              onClick={() => { setActiveSection(s.id); window.history.replaceState(null, '', `#${s.id}`); }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {metaLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </div>
      )}

      {metaError !== null && (
        <ErrorAlert message="Couldn't load agent metadata from the chain. Check your connection and try refreshing the page." onRetry={metadata.refetch} />
      )}

      {/* Overview tab: metadata + deposit + transfer */}
      {activeSection === 'overview' && (
        <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}><Skeleton height={200} /></div>}>
          {isConnected && <DepositForm tokenId={tokenIdBigInt} />}

          {data !== null && (
            <Card style={{ marginBottom: 'var(--space-xl)' }}>
              <SectionTitle>Metadata</SectionTitle>
              <dl className="stack-on-mobile" style={{ margin: 0, display: 'grid', gridTemplateColumns: '8.75rem 1fr', gap: 'var(--space-md) var(--space-lg)', fontSize: 'var(--text-sm)', minWidth: 0 }}>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Collection</dt>
                <dd style={{ margin: 0, color: COLORS.text, overflow: 'hidden', overflowWrap: 'break-word' }}>
                  {data.name === '' ? PLACEHOLDER : data.name}{' '}
                  {data.symbol !== '' && (
                    <span style={{ color: COLORS.textMuted }}>({data.symbol})</span>
                  )}
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Owner</dt>
                <dd style={{ margin: 0, overflow: 'hidden' }}>
                  <MonoLabel>{data.owner}</MonoLabel>
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Creator</dt>
                <dd style={{ margin: 0, overflow: 'hidden' }}>
                  {data.creator !== undefined ? <MonoLabel>{data.creator}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Data Hash</dt>
                <dd style={{ margin: 0, overflow: 'hidden' }}>
                  <MonoLabel title={data.dataHash}>{truncateHex(data.dataHash)}</MonoLabel>
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Description</dt>
                <dd style={{ margin: 0, color: COLORS.text, overflow: 'hidden', overflowWrap: 'break-word' }}>
                  {data.dataDescription === '' ? <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span> : data.dataDescription}
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Token URI</dt>
                <dd style={{ margin: 0, overflow: 'hidden' }}>
                  {data.tokenUri === '' ? <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span> : <MonoLabel>{data.tokenUri}</MonoLabel>}
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}><HelpTip tip="Trusted Execution Environment — the secure enclave that signs ownership proofs and re-encrypts agent data on transfer">TEE / Oracle</HelpTip></dt>
                <dd style={{ margin: 0, overflow: 'hidden' }}>
                  {health.data ? (
                    <MonoLabel style={{ color: health.data.oracle === 'up' ? COLORS.success : COLORS.danger }}>
                      TEE {health.data.oracle === 'up' ? 'Up ✓' : 'Down ✗'}
                    </MonoLabel>
                  ) : (
                    <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>
                  )}
                </dd>
              </dl>
            </Card>
          )}

          <Card style={{ marginBottom: 'var(--space-xl)' }}>
            <SectionTitle>Transfer</SectionTitle>
            <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-normal)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)' }}>
              Transfer ownership with cryptographic proof of integrity. The agent's
              encrypted intelligence is re-keyed on 0G Storage, and the receiver
              unwraps the sealed key inside a TEE.
            </p>
            <Button variant="primary" onClick={(): void => setTransferOpen(true)}>
              Transfer Agent
            </Button>
          </Card>
        </Suspense>
      )}

      {/* Execute tab: deposit (if needed) + execute */}
      {activeSection === 'execute' && (
        <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}><Skeleton height={200} /></div>}>
          <DepositForm tokenId={tokenIdBigInt} variant="warning" />
          <ExecutePanel tokenId={tokenId} />
        </Suspense>
      )}

      {/* Payments tab */}
      {activeSection === 'payments' && (
        <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}><Skeleton height={200} /></div>}>
          <PaymentPanel tokenId={tokenId} />
        </Suspense>
      )}

      {/* Activity tab */}
      {activeSection === 'activity' && (
        <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}><Skeleton height={200} /></div>}>
          {agentEvents.length > 0 ? (
            <Card style={{ marginBottom: 'var(--space-xl)' }}>
              <SectionTitle>Agent Activity</SectionTitle>
              <EventTimeline
                events={agentEvents}
                renderEvent={(ev) => {
                  if (ev.eventName === 'Tick') {
                    const p = ev.payload as Record<string, unknown>;
                    const action = String(p.action ?? '');
                    const actionColor = action === 'buy' ? COLORS.success : action === 'sell' ? COLORS.danger : COLORS.textMuted;
                    return (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                        <strong style={{ color: actionColor, textTransform: 'uppercase' }}>{action}</strong>
                        {p.amount !== undefined && p.amount !== null && <span style={{ color: COLORS.textMuted }}>amount: {String(p.amount)}</span>}
                        <span style={{ color: COLORS.textDim }}>{String(p.durationMs ?? '')}ms</span>
                      </div>
                    );
                  }
                  return <span style={{ color: COLORS.text }}>{ev.eventName}</span>;
                }}
              />
            </Card>
          ) : (
            <EmptyState>
              <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0 }}>
                No activity yet. Execute a strategy to see events here.
              </p>
            </EmptyState>
          )}
        </Suspense>
      )}

      {/* Performance tab */}
      {activeSection === 'performance' && (
        <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}><Skeleton height={200} /></div>}>
          {metrics !== null && metrics.totalTicks > 0 ? (
            <>
              <PerformanceMetrics metrics={metrics} />
              <TradeHistory history={perfHistory} />
            </>
          ) : (
            <EmptyState>
              <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0 }}>
                No strategy executions yet.{' '}
                <button
                  type="button"
                  onClick={() => setActiveSection('execute')}
                  style={{ background: 'none', border: 'none', color: COLORS.bronzeLight, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}
                >
                  Execute a strategy
                </button>
                {' '}to see performance data here.
              </p>
            </EmptyState>
          )}
        </Suspense>
      )}

      {address !== undefined && (
        <p style={{ marginTop: 'var(--space-xl)', fontSize: 'var(--text-sm)', color: COLORS.textDim }}>
          Connected as <MonoLabel>{address}</MonoLabel>
        </p>
      )}


      {transferOpen && (
        <Suspense fallback={null}>
          <TransferModal
            open={transferOpen}
            tokenId={tokenId}
            onClose={(): void => setTransferOpen(false)}
            onSuccess={(): void => setTransferOpen(false)}
          />
        </Suspense>
      )}
      </ConnectedGuard>
    </main>
  );
}

export default AgentDetail;
