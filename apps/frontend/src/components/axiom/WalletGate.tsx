/*
  Live WalletGate — three states driven by wagmi:
    connect → one CTA that opens the wagmi-native ConnectModal (wallet list,
                   QR/deep-link flow and errors are ours now)
    wrong-network → switchChain back to the configured app chain
    authenticated → the console opens immediately.
  A verified connection on the app chain IS the session: the old
  axiom-console-session signature ceremony was removed because nothing ever
  verified it, and the mandatory profile-naming step went with it (naming
  lives in Settings). Reconnects restore silently (wagmi persists the last
  wallet); the 24h TTL only decides whether returning users re-walk this
  small path.
*/
import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { AlertTriangle, LockKeyhole, Network, X } from "./icons.js";
import { Button } from "./Controls.js";
import { ConnectModal } from "./ConnectModal.js";
import { Logo } from "./AppShell.js";

import { getCopy, interpolate, type Locale } from "../../lib/copy.js";
import type { ConsoleAction } from "../../lib/consoleStore.js";
import type { Session } from "../../lib/models.js";
import { humanizeError } from "../../utils/format.js";
import { useModalDismiss } from "../../hooks/useModalDismiss.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../../config/wagmi.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function isSessionFresh(session: Session): boolean {
  if (session.status !== "authenticated" || !session.signedAt) return false;
  return Date.now() - Date.parse(session.signedAt) < SESSION_TTL_MS;
}

export function WalletGate({
  session,
  dispatch,
  onClose,
  onAuthenticated,
  locale,
}: {
  session: Session;
  dispatch: React.Dispatch<ConsoleAction>;
  onClose: () => void;
  onAuthenticated: () => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  // the target network in copy is always the configured chain, never a
  // literal ("Switch to 0G Mainnet" told testnet users the wrong network).
  const chainVars = { chainName: APP_CHAIN.name, chainId: APP_CHAIN_ID };
  const { address, isConnected, chainId, connector } = useAccount();
  const [connectOpen, setConnectOpen] = useState(false);
  const { switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(false);
  // dismiss trio: Esc + focus restore here; backdrop via layer onMouseDown
  // below; X already exists. Dismiss is safe in every view — the wagmi
  // connection persists and the gate re-opens from any locked CTA.
  useModalDismiss(onClose);

  const wrongNetwork =
    isConnected && chainId !== undefined && chainId !== APP_CHAIN_ID;
  const connectedOk = isConnected && !wrongNetwork;

  // Silent sign-in: a verified connection on the app chain opens the session.
  // The effect also resumes any pending intent (locked CTA → gate → console)
  // without a second click. U14: no naming detour — the session is
  // authenticated immediately; whatever profile exists stays as-is and the
  // reducer merge keeps it (naming lives in Settings).
  useEffect(() => {
    if (!connectedOk || !address) return;
    if (session.status === "authenticated") {
      if (!resumed.current) {
        resumed.current = true;
        onAuthenticated();
      }
      return;
    }
    dispatch({
      type: "session",
      session: {
        status: "authenticated",
        address,
        wallet: connector?.name ?? "",
        chain: APP_CHAIN_ID,
        signedAt: new Date().toISOString(),
      },
    });
  }, [
    connectedOk,
    address,
    session.status,
    connector,
    dispatch,
    onAuthenticated,
  ]);

  const switchNetwork = async () => {
    setError(null);
    try {
      // APP_CHAIN_ID is env-resolved and typed as the configured-chain union.
      await switchChainAsync({ chainId: APP_CHAIN_ID });
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  const view: "connect" | "wrong-network" = wrongNetwork
    ? "wrong-network"
    : "connect";

  return (
    <div className="wallet-gate-layer" onMouseDown={onClose}>
      <section
        className="wallet-gate"
        role="dialog"
        aria-modal="true"
        aria-label={copy.a11y.walletAccess}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="wallet-gate-close"
          onClick={onClose}
          aria-label={copy.a11y.closeWalletAccess}
        >
          <X size={16} />
        </button>
        <div className="wallet-gate-art">
          <img
            src="/brand/hero-seal-512.jpg"
            alt="Abstract Axiom wallet access nucleus"
          />
          <div className="wallet-gate-art-copy">
            <strong>
              One wallet.
              <br />
              <i>One accountable session.</i>
            </strong>
            <span>Non-custodial access.</span>
          </div>
        </div>
        <div className="wallet-gate-panel">
          <div className="wallet-gate-head">
            <Logo compact />
          </div>

          {view === "connect" && (
            <>
              <h1 id="wallet-title">
                Enter the
                <br />
                <i>command surface.</i>
              </h1>
              <p>Connect a wallet to start a session. We never take custody.</p>
              <Button
                onClick={() => setConnectOpen(true)}
                icon={<LockKeyhole size={15} />}
              >
                {copy.nav.connectWallet}
              </Button>
            </>
          )}

          {view === "wrong-network" && (
            <div className="wallet-state">
              <AlertTriangle className="warning-icon" size={28} />
              <h2>{interpolate(copy.wallet.wrongNetworkTitle, chainVars)}</h2>
              <p>{copy.wallet.wrongNetworkDescription}</p>
              <div className="network-check">
                <span>{copy.wallet.networkMismatch}</span>
                <strong>
                  {interpolate(copy.wallet.connectedChain, {
                    chainId: String(chainId ?? "unknown"),
                  })}
                </strong>
                <small>
                  {interpolate(copy.wallet.requiredChain, {
                    chainName: APP_CHAIN.name,
                    chainId: String(APP_CHAIN_ID),
                  })}
                </small>
              </div>
              <Button
                onClick={() => void switchNetwork()}
                icon={<Network size={15} />}
              >
                {interpolate(copy.wallet.switchNetwork, chainVars)}
              </Button>
              {error && (
                <p className="wallet-gate-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      {connectOpen && (
        <ConnectModal
          open
          onClose={() => setConnectOpen(false)}
          locale={locale}
        />
      )}
    </div>
  );
}
