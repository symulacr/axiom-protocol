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
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, keccak256, parseAbi, toBytes } from "viem";
import { humanizeError } from "../utils/format.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

const agentNftAbi = parseAbi(AGENT_NFT_ABI);
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import {
  COLORS,
  Card,
  Button,
  Alert,
  PageHeader,
  Input,
  ConnectedGuard,
} from "./ui.js";

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 16,
  fontWeight: "var(--fw-medium)",
  fontSize: "var(--text-sm)",
  color: COLORS.textPrimary,
};

export type MintFormProps = {
  provider?: `0x${string}` | undefined;
};

export function MintForm({ provider }: MintFormProps): ReactElement {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const { writeContractAsync, isPending } = useWriteContract();

  const [agentName, setAgentName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feeQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: getAxiomAgentNftAddress(),
        abi: agentNftAbi,
        functionName: "mintFee",
        args: undefined,
      },
    ],
    query: {
      enabled: Boolean(getAxiomAgentNftAddress()),
    },
  });

  const mintFeeWei: bigint | undefined = feeQuery.data?.[0] as
    | bigint
    | undefined;
  const feeError = (feeQuery.error as Error | null) ?? null;

  const owner = address;
  const canSubmit =
    isConnected &&
    owner !== undefined &&
    agentName.trim().length > 0 &&
    !isPending;

  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);
  const receiptQuery = useWaitForTransactionReceipt({
    hash: pendingHash ?? undefined,
    query: { enabled: pendingHash !== null },
  });

  // After receipt arrives, extract tokenId and navigate
  useEffect(() => {
    if (receiptQuery.data && pendingHash) {
      const TRANSFER_TOPIC =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const ZERO_TOPIC =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      const mintLog = receiptQuery.data.logs.find(
        (log) =>
          log.topics[0] === TRANSFER_TOPIC && log.topics[1] === ZERO_TOPIC,
      );
      setPendingHash(null);
      if (mintLog?.topics[3]) {
        const tokenId = BigInt(mintLog.topics[3]).toString();
        navigate(`/agents/${tokenId}`);
      } else {
        navigate("/agents");
      }
    }
  }, [receiptQuery.data, pendingHash, navigate]);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const trimmedName = agentName.trim();
      if (
        !canSubmit ||
        !owner ||
        mintFeeWei === undefined ||
        isPending ||
        trimmedName.length === 0
      )
        return;
      setSubmitError(null);
      try {
        const dataHash = keccak256(
          toBytes(`axiom:agent:${trimmedName}:${owner.toLowerCase()}`),
        );
        const hash = await writeContractAsync({
          address: getAxiomAgentNftAddress(),
          abi: agentNftAbi,
          functionName: "mint",
          args: [[{ dataDescription: trimmedName, dataHash }], owner],
          value: mintFeeWei,
        });
        toast.success(`Agent "${agentName}" minted! Confirming on-chain…`);
        setAgentName("");
        setPendingHash(hash);
      } catch (err) {
        setSubmitError(humanizeError(err));
      }
    },
    [canSubmit, agentName, owner, mintFeeWei, isPending, writeContractAsync],
  );

  const onNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setAgentName(event.target.value);
    },
    [],
  );

  return (
    <div style={{ maxWidth: "36rem", margin: "0 auto" }}>
      <ConnectedGuard>
        <PageHeader title="Mint Agent" />

        <Card>
          <form onSubmit={onSubmit}>
            <label htmlFor="agent-name" style={labelStyle}>
              Agent name
            </label>
            <Input
              id="agent-name"
              name="agentName"
              type="text"
              value={agentName}
              onChange={onNameChange}
              placeholder="My AI strategy"
              autoComplete="off"
              maxLength={100}
              style={{ width: "100%", marginTop: 6, boxSizing: "border-box" }}
              required
              aria-describedby="agent-name-count"
            />
            <div
              id="agent-name-count"
              className={`char-count${agentName.length > 80 ? " char-count--warn" : ""}${agentName.length > 100 ? " char-count--over" : ""}`}
            >
              {agentName.length}/100
            </div>

            <div
              style={{
                marginTop: "var(--space-lg)",
                padding: "var(--space-md) var(--space-lg)",
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: "var(--radius-lg)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span
                style={{
                  fontWeight: "var(--fw-medium)",
                  color: COLORS.textPrimary,
                }}
              >
                Fee:{" "}
              </span>
              {feeError !== null ? (
                <span style={{ color: COLORS.danger }}>
                  unavailable ({humanizeError(feeError)})
                </span>
              ) : mintFeeWei === undefined ? (
                <span style={{ color: COLORS.textMuted }}>loading…</span>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: COLORS.bronzeLight,
                    fontWeight: "var(--fw-semibold)",
                  }}
                >
                  {formatEther(mintFeeWei)} 0G
                </span>
              )}
              {provider !== undefined && (
                <span
                  style={{
                    color: COLORS.textDim,
                    marginLeft: "var(--space-md)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  {provider.slice(0, 10)}…
                </span>
              )}
            </div>

            {submitError !== null && (
              <Alert variant="error" style={{ marginTop: "var(--space-md)" }}>
                {submitError}
              </Alert>
            )}

            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                justifyContent: "flex-end",
                marginTop: "var(--space-xl)",
              }}
            >
              <Button
                variant="primary"
                type="submit"
                disabled={!canSubmit || isPending}
              >
                {isPending ? "Confirming…" : "Mint agent"}
              </Button>
            </div>
          </form>
        </Card>
      </ConnectedGuard>
    </div>
  );
}

export default MintForm;
