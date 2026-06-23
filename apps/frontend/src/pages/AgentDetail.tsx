// Axiom Protocol — agent detail page (`/agents/:tokenId` route).
//
// Renders on-chain metadata for an AxiomAgentNFT token using
// `useAgentMetadata` and a separate `creatorOf` multicall.
// The "Transfer Agent" action opens `<TransferModal />`.

import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, useReadContracts } from 'wagmi';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';
import { axiomAgentNftAbi } from '../abi/axiomAgentNft.js';
import { useAgentMetadata } from '../hooks/useAgentMetadata.js';
import { TransferModal } from '../components/TransferModal.js';
import { PaymentPanel } from '../components/PaymentPanel.js';
import {
  COLORS,
  Skeleton,
  Card,
  Button,
  SectionTitle,
  MonoLabel,
  Alert,
  PageHeader,
} from '../components/ui.js';

/** Display the em-dash for an absent value. */
const PLACEHOLDER = '\u2014';
const ELLIPSIS = '\u2026';

/** Truncate a `0x…` hex string to `head + … + tail`. */
function truncateHex(value: string, head = 10, tail = 6) {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

/**
 * Parse a route param string into a bigint tokenId. Returns null when
 * the segment is missing or not a valid integer (EIP-721 tokenIds are
 * uint256, which fits in bigint; we accept decimal form only).
 */
function parseTokenId(raw: string | undefined) {
  if (raw === undefined || raw === '') {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function AgentDetail(): ReactElement {
  // React Router v6+/v7: useParams returns the route's dynamic segments
  // typed against the path pattern in <Route path="/agents/:tokenId">.
  // Source: https://reactrouter.com/api/hooks/useParams
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  // wagmi v2 useAccount — connected address + status flags. Source:
  //   https://wagmi.sh/react/hooks/useAccount
  const { isConnected, address } = useAccount();

  // useAgentMetadata is a multicall of EIP-721 + iNFT getters. We
  // guard on tokenId !== null so wagmi doesn't read with `args: [null]`
  // and revert on every poll. Source:
  //   https://wagmi.sh/react/hooks/useReadContracts
  const metadata = useAgentMetadata(tokenId ?? 0n);
  const { data, isLoading: metaLoading, error: metaError } = metadata;

  // `creatorOf(tokenId)` is an AxiomAgentNFT-specific getter, not a base
  // EIP-721 spec function, so the shared hook doesn't include it. We
  // multicall it here so the detail page shows the creator alongside
  // the owner. ABI:
  //   https://docs.soliditylang.org/en/latest/abi-spec.html
  const creatorQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'creatorOf',
        args: [tokenId ?? 0n],
      },
    ],
    query: {
      enabled: tokenId !== null && Boolean(AXIOM_AGENT_NFT_ADDRESS),
    },
  });
  const creator = (creatorQuery.data?.[0] as string | undefined) ?? undefined;

  const [transferOpen, setTransferOpen] = useState(false);

  if (!isConnected) {
    return (
      <main>
        <PageHeader title="Agent" />
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            Connect your wallet to view this agent's on-chain metadata.
          </p>
          <Link to="/agents" style={{ color: COLORS.bronzeLight, fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)' }}>
            Back to agents
          </Link>
        </Card>
      </main>
    );
  }

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
      <PageHeader
        title={`Agent #${tokenId.toString()}`}
        subtitle="On-chain iNFT metadata and transfer history"
        action={
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
        <Alert variant="error" style={{ marginBottom: 'var(--space-xl)' }}>
          Couldn't load agent metadata from the chain. Check your connection and
          try refreshing the page.
        </Alert>
      )}

      {data !== null && (
        <Card style={{ marginBottom: 'var(--space-xl)' }}>
          <SectionTitle>Metadata</SectionTitle>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '8.75rem 1fr', gap: 'var(--space-md) var(--space-lg)', fontSize: 'var(--text-sm)' }}>
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
              {creator !== undefined ? <MonoLabel>{creator}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
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

      <PaymentPanel tokenId={tokenId} />

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
    </main>
  );
}

export default AgentDetail;
