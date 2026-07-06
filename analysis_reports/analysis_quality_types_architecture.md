# Quality, Types & Architecture Analysis — `@axiom/config` Package

**Agent**: Sub-Agent 3 — Quality, Types & Architecture
**Scope**: Group C — 22 source files in `packages/config/src/`
**Date**: 2025-07-05

---

## 1. Executive Summary

The `@axiom/config` package is a shared config/types/crypto/storage package used across oracle, backend, and frontend. Overall quality is **above average for a Web3 monorepo** — the codebase demonstrates deliberate type-safety decisions (branded types, sanctioned `as` casts, Zod schemas), clean separation of concerns, and good defensive coding. However, several issues span from **Critical** (security) to **Cosmetic** (redundant regex in schemas). The most impactful issues are: (1) a timing-vulnerable API key comparison, (2) the `.env` parser not handling quoted values, (3) the `upload` method signature mismatch between the `StorageAdapter` interface and `ZeroGStorage` class, and (4) several `any`/`unknown` leak points that weaken the type contract.

**Severity distribution**: 1 Critical, 4 High, 9 Medium, 7 Low, 5 Cosmetic

---

## 2. Detailed Findings

### CRITICAL

#### C1 — Timing-Vulnerable API Key Comparison
- **Severity**: Critical
- **Issue**: `middleware/auth.ts:11` uses `!==` (constant-time-violating) to compare the API key. This is a classic timing side-channel attack vector — an attacker can iteratively guess key bytes by measuring response times.
- **Location**: `middleware/auth.ts:11`
- **Evidence**: `if (key !== apiKey)` — standard string comparison short-circuits on first mismatched byte.
- **Suggested Direction**: Use `crypto.timingSafeEqual(Buffer.from(key ?? ""), Buffer.from(apiKey))`. This is a 3-line change with significant security impact.

---

### HIGH

#### H1 — `.env` Parser Does Not Handle Quoted Values
- **Severity**: High
- **Issue**: `env.ts:33` does `const val = trimmed.slice(eq + 1).trim()`, which does not strip surrounding quotes. If a user writes `DB_URL="postgres://..."`, the value stored includes the literal double-quotes, causing downstream connection failures or silent misconfigurations.
- **Location**: `env.ts:33`
- **Evidence**: `const val = trimmed.slice(eq + 1).trim();` — no quote stripping.
- **Suggested Direction**: After slicing, strip matching outer `'` or `"` if present: `const val = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');`

#### H2 — `loadEnv` Fallback Path Hardcoded to `../../.env`
- **Severity**: High
- **Issue**: `env.ts:22` falls back to `join(process.cwd(), "../../.env")` — a fragile, environment-dependent relative path that silently resolves to different files depending on the CWD at call time. In a monorepo with multiple packages, this may load the wrong `.env`.
- **Location**: `env.ts:22`
- **Evidence**: `resolvedPath = join(process.cwd(), "../../.env");`
- **Suggested Direction**: Remove the hardcoded fallback entirely. If `.env` is not found by traversal, throw a clear error or log a warning. The `existsSync` traversal already walks up to the root.

#### H3 — `upload` Method Signature Mismatches `StorageAdapter` Interface
- **Severity**: High
- **Issue**: `StorageAdapter.upload` (line 23) expects `(blob: Uint8Array): Promise<{ rootHash: Hex }>`, but `ZeroGStorage.upload` (line 187-199) accepts a second `encryption?: Encryption` parameter. This breaks the interface contract — code that types a variable as `StorageAdapter` cannot pass encryption options, while code using `ZeroGStorage` directly can. This is a subtle polymorphism break.
- **Location**: `storage/0g.ts:23` vs `storage/0g.ts:187`
- **Evidence**: Interface: `upload(blob: Uint8Array): Promise<{ rootHash: Hex }>` vs class: `upload(blob: Uint8Array, encryption?: Encryption): Promise<{ rootHash: Hex }>`
- **Suggested Direction**: Either (a) add `encryption?` to the `StorageAdapter` interface, or (b) use a separate `EncryptedStorageAdapter` interface. The former is simpler and backward-compatible.

#### H4 — `getEnvWithAlias` Does Not Log Which Alias Was Used
- **Severity**: High
- **Issue**: When a deprecated alias resolves, no warning is emitted. Over time, teams will have no visibility into which env var names are actually in use, making alias removal risky.
- **Location**: `env.ts:61-73`
- **Evidence**: Loop iterates aliases silently; no `console.warn` or structured log.
- **Suggested Direction**: When a non-canonical alias matches, emit: `console.warn(\`[config] DEPRECATED: \${key} is deprecated, use \${canonical}\`)`.

---

### MEDIUM

#### M1 — Zod Schemas Duplicate Regex Already in `hex.ts`
- **Severity**: Medium
- **Issue**: `types/schemas.ts:7` defines `/^0x[a-fA-F0-9]+$/` which is identical to `HEX_REGEX` in `types/hex.ts:2`. The address regex is similarly duplicated. This creates a maintenance risk — if the regex changes in one place, the other drifts.
- **Location**: `types/schemas.ts:7,12` vs `types/hex.ts:2-3`
- **Evidence**: Both files define `HEX_REGEX` / `ADDRESS_REGEX` independently.
- **Suggested Direction**: Import and reuse `HEX_REGEX` and `ADDRESS_REGEX` from `hex.ts` in `schemas.ts`.

#### M2 — `concatEncrypted` Uses Spread into Array Constructor (Memory Waste)
- **Severity**: Medium
- **Issue**: `crypto/aes-gcm.ts:53-57` uses `[...payload.iv, ...payload.ciphertext, ...payload.authTag]` which creates an intermediate array of individual bytes before constructing `Uint8Array`. For large ciphertexts this causes significant memory churn.
- **Location**: `crypto/aes-gcm.ts:53-57`
- **Evidence**: `new Uint8Array([...payload.iv, ...payload.ciphertext, ...payload.authTag])` — O(n) intermediate array allocation.
- **Suggested Direction**: Pre-allocate and use `.set()`: `const out = new Uint8Array(payload.iv.length + payload.ciphertext.length + payload.authTag.length); out.set(payload.iv); out.set(payload.ciphertext, payload.iv.length); out.set(payload.authTag, payload.iv.length + payload.ciphertext.length);`

#### M3 — `ZeroGStorage` `seenDataHashes` Set Grows Unbounded
- **Severity**: Medium
- **Issue**: Both `InMemoryStorage` and `ZeroGStorage` maintain `seenDataHashes: Set<string>` that grows forever. In a long-running process (oracle, backend), this leaks memory proportional to the number of processed hashes.
- **Location**: `storage/0g.ts:63,179`
- **Evidence**: `private seenDataHashes = new Set<string>()` — no eviction, no TTL, no size cap.
- **Suggested Direction**: Use an LRU cache (e.g., `lru-cache` or a simple circular buffer) with a configurable max size, or use a bloom filter for probabilistic dedup if false positives are acceptable.

#### M4 — `resolveRpcUrl` / `resolveStorageRpc` Repeat Env-Check Pattern
- **Severity**: Medium
- **Issue**: `networks.ts:41-42` and `networks.ts:50-51` both contain `typeof process !== "undefined" && process.env ? process.env : {}` — duplicated env-guards with no shared helper. This also appears in `addresses.ts:66`.
- **Location**: `networks.ts:41,50` and `addresses.ts:66`
- **Evidence**: Three identical env-guard expressions across two files.
- **Suggested Direction**: Extract a `safeEnv()` helper (or use the already-exported `getEnv`/`getEnvWithAlias`) to centralize the pattern.

#### M5 — `process.ts` Handlers Call `process.exit(1)` on Unhandled Rejection
- **Severity**: Medium
- **Issue**: `process.ts:14` calls `process.exit(1)` on unhandled promise rejection. While this is a common pattern, it means a single transient unhandled rejection (e.g., a race condition in a graceful-shutdown path) will kill the entire process with no opportunity for cleanup. The `uncaughtException` handler is more justified here.
- **Location**: `process.ts:14`
- **Evidence**: `process.exit(1)` after unhandledRejection.
- **Suggested Direction**: For `unhandledRejection`, consider logging + setting a "degraded" flag instead of immediate exit, or make the exit behavior configurable.

#### M6 — `addresses.ts` `getAddresses` Returns Object Without `resolveAddress` for Each Key
- **Severity**: Medium
- **Issue**: `getAddresses()` (line 65-74) hardcodes all five address names. If a new address is added to `DEPLOYED_ADDRESSES`, `getAddresses` must be updated manually — violating single-source-of-truth.
- **Location**: `addresses.ts:65-74`
- **Evidence**: Manual enumeration of 5 keys instead of dynamic iteration over `DEPLOYED_ADDRESSES`.
- **Suggested Direction**: Use `Object.fromEntries(Object.keys(DEPLOYED_ADDRESSES).map(name => [name, resolveAddress(name, env)]))` and assert the result type.

#### M7 — `eip712.ts` Module-Level Side Effects (Keccak Hashes at Import Time)
- **Severity**: Medium
- **Issue**: `eip712.ts:58-73` computes keccak256 hashes at module load time. This is fine in Node.js but will cause issues in environments where the module is imported but EIP-712 functionality is unused (e.g., frontend bundles). It also makes testing harder — you can't mock the domain name/version.
- **Location**: `eip712.ts:58-73`
- **Evidence**: `const EIP712_DOMAIN_TYPEHASH = keccak256(...)` runs at import time.
- **Suggested Direction**: Lazy-compute via a getter or memoized function, or accept the current design if bundle size is not a concern.

#### M8 — `process.ts` Duplicates `err` and `error` in JSON Output
- **Severity**: Medium
- **Issue**: `process.ts:8-9` writes both `err` and `error` with the same value. This is redundant and confusing for log consumers — which field should they query?
- **Location**: `process.ts:8-9,22-23`
- **Evidence**: `{ level: "error", msg: "unhandledRejection", err, error: err, ... }`
- **Suggested Direction**: Pick one field name (recommend `error` to match standard logging conventions) and remove the other.

#### M9 — `InMemoryStorage` Upload Does Not Deep-Copy the Input Blob
- **Severity**: Medium
- **Issue**: `storage/0g.ts:67` does `this.store.set(rootHash.toLowerCase(), new Uint8Array(blob))` — this creates a new `Uint8Array` view over the same underlying `ArrayBuffer` if `blob` is a `Uint8Array` backed by one. However, if `blob` is a `Buffer` or typed array slice, mutations to the original can corrupt the stored copy.
- **Location**: `storage/0g.ts:67`
- **Evidence**: `new Uint8Array(blob)` is a copy of the typed array metadata, not a deep copy of the buffer.
- **Suggested Direction**: Use `new Uint8Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))` for a true deep copy.

---

### LOW

#### L1 — `hex.ts` `toViemHex` Uses Double Cast (`as unknown as`)
- **Severity**: Low
- **Issue**: `hex.ts:22` uses `as unknown as \`0x${string}\`` — the `as unknown` intermediate is unnecessary since branded types already satisfy structural compatibility.
- **Location**: `hex.ts:22`
- **Evidence**: `return h as unknown as \`0x${string}\`;`
- **Suggested Direction**: `return h as \`0x${string}\`` is sufficient, since `Hex` is `string & { __brand }` which is assignable to `` `0x${string}` ``.

#### L2 — `ecies.ts` `toCompressed` Uses `Buffer.from(...).toString("hex")`
- **Severity**: Low
- **Issue**: `ecies.ts:26` converts bytes to hex string then passes to `fromHex`. This is a minor performance waste — `ProjectivePoint.fromHex` accepts `Uint8Array` directly.
- **Location**: `ecies.ts:26`
- **Evidence**: `Buffer.from(full).toString("hex")` then `fromHex(hexString)`.
- **Suggested Direction**: Pass `full` directly to `secp256k1.ProjectivePoint.fromHex(full)`.

#### L3 — `auth.ts` Skips Auth for `/health` but Not for Other Common Endpoints
- **Severity**: Low
- **Issue**: `auth.ts:9` hardcodes `/health` as the only unauthenticated path. Common patterns also exclude `/ready`, `/metrics`, `/openapi.json`, etc. This is a minor API design concern — callers may need to add more bypasses.
- **Location**: `auth.ts:9`
- **Evidence**: `if (req.path === "/health") return next();`
- **Suggested Direction**: Accept an optional `publicPaths: string[]` parameter, defaulting to `["/health"]`.

#### L4 — `env.ts` `getEnv` Throws Plain `Error` Without Error Code
- **Severity**: Low
- **Issue**: `env.ts:45` throws `new Error(\`Missing required env var \${key}\`)`. Without an error code or custom error class, callers cannot programmatically distinguish config errors from other errors.
- **Location**: `env.ts:45`
- **Suggested Direction**: Define a `ConfigError` class or use `ERR_MISSING_ENV` as a code: `const err = new Error(...); err.code = 'ERR_MISSING_ENV'; throw err;`

#### L5 — `networks.ts` `pickOGNetwork` Returns `null` Instead of Throwing
- **Severity**: Low
- **Issue**: `networks.ts:36` returns `null` for unknown chain IDs. This forces every caller to null-check, which is error-prone. A thrown error with a clear message would be more defensive.
- **Location**: `networks.ts:36`
- **Suggested Direction**: Throw a descriptive error for unknown chain IDs, or provide a `pickOGNetworkOrThrow` variant.

#### L6 — `process.ts` `err` Field Uses `reason.stack ?? reason.message` Which Can Be `undefined`
- **Severity**: Low
- **Issue**: `process.ts:4` — `reason.stack ?? reason.message` — if `reason` is an Error with neither `stack` nor `message` (technically possible with custom Error subclasses), `err` becomes `undefined`, and JSON.stringify writes `"err": null`.
- **Location**: `process.ts:4`
- **Suggested Direction**: Fallback chain: `reason.stack ?? reason.message ?? String(reason)`.

#### L7 — `eip712.ts` `OwnershipProofResult` Has All Optional Fields
- **Severity**: Low
- **Issue**: `eip712.ts:115-123` — `OwnershipProofResult` has `accessProofNonce?`, `ownershipProofNonce?`, and `signer?` as optional. This weakens the type contract for downstream consumers who must null-check every field.
- **Location**: `eip712.ts:115-123`
- **Suggested Direction**: Split into `OwnershipProofResultBase` (always present) and `OwnershipProofResultExtended` (optional fields), or use discriminated unions.

---

### COSMETIC

#### S1 — `index.ts` Exports `export *` From Multiple Modules
- **Severity**: Cosmetic
- **Issue**: `index.ts:12-16` uses `export *` from several modules. This can cause name collisions if two modules export the same name (currently not the case, but fragile).
- **Location**: `index.ts:12-16`
- **Suggested Direction**: Prefer named re-exports (like lines 1-10 already do) for consistency and collision safety.

#### S2 — `env-schema.ts` Has Unused `process` Guard
- **Severity**: Cosmetic
- **Issue**: `env-schema.ts:19` checks `typeof process !== "undefined" && process.env ? process.env : {}` but this schema is validated on the server where `process` always exists. The guard is dead code.
- **Location**: `env-schema.ts:19`
- **Suggested Direction**: Simplify to `process.env.OG_COMPUTE_API_KEY ?? undefined`.

#### S3 — `secp256k1.ts` `deriveUncompressedPubkeyFromHex` Name Suggests "Uncompressed" But Returns 64-byte (No Prefix)
- **Severity**: Cosmetic
- **Issue**: The function name says "uncompressed" but returns 64 bytes (X||Y), not 65 bytes (0x04||X||Y). This is confusing — "uncompressed" in secp256k1 traditionally means 65 bytes.
- **Location**: `secp256k1.ts:23`
- **Suggested Direction**: Rename to `deriveRawPubkeyFromHex` or clarify in the JSDoc that this returns the 64-byte X||Y form.

#### S4 — `schemas.ts` Transform Chains May Lose Zod Parse-tree Information
- **Severity**: Cosmetic
- **Issue**: `schemas.ts:8` chains `.transform()` which replaces the Zod output type. This means error messages from downstream Zod schemas may not include the original field path.
- **Location**: `schemas.ts:5-17`
- **Suggested Direction**: Consider using `.pipe()` instead of `.transform()` to preserve the original schema's error context.

#### S5 — `process.ts` Exports Only One Function
- **Severity**: Cosmetic
- **Issue**: The entire `process.ts` file exports a single function. This is fine architecturally, but the file could be inlined into `index.ts` or kept as-is — no issue, just a note.
- **Location**: `process.ts`
- **Suggested Direction**: No change needed; file organization is acceptable.

---

## 3. Positive Findings

1. **Branded Hex types with single-sanctioned-cast pattern** (`types/hex.ts`): The `validateHex` / `validateAddress` functions provide a clean runtime-to-compile-time bridge. The "THE ONE sanctioned `as`" comment is excellent documentation discipline.

2. **`TypedContract<T>` design** (`types/contract.ts`): A single `as unknown as T` in the constructor with zero per-method casts is a textbook approach to wrapping untyped contract libraries. This is well-architected.

3. **EIP-712 type definitions as canonical source** (`eip712.ts`): Centralizing `ACCESS_PROOF_TYPES` and `OWNERSHIP_PROOF_TYPES` with `as const` satisfies prevents drift between oracle and frontend. This is a strong architectural decision.

4. **Zod schema merging pattern** (`env-schema.ts`): The `sharedEnvSchema` is designed to be merged into package-specific schemas via `.merge()`. This is a clean composable config pattern.

5. **`StorageAdapter` interface** (`storage/0g.ts`): Defining a clear interface with `InMemoryStorage` and `ZeroGStorage` implementations enables testing and swapping. Good dependency inversion.

6. **Defensive crypto coding** (`crypto/aes-gcm.ts`): Key length validation (`key.length !== 32`) and blob length checks in `parseEncrypted` are exactly the kind of fail-fast patterns that prevent cryptic downstream errors.

7. **`resolveAddress` with env-override chain** (`addresses.ts`): The canonical → deprecated alias → hardcoded fallback chain is well-designed for migration safety.

8. **`bigintReplacer`** (`types/bigint.ts`): A tiny, focused utility that prevents a common and nasty JSON.stringify crash. Good defensive utility.

9. **Module re-export organization** (`types/index.ts`, `abis/index.ts`): Clean barrel exports that keep consumer imports short.

10. **`getTokenIdFromPayload`** (`types/events.ts`): Robust multi-type extraction with graceful fallbacks — handles bigint, number, string, and missing values.

---

## 4. Microchange Opportunities

| Priority | Change | Files | Effort |
|----------|--------|-------|--------|
| **P0** | Fix timing-vulnerable API key comparison with `crypto.timingSafeEqual` | `middleware/auth.ts` | 10 min |
| **P0** | Strip quotes from `.env` values | `env.ts` | 10 min |
| **P1** | Add `encryption?` to `StorageAdapter` interface | `storage/0g.ts` | 5 min |
| **P1** | Extract `safeEnv()` helper to deduplicate env-guard pattern | `networks.ts`, `addresses.ts` | 15 min |
| **P1** | Add deprecated-alias warnings in `getEnvWithAlias` | `env.ts` | 10 min |
| **P2** | Fix `concatEncrypted` memory allocation pattern | `crypto/aes-gcm.ts` | 5 min |
| **P2** | Add LRU/bloom to `seenDataHashes` | `storage/0g.ts` | 20 min |
| **P2** | Deduplicate regex between `schemas.ts` and `hex.ts` | `types/schemas.ts` | 5 min |
| **P2** | Remove hardcoded `../../.env` fallback | `env.ts` | 5 min |
| **P2** | Dynamic `getAddresses` iteration | `addresses.ts` | 10 min |
| **P2** | Remove duplicate `err`/`error` in process handlers | `process.ts` | 5 min |
| **P3** | Add `ConfigError` class for env-var errors | `env.ts` | 15 min |
| **P3** | Fix `toViemHex` unnecessary `as unknown` | `types/hex.ts` | 2 min |
| **P3** | Accept `publicPaths` in `createApiKeyAuth` | `middleware/auth.ts` | 10 min |
| **P3** | Rename `deriveUncompressedPubkeyFromHex` | `crypto/secp256k1.ts` | 5 min |
