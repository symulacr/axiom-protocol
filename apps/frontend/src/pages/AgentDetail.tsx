import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useAgentMetadata } from '../hooks/useAgentMetadata.js';
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

  const [transferOpen, setTransferOpen] = useState(false);

  if (tokenId === null) {
    return (
      <main>
        <Alert variant="error" style={{ marginBottom: 'var(--space-lg)' }}>
          Invalid token ID in the URL. The ID must be a positive integer.
        </Alert>
        <Link to="/agents" style={{ color: COLORS.bronzeLight, fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)' }}>
          Back to agents
        </Link>
      </main>
    );
  }

  return (
    <main>
      <ConnectedGuard>
      <PageHeader
        title={`Agent #${tokenId.toString()}`}
        subtitle="On-chain iNFT metadata and transfer history"
        action={
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <Link
              to={`/agents/${tokenId.toString()}/execute`}
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                background: COLORS.bronze,
                color: '#0f0f0f',
                textDecoration: 'none',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--fw-semibold)',
              }}
            >
              Execute Strategy
            </Link>
            <Link
              to="/agents"
              style={{
                color: COLORS.textMuted,
                fontSize: 'var(--text-sm)',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
            >
              Back to agents
            </Link>
          </div>
        }
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

      <Link to={`/agents/${tokenId.toString()}/payments`} style={{ textDecoration: 'none' }}>
        <Card hover style={{ padding: 16, textAlign: 'center' }}>
          <SectionTitle>Manage Payments</SectionTitle>
          <p style={{ fontSize: 'var(--text-sm)', color: COLORS.textMuted, margin: 0 }}>
            Pay, withdraw earnings, and manage royalties →
          </p>
        </Card>
      </Link>

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
