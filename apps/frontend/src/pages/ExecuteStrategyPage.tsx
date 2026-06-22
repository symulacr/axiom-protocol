// Axiom Protocol — execute-strategy page (`/agents/:tokenId/execute` route).
//
// Thin wrapper around `<ExecutePanel />` that parses the `:tokenId` route
// segment into a `bigint` (EIP-721 tokenId) and passes it as the locked
// `tokenId` prop. When the segment is missing or non-numeric the page renders
// an error instead of calling the panel with a bad id.
//
// Route registration lives in App.tsx (owned by W4-A):
//   <Route path="/agents/:tokenId/execute" element={<ExecuteStrategyPage />} />
//
// Routing:
//   - React Router v6+/v7 `useParams` returns the dynamic segment:
//     https://reactrouter.com/api/hooks/useParams
//
// Truncation / placeholder convention matches AgentDetail.tsx and
// VaultDashboard.tsx.

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
