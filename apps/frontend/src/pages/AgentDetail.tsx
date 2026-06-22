// Axiom Protocol — agent detail page (`/agents/:tokenId` route).
//
// Renders the on-chain metadata for a single AxiomAgentNFT token in a
// definition list. The "Transfer Agent" action opens the shared
// <TransferModal /> (owned by Agent B) which drives the iTransferFrom
// call with both the receiver's AccessProof signature and the TEE
// OwnershipProof signature.
//
// Data sources:
//
//   1. The `useAgentMetadata(tokenId)` hook (apps/frontend/src/hooks/
//      useAgentMetadata.ts) multicalls the standard EIP-721 getters
//      (name, symbol, ownerOf, tokenURI) plus the AxiomAgentNFT iNFT
//      extensions (getDataHash, getSealedKey) in a single round-trip.
//      EIP-721: https://eips.ethereum.org/EIPS/eip-721
//      wagmi v2 useReadContracts:
//        https://wagmi.sh/react/hooks/useReadContracts
//
//   2. A second `useReadContracts` call reads `creatorOf(tokenId)` from
//      the same ABI. The shared hook doesn't surface this field
//      because it's AxiomAgentNFT-specific, not a property of the base
//      EIP-721 spec, so we read it directly here.
//
// Routing:
//
//   - `useParams<{ tokenId: string }>()` returns the URL segment. We
//     parse it with `BigInt(...)` (the EIP-721 tokenId type) and fall
//     back to 0n if the segment is missing or non-numeric. React Router
//     v6/v7 useParams API:
//       https://reactrouter.com/api/hooks/useParams
//
// Truncation of `dataHash` and `sealedKey` follows the same convention
// as VaultDashboard.tsx (first 10 + ellipsis + last 6) so the dApp
// has one consistent hash-rendering style across pages.

import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, useReadContracts } from 'wagmi';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';
import { axiomAgentNftAbi } from '../abi/axiomAgentNft.js';
import { useAgentMetadata } from '../hooks/useAgentMetadata.js';
import { TransferModal } from '../components/TransferModal.js';

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
        <h1>Agent</h1>
        <p>Connect wallet to view this agent.</p>
        <p>
          <Link to="/agents">Back to your agents</Link>
        </p>
      </main>
    );
  }

  if (tokenId === null) {
    return (
      <main>
        <h1>Agent</h1>
        <p role="alert">Invalid token id in the URL.</p>
        <p>
          <Link to="/agents">Back to your agents</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Agent #{tokenId.toString()}</h1>
      <p>
        <Link to="/agents">Back to your agents</Link>
      </p>

      {metaLoading && <p>Loading agent metadata\u2026</p>}
      {metaError !== null && (
        <p role="alert">
          Failed to read agent metadata. Check the console for the
          underlying wagmi error.
        </p>
      )}

      {data !== null && (
        <section>
          <h2>Metadata</h2>
          <dl>
            <dt>Name</dt>
            <dd>{data.name === '' ? PLACEHOLDER : data.name}</dd>
            <dt>Symbol</dt>
            <dd>{data.symbol === '' ? PLACEHOLDER : data.symbol}</dd>
            <dt>Owner</dt>
            <dd>
              <code>{data.owner}</code>
            </dd>
            <dt>Creator</dt>
            <dd>
              <code>{creator ?? PLACEHOLDER}</code>
            </dd>
            <dt>Data Hash</dt>
            <dd>
              <code title={data.dataHash}>
                {truncateHex(data.dataHash)}
              </code>
            </dd>
            <dt>Sealed Key</dt>
            <dd>
              <code title={data.sealedKey}>
                {truncateHex(data.sealedKey)}
              </code>
            </dd>
            <dt>tokenURI</dt>
            <dd>
              <code>{data.tokenUri === '' ? PLACEHOLDER : data.tokenUri}</code>
            </dd>
          </dl>
        </section>
      )}

      <section>
        <h2>Transfer</h2>
        <p>
          Transfer re-encrypts the agent's encrypted intelligence on 0G
          Storage and writes a sealed key the receiver can unwrap. See
          EIP-721{' '}
          <a
            href="https://eips.ethereum.org/EIPS/eip-721"
            rel="noreferrer noopener"
            target="_blank"
          >
            ownerOf
          </a>{' '}
          for the on-chain ownership primitive that backs this flow.
        </p>
        <button
          type="button"
          onClick={(): void => {
            setTransferOpen(true);
          }}
        >
          Transfer Agent
        </button>
      </section>

      {address !== undefined && (
        <p>
          Connected as <code>{address}</code>
        </p>
      )}

      {transferOpen && (
        <TransferModal
          tokenId={tokenId}
          onClose={(): void => {
            setTransferOpen(false);
          }}
          onSuccess={(): void => {
            setTransferOpen(false);
          }}
        />
      )}
    </main>
  );
}

export default AgentDetail;
