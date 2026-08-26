/*
  Live WalletGate — three states driven by wagmi:
    connect → direct connectAsync of the first discovered injected wallet
              (chooser opens only when multiple injected wallets are
              installed; WalletConnect stays as the mobile path)
    wrong-network → switchChain back to the configured app chain
    authenticated → the console opens immediately.
  A verified connection on the app chain IS the session; reconnects restore
  silently (wagmi persists the last wallet), and the 24h TTL only decides
  whether returning users re-walk this small path.
*/
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useConnectors, useSwitchChain } from "wagmi";
import { AlertTriangle, LockKeyhole, Network, X } from "./icons.js";
import { Button, ErrorNote } from "./Controls.js";
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
  const [chooserOpen, setChooserOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  // mipd-discovered injected wallets (bare injected() in config/wagmi);
  // WalletConnect is the secondary mobile path, never the primary CTA.
  const injected = connectors.filter((c) => c.type === "injected");
  const mobileConnector = connectors.find((c) => c.type === "walletConnect");
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

  // One-click happy path: the CTA connects the first injected wallet
  // synchronously in the click gesture. No provider installed → mipd lists
  // nothing usable, so surface it instead of throwing ProviderNotFoundError.
  const connectInjected = async () => {
    const target = injected[0];
    if (!target) {
      setError(copy.wallet.noWalletDetected);
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      await connectAsync({ connector: target });
    } catch (err) {
      // No injected provider announced → wagmi throws ProviderNotFoundError;
      // that is the "install a wallet" case, not a generic failure.
      setError(
        err instanceof Error && /provider not found/i.test(err.message)
          ? copy.wallet.noWalletDetected
          : humanizeError(err),
      );
    } finally {
      setConnecting(false);
    }
  };

  const view: "connect" | "wrong-network" = wrongNetwork
    ? "wrong-network"
    : "connect";

  // Zero-interstitial open: mounting the gate continues the original click
  // gesture — exactly one injected wallet connects immediately (extension
  // popup, no second click); several wallets auto-open the chooser; none
  // surfaces the install hint at once. The panel stays for retries and
  // manual paths.
  const autoTried = useRef(false);
  useEffect(() => {
    if (view !== "connect" || autoTried.current) return;
    autoTried.current = true;
    if (injected.length > 1) setChooserOpen(true);
    else if (injected.length === 1) void connectInjected();
    else setError(copy.wallet.noWalletDetected);
    // Run once per mount: connectors and copy are stable for the gate lifetime.
  }, []);

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
              <i>{copy.wallet.gateSessionLine}</i>
            </strong>
            {/* custody is already stated once in the connect panel ("We never
                take custody") — the art overlay must not repeat it */}
          </div>
        </div>
        <div className="wallet-gate-panel">
          <div className="wallet-gate-head">
            <Logo compact />
          </div>

          {view === "connect" && (
            <>
              <h1 id="wallet-title">{copy.wallet.gateTitle}</h1>
              <p>Connect a wallet to start a session. We never take custody.</p>
              {/* Chooser only on conflict: >1 injected wallet means the CTA
                  cannot guess which one to open. */}
              <Button
                busy={connecting}
                onClick={() =>
                  injected.length > 1
                    ? setChooserOpen(true)
                    : void connectInjected()
                }
                icon={<LockKeyhole size={15} />}
              >
                {copy.nav.connectWallet}
              </Button>
              {mobileConnector && (
                <Button
                  variant="ghost"
                  className="wallet-gate-mobile-cta"
                  onClick={() => setChooserOpen(true)}
                >
                  {copy.wallet.useMobileWallet}
                </Button>
              )}
              <ErrorNote message={error} />
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
              <ErrorNote message={error} />
            </div>
          )}
        </div>
      </section>
      {chooserOpen && (
        <ConnectModal onClose={() => setChooserOpen(false)} locale={locale} />
      )}
    </div>
  );
}
