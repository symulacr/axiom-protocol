import { AXIOM_TEE_VERIFIER_ADDRESS } from './addresses.js';
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

export const EIP712_DOMAIN = {
  name: 'AxiomTeeVerifier',
  version: '1',
  chainId: GALILEO_CHAIN_ID,
  verifyingContract: AXIOM_TEE_VERIFIER_ADDRESS,
} as const;

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
