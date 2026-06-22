// Axiom Protocol — minimal ABI fragment for `AxiomAgentNFT.iTransferFrom`.
//
// `iTransferFrom` is the ERC-7857 iNFT transfer entrypoint. It carries an
// `iTransferFrom(from, to, tokenId, TransferValidityProof[])` signature
// where the proof is a `TransferValidityProof` struct containing the
// TEE-signed OwnershipProof and the receiver-signed AccessProof. The
// canonical EIP-7857 interface is documented at:
//
//   https://eips.ethereum.org/EIPS/eip-7857
//
// The 0G reference implementation at `0gfoundation/0g-agent-nft` updated
// the original `iTransfer` (no `from` argument) to `iTransferFrom` so the
// iNFT surface stays ERC-721-compatible — the standard still calls the
// flow "iTransfer" in the prose, but the on-chain method is `iTransferFrom`.
// Reference: https://raw.githubusercontent.com/0gfoundation/0g-agent-nft/main/contracts/interfaces/IERC7857.sol
//
// The full EIP-7857 `TransferValidityProof` struct is:
//
//   struct TransferValidityProof {
//       AccessProof   accessProof;     // receiver-signed: dataHash||dataHash||encryptedPubKey||nonce
//       OwnershipProof ownershipProof;  // TEE-signed:  dataHash||dataHash||sealedKey||encryptedPubKey||nonce
//   }
//
// where `AccessProof.proof` and `OwnershipProof.proof` are both 65-byte
// secp256k1 signatures (`bytes` in the ABI). For the dApp's wagmi
// `useWriteContract` call site we only need the top-level proof tuple to
// be a `bytes` (the on-chain entry point takes a single calldata
// `TransferValidityProof` per token and our batch transfer is one proof
// per tokenId), so this fragment declares `accessProof` and
// `ownershipProof` as `bytes` — the Axios/JSON request body returns
// each as a `0x`-prefixed hex string that viem encodes into calldata
// automatically. See viem's `encodeAbiParameters` and wagmi v2 type
// inference for ABI tuples:
//
//   https://wagmi.sh/react/typescript#const-assert-abis-typed-data
//
// The `as const` makes the array readonly so wagmi v2 narrows the
// `functionName` and `args` types correctly. `stateMutability: 'nonpayable'`
// matches the reference's non-payable iTransferFrom.
//
// The original `AxiomAgentNFT.json` exposes a read-only fragment (name /
// symbol / ownerOf / tokenURI / creatorOf / getDataHash / getSealedKey);
// this file adds the *write* surface so `useWriteContract` can submit
// the iNFT transfer without dragging the rest of the ERC-721 /
// AccessControl methods into the typed ABI.

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
