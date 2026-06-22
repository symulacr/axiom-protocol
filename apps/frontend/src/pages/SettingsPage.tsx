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
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>

      <fieldset style={{ marginBottom: 24 }}>
        <legend>
          <strong>RPC URL</strong>
        </legend>
        <p style={{ margin: '4px 0 8px 0' }}>
          The JSON-RPC endpoint the frontend uses to read 0G chain state.
        </p>
        <label htmlFor="rpc-url-input">Endpoint</label>
        <br />
        <input
          id="rpc-url-input"
          type="url"
          inputMode="url"
          value={rpcDraft}
          onChange={onRpcDraftChange}
          placeholder={DEFAULT_RPC_URL}
          style={{ minWidth: 360, padding: '4px 8px' }}
        />
        <button
          type="button"
          onClick={onSaveRpc}
          style={{ marginLeft: 8, padding: '4px 12px' }}
        >
          Save
        </button>
        <p
          style={{
            margin: '8px 0 0 0',
            fontSize: 12,
            color: '#6b7280',
          }}
        >
          Persists to <code>localStorage</code> key <code>axiom.rpcUrl</code>.
        </p>
      </fieldset>

      <fieldset style={{ marginBottom: 24 }}>
        <legend>
          <strong>WalletConnect project ID</strong>
        </legend>
        <p style={{ margin: '4px 0 8px 0' }}>
          Your WalletConnect Cloud project identifier. Required for
          WalletConnect-based wallets (Rainbow, Trust, MetaMask mobile via
          QR, etc.).
        </p>
        <label htmlFor="wc-project-id-input">Project ID</label>
        <br />
        <input
          id="wc-project-id-input"
          type="text"
          value={wcDraft}
          onChange={onWcDraftChange}
          placeholder="00000000000000000000000000000000"
          style={{ minWidth: 360, padding: '4px 8px' }}
        />
        <button
          type="button"
          onClick={onSaveWcProjectId}
          style={{ marginLeft: 8, padding: '4px 12px' }}
        >
          Save
        </button>
        <p
          style={{
            margin: '8px 0 0 0',
            fontSize: 12,
            color: '#b45309',
          }}
        >
          <strong>Note:</strong> the change requires a full page reload
          before the wagmi config picks up the new project id.
        </p>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: '#6b7280',
          }}
        >
          Persists to <code>localStorage</code> key{' '}
          <code>axiom.wcProjectId</code>.
        </p>
      </fieldset>

      <fieldset>
        <legend>
          <strong>Active chain</strong>
        </legend>
        <p style={{ margin: '4px 0 8px 0' }}>
          The 0G chain the frontend targets by default.
        </p>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>
            <input
              type="radio"
              name="chain"
              value={GALILEO_CHAIN_ID}
              checked={chainId === GALILEO_CHAIN_ID}
              onChange={onChainChange}
            />{' '}
            Galileo Testnet (16602)
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="radio"
              name="chain"
              value={ARISTOTLE_CHAIN_ID}
              checked={chainId === ARISTOTLE_CHAIN_ID}
              onChange={onChainChange}
            />{' '}
            Aristotle Mainnet (16661)
          </label>
        </div>
        <p
          style={{
            margin: '8px 0 0 0',
            fontSize: 12,
            color: '#b45309',
          }}
        >
          <strong>Note:</strong> the wagmi config picks up this value on
          the next page load. The current page is using the chain that
          was active when it was loaded.
        </p>
        <p
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: '#6b7280',
          }}
        >
          Persists to <code>localStorage</code> key{' '}
          <code>axiom.chainId</code>.
        </p>
      </fieldset>
    </section>
  );
}

export default SettingsPage;
