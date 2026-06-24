import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COLORS, PageHeader, Alert } from '../components/ui.js';
import { ExecutePanel } from '../components/ExecutePanel.js';
import { parseTokenId } from '../utils/format.js';

export function ExecuteStrategyPage(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  if (tokenId === null) {
    return (
      <main>
        <PageHeader title="Execute Strategy" />
        <Alert variant="error">Invalid token id in the URL.</Alert>
        <p style={{ marginTop: 'var(--space-md)' }}>
          <Link to="/agents" style={{ color: COLORS.bronzeLight, fontSize: 'var(--text-sm)' }}>
            Back to your agents
          </Link>
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
