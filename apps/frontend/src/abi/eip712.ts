import { useMemo } from "react";
import { useChainId } from "wagmi";
import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from "@axiom/config/eip712";
import { getAxiomTeeVerifierAddress } from "./addresses.js";

export { ACCESS_PROOF_TYPES } from "@axiom/config/eip712";

const BASE_DOMAIN = {
  name: EIP712_DOMAIN_NAME,
  version: EIP712_DOMAIN_VERSION,
} as const;

export function useEip712Domain(): {
  domain: typeof BASE_DOMAIN & {
    chainId: number;
    verifyingContract: `0x${string}`;
  };
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
