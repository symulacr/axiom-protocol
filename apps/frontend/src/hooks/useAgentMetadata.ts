import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { type Address, type Hex } from "viem";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

const axiomAgentNftAbiParsed = AGENT_NFT_ABI;

export type AgentMetadata = {
  tokenId: bigint;
  name: string;
  symbol: string;
  owner: Address;
  creator: Address | undefined;
  dataHash: Hex;
  dataDescription: string;
  tokenUri: string;
};

export function useAgentMetadata(
  tokenId: bigint,
  options?: { enabled?: boolean },
): {
  data: AgentMetadata | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const enabledOption = options?.enabled ?? true;
  const agentNftAddr = getAxiomAgentNftAddress(chainId);

  const contracts = useMemo(
    () =>
      [
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "name",
        },
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "symbol",
        },
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
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "tokenURI",
          args: [tokenId],
        },
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "creatorOf",
          args: [tokenId],
        },
      ] as const,
    [tokenId, agentNftAddr],
  );

  const query = useReadContracts({
    allowFailure: false,
    contracts,
    query: {
      enabled: enabledOption && isConnected && tokenId > 0n,
    },
  });

  const intelligentDatas =
    (query.data?.[3] as
      | ReadonlyArray<{ dataDescription: string; dataHash: Hex }>
      | undefined) ?? undefined;
  const firstData = intelligentDatas?.[0];

  const data = useMemo<AgentMetadata | null>(() => {
    if (!query.data) return null;
    return {
      tokenId,
      name: (query.data[0] as string) || "",
      symbol: (query.data[1] as string) || "",
      owner: (query.data[2] as Address) ?? "0x0",
      creator: (query.data[5] as Address | undefined) ?? undefined,
      dataHash: firstData?.dataHash ?? "0x",
      dataDescription: firstData?.dataDescription ?? "",
      tokenUri: (query.data[4] as string) ?? "",
    };
  }, [query.data, tokenId, firstData]);

  const refetch = query.refetch;
  const result = useMemo(
    () => ({
      data,
      isLoading: query.isLoading,
      error: (query.error as Error | null) ?? null,
      refetch,
    }),
    [data, query.isLoading, query.error, refetch],
  );

  return result;
}
