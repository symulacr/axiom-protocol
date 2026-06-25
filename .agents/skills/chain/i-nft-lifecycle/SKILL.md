# iNFT DataHash Lifecycle (EIP-7857)

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0, `@0gfoundation/0g-ts-sdk` ^1.2.8
- **Activation Triggers**: "EIP-7857", "iNFT", "IntelligentData", "dataHash identity",
  "verify iNFT", "sealedKey", "OwnershipProof"

## Purpose

Drive the full iNFT (EIP-7857 "Intelligent NFT") dataHash lifecycle: upload the encrypted
or plaintext payload to 0G Storage, register the `dataHash` (the Merkle root) on-chain,
re-derive the root from downloaded bytes, and prove identity — i.e. prove that the bytes
returned by 0G Storage really do hash to the `dataHash` recorded on-chain.

A "forged blob" (different bytes with a coincidentally matching root) is rejected at the
Merkle layer, because changing the bytes necessarily changes the leaf hashes and therefore
the root. The on-chain `dataHash` is the only thing a downstream consumer (an inference
node, an indexer, a frontend) can trust without a third-party attestation — but it is only
trustworthy if we can independently prove the storage-layer bytes match.

## Prerequisites

- Node.js >= 18
- `ethers` v6 with a funded signer
- `@0gfoundation/0g-ts-sdk` (for `ZgFile`, `Indexer`, `downloadToBlob`)
- A `ZeroGStorage` instance (the typed wrapper around the SDK)
- The iNFT contract (extends `ERC7857Upgradeable`) deployed to the connected chain
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `STORAGE_INDEXER`, `INFT_CONTRACT_ADDRESS`

## Quick Workflow

1. Encrypt the payload (if it is an iNFT with a sealed key) — `apps/backend/src/storage/encrypt.ts`
2. Upload to 0G Storage via the typed wrapper — `ZeroGStorage.uploadData(bytes)` → root hash
3. Mint the iNFT on-chain with the `dataHash = rootHash` — the `data()` field is the
   commitment
4. To verify: download the bytes from 0G Storage by root hash
5. Re-derive the Merkle root from those bytes (`rootFromBytes`)
6. Compare the re-derived root to the on-chain `dataHash` — equal ⇒ identity proved

## Core Rules

### ALWAYS

- Use `verifyBytes(bytes, expectedDataHash)` (the iNFT-domain wrapper) rather than
  re-implementing the root re-derivation at the call site. The wrapper takes the same
  shape the EIP-7857 storage flow uses and exposes a `fetcher?` seam for tests.
- Re-derive the Merkle root from the downloaded bytes, NOT from the file path. The
  on-chain `dataHash` is a commitment to the bytes, not to the local file's name or
  filesystem layout.
- Treat the iNFT's `dataHash` as a 32-byte hex string (`0x…`). Pass it through
  `toUtf8Bytes` only when interacting with `EIP-712` typed-data (the `validUntil`
  field), NOT as a content hash.
- Use a `DataHashFetcher` seam in tests so the rejection path (forged bytes vs.
  legitimate dataHash) can be exercised against a real Galileo blob in CI without
  depending on the network staying up between `downloadToBlob` and the assertion.
- When minting, set the iNFT's `dataHash` to the root hash returned by the storage
  upload — never to a hash of the plaintext payload, never to a placeholder.

### NEVER

- Trust the storage layer's response without re-deriving. A node may serve stale or
  tampered bytes; the on-chain `dataHash` is the only authoritative commitment.
- Re-derive the root from a slice of the file (HTTP `Range`). The root is over the
  whole file. For partial verification, use `MerkleProof` against the canonical tree.
- Encode `dataHash` with `EIP-191` (the personal_sign prefix) when constructing the
  `OwnershipProof.proof` or `AccessProof.proof` payloads. The on-chain verifier
  expects a raw ECDSA signature over the raw 32-byte digest (see
  `cross-layer/oracle-tee` for the on-chain verification rules).
- Store the unsealed private key on-chain. The "sealed key" pattern is the
  iNFT-defined envelope; the storage layer never sees plaintext.

## Code Examples

### Mint: Upload + Register

```typescript
import { ZeroGStorage } from "../storage/0g.js";
import { encrypt } from "../storage/encrypt.js";
import { ethers } from "ethers";

async function mintINFT(
  storage: ZeroGStorage,
  nft: ethers.Contract,
  plaintext: Uint8Array,
  sealedKey: Uint8Array,
): Promise<{ tokenId: bigint; dataHash: string }> {
  // 1. Encrypt the payload
  const ciphertext = encrypt(plaintext, sealedKey);

  // 2. Upload to 0G Storage — returns the Merkle root
  const { rootHash } = await storage.uploadData(ciphertext);

  // 3. Mint on-chain with the dataHash
  const tx = await nft.mint(rootHash, sealedKey);
  const receipt = await tx.wait();
  const tokenId = BigInt(receipt.logs[0].topics[1] ?? "0");

  return { tokenId, dataHash: rootHash };
}
```

### Verify: Download + Re-Derive + Compare

```typescript
import { downloadAndVerify } from "../i-nft/verify-data-hash.js";
import { ZeroGStorage } from "../storage/0g.js";
import type { Hex } from "viem";

async function proveIdentity(
  storage: ZeroGStorage,
  rootHash: Hex,
  expectedDataHash: Hex,
) {
  const result = await downloadAndVerify(storage, rootHash, expectedDataHash);
  if (!result.ok) {
    throw new Error(
      `iNFT dataHash mismatch: re-derived ${result.derived}, expected ${expectedDataHash}`,
    );
  }
  return result;
}
```

### A Plug-in Fetcher for Tests

```typescript
import type { DataHashFetcher } from "../i-nft/verify-data-hash.js";

// In a test: serve forged bytes and prove the verifier rejects them
const forgedFetcher: DataHashFetcher = async () => {
  return new Uint8Array(Buffer.from("forged bytes, not the real payload"));
};

const result = await downloadAndVerify(storage, rootHash, dataHash, forgedFetcher);
console.assert(result.ok === false, "forged bytes MUST be rejected");
```

## Anti-Patterns

```solidity
// BAD (Solidity): storing the plaintext key on-chain
function mint(bytes calldata data, bytes32 keyHash) external {
  _mint(msg.sender, data, keyHash); // plaintext bytes in storage!
}

// BAD (Solidity): storing the dataHash as a placeholder
function mint(bytes calldata data) external {
  _mint(msg.sender, data, bytes32(0)); // dataHash is zero — meaningless
}
```

```typescript
// BAD (TypeScript): trusting storage without re-derivation
const bytes = await storage.download(rootHash);
console.log("Got bytes, looks good."); // no identity proof

// BAD (TypeScript): re-deriving from a local file instead of the downloaded bytes
const localBytes = await fs.promises.readFile(filePath);
const root = await rootFromBytes(localBytes); // wrong file

// BAD (TypeScript): EIP-191-prefixed signature
const sig = await wallet.signMessage(digest); // verifier expects raw ECDSA
```

## Common Errors & Fixes

| Error                                       | Cause                                        | Fix                                                       |
| ------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| `dataHash mismatch`                         | Storage node returned stale or tampered bytes | Re-derive, then re-upload; do not trust the node          |
| `dataHash is zero`                          | Mint call omitted the root hash              | Pass the upload's `rootHash` to `mint`                    |
| Signature recovers to wrong address         | Used `signMessage` (EIP-191) instead of raw ECDSA | Use `signingKey.sign(digest)` (see `cross-layer/oracle-tee`) |
| `validUntil` expired                        | Proof older than the on-chain window         | Issue a new ownership proof with a fresh `validUntil`     |
| `sealedKey` round-trip fails                | Encrypted key was not stored with the token  | Re-mint with the correct sealed-key envelope              |

## Related Skills

- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — the on-chain
  reference pattern this skill descends from
- [Merkle Verification](../../storage/merkle-verification/SKILL.md) — the off-chain
  re-derive primitive
- [Oracle + TEE](../../cross-layer/oracle-tee/SKILL.md) — for the on-chain verifier that
  checks `OwnershipProof.proof` and `AccessProof.proof`

## References

- [EIP-7857 (iNFT — Intelligent NFTs)](https://eips.ethereum.org/EIPS/eip-7857)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [0G Storage merkle proofs](https://docs.0g.ai/developer-hub/building-on-0g/storage/merkle-proofs)
- [OpenZeppelin MerkleProof (on-chain analogue)](https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#MerkleProof)
- [0G Agent Skills — Storage + Chain (upstream pattern)](https://github.com/0gfoundation/0g-agent-skills/blob/main/skills/cross-layer/storage-plus-chain/SKILL.md)
