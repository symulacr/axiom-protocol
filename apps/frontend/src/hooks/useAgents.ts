import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc721Abi, type Address } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';

/**
 * Hook that returns the iNFT agents (ERC-721 token IDs) owned by the
 * currently-connected wallet on the AxiomAgentNFT contract.
 *
 * Strategy: `balanceOf` → fan-out `tokenOfOwnerByIndex` → `tokenURI` per token.
 * Does NOT call `tokenOfOwnerByIndex` when balance is 0 (would revert).
 */
export type AgentSummary = {
  tokenId: bigint;
  uri: string;
};

export function useAgents(): {
  agents: AgentSummary[];
  isLoading: boolean;
  error: Error | null;
} {
  const { address } = useAccount();

  // Step 1: read the owner's balance. Only enable when we have an address
  // and a deployed contract address.
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
  const ownerAddress: Address | undefined = address ?? undefined;

  // Step 2 + 3: only fan out the per-index + per-tokenURI reads when the
  // owner actually holds at least one agent. Build the contract calls
  // statically — `args: undefined` on a function with no inputs is fine for
  // the no-arg getters, and the indexed reads get `[owner, i]`.
  const calls = useMemo(() => {
    if (!ownerAddress) return [];
    const list: Array<{
      address: `0x${string}`;
      abi: typeof erc721Abi;
      functionName:
        | 'tokenOfOwnerByIndex'
        | 'tokenURI';
      args: readonly unknown[];
    }> = [];
    for (let i = 0n; i < balance; i += 1n) {
      list.push({
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: erc721Abi,
        functionName: 'tokenOfOwnerByIndex',
        args: [ownerAddress, i],
      });
    }
    return list;
  }, [ownerAddress, balance]);

  const indexQuery = useReadContracts({
    allowFailure: false,
    contracts: calls,
    query: {
      enabled: calls.length > 0,
    },
  });

  // Resolve tokenIds, then fan out a second batch of tokenURI reads. The
  // dependency on `indexQuery.data` makes this run only after the first
  // multicall settles.
  const tokenIds = (indexQuery.data ?? []) as bigint[];

  const uriCalls = useMemo(() => {
    return tokenIds.map((id) => ({
      address: AXIOM_AGENT_NFT_ADDRESS,
      abi: erc721Abi,
      functionName: 'tokenURI' as const,
      args: [id] as const,
    }));
  }, [tokenIds]);

  const uriQuery = useReadContracts({
    allowFailure: false,
    contracts: uriCalls,
    query: {
      enabled: uriCalls.length > 0,
    },
  });

  const uris = (uriQuery.data ?? []) as string[];

  const agents: AgentSummary[] = useMemo(() => {
    return tokenIds.map((id, i) => ({
      tokenId: id,
      uri: uris[i] ?? '',
    }));
  }, [tokenIds, uris]);

  const isLoading =
    balanceQuery.isLoading ||
    indexQuery.isLoading ||
    uriQuery.isLoading;

  const error =
    (balanceQuery.error as Error | null) ??
    (indexQuery.error as Error | null) ??
    (uriQuery.error as Error | null) ??
    null;

  return { agents, isLoading, error };
}
