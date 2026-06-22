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

export function AgentsBrowser(): ReactElement {
  // wagmi v2 useAccount — source of truth for connection status.
  //   https://wagmi.sh/react/hooks/useAccount
  const { isConnected } = useAccount();
  // useAgents multicalls balanceOf + per-index + per-tokenURI.
  //   https://wagmi.sh/react/hooks/useReadContracts
  const { agents, isLoading, error } = useAgents();

  if (!isConnected) {
    return (
      <main>
        <h1>Your Agents</h1>
        <p>Connect wallet to view your agents.</p>
      </main>
    );
  }

  if (error !== null) {
    return (
      <main>
        <h1>Your Agents</h1>
        <p role="alert">
          Failed to read your agents. Check the console for the
          underlying wagmi error.
        </p>
      </main>
    );
  }

  if (isLoading && agents.length === 0) {
    return (
      <main>
        <h1>Your Agents</h1>
        <p>Loading\u2026</p>
      </main>
    );
  }

  if (agents.length === 0) {
    return (
      <main>
        <h1>Your Agents</h1>
        <p>No agents yet. Mint one from a vault.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Your Agents</h1>
      <p>
        {agents.length} agent{agents.length === 1 ? '' : 's'} owned by the
        connected wallet. Each row links to the on-chain detail view, which
        multicalls EIP-721 (name, symbol, ownerOf, tokenURI) and the
        AxiomAgentNFT iNFT extensions (dataHash, sealedKey) in one
        round-trip.{' '}
        <a
          href="https://eips.ethereum.org/EIPS/eip-721"
          rel="noreferrer noopener"
          target="_blank"
        >
          EIP-721
        </a>
      </p>
      <ul>
        {agents.map((agent) => (
          <li key={agent.tokenId.toString()}>
            <Link to={`/agents/${agent.tokenId.toString()}`}>
              Agent #{agent.tokenId.toString()}
            </Link>
            {agent.uri !== '' && (
              <>
                {' '}
                &middot; <code>{agent.uri}</code>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default AgentsBrowser;
