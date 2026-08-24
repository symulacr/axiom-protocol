import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { deriveMintDataHash } from "@axiom/config/types/hex";
import { humanizeError } from "../utils/format.js";
import {
  apiFetch,
  oracleFetch,
  type EncodeResponse,
} from "../utils/apiFetch.js";

export function buildDefaultPayload(agentName: string): string {
  const name = agentName.trim() || "Axiom agent";
  return JSON.stringify({
    name,
    version: 1,
    kind: "axiom-inft-agent",
    strategy: "default",
    description: `${name} — ownable AI agent on Axiom Protocol (0G / ERC-7857)`,
    createdAt: new Date().toISOString(),
  });
}

type MintWizardStep = "name" | "minting" | "ready";

export function useMintWizard() {
  const [step, setStep] = useState<MintWizardStep>("name");
  const [agentName, setAgentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { address: owner } = useAccount();
  const { data: walletClient } = useWalletClient();

  const deriveDataHash = useCallback(
    (name?: string) => {
      const n = (name ?? agentName).trim() || "Axiom agent";
      // dataHash must match the chat mint_agent derivation (oracle signs only hashes it has SEEN); real hash is the 0G Merkle root once the payload uploads
      return deriveMintDataHash(n);
    },
    [agentName],
  );

  const oracleMutation = useMutation({
    retry: false,
    mutationFn: (hash: `0x${string}`) =>
      oracleFetch<{ ok?: boolean; dataHash?: string }>("/v1/agents/mint", {
        method: "POST",
        body: JSON.stringify({ dataHash: hash }),
      }),
  });

  const encodeMutation = useMutation({
    retry: false,
    mutationFn: async (input: {
      dataHash: `0x${string}`;
      description: string;
    }) => {
      if (!owner || !walletClient) {
        throw new Error("wallet not connected");
      }
      const encoded = await apiFetch<EncodeResponse>("/v1/agents/mint/encode", {
        method: "POST",
        body: JSON.stringify({
          dataDescription: input.description,
          dataHash: input.dataHash,
          to: owner,
        }),
      });
      return walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value),
        chain: walletClient.chain,
      });
    },
  });

  const registerOracle = useCallback(
    async (name?: string): Promise<`0x${string}`> => {
      setError(null);
      setStep("minting");
      try {
        const hash = deriveDataHash(name);
        const body = await oracleMutation.mutateAsync(hash);
        if (body.ok !== true) throw new Error("Oracle did not accept dataHash");
        setStep("ready");
        return hash;
      } catch (err) {
        setError(humanizeError(err));
        setStep("name");
        throw err;
      }
    },
    [deriveDataHash, oracleMutation],
  );

  const chainMint = useCallback(
    async (dataHash: `0x${string}`): Promise<`0x${string}`> =>
      encodeMutation.mutateAsync({
        dataHash,
        description: agentName.trim() || "Axiom agent", // must match the name derived in deriveDataHash via keccak256(toHex(name)) so chat mint agrees
      }),
    [encodeMutation, agentName],
  );

  return {
    agentName,
    setAgentName,
    registerOracle,
    chainMint,
    error,
    busy:
      oracleMutation.isPending ||
      encodeMutation.isPending ||
      step === "minting",
  };
}
