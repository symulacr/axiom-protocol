/*
  Live WalletGate — the v2 mockup's gate states driven by wagmi:
    disconnected → connector list (useConnect)
    connecting   → pending connect()
    wrong-network→ useSwitchChain (app chain from config/wagmi)
    signing      → SIWE-lite session sign (same EIP-191 pattern the chat
                   history proof uses, over an axiom-console-session message)
    profile      → name the local operator profile (stored in the session)
    authenticated/ rejected / timeout → resume / retry states.
  The signature is non-transactional and cached only in the local session
  (axiom-session in localStorage, via the uiStore).
*/
import { useState } from "react";
import { useAccount, useConnect, useSignMessage, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Network,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  X,
} from "./icons.js";
import { Button, Field } from "./Controls.js";
import { Logo } from "./AppShell.js";

import { getCopy, interpolate, type Locale } from "../../lib/copy.js";
import type { PrototypeAction } from "../../lib/prototypeStore.js";
import type { Session } from "../../lib/models.js";
import { humanizeError } from "../../utils/format.js";
import { useModalDismiss } from "../../hooks/useModalDismiss.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../../config/wagmi.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_MESSAGE = (address: string, ts: number) =>
  `axiom-console-session-v1:${address.toLowerCase()}:${ts}`;

export function isSessionFresh(session: Session): boolean {
  if (session.status !== "authenticated" || !session.signedAt) return false;
  return Date.now() - Date.parse(session.signedAt) < SESSION_TTL_MS;
}

export { SESSION_MESSAGE };

function connectorLabel(connector: Connector): {
  name: string;
  hint: string;
  mark: string;
} {
  const id = connector.id.toLowerCase();
  const name = connector.name || "Browser wallet";
  if (id.includes("walletconnect"))
    return { name, hint: "Scan with a mobile wallet", mark: "W" };
  if (id.includes("coinbase"))
    return { name, hint: "Coinbase wallet", mark: "C" };
  if (id.includes("metamask") || id.includes("injected"))
    return { name, hint: "Browser extension", mark: "M" };
  return {
    name,
    hint: "Connect via wallet",
    mark: id.slice(0, 1).toUpperCase() || "W",
  };
}

export function WalletGate({
  session,
  dispatch,
  onClose,
  onAuthenticated,
  locale,
}: {
  session: Session;
  dispatch: React.Dispatch<PrototypeAction>;
  onClose: () => void;
  onAuthenticated: () => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  // C-08: the target network in copy is always the configured chain, never a
  // literal ("Switch to 0G Mainnet" told testnet users the wrong network).
  const chainVars = { chainName: APP_CHAIN.name, chainId: APP_CHAIN_ID };
  const { address, isConnected, chainId, connector } = useAccount();
  const {
    connectors,
    connectAsync,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState(session.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // C-14 dismiss trio: Esc + focus restore here; backdrop via layer onMouseDown
  // below; X already exists. Dismiss is safe in every view — the X was never
  // gated during signing, session state is untouched by closing, and the gate
  // re-opens from any locked CTA (the wagmi connection persists).
  useModalDismiss(onClose);

  const wrongNetwork =
    isConnected && chainId !== undefined && chainId !== APP_CHAIN_ID;

  // Derived gate view — live wagmi state wins over the stored session status
  // except for the post-signature states (rejected/timeout/profile/authenticated).
  const view:
    | "connect"
    | "connecting"
    | "wrong-network"
    | "signing"
    | "profile"
    | "authenticated"
    | "rejected"
    | "timeout" =
    session.status === "rejected"
      ? "rejected"
      : session.status === "timeout"
        ? "timeout"
        : session.status === "profile"
          ? "profile"
          : session.status === "authenticated"
            ? "authenticated"
            : wrongNetwork
              ? "wrong-network"
              : isConnected
                ? "signing"
                : isConnecting
                  ? "connecting"
                  : "connect";

  const connect = async (c: Connector) => {
    setError(null);
    try {
      await connectAsync({ connector: c });
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  const switchNetwork = async () => {
    setError(null);
    try {
      // APP_CHAIN_ID is env-resolved (number); the wagmi config only registers
      // 16661/16602, so narrow it to the configured union for switchChain.
      await switchChainAsync({ chainId: APP_CHAIN_ID as 16661 | 16602 });
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  const approve = async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const ts = Math.floor(Date.now() / 1000);
      await signMessageAsync({ message: SESSION_MESSAGE(address, ts) });
      dispatch({
        type: "session",
        session: {
          status: session.profile ? "authenticated" : "profile",
          address,
          wallet: connector?.name ?? session.wallet,
          chain: APP_CHAIN_ID,
          signedAt: new Date().toISOString(),
        },
      });
      if (session.profile) onAuthenticated();
    } catch (err) {
      dispatch({
        type: "session",
        session: {
          status: "rejected",
          address,
          chain: chainId ?? APP_CHAIN_ID,
        },
      });
      setError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const reject = () =>
    dispatch({ type: "session", session: { status: "rejected" } });
  const retry = () => {
    setError(null);
    dispatch({
      type: "session",
      session: { status: "disconnected", signedAt: null },
    });
  };

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    dispatch({
      type: "session",
      session: { status: "authenticated", profile: profile || "axiom.main" },
    });
    onAuthenticated();
  };

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
            <span className="eyebrow">AXIOM ACCESS PROTOCOL</span>
            <strong>
              One wallet.
              <br />
              <i>One accountable session.</i>
            </strong>
            <span>Non-custodial access with a visible signature boundary.</span>
          </div>
        </div>
        <div className="wallet-gate-panel">
          {/* S2 (audit 06 FINDING-004 / duplication map #8): one label per
              state — the localized phase eyebrow (S1's DOM copy.wallet.phase*
              strings) + the h2 carry it; the head's Status pill repeated the
              raw view name a third time and is gone. */}
          <div className="wallet-gate-head">
            <Logo compact />
          </div>

          {view === "connect" && (
            <>
              {/* S1 (audit 06 FINDING-004): the phase label was CSS ::after
                  content — invisible to i18n/grep. Real DOM copy now, straight
                  from copy.wallet. */}
              <span className="eyebrow copper">{copy.wallet.phaseConnect}</span>
              <h1 id="wallet-title">
                Enter the
                <br />
                <i>command surface.</i>
              </h1>
              <p>
                Connect a wallet to create a local operator session. Axiom never
                asks for seed phrases or custody.
              </p>
              <div className="wallet-options">
                {connectors.map((c) => {
                  const meta = connectorLabel(c);
                  return (
                    <button
                      key={c.uid}
                      className="wallet-option"
                      onClick={() => void connect(c)}
                    >
                      <span
                        className={`wallet-option-mark ${c.id.includes("walletconnect") ? "wallet-connect-mark" : ""}`}
                      >
                        {meta.mark}
                      </span>
                      <span>
                        <strong>{meta.name}</strong>
                        <small>{meta.hint}</small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  );
                })}
              </div>
              {connectError && (
                <p className="wallet-gate-error" role="alert">
                  {humanizeError(connectError)}
                </p>
              )}
              <p className="wallet-gate-foot-note">
                <ShieldCheck size={14} /> A signature is requested only after
                chain verification.
              </p>
            </>
          )}

          {view === "connecting" && (
            <div className="wallet-state">
              <span className="eyebrow">CONNECTING</span>
              <h2>{copy.wallet.connectingTitle}</h2>
              <p>
                {copy.wallet.connectingDescription} Waiting for the wallet to
                respond; no transaction, approval, or signature has been
                requested.
              </p>
              <div
                className="state-progress"
                role="status"
                aria-label={copy.a11y.walletWaiting}
              >
                <i />
                <i />
                <i />
              </div>
            </div>
          )}

          {view === "wrong-network" && (
            <div className="wallet-state">
              <AlertTriangle className="warning-icon" size={28} />
              <span className="eyebrow copper">{copy.wallet.phaseNetwork}</span>
              <h2>{interpolate(copy.wallet.wrongNetworkTitle, chainVars)}</h2>
              <p>{copy.wallet.wrongNetworkDescription}</p>
              <div className="network-check">
                <span>Network mismatch</span>
                <strong>Connected: chain {chainId ?? "unknown"}</strong>
                <small>
                  Required: {APP_CHAIN.name} · chain {APP_CHAIN_ID}
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

          {view === "signing" && (
            <div className="wallet-state">
              <KeyRound className="copper" size={28} />
              <span className="eyebrow copper">{copy.wallet.phaseSigning}</span>
              <h2>Confirm the access message.</h2>
              <p>
                Review the non-transactional message in{" "}
                {connector?.name ?? "your wallet"}. No gas, transfer or approval
                is requested.
              </p>
              <div className="signature-preview">
                <span className="mono">
                  axiom-console-session-v1 · chain {APP_CHAIN_ID}
                </span>
                <strong>{address}</strong>
                <small>Session only · re-signed after 24h</small>
              </div>
              <div className="button-row">
                <Button
                  busy={busy}
                  onClick={() => void approve()}
                  icon={<ShieldCheck size={15} />}
                >
                  {copy.wallet.approveSignature}
                </Button>
                <Button
                  variant="danger"
                  onClick={reject}
                  icon={<X size={15} />}
                >
                  {copy.wallet.rejectSignature}
                </Button>
              </div>
              {error && (
                <p className="wallet-gate-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          {view === "profile" && (
            <form className="wallet-state" onSubmit={saveProfile}>
              <span className="eyebrow copper">{copy.wallet.phaseProfile}</span>
              <h2>{copy.wallet.profileTitle}</h2>
              <p>{copy.wallet.profileDescription}</p>
              <Field
                label="Profile name"
                value={profile}
                onChange={setProfile}
                hint={copy.wallet.profileHint}
              />
              <Button type="submit" icon={<LockKeyhole size={15} />}>
                {copy.wallet.unlockConsole}
              </Button>
            </form>
          )}

          {view === "authenticated" && (
            <div className="wallet-state">
              <CircleCheck className="copper" size={28} />
              <span className="eyebrow">SESSION READY</span>
              <h2>
                Console access
                <br />
                <i>is already verified.</i>
              </h2>
              <p>
                Resume the local operator session or return to the landing page.
                No new signature is requested.
              </p>
              <Button
                onClick={onAuthenticated}
                icon={<LayoutDashboard size={15} />}
              >
                Open operator console
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                icon={<ArrowLeft size={14} />}
              >
                Return to landing
              </Button>
            </div>
          )}

          {view === "rejected" && (
            <div className="wallet-state">
              <ShieldAlert className="warning-icon" size={28} />
              <span className="eyebrow">SIGNATURE REJECTED</span>
              <h2>{copy.wallet.rejectedTitle}</h2>
              <p>
                {copy.wallet.rejectedDescription} The access signature was
                declined before a session was created.
              </p>
              <Button onClick={retry} icon={<RotateCcw size={15} />}>
                {copy.wallet.retryConnection}
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                icon={<ArrowLeft size={14} />}
              >
                Return to landing
              </Button>
            </div>
          )}

          {view === "timeout" && (
            <div className="wallet-state">
              <Timer className="warning-icon" size={28} />
              <span className="eyebrow">CONNECTION TIMEOUT</span>
              <h2>{copy.wallet.timeoutTitle}</h2>
              <p>
                {copy.wallet.timeoutDescription} The wallet did not respond
                before this access request expired.
              </p>
              <Button onClick={retry} icon={<RefreshCw size={15} />}>
                {copy.wallet.retryConnection}
              </Button>
            </div>
          )}
          {/* S1 (audit 06 FINDING-014 / duplication map #9): the foot repeated
              "Non-custodial access" (art panel above) and the network name
              (sidebar rail card + wrong-network check) on every gate state. */}
        </div>
      </section>
    </div>
  );
}
