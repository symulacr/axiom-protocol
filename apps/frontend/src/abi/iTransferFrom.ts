// Axiom Protocol — minimal ABI fragment for `AxiomAgentNFT.iTransferFrom`.
//
// `iTransferFrom` carries the ERC-7857 `TransferValidityProof[]` struct
// containing the TEE-signed OwnershipProof and receiver-signed AccessProof.
// The proof fields are declared as `bytes` so viem encodes the hex strings
// from the backend JSON response into calldata automatically.
//
// This file adds the *write* surface — the ABI JSON exposes the read-only
// fragment so `useWriteContract` can submit iTransferFrom without dragging
// the full ERC-721 / AccessControl methods into the typed ABI.

export const iTransferFromAbi = [
  {
    type: 'function',
    name: 'iTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      {
        name: 'proofs',
        type: 'tuple[]',
        components: [
          {
            name: 'accessProof',
            type: 'tuple',
            components: [
              { name: 'dataHash', type: 'bytes32' },
              { name: 'targetPubkey', type: 'bytes' },
              { name: 'nonce', type: 'uint256' },
              { name: 'proof', type: 'bytes' },
              { name: 'validUntil', type: 'uint256' },
            ],
          },
          {
            name: 'ownershipProof',
            type: 'tuple',
            components: [
              { name: 'oracleType', type: 'uint8' },
              { name: 'dataHash', type: 'bytes32' },
              { name: 'sealedKey', type: 'bytes' },
              { name: 'targetPubkey', type: 'bytes' },
              { name: 'nonce', type: 'uint256' },
              { name: 'proof', type: 'bytes' },
              { name: 'validUntil', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export type ITransferFromAbi = typeof iTransferFromAbi;
