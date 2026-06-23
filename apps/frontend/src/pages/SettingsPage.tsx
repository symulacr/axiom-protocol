// Axiom Protocol — Settings page (`/settings` route).
//
// Three persistence-backed settings, each with its own UI affordance:
//
//   1. RPC URL — a controlled text input bound to a local draft state
//      plus a "Save" button that commits the draft to localStorage and
//      updates the persisted hook value. We keep a separate draft so
//      keystrokes do not write to storage on every keypress.
//
//   2. WalletConnect project ID — same draft+Save pattern as the RPC
//      URL. The note next to the field warns the user that changing it
//      requires a full page reload before wagmi's connector picks up
//      the new project id (this is a RainbowKit + WalletConnect v2
//      constraint, not a wagmi v2 constraint).
//
//   3. Chain selector — radio buttons for the two supported 0G chains
//      (Galileo testnet chainId 16602, Aristotle mainnet chainId 16661).
//      The selection writes to localStorage on change. The note reminds
//      the user that the wagmi `Config` is built once at module load in
//      `src/config/wagmi.ts`; a future micro-wave will thread the
//      stored value into the transport (this page persists the
//      intent, the runtime reads it).
//
// Persistence keys (the public contract — referenced by `wagmi.ts` in a
// later micro-wave):
//   - axiom.rpcUrl       string   default "https://evmrpc-testnet.0g.ai"
//   - axiom.wcProjectId  string   default ""
//   - axiom.chainId      number   default 16602 (Galileo) or 16661 (Aristotle)
//
// Canonical sources:
//   - MDN: Window.localStorage (getItem, setItem, JSON serialisation):
//     https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
//   - React 18 controlled <input> (value + onChange pattern):
//     https://react.dev/reference/react-dom/components/input#controlling-an-input
//   - 0G chain ids (16602 Galileo, 16661 Aristotle):
//     https://docs.0g.ai/ai-context

import type { ChangeEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
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

  // Local drafts so the user can type without writing to localStorage
  // on every keystroke. The drafts are seeded from the persisted hook
  // value (which is itself hydrated from localStorage by the hook's
  // mount-effect). We mirror hook → draft so a Save in another tab, or
  // a future programmatic change, flows back into the visible input.
  const [rpcDraft, setRpcDraft] = useState<string>(rpcUrl);
  const [wcDraft, setWcDraft] = useState<string>(wcProjectId);
  useEffect(() => {
    setRpcDraft(rpcUrl);
  }, [rpcUrl]);
  useEffect(() => {
    setWcDraft(wcProjectId);
  }, [wcProjectId]);

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
    if (next === GALILEO_CHAIN_ID || next === ARISTOTLE_CHAIN_ID) {
      setChainId(next);
    }
  };

  return (
    <main>
      <PageHeader title="Settings" subtitle="Configure RPC endpoint, wallet connector, and chain" />

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle>RPC Endpoint</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 14, margin: '0 0 16px', fontWeight: 300 }}>
          The JSON-RPC endpoint used to read 0G chain state.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
        <p style={{ margin: '12px 0 0', fontSize: 12, color: COLORS.textDim }}>
          Saved to localStorage key <code style={{ color: COLORS.bronzeLight }}>axiom.rpcUrl</code>. Takes effect on next page load.
        </p>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle>WalletConnect Project ID</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 14, margin: '0 0 16px', fontWeight: 300 }}>
          Your WalletConnect Cloud project identifier. Required for WalletConnect-based wallets like Rainbow, Trust, and MetaMask Mobile.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
        <Alert variant="warning" style={{ marginTop: 12 }}>
          Reload the page after saving — the wallet connector initializes once on page load.
        </Alert>
      </Card>

      <Card>
        <SectionTitle>Active Chain</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 14, margin: '0 0 16px', fontWeight: 300 }}>
          The 0G chain the frontend targets by default.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${chainId === GALILEO_CHAIN_ID ? COLORS.bronzeBorder : COLORS.border}`,
              background: chainId === GALILEO_CHAIN_ID ? COLORS.bronzeBg : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              color: COLORS.text,
              fontSize: 14,
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
            <span style={{ color: COLORS.textDim, fontSize: 12 }}>(chainId 16602)</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${chainId === ARISTOTLE_CHAIN_ID ? COLORS.bronzeBorder : COLORS.border}`,
              background: chainId === ARISTOTLE_CHAIN_ID ? COLORS.bronzeBg : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              color: COLORS.text,
              fontSize: 14,
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
            <span style={{ color: COLORS.textDim, fontSize: 12 }}>(chainId 16661)</span>
          </label>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: COLORS.textDim }}>
          Saved to localStorage key <code style={{ color: COLORS.bronzeLight }}>axiom.chainId</code>. Takes effect on next page load.
        </p>
      </Card>
    </main>
  );
}

export default SettingsPage;
