import { useAccount, useReadContracts } from 'wagmi';
import { erc721Abi } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';

/**
 * Hook that returns the iNFT agent count owned by the currently-connected
 * wallet on the AxiomAgentNFT contract.
 *
 * The contract does NOT support ERC-721Enumerable (no tokenOfOwnerByIndex),
 * so we can only read balanceOf and cannot enumerate individual token IDs
 * on-chain. For a full token list, the backend event store should be used.
 *
 * Strategy: `balanceOf` only.
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
