import { useCallback, useState, type FormEvent, type ReactElement } from "react";
import { useChainId, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { VAULT_ABI } from "@axiom/config/abis";
import { getAxiomStrategyVaultAddress } from "../abi/addresses.js";
import { humanizeError } from "../utils/format.js";
import { COLORS, Card, Button, Input, SectionTitle, Alert } from "./ui.js";

const vaultAbi = VAULT_ABI;

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
      <p style={{ fontSize: "var(--text-sm)", color: COLORS.textMuted, marginTop: 0 }}>
        Set the Merkle root from your 0G Storage upload and a daily spend limit (wei).
      </p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <label style={{ display: "block", fontSize: "var(--text-sm)", marginBottom: 6 }}>
          Strategy root (bytes32)
        </label>
        <Input
          value={strategyRoot}
          onChange={(e) => setStrategyRoot(e.target.value)}
          placeholder="0x…"
          style={{ width: "100%", marginBottom: "var(--space-md)" }}
        />
        <label style={{ display: "block", fontSize: "var(--text-sm)", marginBottom: 6 }}>
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