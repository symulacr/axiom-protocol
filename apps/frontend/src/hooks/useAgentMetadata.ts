import { useReadContracts } from 'wagmi';
import { type Address, type Hex } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';
import { axiomAgentNftAbi } from '../abi/axiomAgentNft.js';

export type AgentMetadata = {
  /** ERC-721 tokenId. */
  tokenId: bigint;
  /** Contract-level collection name (ERC-721 `name()`). */
  name: string;
  /** Contract-level collection symbol (ERC-721 `symbol()`). */
  symbol: string;
  /** Current owner of the token (ERC-721 `ownerOf`). */
  owner: Address;
  /**
   * keccak256 hash of the encrypted model payload stored on 0G Storage.
   * The bytes32 returned by the contract is the canonical content-addressed
   * identifier of the iNFT's encrypted intelligence. Source:
   * https://eips.ethereum.org/EIPS/eip-7857
   */
  dataHash: Hex;
  /**
   * The new owner's wrapped decryption key (`sealedKey`) that the receiver
   * must unwrap with their secp256k1 private key to decrypt the re-encrypted
   * blob on 0G Storage. Empty when the agent is not currently being
   * transferred.
   */
  sealedKey: Hex;
  /** tokenURI pointer to the on-chain / off-chain metadata blob. */
  tokenUri: string;
};

/**
 * Read the full metadata view for a single AxiomAgentNFT tokenId in one
 * multicall. Combines the standard EIP-721 getters (`name`, `symbol`,
 * `ownerOf`) with the AxiomAgentNFT-specific extensions (`getDataHash`,
 * `getSealedKey`) and the EIP-721 `tokenURI`.
 *
 * Canonical references:
 *  - EIP-721: name / symbol / ownerOf / tokenURI:
 *    https://eips.ethereum.org/EIPS/eip-721
 *  - EIP-7857 IntelligentData / dataHash semantics:
 *    https://eips.ethereum.org/EIPS/eip-7857
 *  - wagmi v2 useReadContracts (batched reads, allowFailure):
 *    https://wagmi.sh/react/hooks/useReadContracts
 */
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
        functionName: 'getDataHash',
        args: [tokenId],
      },
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: axiomAgentNftAbi,
        functionName: 'getSealedKey',
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

  const data: AgentMetadata | null = query.data
    ? {
        tokenId,
        name: (query.data[0] as string) ?? '',
        symbol: (query.data[1] as string) ?? '',
        owner: (query.data[2] as Address) ?? '0x0',
        dataHash: (query.data[3] as Hex) ?? '0x',
        sealedKey: (query.data[4] as Hex) ?? '0x',
        tokenUri: (query.data[5] as string) ?? '',
      }
    : null;

  return {
    data,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
