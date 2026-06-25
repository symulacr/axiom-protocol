import { type ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui.js';
import { PaymentPanel } from '../components/PaymentPanel.js';

export function AgentPaymentsPage(): ReactElement {
  const { tokenId } = useParams<{ tokenId: string }>();
  if (!tokenId) return <PageHeader title="Invalid Agent" />;
  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return <PageHeader title="Invalid Agent" />;
  }
  return (
    <main>
      <PageHeader
        title="Agent Payments"
      />
      <PaymentPanel tokenId={id} />
    </main>
  );
}
