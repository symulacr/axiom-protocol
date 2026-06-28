# 0G Labs SDK/API Exhaustive Research Report

**Date**: 2026-06-28
**Scope**: Compare official 0G documentation & SDK source code against our codebase at `/home/eya/og/`

---

## 1. Overview & Architecture

0G (Zero Gravity) is a modular Layer-1 dAIOS (decentralized AI Operating System) with four main components:

| Component | Purpose | Our Usage |
|-----------|---------|-----------|
| **Storage** | Persistent decentralized file storage (hot + cold) | Oracle agent config / model-data storage |
| **Compute** | TEE-verified AI inference & fine-tuning marketplace | AI strategy inference via Router |
| **DA** | Data Availability (high-throughput, 50 Gbps) | Not used |
| **Consensus** | EVM-compatible L1 chain | On-chain contract interactions |

---

## 2. Storage SDK (`@0gfoundation/0g-storage-ts-sdk`)

### 2.1 Version

| Source | Version |
|--------|---------|
| Our `@axiom/config` | `^1.2.10` |
| Official npm | latest stable |

### 2.2 Core Classes — Correct Signatures (v1.2.x)

#### `Indexer`
```typescript
class Indexer extends HttpProvider {
  constructor(url: string)  // indexer RPC URL

  // Upload — computes merkle tree internally during splitableUpload
  async upload(
    file: AbstractFile,       // ZgFile, MemData, or Blob
    blockchain_rpc: string,   // EVM RPC URL
    signer: Signer,           // ethers Signer (must hold OG tokens for gas)
    uploadOpts?: UploadOption,
    retryOpts?: RetryOpts,
    opts?: TransactionOptions
  ): Promise<
    [{ txHash: string; rootHash: string; txSeq: number }
   | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] },
     Error | null]
  >

  // Node.js file-system download
  async download(rootHash: string, filePath: string, proof?: boolean): Promise<Error | null>
  async download(rootHashes: string[], filePath: string, proof?: boolean): Promise<Error | null>

  // Browser-safe/Node in-memory download (v1.1+)
  async downloadToBlob(rootHash: string, opts?: DownloadOption): Promise<[Blob, Error | null]>
  async downloadToBlob(rootHashes: string[], opts?: DownloadOption): Promise<[Blob, Error | null]>

  // Node selection for KV operations
  async selectNodes(expectedReplica: number, method?: SelectMethod): Promise<[StorageNode[], Error | null]>
}
```

#### `DownloadOption`
```typescript
interface DownloadOption {
  proof?: boolean;                    // default false; enables merkle proof verification
  decryption?: {
    symmetricKey?: string | Uint8Array;   // AES-256 key
    privateKey?: string | Uint8Array;     // ECIES private key
  };
}
```

#### `MemData`
```typescript
class MemData extends AbstractFile {
  constructor(data: ArrayLike<number>, offset?: number, size?: number, paddedSize?: number)
  // Must call .merkleTree() if you need the root hash BEFORE upload;
  // upload() computes it internally during splitableUpload.
  async merkleTree(): Promise<[MerkleTree | null, Error | null]>
}
```

#### `ZgFile`
```typescript
class ZgFile extends AbstractFile {
  // Node.js only — reads from filesystem
  static async fromFilePath(filePath: string): Promise<ZgFile>
  async merkleTree(): Promise<[MerkleTree | null, Error | null]>
  async close(): Promise<void>
}
```

#### `UploadOption`
```typescript
interface UploadOption {
  expectedReplica?: number;  // default 1
  taskSize?: number;         // default 10
  skipTx?: boolean;          // default false
  finalityRequired?: boolean; // default true
  fastMode?: boolean;        // default false
}
```

### 2.3 Our Implementation — `packages/config/src/storage/0g.ts`

**What we do correctly:**
- Uses `Indexer`, `MemData` from the SDK
- `uploadToStorage` extracts both single and fragment result hashes correctly
- `downloadFromStorage` uses `downloadToBlob` (correct for v1.2.x)
- `ZeroGStorage` wrapper exposes clean `upload(blob)` / `download(rootHash)` interface
- Constructor: `new Indexer(config.indexerRpc)` — correct

**Issues / Pitfalls:**

1. **Missing `merkleTree()` call before upload** (L68)
   - Our code: `indexer.upload(new MemData(data), evmRpc, signer)`
   - Official docs show: `new MemData(data); await memData.merkleTree(); indexer.upload(memData, ...)`
   - **Risk**: LOW. The SDK's `splitableUpload` internally computes Merkle trees via `createSubmission()` during upload. The root hash is returned in the transaction result. However, the official docs emphasize calling `merkleTree()` before upload to populate internal state. The upload WILL work, but depending on SDK version internals, edge cases (padded size, fragment splitting) could behave differently.
   - **Recommendation**: Add `await memData.merkleTree()` before upload to match the documented pattern.

2. **No encryption support in the upload path** (L62-75)
   - `UploadOption` supports encryption but our upload path never passes encryption options.
   - The `Encryption` type we re-export is never consumed by our upload functions.
   - **Risk**: LOW (encryption not needed for current use case)

3. **No `uploadOpts` passed** (L68)
   - We don't pass `UploadOption` — all defaults apply (expectedReplica=1, fastMode=false, finalityRequired=true)
   - **Risk**: LOW for devnet/testnet; for mainnet, `expectedReplica` of 1 is the minimum.

### 2.4 Download — `downloadFromStorage`

Our code:
```typescript
const downloadOpts = { proof: opts?.withProof ?? true };
const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
```

**Assessment**: Correct. Uses `downloadToBlob` which is browser+Node safe. `withProof` defaults to `true`.

---

## 3. Compute SDK (`@0gfoundation/0g-compute-ts-sdk`)

### 3.1 Version

| Source | Version |
|--------|---------|
| Our `@axiom/backend` | `^0.8.4` |
| Official npm | latest stable |

### 3.2 Key SDK Classes & Signatures (v0.8.x)

#### `createZGComputeNetworkBroker` — Full (Authenticated)
```typescript
async function createZGComputeNetworkBroker(
  signer: JsonRpcSigner | Wallet,
  ledgerCA?: string,       // auto-detected from chain
  inferenceCA?: string,    // auto-detected from chain
  fineTuningCA?: string,   // auto-detected from chain
  gasPrice?: number,
  maxGasPrice?: number,
  step?: number
): Promise<ZGComputeNetworkBroker>
```

`ZGComputeNetworkBroker` properties:
```typescript
class ZGComputeNetworkBroker {
  ledger: LedgerBroker
  inference: InferenceBroker
  fineTuning?: FineTuningBroker
}
```

#### `LedgerBroker` (fund management)
```typescript
async depositFund(amount: number): Promise<void>
async transferFund(providerAddress: string, serviceType: 'inference' | 'fineTuning', amount: bigint, gasPrice?: number): Promise<void>
async getLedger(): Promise<LedgerStructOutput>
async retrieveFund(): Promise<void>
async refund(amount: number): Promise<void>
```

#### `InferenceBroker` (authenticated operations)
```typescript
class InferenceBroker extends ReadOnlyInferenceBroker {
  async listService(offset?: number, limit?: number, includeUnacknowledged?: boolean): Promise<ServiceStructOutput[]>
  async listServiceWithDetail(offset?: number, limit?: number, includeUnacknowledged?: boolean): Promise<ServiceWithDetail[]>
  async getProviderModels(providerAddress: string): Promise<ProviderModels>
  async getAccount(providerAddress: string): Promise<AccountStructOutput>
  async getAccountWithDetail(providerAddress: string): Promise<[...]>
  async acknowledged(providerAddress: string): Promise<boolean>
  async checkProviderSignerStatus(providerAddress: string, gasPrice?: number): Promise<{ isAcknowledged: boolean; teeSignerAddress: string }>
  async acknowledgeProviderSigner(providerAddress: string, gasPrice?: number): Promise<void>
  async getServiceMetadata(providerAddress: string, model?: string): Promise<{ endpoint: string; model: string }>
  async getRequestHeaders(providerAddress: string, content?: string): Promise<ServingRequestHeaders>
  async processResponse(providerAddress: string, chatID?: string, content?: string): Promise<boolean | null>
  loraProcessor: LoRAProcessor
}
```

#### `ReadOnlyInferenceBroker` (no wallet needed)
```typescript
class ReadOnlyInferenceBroker {
  async listService(offset?: number, limit?: number, includeUnacknowledged?: boolean): Promise<ServiceStructOutput[]>
  async listServiceWithDetail(offset?: number, limit?: number, includeUnacknowledged?: boolean): Promise<ServiceWithDetail[]>
  async getProviderModels(providerAddress: string): Promise<ProviderModels>
}

async function createReadOnlyInferenceBroker(rpcUrl: string, chainId?: number): Promise<ReadOnlyInferenceBroker>
```

#### `ServingRequestHeaders`
```typescript
interface ServingRequestHeaders {
  Authorization: string;   // Bearer token signed by wallet
  // All other fields deprecated in v0.8.x
}
```

### 3.3 Our Implementation — `provider-discovery.ts`

**What we do correctly:**
- Uses `ReadOnlyInferenceBroker` — correct choice for provider discovery without wallet
- Uses `listService()` with pagination defaults
- Caches results with 5-min TTL
- Creates new broker instance per call (no stale state)

**Issues / Pitfalls:**

1. **Incorrect service field mapping** (L38-41):
   ```typescript
   services.map(s => ({
     provider: s.provider ?? s.appClientAddr ?? "",
     model: s.model ?? "unknown",
     appClientAddr: s.appClientAddr ?? s.provider ?? "",
   }))
   ```
   - `ServiceStructOutput` from the SDK has fields: `provider`, `name`, `url`, `model`, `pricePerToken`, `providerSigner`, `occupied`, `teeSignerAddress`, `teeSignerAcknowledged`, `additionalInfo`, `verifiability`, `quota`
   - There is NO `appClientAddr` field in the SDK's `ServiceStructOutput`. This field name appears to be from an earlier SDK version or a different type.
   - **Risk**: MEDIUM. The field mapping may produce empty strings for `appClientAddr`. The `provider` field IS the correct canonical name.

### 3.4 Our Implementation — `router.ts`

**What we do correctly:**
- Uses **Router** approach (recommended by docs for server-side apps)
- Falls back from Direct key to Router API key with clear error messages
- Proper network URL resolution per chain ID
- 30s timeout, 2 maxRetries

**Issues / Pitfalls:**

1. **`decodeDirectKeyToken` may be fragile** (L21-37):
   - Parses `app-sk-<base64>` where base64 decodes to `JSON || "|" || hex_signature`
   - Field normalization: `payload.provider ?? payload.providerAddress`, `payload.address ?? payload.user`
   - If the Direct key format changes in an SDK update, this will break silently.
   - **Risk**: LOW-MEDIUM

2. **No `processResponse` (TEE verification)**:
   - We never verify TEE signatures on inference responses.
   - **Risk**: LOW for Router (handles TEE server-side). HIGH if switching to Direct mode.

### 3.5 Funding Flow (Official)

```
1. broker.ledger.depositFund(10)           // Wallet → main account (OG tokens)
2. broker.inference.checkProviderSignerStatus(addr)  // Auto-creates sub-account
3. broker.inference.getRequestHeaders(addr)  // Built-in auto-funding
```

In SDK v0.8.x, `getRequestHeaders()` has built-in `checkAndFund()` which auto-transfers if the sub-account balance is low (refill at 500, target 1000 in price-per-token units).

---

## 4. Network Configuration

### 4.1 Official vs Our Config

| Parameter | Official Testnet (Galileo) | Our `networks.ts` | Match |
|-----------|---------------------------|-------------------|-------|
| Chain ID | 16602 | 16602 | Yes |
| EVM RPC | `https://evmrpc-testnet.0g.ai` | same | Yes |
| Storage Indexer | `https://indexer-storage-testnet-turbo.0g.ai` | same | Yes |
| Router API | `https://router-api-testnet.integratenetwork.work/v1` | same | Yes |
| Block Explorer | `https://chainscan-galileo.0g.ai` | same | Yes |

| Parameter | Official Mainnet (Aristotle) | Our `networks.ts` | Match |
|-----------|---------------------------|-------------------|-------|
| Chain ID | 16661 (from SDK source) | 16661 | Yes |
| EVM RPC | `https://evmrpc.0g.ai` | same | Yes |
| Storage Indexer | `https://indexer-storage-turbo.0g.ai` | same | Yes |
| Router API | `https://router-api.0g.ai/v1` | same | Yes |

### 4.2 SDK Network Detection

```typescript
// From @0gfoundation/0g-compute-ts-sdk constants
TESTNET_CHAIN_ID = 16602n
MAINNET_CHAIN_ID = 16661n
```

Our chain IDs match the SDK exactly.

### 4.3 Chain ID Ambiguity Warning

**Important**: Some external sources (Thirdweb, ChainList) list Galileo Chain ID as **16601**, not 16602. The official docs and SDK source use **16602**. Using 16601 may cause RPC connection failures.

### 4.4 Contract Addresses (Official Compute SDK)

```typescript
// Testnet (Galileo):
ledger:     '0xE70830508dAc0A97e6c087c75f402f9Be669E406'
inference:  '0xa79F4c8311FF93C06b8CfB403690cc987c93F91E'
fineTuning: '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA'

// Mainnet (Aristotle):
ledger:     '0x2dE54c845Cd948B72D2e32e39586fe89607074E3'
inference:  '0x47340d900bdFec2BD393c626E12ea0656F938d84'
fineTuning: '0x4e3474095518883744ddf135b7E0A23301c7F9c0'
```

**Storage contract addresses** (from docs, separate from Compute):
```
Flow:   0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
Mine:   0x00A9E9604b0538e06b268Fb297Df333337f9593b
Reward: 0xA97B57b4BdFEA2D0a25e535bd849ad4e6C440A69
DA:     0xE75A073dA5bb7b0eC622170Fd268f35E675a957B
```

---

## 5. Compute Router API (OpenAI-Compatible)

### 5.1 Base URLs

| Network | Router URL |
|---------|-----------|
| Mainnet | `https://router-api.0g.ai/v1` |
| Testnet | `https://router-api-testnet.integratenetwork.work/v1` |

### 5.2 Authentication

Two key types:
- `sk-*` (API key): For inference calls (`/v1/chat/completions`, etc.)
- `mk-*` (Management key): For account admin (balance, key management)

**Breaking change**: `sk-` keys no longer have access to `/v1/account/*`. Use `mk-` keys with `account:read` scope.

**Header**: `Authorization: Bearer sk-YOUR_API_KEY`

### 5.3 Permission Matrix

| Endpoint | `sk-` | `mk-` |
|----------|-------|-------|
| `POST /v1/chat/completions` | Allowed | Denied |
| `GET /v1/account/*` | Denied | Allowed (with `account:read`) |
| `GET /v1/api-keys` | Denied | Allowed (`keys:read`) |
| `POST /v1/api-keys` | Denied | Allowed (`keys:create`) |
| `PATCH/DELETE /v1/api-keys/:id` | Denied | Allowed (`keys:manage`) |
| `ANY /v1/management-keys/*` | Denied | Denied (wallet JWT only) |

### 5.4 Our Usage

```typescript
new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
```

Correct usage. Passes API key as `apiKey` (OpenAI SDK standard). Uses Router URL as base.

---

## 6. TEE Verification & `processResponse`

### 6.1 Official Flow

```typescript
// From ResponseProcessor
async processResponse(
  providerAddress: string,
  chatID?: string,     // Required for verification
  content?: string     // Usage JSON with input_tokens/output_tokens
): Promise<boolean | null>   // true=verified, false=failed, null=skipped
```

The TEE verification works through:
1. `Verifier.fetchSignatureByChatID(svc.url, chatID, svc.model)` — fetches signed response from provider
2. `Verifier.verifySignature(text, signature, signingAddress)` — verifies ECDSA signature against TEE public key
3. **TeeML**: Model runs inside TEE, signs with TEE key
4. **TeeTLS**: Broker proxies to centralized provider, captures TLS fingerprint + request/response hash

### 6.2 Our Implementation

**Not implemented**. We use the Router (not Direct) for inference calls. The Router handles TEE verification server-side. Our Oracle uses a custom `TeeSigner` for EIP-712 signing (unrelated to 0G Compute TEE).

**Risk**: LOW for Router path. Router guarantees TEE-verified responses automatically. If switching to Direct mode, `processResponse()` MUST be called.

---

## 7. DA vs Storage — When to Use Which

| Aspect | Storage | DA |
|--------|---------|-----|
| Purpose | Persistent blob storage | Data availability proofs |
| Access | Read/write individual files | Publish blobs for L2/rollups |
| Performance | Hot storage (near-centralized) | 50 Gbps throughput |
| Proof | PoRA (Proof of Random Access) | Random sampling committees |
| Our use case | Model data, agent config | Not needed |

Our usage of 0G Storage (not DA) is correct.

---

## 8. Configuration Best Practices

### 8.1 Environment Variables

| Variable | Our Name | Status |
|----------|----------|--------|
| EVM RPC | `AXIOM_EVM_RPC` | Custom, correct |
| Storage Indexer | `AXIOM_STORAGE_RPC` | Custom, correct |
| Compute API Key | `AXIOM_COMPUTE_API_KEY` / `OG_COMPUTE_API_KEY` | Custom, correct |
| Compute Direct Key | `AXIOM_COMPUTE_DIRECT_KEY` | Custom, correct |

### 8.2 Turbo vs Standard Indexer

Our config uses Turbo (`indexer-storage-testnet-turbo.0g.ai`). Correct. Turbo is the recommended path (faster, higher fees).

### 8.3 Storage Contracts Auto-Discovery

The Storage SDK (`Indexer`) auto-discovers the Flow contract from the indexer node. You do NOT need to configure Storage contract addresses manually. The Compute SDK auto-detects contract addresses from chain ID.

---

## 9. Common Pitfalls Summary

| # | Pitfall | File | Severity | Fix |
|---|---------|------|----------|-----|
| 1 | Missing `merkleTree()` before upload | `packages/config/src/storage/0g.ts:68` | Low | Add `memData.merkleTree()` before upload |
| 2 | Incorrect field mapping (`appClientAddr` doesn't exist in SDK) | `apps/backend/src/compute/provider-discovery.ts:38-41` | Medium | Remove `appClientAddr`; use only `provider` and `model` |
| 3 | No TEE `processResponse` for Direct mode | Router path only | Low (Router) / High (Direct) | Add verification if switching to Direct |
| 4 | Fragile `decodeDirectKeyToken` format assumptions | `apps/backend/src/compute/router.ts:21-37` | Low-Medium | Add format validation and graceful fallback |
| 5 | No `UploadOption` customization for storage | `packages/config/src/storage/0g.ts:68` | Low | Add configurable `expectedReplica` for production |
| 6 | Chain ID 16601 vs 16602 confusion (external RPCs) | External | Medium | Always use 16602 (matches SDK) |

---

## 10. SDK Version Compatibility Notes

### Storage SDK v0.x → v1.x
- `Indexer.upload()` return type changed — our code handles both shapes: OK
- `downloadToBlob` added in v1.1 — our code uses it: OK
- `merkleTree()` no longer strictly required before upload (SDK computes internally): LOW RISK

### Compute SDK v0.7.x → v0.8.x
- Package renamed from `@0glabs/0g-serving-broker` to `@0gfoundation/0g-compute-ts-sdk`
- `ServingRequestHeaders` — most fields deprecated; only `Authorization` remains
- `getRequestHeaders()` has built-in `checkAndFund()` for auto-balance management
- Our imports use `@0gfoundation/0g-compute-ts-sdk`: OK

---

## 11. Key References

| Resource | URL |
|----------|-----|
| Storage TS SDK | https://github.com/0gfoundation/0g-storage-ts-sdk |
| Compute TS SDK | https://github.com/0gfoundation/0g-compute-ts-sdk |
| Storage Docs | https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk |
| Compute Router Docs | https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview |
| Compute Direct Docs | https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference |
| Testnet Overview | https://docs.0g.ai/developer-hub/testnet/testnet-overview |
| Builder Hub | https://build.0g.ai/sdks |
| Router API Reference | https://0gfoundation.github.io/0g-router/ |
| Storage TS Starter Kit | https://github.com/0gfoundation/0g-storage-ts-starter-kit |
| Compute TS Starter Kit | https://github.com/0glabs/0g-compute-ts-starter-kit |
