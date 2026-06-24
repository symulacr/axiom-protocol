import { useReadContracts } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { getAxiomAgentNftAddress } from '../abi/addresses.js';
import { axiomAgentNftAbi } from '../abi/axiomAgentNft.js';

export type AgentMetadata = {
  tokenId: bigint;
  name: string;
  symbol: string;
  owner: Address;
  dataHash: Hex;
  dataDescription: string;
  tokenUri: string;
};

export function useAgentMetadata(tokenId: bigint): {
  data: AgentMetadata | null;
  isLoading: boolean;
  error: Error | null;
} {
  const query = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: getAxiomAgentNftAddress(),
        abi: axiomAgentNftAbi,
        functionName: 'name',
      },
      {
        address: getAxiomAgentNftAddress(),
        abi: axiomAgentNftAbi,
        functionName: 'symbol',
      },
      {
        address: getAxiomAgentNftAddress(),
        abi: axiomAgentNftAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      },
      {
        address: getAxiomAgentNftAddress(),
        abi: axiomAgentNftAbi,
        functionName: 'intelligentDatasOf',
        args: [tokenId],
      },
      {
        address: getAxiomAgentNftAddress(),
        abi: axiomAgentNftAbi,
        functionName: 'tokenURI',
        args: [tokenId],
      },
    ],
    query: {
      enabled: Boolean(getAxiomAgentNftAddress()) && tokenId > 0n,
    },
  });

  const intelligentDatas =
    (query.data?.[3] as
      | ReadonlyArray<{ dataDescription: string; dataHash: Hex }>
      | undefined) ?? undefined;
  const firstData = intelligentDatas?.[0];

  const data: AgentMetadata | null = query.data
    ? {
        tokenId,
        name: (query.data[0] as string) || '',
        symbol: (query.data[1] as string) || '',
        owner: (query.data[2] as Address) ?? '0x0',
        dataHash: firstData?.dataHash ?? '0x',
        dataDescription: firstData?.dataDescription ?? '',
        tokenUri: (query.data[4] as string) ?? '',
      }
    : null;

  return {
    data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
