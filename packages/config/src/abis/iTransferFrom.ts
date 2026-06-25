export const ITRANSFER_FROM_ABI = [
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      {
        name: "proofs",
        internalType: "struct TransferValidityProof[]",
        type: "tuple[]",
        components: [
          {
            name: "accessProof",
            internalType: "struct AccessProof",
            type: "tuple",
            components: [
              { name: "dataHash", internalType: "bytes32", type: "bytes32" },
              { name: "targetPubkey", internalType: "bytes", type: "bytes" },
              { name: "nonce", internalType: "uint256", type: "uint256" },
              { name: "proof", internalType: "bytes", type: "bytes" },
              { name: "validUntil", internalType: "uint256", type: "uint256" },
            ],
          },
          {
            name: "ownershipProof",
            internalType: "struct OwnershipProof",
            type: "tuple",
            components: [
              { name: "oracleType", internalType: "enum OracleType", type: "uint8" },
              { name: "dataHash", internalType: "bytes32", type: "bytes32" },
              { name: "sealedKey", internalType: "bytes", type: "bytes" },
              { name: "targetPubkey", internalType: "bytes", type: "bytes" },
              { name: "nonce", internalType: "uint256", type: "uint256" },
              { name: "proof", internalType: "bytes", type: "bytes" },
              { name: "validUntil", internalType: "uint256", type: "uint256" },
            ],
          },
        ],
      },
    ],
    name: "iTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
