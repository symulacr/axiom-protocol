import { useCallback, useState, type ReactElement } from "react";
import { useChainId, useWriteContract } from "wagmi";
import { isAddress, parseAbi } from "viem";
import { toast } from "sonner";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { humanizeError } from "../utils/format.js";
import { COLORS, Card, Button, Input, SectionTitle, Alert } from "./ui.js";

const agentAbi = parseAbi(AGENT_NFT_ABI);

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
      <p style={{ fontSize: "var(--text-sm)", color: COLORS.textMuted, marginTop: 0 }}>
        Authorize another wallet to act on this agent (authorizeUsage).
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
      <Button variant="primary" disabled={isPending} onClick={() => void authorize()}>
        {isPending ? "Confirming…" : "Authorize delegate"}
      </Button>
    </Card>
  );
}