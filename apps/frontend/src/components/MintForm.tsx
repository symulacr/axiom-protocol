import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWalletClient,
} from "wagmi";
import { formatTokenAmount, humanizeError } from "../utils/format.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { TRANSFER_TOPIC, ZERO_DATA_ROOT } from "@axiom/config/constants";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { toViemAbi } from "../lib/abi.js";
import { useMintWizard } from "../hooks/useMintWizard.js";
import { COLORS, Card, Button, Alert, Input } from "./ui.js";

const MINT_STEPS = ["Oracle registration", "Chain mint", "Confirm"] as const;
const MINT_NARR = [
  "Registering with oracle",
  "Preparing mint transaction",
  "Confirm in wallet / on-chain",
] as const;

type MintFormProps = {
  provider?: `0x${string}` | undefined;
  onClose?: () => void;
};

/** One-field mint (name only): auto strategy payload → oracle dataHash → wallet signs the mint fee. */
export function MintForm({ provider, onClose }: MintFormProps): ReactElement {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const navigate = useNavigate();
  const { data: walletClient } = useWalletClient();
  const wizard = useMintWizard();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);
  const [phase, setPhase] = useState<"idle" | "oracle" | "chain" | "confirm">(
    "idle",
  );

  const feeQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: getAxiomAgentNftAddress(chainId),
        abi: toViemAbi(AGENT_NFT_ABI),
        functionName: "mintFee",
        args: undefined,
      },
    ],
    query: {
      enabled: Boolean(getAxiomAgentNftAddress(chainId)),
    },
  });

  const mintFeeWei: bigint | undefined = feeQuery.data?.[0] as
    bigint | undefined;
  const feeError = (feeQuery.error as Error | null) ?? null;

  const receiptQuery = useWaitForTransactionReceipt({
    hash: pendingHash ?? undefined,
    query: { enabled: pendingHash !== null },
  });

  useEffect(() => {
    if (receiptQuery.data && pendingHash) {
      const mintLog = receiptQuery.data.logs.find(
        (log) =>
          log.topics[0] === TRANSFER_TOPIC && log.topics[1] === ZERO_DATA_ROOT,
      );
      setPendingHash(null);
      setPhase("idle");
      if (mintLog?.topics[3]) {
        const tokenId = BigInt(mintLog.topics[3]).toString();
        toast.success(`Agent #${tokenId} minted`);
        onClose?.();
        navigate(`/agents/${tokenId}`);
      } else {
        onClose?.();
        navigate("/app");
      }
    }
  }, [receiptQuery.data, pendingHash, navigate, onClose]);

  const onMintChain = useCallback(
    async (dataHash: `0x${string}`): Promise<void> => {
      setPhase("chain");
      const hash = await wizard.chainMint(dataHash);
      setPhase("confirm");
      toast.success("Mint submitted — confirming on-chain…");
      setPendingHash(hash);
    },
    [wizard],
  );

  const onCompleteMint = useCallback(
    async (e?: FormEvent): Promise<void> => {
      e?.preventDefault();
      if (!wizard.agentName.trim()) return;
      if (!isConnected || !address || !walletClient) {
        setSubmitError("Connect a wallet to mint.");
        return;
      }
      if (mintFeeWei === undefined) {
        setSubmitError("Mint fee still loading — try again in a moment.");
        return;
      }
      setSubmitError(null);
      setMintPending(true);
      try {
        setPhase("oracle");
        const hash = await wizard.registerOracle(wizard.agentName);
        await onMintChain(hash);
      } catch (err) {
        setSubmitError(humanizeError(err));
        setPhase("idle");
      } finally {
        setMintPending(false);
      }
    },
    [wizard, isConnected, address, walletClient, mintFeeWei, onMintChain],
  );

  const onNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      wizard.setAgentName(event.target.value);
      setSubmitError(null);
    },
    [wizard],
  );

  const busy =
    mintPending ||
    wizard.busy ||
    pendingHash !== null ||
    phase === "oracle" ||
    phase === "chain" ||
    phase === "confirm";

  const stepIdx: number =
    phase === "idle" ? -1 : phase === "oracle" ? 0 : phase === "chain" ? 1 : 2;
  const phaseLabel = stepIdx >= 0 ? `${MINT_NARR[stepIdx]}…` : null;

  return (
    <div>
      <p
        style={{
          margin: "0 0 var(--space-md)",
          fontSize: "var(--text-sm)",
          color: COLORS.textMuted,
        }}
      >
        Name only — default payload + oracle, then wallet pays the 0G mint fee.
      </p>

      <Card>
        <form onSubmit={(e) => void onCompleteMint(e)}>
          <label
            htmlFor="agent-name"
            style={{
              display: "block",
              fontWeight: "var(--fw-medium)",
              fontSize: "var(--text-sm)",
              color: COLORS.textPrimary,
            }}
          >
            Agent name
          </label>
          <Input
            id="agent-name"
            value={wizard.agentName}
            onChange={onNameChange}
            placeholder="e.g. Scout"
            maxLength={100}
            autoFocus
            disabled={busy}
            style={{ width: "100%", marginTop: 8 }}
            required
          />

          <div
            className="surface-lcd"
            style={{
              marginTop: "var(--space-lg)",
              padding: "var(--space-md)",
              fontSize: "var(--text-xs)",
            }}
          >
            <div style={{ opacity: 0.75, marginBottom: 4 }}>Mint fee</div>
            <div
              style={{ fontSize: "var(--text-sm)", color: "var(--c-phosphor)" }}
            >
              {mintFeeWei === undefined && feeError ? (
                <span style={{ color: COLORS.warning }}>
                  {humanizeError(feeError)}
                </span>
              ) : mintFeeWei === undefined ? (
                "Loading…"
              ) : (
                <>
                  {formatTokenAmount(mintFeeWei)} 0G
                  {feeError ? (
                    <span style={{ color: COLORS.warning }}>
                      {" "}
                      ({humanizeError(feeError)})
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {stepIdx >= 0 && (
            <ol
              style={{
                display: "grid",
                gap: "var(--space-sm)",
                margin: "var(--space-md) 0 0",
                padding: 0,
                listStyle: "none",
                fontSize: "var(--text-sm)",
              }}
            >
              {MINT_STEPS.map((label, i) => (
                <li
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color:
                      i < stepIdx
                        ? "var(--c-phosphor)"
                        : i === stepIdx
                          ? COLORS.textPrimary
                          : COLORS.textDim,
                  }}
                >
                  {i < stepIdx ? (
                    <span aria-hidden="true">✓</span>
                  ) : i === stepIdx ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        border: "2px solid var(--c-border)",
                        borderTopColor: COLORS.bronze,
                        animation: "axiom-spin var(--dur-spin) linear infinite",
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: COLORS.textDim,
                      }}
                    />
                  )}{" "}
                  {label}
                </li>
              ))}
            </ol>
          )}
          <span
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            {phaseLabel
              ? `${phaseLabel} — step ${stepIdx + 1} of ${MINT_STEPS.length}`
              : ""}
          </span>

          {wizard.error || submitError ? (
            <Alert
              variant="error"
              className="axiom-error-shake"
              style={{ marginTop: "var(--space-md)" }}
            >
              {submitError ?? wizard.error}
            </Alert>
          ) : null}

          <Button
            variant="primary"
            type="submit"
            disabled={
              busy ||
              wizard.agentName.trim().length === 0 ||
              !isConnected ||
              mintFeeWei === undefined
            }
            style={{ width: "100%", marginTop: "var(--space-xl)" }}
          >
            {busy
              ? (phaseLabel ?? "Working…")
              : !isConnected
                ? "Connect wallet to mint"
                : "Mint agent"}
          </Button>

          {provider !== undefined && (
            <p
              style={{
                fontSize: "var(--text-xs)",
                color: COLORS.textDim,
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              Provider hint: {provider.slice(0, 10)}…
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
