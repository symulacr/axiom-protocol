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
import { Logo } from "./AppShell.js";

import { getCopy, interpolate, type Locale } from "../../lib/copy.js";
import { CopyButton } from "../ui.js";
import type { ConsoleAction } from "../../lib/consoleStore.js";
import type { Session } from "../../lib/models.js";
import { humanizeError } from "../../utils/format.js";
import { useModalDismiss } from "../../hooks/useModalDismiss.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../../config/wagmi.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** EIP-6963 wallet announcement payload (UUID is the identity we track). */
type EIP6963ProviderInfo = {
  info: { uuid: string; name: string; rdns: string };
};

/** Hero alert glyph in `.wallet-state` — semantic exception to the 14/16/18 icon scale. */
const WALLET_STATE_ICON_SIZE = 28;

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
  // R12: the nested chooser modal is gone — conflicts render as an inline
  // option list inside this single panel.
  const [showOptions, setShowOptions] = useState(false);
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  // Config-declared connectors — NOT an installed-wallet signal: wagmi always
  // lists the declared injected() connector even with no wallet installed
  // (discovery happens at connect time). Real installs are detected via
  // EIP-6963 announcements below.
  const injected = connectors.filter((c) => c.type === "injected");
  const mobileConnector = connectors.find((c) => c.type === "walletConnect");
  // EIP-6963 announcements are the only reliable "wallet installed" signal.
  // Collected into a ref (not state) because the requestProvider dispatch is
  // synchronous: a later mount effect reads the ref in the same commit.
  const announcedRef = useRef<EIP6963ProviderInfo[]>([]);
  const [, setAnnouncedTick] = useState(0);
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const info = (event as CustomEvent<EIP6963ProviderInfo>).detail?.info;
      if (!info?.uuid) return;
      if (announcedRef.current.some((p) => p.info.uuid === info.uuid)) return;
      announcedRef.current.push({ info });
      setAnnouncedTick((n) => n + 1);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    // Wallets announce at page load; re-request so a gate mounted later
    // still receives them (spec: providers re-announce on every request).
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);
  const hasInstalledWallet = announcedRef.current.length > 0;
  const { switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(false);
  // dismiss contract: Esc + Tab trap + initial focus + focus restore here; backdrop via
  // layer onMouseDown below; X already exists. Dismiss is safe in every view — the wagmi
  // connection persists and the gate re-opens from any locked CTA. The trap binds to the
  // layer (not the gate section) so inline conflict options stay inside it too.
  const layerRef = useRef<HTMLDivElement>(null);
  useModalDismiss(onClose, layerRef);

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
  const connectWith = async (
    target: (typeof connectors)[number] | undefined,
  ) => {
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

  const connectInjected = () => connectWith(injected[0]);

  // R12: mobile path goes straight to the WalletConnect SDK connector. The
  // pairing URI is captured from the connector's message event and shown
  // inline in this panel — one action, no second modal.
  const connectMobile = async () => {
    if (!mobileConnector) return;
    setError(null);
    setConnecting(true);
    try {
      const emitter = mobileConnector as unknown as {
        on?: (
          event: string,
          cb: (payload: { type?: string; data?: unknown }) => void,
        ) => void;
      };
      emitter.on?.("message", (payload) => {
        const data = payload.data as { uri?: string } | undefined;
        const uri = data?.uri;
        if (typeof uri === "string" && uri.startsWith("wc:")) {
          setPairingUri(uri);
        }
      });
      await connectAsync({ connector: mobileConnector });
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setConnecting(false);
    }
  };

  const view: "connect" | "wrong-network" = wrongNetwork
    ? "wrong-network"
    : "connect";

  // Zero-interstitial open: mounting the gate continues the original click
  // gesture — an installed (EIP-6963-announced) wallet connects immediately
  // (extension popup, no second click); several wallets list inline. With NO
  // installed wallet the panel opens CLEAN: no auto-firing (the old code
  // auto-attempted the always-declared injected connector, failed instantly
  // and painted a "no browser wallet detected" error beside two stacked
  // CTAs). The primary CTA IS the one clean WalletConnect action, and the
  // "no wallet detected" error only renders when no connector exists at all.
  const autoTried = useRef(false);
  useEffect(() => {
    if (view !== "connect" || autoTried.current) return;
    autoTried.current = true;
    if (injected.length > 1) setShowOptions(true);
    else if (hasInstalledWallet) void connectInjected();
    else if (!mobileConnector) setError(copy.wallet.noWalletDetected);
    // Run once per mount: connectors and copy are stable for the gate lifetime.
  }, []);

  return (
    <div ref={layerRef} className="wallet-gate-layer" onMouseDown={onClose}>
      <section
        className="wallet-gate"
        role="dialog"
        aria-modal="true"
        aria-label={copy.a11y.walletAccess}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button icon-button--lg wallet-gate-close"
          onClick={onClose}
          aria-label={copy.a11y.closeWalletAccess}
        >
          <X size={16} />
        </button>
        <div className="wallet-gate-art">
          <img
            src="/brand/hero-seal-512.jpg"
            alt="Abstract Axiom wallet access nucleus"
            loading="lazy"
            decoding="async"
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
              {/* Conflict (>1 injected wallet) renders inline — no nested
                  chooser modal. */}
              <Button
                busy={connecting}
                onClick={() => {
                  if (injected.length > 1) setShowOptions(true);
                  else if (hasInstalledWallet) void connectInjected();
                  else if (mobileConnector) void connectMobile();
                }}
                icon={<LockKeyhole size={16} />}
              >
                {copy.nav.connectWallet}
              </Button>
              {showOptions && (
                <div
                  className="connect-options-inline"
                  aria-label={copy.wallet.connectTitle}
                >
                  {connectors.map((c) => {
                    const isInjected = c.type === "injected";
                    return (
                      <Button
                        key={c.uid}
                        variant="secondary"
                        busy={connecting}
                        onClick={() => {
                          setShowOptions(false);
                          void connectWith(c);
                        }}
                      >
                        <span className="connect-option">
                          <strong>
                            {isInjected
                              ? copy.wallet.browserWalletLabel
                              : copy.wallet.walletConnectLabel}
                          </strong>
                          {isInjected ? (
                            <small>{copy.wallet.browserWalletHint}</small>
                          ) : (
                            <small>{copy.wallet.walletConnectHint}</small>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
              {/* Second choice only when the primary is the extension path —
                  with no installed wallet the primary IS WalletConnect, so a
                  duplicate "use mobile" button would be dead-weight UI. */}
              {mobileConnector && hasInstalledWallet && !showOptions && (
                <Button
                  variant="ghost"
                  className="wallet-gate-mobile-cta"
                  busy={connecting}
                  onClick={() => void connectMobile()}
                >
                  {copy.wallet.useMobileWallet}
                </Button>
              )}
              {pairingUri && (
                /* WalletConnect SDK pairing — code surfaced inline in this
                   panel instead of a second modal. */
                <div className="wallet-pairing">
                  <strong>{copy.wallet.pairingTitle}</strong>
                  <span>{copy.wallet.pairingHint}</span>
                  <code>{pairingUri}</code>
                  <CopyButton text={pairingUri} />
                </div>
              )}
              <ErrorNote message={error} />
            </>
          )}

          {view === "wrong-network" && (
            <div className="wallet-state">
              <AlertTriangle
                className="warning-icon"
                size={WALLET_STATE_ICON_SIZE}
              />
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
                icon={<Network size={16} />}
              >
                {interpolate(copy.wallet.switchNetwork, chainVars)}
              </Button>
              <ErrorNote message={error} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
