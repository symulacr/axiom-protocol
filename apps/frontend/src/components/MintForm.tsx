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
import { formatEther, parseAbi } from "viem";
import { humanizeError } from "../utils/format.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { TRANSFER_TOPIC, ZERO_DATA_ROOT } from "@axiom/config/constants";
import { apiFetch } from "../utils/apiFetch.js";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { useMintWizard } from "../hooks/useMintWizard.js";
import {
  COLORS,
  Card,
  Button,
  Alert,
  PageHeader,
  Input,
  Textarea,
} from "./ui.js";

const agentNftAbi = parseAbi(AGENT_NFT_ABI);

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 16,
  fontWeight: "var(--fw-medium)",
  fontSize: "var(--text-sm)",
  color: COLORS.textPrimary,
};

export type MintFormProps = {
  provider?: `0x${string}` | undefined;
  /** Hide page chrome when embedded in a modal */
  compact?: boolean;
  onClose?: () => void;
};

export function MintForm({
  provider,
  compact = false,
  onClose,
}: MintFormProps): ReactElement {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const navigate = useNavigate();
  const { data: walletClient } = useWalletClient();
  const wizard = useMintWizard();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);

  const feeQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: getAxiomAgentNftAddress(chainId),
        abi: agentNftAbi,
        functionName: "mintFee",
        args: undefined,
      },
    ],
    query: {
      enabled: Boolean(getAxiomAgentNftAddress(chainId)),
    },
  });

  const mintFeeWei: bigint | undefined = feeQuery.data?.[0] as bigint | undefined;
  const feeError = (feeQuery.error as Error | null) ?? null;
  const owner = address;

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
      if (mintLog?.topics[3]) {
        const tokenId = BigInt(mintLog.topics[3]).toString();
        onClose?.();
        navigate(`/agents/${tokenId}`);
      } else {
        onClose?.();
        navigate("/app");
      }
    }
  }, [receiptQuery.data, pendingHash, navigate, onClose]);

  const onMintChain = useCallback(async (): Promise<void> => {
    if (!owner || !walletClient || mintFeeWei === undefined) return;
    setSubmitError(null);
    setMintPending(true);
    try {
      const dataHash = wizard.dataHash || wizard.deriveDataHash();
      const encoded = await apiFetch<{
        to: `0x${string}`;
        data: `0x${string}`;
        value: string;
      }>("/v1/agents/mint/encode", {
        method: "POST",
        body: JSON.stringify({
          dataDescription: wizard.agentName.trim(),
          dataHash,
          to: owner,
        }),
      });
      const hash = await walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value),
        chain: walletClient.chain,
      });
      toast.success("Mint submitted — confirming on-chain…");
      setPendingHash(hash);
    } catch (err) {
      setSubmitError(humanizeError(err));
    } finally {
      setMintPending(false);
    }
  }, [owner, walletClient, mintFeeWei, wizard]);

  const onNameChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    wizard.setAgentName(event.target.value);
  }, [wizard]);

  return (
    <div style={{ maxWidth: compact ? "100%" : "36rem", margin: compact ? 0 : "0 auto" }}>
      {!compact && <PageHeader title="Mint agent" />}
      {compact && (
        <p
          style={{
            margin: "0 0 var(--space-md)",
            fontSize: "var(--text-sm)",
            color: COLORS.textMuted,
          }}
        >
          Create an iNFT agent on 0G. Wallet will sign the mint fee.
          {provider ? (
            <span style={{ display: "block", marginTop: 4 }}>
              Provider hint: {provider.slice(0, 10)}…
            </span>
          ) : null}
        </p>
      )}

      <Card>
        <p style={{ fontSize: "var(--text-sm)", color: COLORS.textMuted, marginTop: 0 }}>
          Step {wizard.step === "describe" ? 1 : wizard.step === "oracle" ? 2 : 3} of 3:
          {" "}
          {wizard.step === "describe"
            ? "Describe agent & payload"
            : wizard.step === "oracle"
              ? "Register with oracle"
              : "Mint on-chain"}
        </p>

        {wizard.step === "describe" && (
          <>
            <label htmlFor="agent-name" style={labelStyle}>
              Agent name
            </label>
            <Input
              id="agent-name"
              value={wizard.agentName}
              onChange={onNameChange}
              placeholder="My AI strategy"
              maxLength={100}
              style={{ width: "100%", marginTop: 6 }}
              required
            />
            <label htmlFor="agent-payload" style={labelStyle}>
              Strategy / metadata payload (hashed for dataHash)
            </label>
            <Textarea
              id="agent-payload"
              value={wizard.payloadText}
              onChange={(e) => wizard.setPayloadText(e.target.value)}
              placeholder="Paste strategy JSON or description bytes…"
              rows={4}
              style={{ width: "100%", marginTop: 6 }}
            />
            <Button
              variant="primary"
              style={{ marginTop: "var(--space-lg)" }}
              disabled={wizard.agentName.trim().length === 0}
              onClick={() => {
                wizard.deriveDataHash();
                wizard.setStep("oracle");
              }}
            >
              Next: register oracle
            </Button>
          </>
        )}

        {wizard.step === "oracle" && (
          <>
            <p style={{ fontSize: "var(--text-sm)", color: COLORS.textMuted }}>
              dataHash: <code>{wizard.dataHash || wizard.deriveDataHash()}</code>
            </p>
            {wizard.error ? (
              <Alert variant="error">{wizard.error}</Alert>
            ) : null}
            <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-lg)" }}>
              <Button variant="secondary" onClick={() => wizard.setStep("describe")}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={wizard.busy}
                onClick={() => void wizard.registerOracle()}
              >
                {wizard.busy ? "Registering…" : "Register with oracle"}
              </Button>
            </div>
          </>
        )}

        {wizard.step === "mint" && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void onMintChain();
            }}
          >
            <Alert variant="success" style={{ marginBottom: "var(--space-md)" }}>
              Oracle registered for {wizard.dataHash}
            </Alert>
            <div
              style={{
                padding: "var(--space-md)",
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "var(--radius-lg)",
                fontSize: "var(--text-sm)",
              }}
            >
              Fee:{" "}
              {mintFeeWei === undefined ? (
                "loading…"
              ) : (
                <strong>{formatEther(mintFeeWei)} 0G</strong>
              )}
              {feeError ? ` (${humanizeError(feeError)})` : null}
            </div>
            {submitError ? (
              <Alert variant="error" style={{ marginTop: "var(--space-md)" }}>
                {submitError}
              </Alert>
            ) : null}
            <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-xl)" }}>
              <Button variant="secondary" type="button" onClick={() => wizard.setStep("oracle")}>
                Back
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  !isConnected ||
                  !owner ||
                  mintPending ||
                  mintFeeWei === undefined ||
                  !wizard.oracleOk
                }
              >
                {mintPending ? "Confirming…" : "Mint agent"}
              </Button>
            </div>
          </form>
        )}

        {provider !== undefined && (
          <p style={{ fontSize: "var(--text-xs)", color: COLORS.textDim, marginTop: 12 }}>
            Provider hint: {provider.slice(0, 10)}…
          </p>
        )}
      </Card>
    </div>
  );
}

export default MintForm;