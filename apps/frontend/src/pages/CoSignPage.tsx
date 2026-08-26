/*
  CoSignPage — cross-wallet handoff, receiver side (/transfer/co-sign).

  Public route (no Axiom session needed): the sender's review sheet exports
  the paused challenge as an acceptance link; the receiver opens it on their
  own device, reviews the facts, and signs the EIP-712 AccessProof with the
  receiving wallet. The result is a short code the receiver sends back (or,
  in the same browser, it reaches the sender's tab via the storage event).
  Nothing moves on-chain here — the sender keeps the only submission key.

  Honest states only: bare visit (orientation), unusable link, expired
  acceptance, wrong network, wrong account, signing, done. Copy via
  copy.flowUi.receive* (en/fr/de).
*/
import { useState, type ReactElement, type ReactNode } from "react";
import { useAccount, useConnect, useConnectors, useSignTypedData } from "wagmi";
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
import { Button, Fact, PageHead } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { useUiStore } from "../lib/uiStore.js";
import { getCopy, interpolate } from "../lib/copy.js";
import {
  decodeHandoffPayload,
  encodeHandoffResult,
  encodeHandoffResultToken,
  handoffClaimUrl,
  HANDOFF_RESULT_STORAGE_KEY,
} from "../lib/transferHandoff.js";
import { ACCESS_PROOF_TYPES } from "../abi/addresses.js";
import { humanizeError, truncateAddress } from "../utils/format.js";

/** Shared alert row — every honest blocker on this page renders the same shell. */
function ReviewError({
  testId,
  title,
  children,
}: {
  testId?: string;
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="review-error" role="alert" data-testid={testId}>
      <AlertTriangle size={14} />
      <div>
        {title !== undefined && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function CoSignPage({ go }: { go: (path: string) => void }) {
  const { state } = useUiStore();
  const f = getCopy(state.settings.locale).flowUi;
  const search = new URLSearchParams(window.location.search);
  // ~1 KB decode per render — cheaper than memoizing on a recreated URLSearchParams.
  const rawToken = search.get("data");
  const payload = decodeHandoffPayload(rawToken ?? "");
  const { address, isConnected, chainId } = useAccount();
  // Widened to the base type — v3's useConnectors() infers the exact config
  // tuple (length 2), which breaks the single-connector length check below.
  const connectors: readonly Connector[] = useConnectors();
  const { connectAsync, isPending: isConnecting } = useConnect();
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
    // U26: the receiver sends ONE piece — the claim link; raw signature stays behind "Advanced".
    if (!claimUrl) return;
    try {
      await navigator.clipboard?.writeText(claimUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — token and link stay selectable in the panel
    }
  };

  const wrapperClass = "ops-page cosign-page";

  if (payload === null) {
    // Bare visit (no ?data=): orientation, not an error — the receiver likely
    // opened the page directly instead of following the acceptance link.
    if (rawToken === null) {
      return (
        <div className={wrapperClass}>
          <div className="panel cosign-panel">
            <div className="review-cosign" data-testid="cosign-no-link">
              <ShieldCheck size={14} />
              <div>
                <strong>{f.receiveNoLinkTitle}</strong>
                <p>{f.receiveNoLinkBody}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => go("/")}
              icon={<ArrowLeft size={15} />}
            >
              {f.goHome}
            </Button>
          </div>
        </div>
      );
    }
    // Present-but-unusable token: genuine damaged/expired-link error.
    return (
      <div className={wrapperClass}>
        <div className="panel cosign-panel">
          <ReviewError title={f.receiveBadTitle}>
            <p>{f.receiveBadBody}</p>
          </ReviewError>
          <Button
            variant="ghost"
            onClick={() => go("/")}
            icon={<ArrowLeft size={15} />}
          >
            {f.goHome}
          </Button>
        </div>
      </div>
    );
  }

  const receiver = payload.typedData.message.to;
  // U26: one-piece claim token + full claim link for the sender's /transfer page.
  const resultToken = signature
    ? encodeHandoffResultToken(signature, payload.typedData.message.nonce)
    : null;
  const claimUrl = resultToken ? handoffClaimUrl(resultToken) : null;
  const expiryDate = new Date(
    Number(payload.typedData.message.validUntil) * 1000,
  );

  return (
    <div className={wrapperClass}>
      <PageHead title={f.receiveTitle} lede={f.receiveLede}>
        {signature ? (
          <StatePill state="confirmed" />
        ) : expired ? (
          <StatePill state="stale" />
        ) : (
          <StatePill state="signing" />
        )}
      </PageHead>

      <div className="flow-layout review-first-layout">
        <section className="flow-stage panel">
          <dl className="review-facts">
            <Fact label={f.receiveAgent}>#{payload.meta.tokenId}</Fact>
            <Fact label={f.receiveSender} mono>
              {truncateAddress(payload.meta.sender)}
            </Fact>
            <Fact label={f.receiveReceiver} mono>
              {truncateAddress(receiver)}
            </Fact>
            <Fact label={f.receiveExpiry}>{expiryDate.toLocaleString()}</Fact>
            <Fact label={f.receiveNetwork}>
              {interpolate(f.networkFact, {
                chainName: "",
                chainId: payload.typedData.domain.chainId,
              }).replace(/^ · /, "")}
            </Fact>
          </dl>

          {expired && (
            <ReviewError testId="cosign-expired" title={f.receiveExpiredTitle}>
              <p>{f.receiveExpiredBody}</p>
            </ReviewError>
          )}
          {!expired && wrongNetwork && (
            <ReviewError testId="cosign-wrong-chain">
              <p>
                {interpolate(f.receiveWrongChain, {
                  chainId: payload.typedData.domain.chainId,
                })}
              </p>
            </ReviewError>
          )}
          {!expired && wrongAccount && (
            <ReviewError testId="cosign-wrong-account">
              <p>
                {interpolate(f.receiveWrongAccount, {
                  connected: truncateAddress(address ?? ""),
                  receiver: truncateAddress(receiver),
                })}
              </p>
            </ReviewError>
          )}

          {signature ? (
            <div className="review-cosign" data-testid="cosign-done">
              <Check size={14} />
              <div>
                <strong>{f.receiveDoneTitle}</strong>
                <p>{f.receiveDoneBody}</p>
                {/* proto-subpages-b: the happy path presents ONE artifact — the
                    approval link; raw signature + token live behind Advanced. */}
                <dl className="drawer-list">
                  <div>
                    <dt>{f.claimUrlLabel}</dt>
                    <dd className="mono">{claimUrl}</dd>
                  </div>
                </dl>
                <details>
                  <summary>{f.claimRawToggle}</summary>
                  <pre className="mono cosign-code">{resultToken}</pre>
                  <pre className="mono cosign-code">{signature}</pre>
                </details>
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

          {error && <ReviewError>{error}</ReviewError>}

          {!signature && !expired && (
            <div className="review-actions">
              {!isConnected ? (
                (connectors.length === 1 ? [connectors[0]!] : connectors).map(
                  (connector) => (
                    <Button
                      key={connector.uid}
                      variant={
                        connectors.length === 1 ? undefined : "secondary"
                      }
                      busy={isConnecting}
                      onClick={() => void connect(connector)}
                      icon={<WalletIcon size={15} />}
                    >
                      {connectors.length === 1
                        ? f.receiveConnect
                        : connector.name}
                    </Button>
                  ),
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
                {f.goHome}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
