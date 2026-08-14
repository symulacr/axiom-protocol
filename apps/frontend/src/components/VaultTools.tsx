import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { humanizeError } from "../utils/format.js";
import { Alert, Button, COLORS, Card, Input, SectionTitle } from "./ui.js";
import { useChainId, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { AGENT_NFT_ABI, VAULT_ABI } from "@axiom/config/abis";
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { toViemAbi } from "../lib/abi.js";
import { isAddress } from "viem";

export { DepositForm, WithdrawForm } from "./VaultAmountForm.js";

const vaultAbi = toViemAbi(VAULT_ABI);

export function StrategyPanel({ tokenId }: { tokenId: bigint }): ReactElement {
  const chainId = useChainId();
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [strategyRoot, setStrategyRoot] = useState("");
  const [dailyLimit, setDailyLimit] = useState("1000000000000000");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      const root = strategyRoot.trim();
      if (!root.startsWith("0x") || root.length !== 66) {
        setError("Strategy root must be a 32-byte hex string (0x…).");
        return;
      }
      try {
        await writeContractAsync({
          address: vaultAddr,
          abi: vaultAbi,
          functionName: "setStrategy",
          args: [tokenId, root as `0x${string}`, BigInt(dailyLimit), 0n],
        });
        toast.success("Strategy bound on vault");
        setStrategyRoot("");
      } catch (err) {
        setError(humanizeError(err));
      }
    },
    [strategyRoot, dailyLimit, writeContractAsync, vaultAddr, tokenId],
  );

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Bind strategy</SectionTitle>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: COLORS.textMuted,
          marginTop: 0,
        }}
      >
        Root from your 0G upload + daily spend limit (wei).
      </p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            marginBottom: 6,
          }}
        >
          Strategy root (bytes32)
        </label>
        <Input
          value={strategyRoot}
          onChange={(e) => setStrategyRoot(e.target.value)}
          placeholder="0x…"
          style={{ width: "100%", marginBottom: "var(--space-md)" }}
        />
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            marginBottom: 6,
          }}
        >
          Daily limit (wei)
        </label>
        <Input
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          style={{ width: "100%", marginBottom: "var(--space-md)" }}
        />
        {error ? (
          <Alert variant="error" style={{ marginBottom: "var(--space-md)" }}>
            {error}
          </Alert>
        ) : null}
        <Button variant="primary" type="submit" disabled={isPending}>
          {isPending ? "Confirming…" : "Set strategy"}
        </Button>
      </form>
    </Card>
  );
}

const agentAbi = toViemAbi(AGENT_NFT_ABI);

export function DelegatePanel({ tokenId }: { tokenId: bigint }): ReactElement {
  const chainId = useChainId();
  const nftAddr = getAxiomAgentNftAddress(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [delegate, setDelegate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authorize = useCallback(async () => {
    setError(null);
    const addr = delegate.trim();
    if (!isAddress(addr)) {
      setError("Enter a valid delegate address.");
      return;
    }
    try {
      await writeContractAsync({
        address: nftAddr,
        abi: agentAbi,
        functionName: "authorizeUsage",
        args: [tokenId, addr],
      });
      toast.success("Delegate authorized");
      setDelegate("");
    } catch (err) {
      setError(humanizeError(err));
    }
  }, [delegate, writeContractAsync, nftAddr, tokenId]);

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Delegate access</SectionTitle>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: COLORS.textMuted,
          marginTop: 0,
        }}
      >
        Allow another wallet to act on this agent.
      </p>
      <Input
        value={delegate}
        onChange={(e) => setDelegate(e.target.value)}
        placeholder="0x delegate address"
        style={{ width: "100%", marginBottom: "var(--space-sm)" }}
      />
      {error ? (
        <Alert variant="error" style={{ marginBottom: "var(--space-sm)" }}>
          {error}
        </Alert>
      ) : null}
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() => void authorize()}
      >
        {isPending ? "Confirming…" : "Authorize delegate"}
      </Button>
    </Card>
  );
}
