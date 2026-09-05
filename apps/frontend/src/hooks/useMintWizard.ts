import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { encodeRelayTransaction } from "../utils/encodeRelay.js";

type MintWizardStep = "name" | "minting" | "ready";

export function useMintWizard() {
  const [step, setStep] = useState<MintWizardStep>("name");
  const [agentName, setAgentName] = useState("");
  const { address: owner } = useAccount();
  const { data: walletClient } = useWalletClient();

  const mintMutation = useMutation({
    retry: false,
    mutationFn: async (name: string) => {
      if (!owner || !walletClient) {
        throw new Error("wallet not connected");
      }
      // Hashless mint (P3 §(b) #1-#3): the server derives dataHash + description
      // from the name and registers it with the oracle in-process — no client
      // keccak, one round-trip instead of two.
      return encodeRelayTransaction(walletClient, "/v1/agents/mint/encode", {
        name,
        owner,
      });
    },
  });

  const mint = useCallback(
    async (name?: string): Promise<`0x${string}`> => {
      setStep("minting");
      try {
        const txHash = await mintMutation.mutateAsync(
          (name ?? agentName).trim() || "Axiom agent",
        );
        setStep("ready");
        return txHash;
      } catch (err) {
        setStep("name");
        throw err;
      }
    },
    [agentName, mintMutation],
  );

  return {
    setAgentName,
    mint,
    busy: mintMutation.isPending || step === "minting",
  };
}
