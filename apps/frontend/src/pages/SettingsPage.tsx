// Axiom Protocol — Settings page (`/settings` route).
//
// Three persistence-backed settings: RPC URL, WalletConnect project ID,
// and chain selector. Each writes to localStorage via `useLocalStorage`.
// Draft state prevents keystrokes from writing on every keypress.

import type { ChangeEvent, ReactElement } from 'react';
import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { COLORS, Card, Button, Input, SectionTitle, PageHeader, Alert } from '../components/ui.js';

const DEFAULT_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const DEFAULT_WC_PROJECT_ID = '';
const DEFAULT_CHAIN_ID = 16602;
const GALILEO_CHAIN_ID = 16602;
const ARISTOTLE_CHAIN_ID = 16661;

export function SettingsPage(): ReactElement {
  const [rpcUrl, setRpcUrl] = useLocalStorage<string>(
    'axiom.rpcUrl',
    DEFAULT_RPC_URL,
  );
  const [wcProjectId, setWcProjectId] = useLocalStorage<string>(
    'axiom.wcProjectId',
    DEFAULT_WC_PROJECT_ID,
  );
  const [chainId, setChainId] = useLocalStorage<number>(
    'axiom.chainId',
    DEFAULT_CHAIN_ID,
  );

  // Drafts are initialized from the persisted value. The inputs use `key`
  // to remount when the saved value changes (e.g. saved in another tab),
  // per the no-use-effect "reset with key" rule — no sync effects needed.
  const [rpcDraft, setRpcDraft] = useState<string>(rpcUrl);
  const [wcDraft, setWcDraft] = useState<string>(wcProjectId);

  const onRpcDraftChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setRpcDraft(event.target.value);
  };
  const onWcDraftChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setWcDraft(event.target.value);
  };
  const onSaveRpc = (): void => {
    setRpcUrl(rpcDraft);
  };
  const onSaveWcProjectId = (): void => {
    setWcProjectId(wcDraft);
  };

  const onChainChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Number.parseInt(event.target.value, 10);
    if (next === GALILEO_CHAIN_ID) {
      setChainId(next);
      setRpcUrl('https://evmrpc-testnet.0g.ai');
    } else if (next === ARISTOTLE_CHAIN_ID) {
      setChainId(next);
      setRpcUrl('https://evmrpc.0g.ai');
    }
  };

  return (
    <main>
      <PageHeader title="Settings" subtitle="Configure RPC endpoint, wallet connector, and chain" />

      <Card style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionTitle>RPC Endpoint</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          The JSON-RPC endpoint used to read 0G chain state.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
          <Input
            key={`rpc-${rpcUrl}`}
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
          <Input
            key={`wc-${wcProjectId}`}
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

      <Card>
        <SectionTitle>Active Chain</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-lg)', fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          The 0G chain the frontend targets by default.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              padding: 'var(--space-md) var(--space-lg)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${chainId === GALILEO_CHAIN_ID ? COLORS.bronzeBorder : COLORS.border}`,
              background: chainId === GALILEO_CHAIN_ID ? COLORS.bronzeBg : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              color: COLORS.text,
              fontSize: 'var(--text-sm)',
            }}
          >
            <input
              type="radio"
              name="chain"
              value={GALILEO_CHAIN_ID}
              checked={chainId === GALILEO_CHAIN_ID}
              onChange={onChainChange}
              style={{ accentColor: COLORS.bronze }}
            />
            Galileo Testnet
            <span style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)' }}>(chainId 16602)</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              padding: 'var(--space-md) var(--space-lg)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${chainId === ARISTOTLE_CHAIN_ID ? COLORS.bronzeBorder : COLORS.border}`,
              background: chainId === ARISTOTLE_CHAIN_ID ? COLORS.bronzeBg : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              color: COLORS.text,
              fontSize: 'var(--text-sm)',
            }}
          >
            <input
              type="radio"
              name="chain"
              value={ARISTOTLE_CHAIN_ID}
              checked={chainId === ARISTOTLE_CHAIN_ID}
              onChange={onChainChange}
              style={{ accentColor: COLORS.bronze }}
            />
            Aristotle Mainnet
            <span style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)' }}>(chainId 16661)</span>
          </label>
        </div>
        <p style={{ margin: 'var(--space-md) 0 0', fontSize: 'var(--text-xs)', color: COLORS.textDim }}>
          Saved to localStorage key <code style={{ color: COLORS.bronzeLight }}>axiom.chainId</code>. Takes effect on next page load.
        </p>
      </Card>
    </main>
  );
}

export default SettingsPage;
