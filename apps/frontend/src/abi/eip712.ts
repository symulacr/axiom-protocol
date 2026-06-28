import { useMemo } from "react";
import { useChainId } from "wagmi";
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, ACCESS_PROOF_TYPES } from "@axiom/config/eip712";
import { getAxiomTeeVerifierAddress } from "./addresses.js";

// Re-export the canonical type definitions so existing imports continue to work.
export { ACCESS_PROOF_TYPES } from "@axiom/config/eip712";

const BASE_DOMAIN = {
  name: EIP712_DOMAIN_NAME,
  version: EIP712_DOMAIN_VERSION,
} as const;

/**
 * Reactive hook that returns an EIP-712 domain object for the current chain.
 * The domain includes the dynamic chainId and the correct verifying contract
 * address for the active network.
 */
export function useEip712Domain(): {
  domain: typeof BASE_DOMAIN & { chainId: number; verifyingContract: `0x${string}` };
} {
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
