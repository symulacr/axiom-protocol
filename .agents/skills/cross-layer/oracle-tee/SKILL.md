# Oracle + TEE (OwnershipProof & AccessProof)

## Metadata

- **Category**: cross-layer
- **SDK**: `ethers` ^6.13.0, `secp256k1` (Node native in v22, or `@noble/secp256k1`)
- **Activation Triggers**: "TEE verifier", "OwnershipProof", "AccessProof", "validUntil",
  "TeeSigner", "sign dataHash", "sealedKey transfer", "sealed key rotation"

## Purpose

Issue and verify TEE-signed proofs that an iNFT holder is entitled to either (a) read
the iNFT's sealed key (`OwnershipProof`) or (b) re-encrypt it for a new owner
(`AccessProof`). The signing key lives in an Intel TDX / AMD SEV enclave in production
(here: a node process with a cleartext devnet key). The on-chain `AxiomTeeVerifier`
checks the ECDSA signatures against a registered secp256k1 public key.

This is the cross-layer glue between the **storage layer** (the sealed key bytes in 0G
Storage) and the **chain layer** (the on-chain `AxiomTeeVerifier` signature check). A
mis-issued proof (wrong EIP-191 prefix, expired `validUntil`, wrong message hash
encoding) costs the user a failed transfer and the operator a key-rotation.

## Prerequisites

- Node.js >= 18
- `ethers` v6
- A secp256k1 helper module (Node 22 has `crypto.sign` natively; `@noble/secp256k1` is
  the cross-runtime alternative)
- The TEE signer's secp256k1 private key (loaded from `.env` — never hardcoded)
- The on-chain `AxiomTeeVerifier` address for the connected chain
- `.env` with `TEE_SIGNER_PRIVATE_KEY`, `TEE_VERIFIER_ADDRESS`, `RPC_URL`, `PRIVATE_KEY`

## Quick Workflow

1. Build the `OwnershipProofInput` or `AccessProofInput` payload — `(dataHash, sealedKey
   | —, targetPubkey, nonce, validUntil)`
2. Encode the payload with `AbiCoder.defaultAbiCoder().encode([...], [...])` and
   `keccak256` the result to get the 32-byte digest
3. Sign the digest with `signingKey.sign(digest)` — RAW ECDSA, NOT `signMessage` (which
   adds the EIP-191 prefix)
4. Submit the proof to the on-chain verifier (typically as part of an
   `AxiomAgentNFT` transfer call)
5. The verifier recovers the signer, checks `teeSignerAcknowledged[recovered]`, and
   rejects if `block.timestamp > validUntil`

## Core Rules

### ALWAYS

- Use `signingKey.sign(digest)` for raw ECDSA, NOT `wallet.signMessage(digest)`. The
  on-chain verifier does NOT apply the EIP-191 prefix; using `signMessage` silently
  breaks recovery.
- Encode the payload as `keccak256(abi.encode(types, values))` where `types` and
  `values` follow the EIP-712 `HashStruct` shape
  (`https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct`).
- Set `validUntil` to a Unix-seconds deadline that is BOTH in the future and within
  `maxProofAgeSeconds` of the current block timestamp. The verifier rejects expired
  proofs AND proofs that are too far in the future (overflow attempts).
- Generate the `nonce` from a monotonically increasing counter or a CSPRNG; never
  reuse a nonce.
- Verify the recovered signer matches the `TeeSigner`'s registered address BEFORE
  submitting the on-chain call. Catches encoding errors early.

### NEVER

- Apply the EIP-191 prefix when signing. The on-chain `ecrecover` call uses raw ECDSA;
  the prefix is silently added by `signMessage` and would break recovery.
- Use the TEE signer's private key outside the TEE. In production, the key is sealed
  inside an Intel TDX / AMD SEV enclave; the devnet cleartext key is a stand-in.
- Issue a proof with `validUntil = 0` (always expired) or `validUntil = type(uint256).max`
  (caught by the future-window check).
- Encode the payload with the field order swapped. The on-chain `abi.decode` is
  positional; `OwnershipProof` is `(dataHash, sealedKey, targetPubkey, nonce, validUntil)`,
  `AccessProof` is `(dataHash, targetPubkey, nonce, validUntil)`.
- Trust the devnet private key in production. The cleartext key is a
  development-only convenience.

## Code Examples

### Build + Sign an OwnershipProof

```typescript
import { AbiCoder, keccak256, Wallet } from "ethers";
import type { Hex } from "viem";
import { publicKeyUncompressedFromPrivate } from "./crypto/secp256k1-helpers.js";

export interface OwnershipProofInput {
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  nonce: bigint;
  validUntil: bigint; // Unix-seconds deadline
}

export function ownershipMessageHash(input: OwnershipProofInput): Hex {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes", "bytes", "uint256", "uint256"],
      [input.dataHash, input.sealedKey, input.targetPubkey, input.nonce, input.validUntil],
    ),
  ) as Hex;
}

export function signOwnership(wallet: Wallet, input: OwnershipProofInput): Hex {
  const digest = ownershipMessageHash(input);
  return wallet.signingKey.sign(digest).serialized as Hex;
}
```

### Build + Verify an AccessProof (off-chain sanity check)

```typescript
import { AbiCoder, keccak256, verifyMessage, getBytes, Wallet } from "ethers";

export interface AccessProofInput {
  dataHash: Hex;
  targetPubkey: Hex;
  nonce: bigint;
  validUntil: bigint;
}

export function accessMessageHash(input: AccessProofInput): Hex {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes", "uint256", "uint256"],
      [input.dataHash, input.targetPubkey, input.nonce, input.validUntil],
    ),
  ) as Hex;
}

/**
 * Recover the EIP-191 signer (the receiver's wallet, not the TEE) of an
 * AccessProof. The receiver signs via `personal_sign`, so the message has
 * the EIP-191 prefix applied.
 */
export function recoverAccessSigner(signature: Hex, input: AccessProofInput): Hex {
  const digest = accessMessageHash(input);
  return verifyMessage(getBytes(digest), signature) as Hex;
}
```

### The TeeSigner Class (Production Surface)

```typescript
export class TeeSigner {
  readonly wallet: Wallet;
  readonly address: Hex;
  readonly uncompressedPubkey: Uint8Array;

  constructor(privateKeyHex: string) {
    this.wallet = new Wallet(privateKeyHex);
    this.address = this.wallet.address as Hex;
    const priv = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex"));
    this.uncompressedPubkey = publicKeyUncompressedFromPrivate(priv);
  }

  signOwnership(input: OwnershipProofInput): Hex {
    const digest = ownershipMessageHash(input);
    return this.wallet.signingKey.sign(digest).serialized as Hex;
  }
}
```

## Anti-Patterns

```typescript
// BAD: applying the EIP-191 prefix
const sig = wallet.signMessage(digest); // recovers to a WRONG address
                                        // (the prefix is the EIP-191 personal_sign prefix)

// BAD: encoding the payload in a different field order
const encoded = AbiCoder.defaultAbiCoder().encode(
  ["bytes32", "uint256", "bytes", "uint256", "bytes"], // ← wrong order
  [dataHash, validUntil, sealedKey, nonce, targetPubkey],
);

// BAD: setting validUntil to 0 (always expired)
const input = { ..., validUntil: 0n };

// BAD: hardcoding the TEE private key
const tee = new TeeSigner("0xabc123..."); // in source — never in source

// BAD: reusing a nonce across two transfers
const input1 = { ..., nonce: 7n };
await submitTransfer(input1);
const input2 = { ..., nonce: 7n }; // replay risk — verifier may not track but
                                  // a downstream indexer (e.g. the Axiom oracle)
                                  // WILL reject duplicate nonces
```

## Common Errors & Fixes

| Error                                                  | Cause                                                         | Fix                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ecrecover: invalid signature`                         | Used `signMessage` (EIP-191 prefix) instead of raw ECDSA      | Use `signingKey.sign(digest).serialized`                                  |
| `validUntil expired`                                   | `block.timestamp > validUntil`                                | Issue a new proof with `validUntil = now + window`                        |
| `validUntil too far in future`                         | `validUntil - block.timestamp > maxProofAgeSeconds`           | Cap the window at `maxProofAgeSeconds` (query the verifier for the bound) |
| Recovered address does not match `TeeSigner.address`   | Different encoding of the digest                              | Re-encode with `AbiCoder`; cross-check with the on-chain `messageHash`    |
| `teeSignerAcknowledged[recovered] is false`            | The TEE signer's public key was not registered on-chain       | Call `AxiomTeeVerifier.updateVerifier(pubkey, true)` first                 |
| Transfer reverts with no reason                        | The `targetPubkey` is invalid (not 64 bytes uncompressed)     | Re-derive the pubkey from the receiver's address via `ecdsa.S256`         |

## Related Skills

- [iNFT Lifecycle](../../chain/i-nft-lifecycle/SKILL.md) — the upstream/downstream of
  this skill; produces the `dataHash` and consumes the signed `OwnershipProof` /
  `AccessProof`
- [Storage + Chain](../storage-plus-chain/SKILL.md) — the on-chain reference pattern
- [Security Patterns](../../../patterns/SECURITY.md) — for the TEE attestation chain

## References

- [EIP-712: typed structured data hashing (`HashStruct` definition)](https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct)
- [EIP-191: signed-data standard (the prefix `signMessage` applies — and the verifier does NOT apply)](https://eips.ethereum.org/EIPS/eip-191)
- [0G AI Context (TEE signer registration pattern)](https://docs.0g.ai/ai-context)
- [0G Agent Skills — Security Patterns (upstream)](https://github.com/0gfoundation/0g-agent-skills/blob/main/patterns/SECURITY.md)
- [Intel TDX](https://www.intel.com/content/www/us/en/developer/tools/trust-domain-extensions/overview.html)
- [AMD SEV](https://www.amd.com/en/developer/sev.html)
