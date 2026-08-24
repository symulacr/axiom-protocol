/*
  CoSignPage — cross-wallet handoff, receiver side (/transfer/co-sign).

  Public route (no Axiom session needed): the sender's review sheet exports
  the paused challenge as an acceptance link; the receiver opens it on their
  own device, reviews the facts, and signs the EIP-712 AccessProof with the
  receiving wallet. The result is a short code the receiver sends back (or,
  in the same browser, it reaches the sender's tab via the storage event).
  Nothing moves on-chain here — the sender keeps the only submission key.

  Honest states only: unusable link, expired acceptance, wrong network,
  wrong account, signing, done. Copy via copy.flowUi.receive* (en/fr/de).
*/
import { useState } from "react";
import { useAccount, useConnect, useSignTypedData } from "wagmi";
import type { Connector } from "wagmi";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ShieldCheck,
  Timer,
  Wallet as WalletIcon,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy, interpolate } from "../lib/copy.js";
import {
  decodeHandoffPayload,
  encodeHandoffResult,
  HANDOFF_RESULT_STORAGE_KEY,
} from "../lib/transferHandoff.js";
import { ACCESS_PROOF_TYPES } from "../abi/eip712.js";
import { humanizeError, truncateAddress } from "../utils/format.js";

export function CoSignPage({ go }: { go: (path: string) => void }) {
  const { state } = useUiStore();
  const f = getCopy(state.settings.locale).flowUi;
  const search = new URLSearchParams(window.location.search);
  // ~1 KB decode per render — cheaper than memoizing on a recreated URLSearchParams.
  const payload = decodeHandoffPayload(search.get("data") ?? "");
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [copied, setCopied] = useState(false);

  const expired =
    payload !== null &&
    payload.typedData.message.validUntil <=
      BigInt(Math.floor(Date.now() / 1000));
  const wrongNetwork =
    isConnected &&
    chainId !== undefined &&
    payload !== null &&
    chainId !== payload.typedData.domain.chainId;
  // Signature valid only when recovered == receiver address; refuse to prompt for another account.
  const wrongAccount =
    isConnected &&
    address !== undefined &&
    payload !== null &&
    address.toLowerCase() !== payload.typedData.message.to.toLowerCase();

  const connect = async (connector: Connector) => {
    setError(null);
    try {
      await connectAsync({ connector });
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  const sign = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sig = await signTypedDataAsync({
        domain: payload.typedData.domain,
        types: ACCESS_PROOF_TYPES,
        primaryType: "AccessProof",
        message: payload.typedData.message,
        account: payload.typedData.message.to,
      });
      setSignature(sig);
      // Same-browser handoff: sender's review sheet auto-applies via this storage event (nonce-matched).
      try {
        localStorage.setItem(
          HANDOFF_RESULT_STORAGE_KEY,
          encodeHandoffResult(sig, payload.typedData.message.nonce),
        );
      } catch {
        // storage unavailable (private mode) — the code fallback still works
      }
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!signature) return;
    try {
      await navigator.clipboard?.writeText(signature);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the code stays selectable in the panel
    }
  };

  const wrapperClass = "ops-page cosign-page";

  if (payload === null) {
    return (
      <div className={wrapperClass}>
        <div className="panel cosign-panel">
          <div className="review-error" role="alert">
            <AlertTriangle size={14} />
            <div>
              <strong>{f.receiveBadTitle}</strong>
              <p>{f.receiveBadBody}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => go("/")}
            icon={<ArrowLeft size={15} />}
          >
            Axiom
          </Button>
        </div>
      </div>
    );
  }

  const receiver = payload.typedData.message.to;
  const expiryDate = new Date(
    Number(payload.typedData.message.validUntil) * 1000,
  );

  return (
    <div className={wrapperClass}>
      <div className="page-head">
        <div>
          <h1>{f.receiveTitle}</h1>
          <p>{f.receiveLede}</p>
        </div>
        {signature ? (
          <StatePill state="confirmed" />
        ) : expired ? (
          <StatePill state="stale" />
        ) : (
          <StatePill state="signing" />
        )}
      </div>

      <div className="flow-layout review-first-layout">
        <section className="flow-stage panel">
          <dl className="review-facts">
            <div>
              <dt>{f.receiveAgent}</dt>
              <dd>#{payload.meta.tokenId}</dd>
            </div>
            <div>
              <dt>{f.receiveSender}</dt>
              <dd className="mono">{truncateAddress(payload.meta.sender)}</dd>
            </div>
            <div>
              <dt>{f.receiveReceiver}</dt>
              <dd className="mono">{truncateAddress(receiver)}</dd>
            </div>
            <div>
              <dt>{f.receiveExpiry}</dt>
              <dd>{expiryDate.toLocaleString()}</dd>
            </div>
            <div>
              <dt>{f.receiveNetwork}</dt>
              <dd>
                {interpolate(f.networkFact, {
                  chainName: "",
                  chainId: payload.typedData.domain.chainId,
                }).replace(/^ · /, "")}
              </dd>
            </div>
          </dl>

          {expired && (
            <div
              className="review-error"
              role="alert"
              data-testid="cosign-expired"
            >
              <AlertTriangle size={14} />
              <div>
                <strong>{f.receiveExpiredTitle}</strong>
                <p>{f.receiveExpiredBody}</p>
              </div>
            </div>
          )}
          {!expired && wrongNetwork && (
            <div
              className="review-error"
              role="alert"
              data-testid="cosign-wrong-chain"
            >
              <AlertTriangle size={14} />
              <div>
                <p>
                  {interpolate(f.receiveWrongChain, {
                    chainId: payload.typedData.domain.chainId,
                  })}
                </p>
              </div>
            </div>
          )}
          {!expired && wrongAccount && (
            <div
              className="review-error"
              role="alert"
              data-testid="cosign-wrong-account"
            >
              <AlertTriangle size={14} />
              <div>
                <p>
                  {interpolate(f.receiveWrongAccount, {
                    connected: truncateAddress(address ?? ""),
                    receiver: truncateAddress(receiver),
                  })}
                </p>
              </div>
            </div>
          )}

          {signature ? (
            <div className="review-cosign" data-testid="cosign-done">
              <Check size={14} />
              <div>
                <strong>{f.receiveDoneTitle}</strong>
                <p>{f.receiveDoneBody}</p>
                <pre className="mono cosign-code">{signature}</pre>
                <div className="review-handoff-actions">
                  <Button
                    variant={copied ? "secondary" : "primary"}
                    onClick={() => void copyCode()}
                    icon={<Copy size={14} />}
                  >
                    {copied ? f.receiveCodeCopied : f.receiveCopyCode}
                  </Button>
                </div>
                <small>{f.receiveDoneSameBrowser}</small>
              </div>
            </div>
          ) : (
            !expired && (
              <div className="review-cosign" data-testid="cosign-action">
                <ShieldCheck size={14} />
                <div>
                  <strong>{f.receiveAcceptTitle}</strong>
                  <p>
                    {interpolate(f.receiveAcceptBody, {
                      receiver: truncateAddress(receiver),
                    })}
                  </p>
                  <small>{f.reviewDisclaimer}</small>
                </div>
              </div>
            )
          )}

          {error && (
            <div className="review-error" role="alert">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {!signature && !expired && (
            <div className="review-actions">
              {!isConnected ? (
                connectors.length === 1 ? (
                  <Button
                    busy={isConnecting}
                    onClick={() => void connect(connectors[0]!)}
                    icon={<WalletIcon size={15} />}
                  >
                    {f.receiveConnect}
                  </Button>
                ) : (
                  connectors.map((connector) => (
                    <Button
                      key={connector.uid}
                      variant="secondary"
                      busy={isConnecting}
                      onClick={() => void connect(connector)}
                      icon={<WalletIcon size={15} />}
                    >
                      {connector.name}
                    </Button>
                  ))
                )
              ) : (
                <Button
                  busy={busy}
                  disabled={wrongAccount}
                  onClick={() => void sign()}
                  icon={busy ? <Timer size={15} /> : <ShieldCheck size={15} />}
                >
                  {busy ? f.receiveSigning : f.receiveSign}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => go("/")}
                icon={<ArrowLeft size={15} />}
              >
                Axiom
              </Button>
            </div>
          )}
        </section>

        <aside className="flow-context panel">
          <h2>{f.liveRouteNote}</h2>
          <div className="diagnostic-note">
            <ShieldCheck size={14} />
            <span>
              {interpolate(f.chainLive, {
                chainId: payload.typedData.domain.chainId,
              })}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
