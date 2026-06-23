// Axiom Protocol — execute-strategy page (`/agents/:tokenId/execute` route).
//
// Thin wrapper around `<ExecutePanel />` that parses `:tokenId` into a
// `bigint` and passes it as the locked `tokenId` prop.

import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExecutePanel } from '../components/ExecutePanel.js';

/**
 * Parse a route param string into a bigint tokenId. Returns null when
 * the segment is missing or not a valid integer (EIP-721 tokenIds are
 * uint256, which fits in bigint; we accept decimal form only).
 */
function parseTokenId(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === '') return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function ExecuteStrategyPage(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  if (tokenId === null) {
    return (
      <main>
        <h1>Execute Strategy</h1>
        <p role="alert">Invalid token id in the URL.</p>
        <p>
          <Link to="/agents">Back to your agents</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Execute Strategy \u2014 Agent #{tokenId.toString()}</h1>
      <p>
        <Link to={`/agents/${tokenId.toString()}`}>Back to agent</Link>
      </p>
      <ExecutePanel tokenId={tokenId} />
    </main>
  );
}

export default ExecuteStrategyPage;
