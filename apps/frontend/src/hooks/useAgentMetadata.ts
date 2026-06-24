import { useReadContracts } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';
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
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'name',
      },
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'symbol',
      },
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      },
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'intelligentDatasOf',
        args: [tokenId],
      },
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'tokenURI',
        args: [tokenId],
      },
    ],
    query: {
      enabled: Boolean(AXIOM_AGENT_NFT_ADDRESS),
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
        name: (query.data[0] as string) ?? '',
        symbol: (query.data[1] as string) ?? '',
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
