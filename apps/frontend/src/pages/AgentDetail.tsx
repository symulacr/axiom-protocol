import { useState, useMemo, useRef, useEffect, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgentMetadata } from '../hooks/useAgentMetadata.js';
import { useEventHistory } from '../hooks/useEventHistory.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { useHealth } from '../hooks/useHealth.js';
import { EventTimeline } from '../components/EventTimeline.js';
import { ExecutePanel } from '../components/ExecutePanel.js';
import { PaymentPanel } from '../components/PaymentPanel.js';
import { TransferModal } from '../components/TransferModal.js';
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
  ConnectedGuard,
} from '../components/ui.js';
import { PLACEHOLDER, truncateHex, parseTokenId } from '../utils/format.js';

export function AgentDetail(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  const { address } = useAccount();

  const metadata = useAgentMetadata(tokenId ?? 0n);
  const { data, isLoading: metaLoading, error: metaError } = metadata;

  const { events, refetch } = useEventHistory({ pollIntervalMs: 15_000 });

  const { events: wsEvents } = useEventStream({ topics: ['*'] });
  const health = useHealth();

  // Debounced refetch on WS event — keeps the timeline fresh between polls
  useEffect(() => {
    if (wsEvents.length === 0) return;
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [wsEvents, refetch]);

  const agentEvents = useMemo(
    () => events.filter(ev => String((ev.payload as Record<string, unknown>)?.tokenId) === tokenId?.toString()),
    [events, tokenId],
  );

  const [transferOpen, setTransferOpen] = useState(false);

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
      <PageHeader
        title={data?.dataDescription ?? `Agent #${tokenId.toString()}`}
      />

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

      {data !== null && (
        <Card style={{ marginBottom: 'var(--space-xl)' }}>
          <SectionTitle>Metadata</SectionTitle>
          <dl className="stack-on-mobile" style={{ margin: 0, display: 'grid', gridTemplateColumns: '8.75rem 1fr', gap: 'var(--space-md) var(--space-lg)', fontSize: 'var(--text-sm)' }}>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Collection</dt>
            <dd style={{ margin: 0, color: COLORS.text }}>
              {data.name === '' ? PLACEHOLDER : data.name}{' '}
              {data.symbol !== '' && (
                <span style={{ color: COLORS.textMuted }}>({data.symbol})</span>
              )}
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Owner</dt>
            <dd style={{ margin: 0 }}>
              <MonoLabel>{data.owner}</MonoLabel>
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Creator</dt>
            <dd style={{ margin: 0 }}>
              {data.creator !== undefined ? <MonoLabel>{data.creator}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Data Hash</dt>
            <dd style={{ margin: 0 }}>
              <MonoLabel title={data.dataHash}>{truncateHex(data.dataHash)}</MonoLabel>
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Description</dt>
            <dd style={{ margin: 0, color: COLORS.text }}>
              {data.dataDescription === '' ? <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span> : data.dataDescription}
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Token URI</dt>
            <dd style={{ margin: 0 }}>
              {data.tokenUri === '' ? <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span> : <MonoLabel>{data.tokenUri}</MonoLabel>}
            </dd>
            <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Oracle</dt>
            <dd style={{ margin: 0 }}>
              {health.data ? (
                <MonoLabel style={{ color: health.data.oracle === 'up' ? COLORS.success : COLORS.danger }}>
                  TEE {health.data.oracle === 'up' ? '✓' : '✗'}
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

      {agentEvents.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-xl)' }}>
          <SectionTitle>Agent Activity</SectionTitle>
          <EventTimeline
            events={agentEvents}
            renderEvent={(ev) => {
              if (ev.eventName === 'Tick') {
                const p = ev.payload as Record<string, unknown>;
                const action = String(p.action ?? '');
                const actionColor = action === 'buy' ? '#6b9e6b' : action === 'sell' ? '#c85a5a' : COLORS.textMuted;
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
      )}

      <SectionTitle style={{ marginBottom: 'var(--space-md)' }}>Execute Strategy</SectionTitle>
      <ExecutePanel tokenId={tokenId} />

      <details style={{ marginTop: 'var(--space-md)' }}>
        <summary style={{ cursor: 'pointer', color: COLORS.bronzeLight, fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-sm)' }}>
          Payments
        </summary>
        <div style={{ marginTop: 'var(--space-md)' }}>
          <PaymentPanel tokenId={tokenId} />
        </div>
      </details>

      {address !== undefined && (
        <p style={{ marginTop: 'var(--space-xl)', fontSize: 'var(--text-sm)', color: COLORS.textDim }}>
          Connected as <MonoLabel>{address}</MonoLabel>
        </p>
      )}


      {transferOpen && (
        <TransferModal
          tokenId={tokenId}
          onClose={(): void => setTransferOpen(false)}
          onSuccess={(): void => setTransferOpen(false)}
        />
      )}
      </ConnectedGuard>
    </main>
  );
}

export default AgentDetail;
