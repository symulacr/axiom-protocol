# 0G Labs SDK Ecosystem: JS/TS vs Go — Feasibility Report

**Date:** 2026-06-24  
**Scope:** JavaScript/TypeScript SDKs vs Go SDKs for 0G Storage, Compute, DA, and Chain interaction  
**Data Source:** GitHub API (live), NPM API (live), repository READMEs and code trees

---

## 1. Organization Overview

The [`0gfoundation`](https://github.com/0gfoundation) GitHub org contains ~80+ repositories. The SDK-relevant ones are:

| Repository | Language | Stars | Forks | Open Issues | Purpose |
|---|---|---|---|---|---|
| `0g-storage-ts-sdk` | TypeScript | 8 | 14 | 6 | Storage TS SDK |
| `0g-compute-ts-sdk` | TypeScript | 12 | 13 | 12 | Compute/AI TS SDK |
| `0g-storage-client` | Go | 55 | 67 | 3 | Storage Go Client/SDK |
| `0g-da-client` | Go | 37 | 31 | 11 | DA Go Client |
| `0g-sandbox` | Go | 2 | 2 | 15 | Billing proxy |
| `0g-storage-node` | Rust | 177 | 180 | 45 | Core storage node |
| `0g-storage-contracts` | TypeScript | 36 | 47 | 0 | Smart contracts |

---

## 2. Activity Comparison Table

| Metric | **JS/TS SDK** | **Go SDK** |
|---|---|---|
| **Repository** | `0g-storage-ts-sdk` | `0g-storage-client` |
| **Language** | TypeScript (95.7%) + JS (4.1%) | Go (100%) |
| **Created** | 2024-02-28 | 2024-01-04 |
| **Last Commit** | **2026-06-02** (hot storage upload) | **2026-06-13** (OnSubmitted callback) |
| **Last Release** | **None** (no GitHub releases) | **v1.4.3-testnet** (2026-06-10) |
| **GitHub Stars** | 8 | **55** |
| **Forks** | 14 | **67** |
| **Watchers/Subscribers** | 3 | **25** |
| **Total Contributors** | 7 | **10** (plus bot accounts) |
| **Top Contributors** | 0g-peterzhb (52), wriches (6), Pana (5) | 0g-peterzhb (53), MiniFrenchBread (40), boqiu (31), wanliqun (12) |
| **Open Issues** | 6 | **3** |
| **License** | None | MIT |
| **NPM Downloads/week** | **868** (`@0gfoundation/0g-storage-ts-sdk`) | N/A (Go module, no npm) |
| **CI/CD** | GitHub Actions | GitHub Actions (Go + tests) |

### JS/TS SDK: Compute SDK

| Metric | Value |
|---|---|
| **Repo** | `0g-compute-ts-sdk` |
| **Last Commit** | 2026-06-10 |
| **Last Release** | v0.9.0-beta.0 (2026-06-10) |
| **Stars** | 12 |
| **Contributors** | 10 (top: Ravenyjh at 397 commits) |
| **Open Issues** | 12 |
| **NPM Downloads/week** | 879 (`@0gfoundation/0g-compute-ts-sdk`) |

### Go SDK: DA Client

| Metric | Value |
|---|---|
| **Repo** | `0g-da-client` |
| **Language** | Go (405KB), Python (50KB), Dockerfile |
| **Last Commit** | 2026-05-29 |
| **Last Release** | v1.0.1-testnet (2024-08-13) |
| **Stars** | 37 |
| **Open Issues** | 11 |

---

## 3. Feature Coverage Matrix

| Feature | **TypeScript (`0g-storage-ts-sdk`)** | **Go (`0g-storage-client`)** |
|---|---|---|
| **Storage: Upload** | ✅ `Indexer.upload` | ✅ `upload` (CLI + SDK) |
| **Storage: Download** | ✅ `Indexer.download` | ✅ `download` (CLI + SDK) |
| **Storage: Hot Storage** | ✅ `Indexer.uploadToHot` (added Jun 2026) | ✅ Hot storage download (v1.4.x) |
| **Storage: Extend Period** | ❌ Not available | ✅ `ExtendStorage` (v1.4.2) |
| **Storage: Batch Upload** | ❌ Not available | ✅ Batch small files, directory upload |
| **Storage: Encryption (AES-256)** | ✅ `tryDecrypt` | ✅ AES-256-CTR |
| **Storage: Encryption (ECIES)** | ❌ Not available | ✅ ECIES asymmetric (v1.4.1) |
| **Storage: Fragment Split** | ❌ Not available | ✅ Fragment upload/download |
| **Storage: Merkle Tree** | ✅ `ZgFile.merkleTree()` | ✅ Core merkle tree utilities |
| **Storage: CLI Tool** | ❌ No CLI | ✅ Full CLI (`0g-storage-client`) |
| **Storage: S3 Gateway** | ❌ Not available | ✅ S3 gateway additions |
| **KV: Write** | ✅ `Batcher` | ✅ `kv-write` with encryption |
| **KV: Read** | ✅ `KvClient.getValue` | ✅ `kv-read` |
| **KV: Encryption** | ❌ Not mentioned | ✅ Full encryption support |
| **Indexer: Select Nodes** | ✅ | ✅ |
| **Indexer: REST Gateway** | ❌ Not available | ✅ Full HTTP REST API |
| **Chain: Flow Contract** | ✅ Contract types (auto-gen) | ✅ Full Flow contract bindings |
| **Chain: Market Contract** | ✅ Contract types | ✅ Market contract bindings |
| **Chain: Transaction Options** | Limited | ✅ Rich options (gas, nonce, retries) |
| **Browser Support** | ✅ (ESM + Vite polyfills) | ❌ N/A (Go) |
| **Docker Support** | ❌ Not available | ✅ Docker images available |
| **Tests** | ✅ Jest unit tests | ✅ Go tests + Python e2e tests |

### Compute Coverage

| Feature | **TypeScript (`0g-compute-ts-sdk`)** | **Go Equivalent** |
|---|---|---|
| **Inference** | ✅ Full SDK | ❌ No Go compute SDK |
| **Fine-tuning** | ✅ Full pipeline | ❌ No Go compute SDK |
| **TEE Downloads** | ✅ | ❌ No Go compute SDK |
| **Broker Interactions** | ✅ Full | ❌ No Go compute SDK |
| **CLI** | ✅ `0g-compute-cli` | ❌ No Go compute SDK |

---

## 4. Maintenance Activity Analysis

### JS/TS SDK (`0g-storage-ts-sdk`)
- **Verdict: Actively maintained but lightweight**
- 68 total commits since Feb 2024 (~2.4 commits/month avg)
- Recent commit (Jun 2, 2026) added hot storage upload — meaningful feature work
- However, **no formal GitHub releases** — the repo has 0 releases published
- 7 contributors but 52/68 commits are from a single person (0g-peterzhb)
- npm package has modest but steady 868 downloads/week
- No CI/CD test badge visible in README

### Go SDK (`0g-storage-client`)
- **Verdict: Heavily maintained, production-grade**
- Multiple releases: v1.0.0 (Apr 2025) → v1.4.3-testnet (Jun 2026)
- Rapid release cadence: 4 releases in 2 weeks (May 28 → Jun 10 → Jun 6 → Jun 10)
- Rich changelogs with detailed feature descriptions
- CI badges: Go build + test workflows both passing
- 25 subscribers vs 3 for TS SDK — much larger community
- Cross-language e2e tests (Python + Go)

### Compute SDK (`0g-compute-ts-sdk`)
- **Verdict: Actively maintained, maturing quickly**
- Latest release v0.9.0-beta.0 (Jun 10, 2026)
- Package renamed from `@0glabs/0g-serving-broker` → `@0gfoundation/0g-compute-ts-sdk` (v0.8.0)
- Frequent releases: v0.7.5 (Apr 14) → v0.8.4 (Jun 10) — ~9 releases in 2 months
- Top maintainer Ravenyjh at 397 commits indicates dedicated ownership

### DA Client (`0g-da-client`)
- **Verdict: Maintained but slower pace**
- Last release v1.0.1-testnet (Aug 2024), but last commit May 2026
- 11 open issues — needs attention
- Changes appear to be minor/maintenance

---

## 5. Feasibility Analysis

### Q1: Is the Go SDK more feature-complete than JS?

**Yes, significantly.** The Go SDK has:

- **More storage features:** Batch upload, directory upload, extend storage period, ECIES encryption, fragment splitting, S3 gateway, REST API gateway
- **More mature CLI:** Full `0g-storage-client` CLI with upload/download/kv/extend commands
- **Better observability:** OnSubmitted callbacks, comprehensive error handling
- **More contracts support:** Full Flow + Market contract bindings with gas adjustment, nonce management, retry logic
- **More releases:** Published formal releases with detailed changelogs since v0.6.4 (Mar 2025)

The TS SDK has parity on core operations (upload/download, merkle tree, KV) but lacks advanced features like extend storage, batch operations, and ECIES encryption.

### Q2: Does the Go SDK support Storage, Compute, DA, and Chain — same as JS?

**No — the Go SDK only covers Storage and Chain.** There is no Go SDK for:

- **Compute:** `0g-compute-ts-sdk` has no Go equivalent. AI compute inference, fine-tuning, and broker operations only exist in TypeScript.
- **DA:** `0g-da-client` is a standalone Go client for DA operations, but it is *not* packaged as a reusable SDK — it's a Docker-deployed service.

Coverage summary:

| Domain | JS/TS SDK | Go SDK |
|---|---|---|
| Storage | ✅ `0g-storage-ts-sdk` | ✅ `0g-storage-client` |
| Compute | ✅ `0g-compute-ts-sdk` | ❌ **No Go SDK** |
| DA | ❌ **No JS SDK** | ✅ `0g-da-client` (service, not library) |
| Chain | ✅ (via contract types) | ✅ (via contract bindings) |

### Q3: Would porting Axiom's backend to Go (or using Go SDK via sidecar) add value?

**Partial value — depends on the use case.**

**Arguments for adding Go:**

1. **More feature-complete storage client:** The Go SDK has extend-storage, batch operations, ECIES encryption, and S3 gateway — all features the TS SDK lacks.
2. **Better performance:** Go would be faster for large file operations (merkle tree computation, encryption at scale).
3. **DA integration:** If Axiom needs DA interaction, the Go `0g-da-client` is the only option.
4. **Lower open issues count:** Go SDK has 3 open issues vs TS storage SDK's 6.

**Arguments against switching to Go:**

1. **No Compute SDK in Go:** If Axiom uses 0G Compute (inference/fine-tuning), the TS SDK is the *only* option — there is no Go equivalent.
2. **Sidecar complexity:** Running a Go sidecar for storage operations adds deployment complexity (separate binary, IPC/RPC bridge, health monitoring).
3. **JS ecosystem alignment:** If the rest of Axiom is JS/TS, a Go sidecar is an additional language and runtime to maintain.
4. **SDK gap is narrowing:** The TS SDK just added hot storage upload (Jun 2026), closing one gap. Extend-storage and batch ops may follow.

### Q4: Is there a risk the JS SDK becomes unmaintained?

**Low risk in the short term, moderate risk long term.**

- The same core maintainer (0g-peterzhb) works on **both** the JS and Go SDKs. This means knowledge transfers, but also means attention is split.
- The JS SDK has fewer features, fewer commits, and no formal releases — suggesting it is treated as a secondary/lightweight client.
- However, the compute SDK (`0g-compute-ts-sdk`) is **thriving** with frequent releases and a dedicated maintainer (Ravenyjh).
- Market signal: 0G's official documentation ([docs.0g.ai](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)) lists both SDKs, so neither is being phased out.
- **Risk scenario:** If the 0G team consolidates on Go for production infrastructure, the JS SDK could see reduced investment. Signs: Go SDK gets more releases, richer features, and the `0g-storage-client` is the one with embedded tests in both Go and Python.

### Q5: What does the 0G DA Client use?

**Confirmed: The 0G DA client (`0g-da-client`) is written in Go.**

- Repository: https://github.com/0gfoundation/0g-da-client
- Language breakdown: Go (405,105 bytes), Python (50,565), Dockerfile (4,569), Makefile (4,344), Shell (2,149)
- The Docker image is `0glabs/0g-da-client`
- This is a Go service, not a reusable Go library
- Last commit: May 29, 2026 (fix quorum-bitmap allocation)
- Two releases: v1.0.0-testnet (Apr 2024), v1.0.1-testnet (Aug 2024)

---

## 6. 0G Labs GitHub Organization — All SDK-Related Repos

Full inventory of SDK-relevant repositories in `0gfoundation`:

| Repo | URL | Language | Purpose |
|---|---|---|---|
| `0g-storage-ts-sdk` | github.com/0gfoundation/0g-storage-ts-sdk | TypeScript | Storage TS SDK |
| `0g-compute-ts-sdk` | github.com/0gfoundation/0g-compute-ts-sdk | TypeScript | Compute TS SDK |
| `0g-storage-client` | github.com/0gfoundation/0g-storage-client | Go | Storage Go Client |
| `0g-da-client` | github.com/0gfoundation/0g-da-client | Go | DA Client |
| `0g-sandbox` | github.com/0gfoundation/0g-sandbox | Go | Billing proxy |
| `0g-storage-contracts` | github.com/0gfoundation/0g-storage-contracts | TypeScript | Smart Contracts |
| `0g-storage-node` | github.com/0gfoundation/0g-storage-node | Rust | Storage Node |
| `0g-storage-scan` | github.com/0gfoundation/0g-storage-scan | — | Storage Scanner |
| `0gchain-NG` | github.com/0gfoundation/0gchain-NG | — | Chain (next-gen) |
| `0gchain-Aristotle` | github.com/0gfoundation/0gchain-Aristotle | — | Chain (Aristotle) |
| `0g-memory` | github.com/0gfoundation/0g-memory | Python | Memory system |
| `0g-sdk-fontend` | github.com/0gfoundation/0g-sdk-fontend | — | Frontend SDK |

No `0g.js` repository exists. The TS SDK is packaged as `@0gfoundation/0g-storage-ts-sdk` on npm.

---

## 7. Recommendation

### Recommendation: **Keep JS/TS as primary SDK; consider Go sidecar for storage-intensive operations only if needed**

**Rationale:**

1. **Compute requires TS:** The 0G Compute SDK only exists in TypeScript. If Axiom uses inference or fine-tuning, you must use the TS SDK — there is no Go alternative.

2. **Storage SDK gap is manageable:** The TS storage SDK covers core operations (upload, download, KV, merkle tree). Missing features (extend storage, batch upload, ECIES) are additive enhancements, not blockers. The TS SDK just got hot storage (Jun 2026), showing active development.

3. **Sidecar only if throughput demands it:** A Go sidecar for the `0g-storage-client` would give you:
   - Better upload/download throughput for large files
   - Extend storage and batch operations
   - CLI tooling flexibility
   - But adds deployment complexity (Docker, orchestration, IPC)

4. **Risk of TS SDK neglect is moderate but not alarming:** The compute SDK is actively growing. The storage SDK is less active but still receiving feature commits. Diversifying to Go hedges against this risk but at a cost.

### Decision Matrix

| Strategy | Pros | Cons | Best For |
|---|---|---|---|
| **Keep JS only** | Simplicity, single runtime | Misses Go features, slower | Compute-heavy workloads |
| **JS + Go Sidecar** | Best of both worlds, performance | Deployment complexity, 2 runtimes | Storage-heavy workloads with high throughput |
| **Full Go migration** | Full feature set, performance | No Compute SDK, rewrite cost | New projects not needing Compute |

### Recommended Path for Axiom

1. **Phase 1 (now):** Continue with the TypeScript SDK for both Storage and Compute. The TS SDK is actively maintained and covers core needs.
2. **Phase 2 (if needed):** If storage throughput becomes a bottleneck or you need extend-storage/batch operations, introduce a Go sidecar using `0g-storage-client` for storage operations while keeping TS for Compute.
3. **Monitor:** Watch `0g-storage-ts-sdk` for release cadence. If it goes 6+ months without meaningful updates, consider the Go sidecar approach.
4. **Never full Go migration** unless 0G releases a Go Compute SDK, which currently does not exist.

---

## 8. Appendix: Key GitHub API Data Points

```json
// 0g-storage-ts-sdk (JS/TS)
{
  "created": "2024-02-28", "stars": 8, "forks": 14,
  "open_issues": 6, "last_push": "2026-06-03T00:25:44Z",
  "last_commit": "2026-06-02 (Indexer.uploadToHot)",
  "npm_downloads_weekly": 868
}

// 0g-storage-client (Go)
{
  "created": "2024-01-04", "stars": 55, "forks": 67,
  "open_issues": 3, "last_push": "2026-06-13T11:53:47Z",
  "last_commit": "2026-06-13 (OnSubmitted callback)",
  "latest_release": "v1.4.3-testnet (2026-06-10)"
}

// 0g-compute-ts-sdk (JS/TS)
{
  "created": "2024-10-17", "stars": 12, "forks": 13,
  "open_issues": 12, "last_push": "2026-06-10T12:46:28Z",
  "latest_release": "v0.9.0-beta.0 (2026-06-10)",
  "npm_downloads_weekly": 879
}

// 0g-da-client (Go)
{
  "created": "2024-01-08", "stars": 37, "forks": 31,
  "open_issues": 11, "last_push": "2026-05-29T06:22:15Z",
  "languages": {"Go": 405105, "Python": 50565, "Dockerfile": 4569}
}
```

---

*Report generated by SDK Feasibility Research task. Data sourced from GitHub API, NPM API, and repository documentation.*
