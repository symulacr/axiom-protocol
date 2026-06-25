import { type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui.js';
import { PaymentPanel } from '../components/PaymentPanel.js';

export function AgentPaymentsPage(): ReactElement {
  const { tokenId } = useParams<{ tokenId: string }>();
  if (!tokenId) return <PageHeader title="Invalid Agent" subtitle="No token ID provided" />;
  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return <PageHeader title="Invalid Agent" subtitle="Token ID must be a number" />;
  }
  return (
    <main>
      <PageHeader
        title="Agent Payments"
        subtitle={`Agent #${id.toString()}`}
        action={
          <Link
            to={`/agents/${id.toString()}`}
            style={{
              color: 'var(--c-text-muted)',
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
          >
            ← Back to Agent
          </Link>
        }
      />
      <PaymentPanel tokenId={id} />
    </main>
  );
}
