import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { type Address, type Hex } from "viem";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { toViemAbi } from "../lib/abi.js";

const axiomAgentNftAbiParsed = toViemAbi(AGENT_NFT_ABI);

type AgentMetadata = {
  tokenId: bigint;
  owner: Address;
  dataHash: Hex;
  dataDescription: string;
};

export function useAgentMetadata(tokenId: bigint): {
  data: AgentMetadata | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const agentNftAddr = getAxiomAgentNftAddress(chainId);

  const contracts = useMemo(
    () =>
      [
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "ownerOf",
          args: [tokenId],
        },
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "intelligentDatasOf",
          args: [tokenId],
        },
      ] as const,
    [tokenId, agentNftAddr],
  );

  const query = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: isConnected && tokenId > 0n,
    },
  });

  const intelligentDatas =
    (
      query.data?.[1] as
        | {
            result?: ReadonlyArray<{ dataDescription: string; dataHash: Hex }>;
            error?: Error;
          }
        | undefined
    )?.result ?? undefined;
  const firstData = intelligentDatas?.[0];

  // ownerOf revert is the canonical on-chain "token does not exist" signal — treat as confirmed null; network failures don't carry the revert message
  const ownerOfError = (query.data?.[0] as { error?: Error } | undefined)
    ?.error;
  const ownerOfReverted =
    ownerOfError !== undefined &&
    /revert/i.test(ownerOfError.message ?? String(ownerOfError));

  const data = useMemo<AgentMetadata | null>(() => {
    if (!query.data) return null;
    if (ownerOfReverted) return null;
    return {
      tokenId,
      owner:
        (query.data[0] as { result?: Address; error?: Error } | undefined)
          ?.result ?? "0x0",
      dataHash: firstData?.dataHash ?? "0x",
      dataDescription: firstData?.dataDescription ?? "",
    };
  }, [query.data, tokenId, firstData, ownerOfReverted]);

  return useMemo(
    () => ({
      data,
      isLoading: query.isLoading,
      error: (query.error as Error | null) ?? null,
      refetch: query.refetch,
    }),
    [data, query.isLoading, query.error, query.refetch],
  );
}
