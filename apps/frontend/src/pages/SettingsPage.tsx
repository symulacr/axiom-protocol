import type { ChangeEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { COLORS, Card, Button, Input, SectionTitle, PageHeader, Alert } from '../components/ui.js';

const DEFAULT_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const DEFAULT_WC_PROJECT_ID = '';

export function SettingsPage(): ReactElement {
  const [rpcUrl, setRpcUrl] = useLocalStorage<string>(
    'axiom.rpcUrl',
    DEFAULT_RPC_URL,
  );
  const [wcProjectId, setWcProjectId] = useLocalStorage<string>(
    'axiom.wcProjectId',
    DEFAULT_WC_PROJECT_ID,
  );
  const [rpcDraft, setRpcDraft] = useState<string>(rpcUrl);
  const [wcDraft, setWcDraft] = useState<string>(wcProjectId);
  const [error, setError] = useState<string | null>(null);

  const onRpcDraftChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setRpcDraft(event.target.value);
    setError(null);
  };
  const onWcDraftChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setWcDraft(event.target.value);
    setError(null);
  };
  const onSaveRpc = (): void => {
    if (!rpcDraft.startsWith('http')) {
      setError('RPC URL must start with http:// or https://');
      return;
    }
    setError(null);
    setRpcUrl(rpcDraft);
    toast.success('RPC URL saved. Takes effect on next page load.');
  };
  const onSaveWcProjectId = (): void => {
    if (wcDraft && !/^[a-f0-9]{32}$/i.test(wcDraft)) {
      setError('WalletConnect Project ID should be a 32-character hex string');
      return;
    }
    setError(null);
    setWcProjectId(wcDraft);
    toast.success('WalletConnect Project ID saved. Reload to apply.');
  };

  return (
    <main>
      <p style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
        <Link to="/" style={{ color: COLORS.textDim, textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back
        </Link>
      </p>
      <PageHeader title="Settings" subtitle="Configure RPC endpoint and wallet connector" />

      {error !== null && (
        <Alert variant="error" style={{ marginBottom: 'var(--space-xl)' }}>{error}</Alert>
      )}

      <Card style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionTitle>RPC Endpoint</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          The JSON-RPC endpoint used to read 0G chain state.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
          <label htmlFor="rpc-url-input" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-sm)', display: 'block' }}>RPC Endpoint</label>
          <Input
            id="rpc-url-input"
            type="url"
            inputMode="url"
            value={rpcDraft}
            onChange={onRpcDraftChange}
            placeholder={DEFAULT_RPC_URL}
            style={{ flex: 1, minWidth: 'auto' }}
          />
          <Button variant="primary" onClick={onSaveRpc}>
            Save
          </Button>
        </div>
        <p style={{ margin: 'var(--space-md) 0 0', fontSize: 'var(--text-xs)', color: COLORS.textDim }}>
          Saved to localStorage key <code style={{ color: COLORS.bronzeLight }}>axiom.rpcUrl</code>. Takes effect on next page load.
        </p>
      </Card>

      <Card style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionTitle>WalletConnect Project ID</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          Your WalletConnect Cloud project identifier. Required for WalletConnect-based wallets like Rainbow, Trust, and MetaMask Mobile.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
          <label htmlFor="wc-project-id-input" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-sm)', display: 'block' }}>WalletConnect Project ID</label>
          <Input
            id="wc-project-id-input"
            type="text"
            value={wcDraft}
            onChange={onWcDraftChange}
            placeholder="00000000000000000000000000000000"
            style={{ flex: 1, minWidth: 'auto' }}
          />
          <Button variant="primary" onClick={onSaveWcProjectId}>
            Save
          </Button>
        </div>
        <Alert variant="warning" style={{ marginTop: 'var(--space-md)' }}>
          Reload the page after saving — the wallet connector initializes once on page load.
        </Alert>
      </Card>

    </main>
  );
}

export default SettingsPage;
