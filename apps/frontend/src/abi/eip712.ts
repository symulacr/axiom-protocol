import { useMemo } from 'react';
import { useChainId } from 'wagmi';
import { getAxiomTeeVerifierAddress } from './addresses.js';
const BASE_DOMAIN = {
  name: 'Axiom iNFT',
  version: '1',
} as const;

/**
 * Reactive hook that returns an EIP-712 domain object for the current chain.
 * The domain includes the dynamic chainId and the correct verifying contract
 * address for the active network.
 */
export function useEip712Domain(): { domain: typeof BASE_DOMAIN & { chainId: number; verifyingContract: `0x${string}` } } {
  const chainId = useChainId();
  return useMemo(
    () => ({
      domain: {
        ...BASE_DOMAIN,
        chainId,
        verifyingContract: getAxiomTeeVerifierAddress(chainId),
      },
    }),
    [chainId],
  );
}

export const ACCESS_PROOF_TYPES = {
  AccessProof: [
    { name: 'dataHash', type: 'bytes32' },
    { name: 'targetPubkey', type: 'bytes' },
    { name: 'to', type: 'address' },
    { name: 'nft', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
  ],
} as const;
