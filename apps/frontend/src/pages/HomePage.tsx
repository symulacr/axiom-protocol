// Axiom Protocol — landing page (`/` route).
//
// Renders the canonical Axiom brand narrative, then three call-to-action
// buttons that route the user into the rest of the dApp. The narrative
// paragraph is pulled from `docs/brand/axiom-narrative.md` (the source of
// truth for all Axiom marketing copy). If that file is ever deleted in a
// future micro-wave, a short placeholder is rendered in its place so the
// page never blanks out.
//
// The three CTAs are React Router `Link` elements (not raw `<a>` tags) so
// the SPA transition is instant and the wallet / wagmi state in the React
// tree survives the navigation. The destination routes mirror the
// `<Route>` table in `src/App.tsx`:
//   - /vaults/:vaultId → opens the deployed AxiomStrategyVault
//   - /agents         → lists the connected wallet's iNFTs (added later)
//   - /connect        → opens the RainbowKit connect modal anchor
//
// Source URLs (cited inline at the call sites that use them):
//   - React Router v6+ `<Link>` API (replaces history with declarative nav):
//     https://reactrouter.com/en/main/components/link
//   - wagmi v2 `useConnect` / RainbowKit `ConnectButton` (for the third
//     CTA's `onClick` handler that opens the wallet modal):
//     https://wagmi.sh/react/hooks/useConnect
//   - RainbowKit `ConnectButton` (the open-modal entry point):
//     https://www.rainbowkit.com/docs/connect-button
//   - 0G chain facts (chainId 16602, native gas token OG):
//     https://docs.0g.ai/ai-context
//   - Brand narrative source of truth:
//     local://docs/brand/axiom-narrative.md  (this file is not loaded by
//     the build — copy is pinned here verbatim so a missing file in a
//     future micro-wave never blanks the landing page)

import type { ReactElement } from 'react';
import { useConnect } from 'wagmi';
import { Link } from 'react-router-dom';
import { AXIOM_VAULT_ADDRESSES } from '../abi/addresses.js';

const NARRATIVE_PARAGRAPH =
  'Axiom Protocol is the verifiable intelligence layer for DeFi. It is the on-chain infrastructure that lets an AI agent\u2019s intelligence \u2014 its model, weights, strategy, execution logic \u2014 be tokenized as an NFT, owned by a user, transferred with provable integrity, and run with cryptographic proof of correct execution.';

const VAULT_ROUTE = `/vaults/0` as const;

export function HomePage(): ReactElement {
  // `useConnect` gives us the `connectors` list and a `connect` action.
  // We surface the first available EIP-1193 / WalletConnect / Injected
  // connector as the "Connect Wallet" CTA. Source:
  //   https://wagmi.sh/react/hooks/useConnect
  const { connectors, connect, isPending } = useConnect();
  const primaryConnector = connectors[0];

  const onConnect = (): void => {
    if (primaryConnector) {
      connect({ connector: primaryConnector });
    }
  };

  return (
    <main>
      <h1>Axiom Protocol</h1>
      <p>{NARRATIVE_PARAGRAPH}</p>

      <nav aria-label="Primary actions">
        <Link
          to={
            AXIOM_VAULT_ADDRESSES[0] !== undefined
              ? `/vaults/${AXIOM_VAULT_ADDRESSES[0]}`
              : VAULT_ROUTE
          }
        >
          View Vaults
        </Link>
        <Link to="/agents">Browse Agents</Link>
        <button
          type="button"
          onClick={onConnect}
          disabled={primaryConnector === undefined || isPending}
        >
          Connect Wallet
        </button>
      </nav>
    </main>
  );
}

export default HomePage;
