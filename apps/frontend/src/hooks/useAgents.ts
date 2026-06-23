import { useAccount, useReadContracts } from 'wagmi';
import { erc721Abi } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';

/**
 * Returns the iNFT agent count for the connected wallet via `balanceOf`.
 * No ERC-721Enumerable support, so individual token IDs are not enumerated.
 */
export type AgentSummary = {
  tokenId: bigint;
  uri: string;
};

export function useAgents(): {
  agents: AgentSummary[];
  count: bigint;
  isLoading: boolean;
  error: Error | null;
} {
  const { address } = useAccount();

  const balanceQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: erc721Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
    ],
    query: {
      enabled: Boolean(address && AXIOM_AGENT_NFT_ADDRESS),
    },
  });

  const balance = balanceQuery.data?.[0] ?? 0n;

  return {
    agents: [],
    count: balance,
    isLoading: balanceQuery.isLoading,
    error: balanceQuery.error as Error | null,
  };
}
