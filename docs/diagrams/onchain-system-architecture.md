# Axiom Protocol — On-chain System Diagram

> **Live state on 0G Galileo testnet (chainId 16602) at the Wave 16 v1.0.0 tag.**

```mermaid
graph TB
    subgraph U["USER (off-chain)"]
        UW["Owner / Buyer wallet<br/>0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91<br/>(operator)"]
    end

    subgraph N["0G Galileo testnet — chainId 16602 (block ~38,919,827)"]
        direction TB
        AGENTNFT["AxiomAgentNFT (proxy)<br/>0xf12F158a20c36a351b056FD60b3a7377ce4F1e09<br/>EIP-1967 transparent proxy<br/>EIP-721 + EIP-7857"]
        IMPL["AxiomAgentNFT (impl)<br/>0xc1fF0C179B947b4CE3a6a2b784025b1DBBd37386<br/>UUPSUpgradeable + AccessControl<br/>+ ReentrancyGuard + Pausable<br/>+ 3 ERC-7857 extensions<br/>+ iNFT data + validUntil"]
        VERIFIER["AxiomTeeVerifier v2<br/>0x24f725198d64A3b03A8386cD8fa12BD7c591734A<br/>ECDSA oracle<br/>7-day validUntil window<br/>registeredSigner = operator"]
        VAULT["AxiomStrategyVault<br/>0xb7F89e50D5A3039Da7d39528436B820371572874<br/>per-tokenId deposit<br/>+ merkleRoot strategy<br/>+ dailyLimit enforcement"]
        PAY["AxiomPaymentProcessor<br/>0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f<br/>ERC-20 payForAgent<br/>+ withdrawAgentEarnings<br/>+ payComputeProvider"]
        USDC["AxiomMockUSDC (test-only)<br/>0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf<br/>mintable 18-dec ERC-20"]
        USDC -.->|paymentToken| PAY

        AGENTNFT -.->|uups impl| IMPL
        IMPL -.->|verifier()| VERIFIER
    end

    subgraph OFF["OFF-CHAIN services (apps/*)"]
        direction TB
        BACKEND["apps/backend (orchestrator)<br/>HTTP/WS server on :3000<br/>StrategyRunner (chainId explicit)"]
        ORACLE["apps/oracle (TEE signer)<br/>HTTP on :8787<br/>POST /v1/ownership<br/>signs EIP-191 OwnershipProof<br/>+ per-provider secret cache"]
        INDEXER["apps/indexer<br/>event watcher + 0G DA submitter"]
        BENCH["apps/bench<br/>9/9 E2E live CLI<br/>+ 4 Wave 12 bench scripts"]
        FRONT["apps/frontend<br/>Vite + React 18<br/>RainbowKit v2<br/>6 routes"]
    end

    subgraph OG["0G Infrastructure"]
        STORAGE[("0G Storage<br/>indexer-storage-testnet-turbo.0g.ai<br/>5GB max, 10MB auto-chunk")]
        COMPUTE["0G Compute<br/>provider 0xa48f...<br/>qwen2.5-omni-7b<br/>+ 3 other providers"]
        DA["0G DA<br/>DAEntrance + DASigners<br/>(BUGS-WAVE10A-1: no-code on Galileo)"]
    end

    %% USER → CHAIN
    UW -- "mint / iTransferFrom /<br/>deposit / strategy" --> AGENTNFT
    UW -- "approve(axmUSDC,<br/>payForAgent)" --> PAY
    UW -- "chat request" --> FRONT

    %% CONTRACT internal relationships
    IMPL -- "iTransferFrom<br/>(validUntil-signed proof)" --> VERIFIER
    IMPL -- "deposit(0)" --> VAULT
    PAY -- "payForAgent +<br/>payComputeProvider" --> USDC

    %% OFF-CHAIN → CHAIN
    BACKEND -- "ethers v6<br/>cast/wait" --> AGENTNFT
    BACKEND -- "ethers v6<br/>cast/wait" --> VAULT
    BACKEND -- "ethers v6<br/>cast/wait" --> PAY
    BACKEND -- "ethers v6<br/>cast/wait" --> VERIFIER
    ORACLE -- "EIP-191 sign<br/>(app-sk-… Bearer)" --> AGENTNFT
    BACKEND -- "POST /v1/ownership" --> ORACLE
    INDEXER -- "watch Transfer/<br/>DataUpdated" --> AGENTNFT
    INDEXER -- "watch Deposited/<br/>StrategySet" --> VAULT
    INDEXER -- "watch PayForAgent" --> PAY
    BENCH -- "9-step E2E" --> BACKEND
    BENCH -- "cast send<br/>(legacy 3 gwei)" --> AGENTNFT
    FRONT -- "wagmi<br/>useReadContracts" --> AGENTNFT
    FRONT -- "wagmi<br/>useWriteContract" --> AGENTNFT
    FRONT -- "POST /v1/*" --> BACKEND

    %% OFF-CHAIN → 0G INFRASTRUCTURE
    BACKEND -- "ZeroGStorage.upload<br/>(AES-256-GCM + ECIES)" --> STORAGE
    BACKEND -- "ZeroGCompute<br/>.getRequestHeaders" --> COMPUTE
    INDEXER -- "canonicalize +<br/>submit" --> DA

    %% INFRASTRUCTURE → OFF-CHAIN (feedback)
    STORAGE -- "downloadToBlob<br/>(byte-exact)" --> BACKEND
    COMPUTE -- "chatID + completion" --> BACKEND
    DA -- "seq + indexer" --> INDEXER

    classDef contract fill:#1e3a5f,stroke:#5fa8d3,color:#fff
    classDef offchain fill:#3a1e5f,stroke:#a87bff,color:#fff
    classDef og fill:#1e5f3a,stroke:#5fd38b,color:#fff
    classDef user fill:#5f3a1e,stroke:#d3a45f,color:#fff

    class AGENTNFT,IMPL,VERIFIER,VAULT,PAY,USDC contract
    class BACKEND,ORACLE,INDEXER,BENCH,FRONT offchain
    class STORAGE,COMPUTE,DA og
    class UW user
```

## Sequence diagram — the canonical 9-step E2E (Step 1 → Step 9)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend (wagmi)
    participant B as Backend (orchestrator)
    participant O as Oracle (TEE signer)
    participant S as 0G Storage
    participant C as 0G Compute
    participant NFT as AxiomAgentNFT (proxy → impl)
    participant V as AxiomTeeVerifier v2
    participant VA as AxiomStrategyVault
    participant P as AxiomPaymentProcessor

    U->>F: 1. GET /health (chainHead check)
    F->>B: 1. GET /health
    B-->>F: 200 { ok, chainHead }

    U->>F: 2. Build StrategySpec (targetToken, threshold, action)
    Note over F: 2. Client-side JSON only

    U->>F: 3. AES-256-GCM encrypt(StrategySpec) +<br/>ECIES.seal(dataKey, deployer.pub)
    Note over F: 3. Symmetric + asymmetric crypto;<br/>no mocks; Node crypto + eciesjs

    U->>S: 4. upload(blob + key) [via backend]
    S-->>U: { rootHash: 0xcd77…543f, tx: 0x…e7ba2 }

    U->>B: 5. POST /v1/agents/mint
    B-->>U: 200 { ok, dataHash, txHash }

    U->>B: 6. POST /v1/vaults/0/deposit (0.1 OG)
    B->>VA: 6. deposit(tokenId) { value: 0.1 OG }
    VA-->>B: deposit event

    U->>B: 7. POST /v1/vaults/0/strategy (merkleRoot, dailyLimit)
    B->>VA: 7. setStrategy(tokenId, merkleRoot, dailyLimit)
    VA-->>B: strategy set

    U->>B: 8. POST /v1/orchestrator/tick
    par fan-out
        B->>S: 8a. downloadToBlob(rootHash) → bytes
        B->>C: 8b. chat(messages, model) [processResponse after every call]
        B->>VA: 8c. read onchain vault state
    end
    B-->>U: 8. { recommendation, rawModelOutput, onchain, storage, durationMs }

    U->>B: 9. POST /v1/agents/0/transfer<br/>(to, receiverPubKey64, dataHash)
    B->>O: 9a. POST /v1/ownership<br/>(dataHash, sealedKey, targetPubkey, nonce, validUntil)
    O->>O: 9b. sign(EIP-191(msg)) using the registered signer key
    O-->>B: 9c. { signature, signer: 0x4373…F91 }
    B->>NFT: 9d. iTransferFrom(from, to, tokenId, ownershipProof, accessProof)
    NFT->>V: 9e. verifyTransferValidity({OwnershipProof, AccessProof})<br/>(checks EIP-712 validUntil within 7d window)
    V-->>NFT: 9f. valid
    NFT-->>U: 9. Transfer event (tokenId, from, to)
```

## Architecture (the 6-package monorepo)

```
~/og/
├── apps/
│   ├── contracts/    Foundry + Hardhat
│   │   ├── src/      AxiomAgentNFT.sol + 3 ERC-7857 extensions
│   │   │            AxiomTeeVerifier.sol + BaseVerifier.sol
│   │   │            AxiomStrategyVault.sol
│   │   │            AxiomPaymentProcessor.sol
│   │   │            Utils.sol (pubKeyToAddress)
│   │   ├── test/     4 contracts + Fuzz + SealedKeyInvariant + V12C3ValidUntil
│   │   └── script/   Deploy.s.sol (Galileo) + DeployAristotle.s.sol
│   │
│   ├── oracle/       TEE signer (apps/oracle/, port 8787)
│   │   ├── signer.ts (EIP-191 ECDSA, 6/6 tests pass)
│   │   ├── server.ts (/v1/ownership, /v1/transfer-validity, /v1/agents/mint)
│   │   ├── storage.ts (in-memory seen-set per Wave 6 A)
│   │   ├── env.ts, crypto/ (aes-gcm, secp256k1-helpers, ecies)
│   │   └── signer.test.ts, server-datahash-binding.test.ts
│   │
│   ├── backend/      Orchestrator (HTTP/WS, port 3000)
│   │   ├── index.ts (entry)
│   │   ├── server.ts (9 routes + 60s hard cap)
│   │   ├── orchestrator/index.ts (StrategyRunner; chainId explicit)
│   │   ├── compute/0g-broker.ts (chat, stream, image, audio)
│   │   ├── storage/0g.ts (KV, range, encrypt, merkle, upload, chain-id)
│   │   ├── events/store.ts
│   │   ├── oracle/client.ts, json/bigint.ts, i-nft/verify-data-hash.ts
│   │   └── cli/run-e2e.ts (9-step CLI)
│   │
│   ├── frontend/     Vite + React 18 + wagmi v2 + RainbowKit v2
│   │   ├── 6 routes: /, /vaults/:id, /agents, /agents/:id, /market, /history, /settings
│   │   └── 4 hooks: useAgents, useAgentMetadata, useOrchestratorTick, useTransfer
│   │
│   ├── indexer/      Event watcher + 0G DA submitter
│   │   └── watcher.ts, events.ts, da.ts, serialization.ts, sink.ts
│   │
│   └── bench/        k6 + micro + macro + live
│       ├── scripts/  3 Wave 2 compute tests + 4 Wave 12 bench scripts
│       ├── live-e2e/  full-flow.sh (9-step), aristotle-precheck.sh, etc.
│       ├── discovery/  Wave 1 D1 + D2 + D3, Wave 2 A/B/C, Wave 4 A/B/C
│       ├── macro-bench/, micro-bench/, storage/, compute-context-limits.ts
│       └── demo-video/  Remotion + ElevenLabs + Playwright (Wave 14)
│
├── packages/         (empty; monorepo reserves for future)
├── docs/             14+ discovery reports + runbook.md + demo-script.md
│                     + submit-akindo.md + release-notes-v1.0.0.md
│                     + deploy/ (galileo + aristotle) + security/ (STRIDE)
├── .claude/          21 SKILL.md + 6 patterns + AGENTS.md + CLAUDE-SNIPPET
├── wallets/          5 testnet keys (gitignored) at ~/og/wallets/ADDRESSES.md
├── local://          plan files
└── .env              shared env (gitignored; has OG_COMPUTE_API_KEY + ELEVENLABS_API_KEY)
```

## Contract inheritance (AxiomAgentNFT impl)

```
AxiomAgentNFT (impl) is
├─ AccessControlUpgradeable (RBAC; OPERATOR_ROLE, DEFAULT_ADMIN_ROLE)
├─ ReentrancyGuardUpgradeable
├─ PausableUpgradeable
├─ UUPSUpgradeable (proxy impl swap)
├─ ERC7857CloneableUpgradeable
├─ ERC7857AuthorizeUpgradeable
└─ ERC7857IDataStorageUpgradeable

  4 public functions (externally callable):
  - mint(to, dataHash, sealedKey)            — onlyOwner
  - iTransferFrom(from, to, tokenId,         — onERC721Received + verifier proof
                       TransferValidityProof)
  - authorizeUsage(tokenId, user, expiresAt) — onlyOwner or delegated
  - setSealedKey(tokenId, newSealedKey)      — onlyOwner (re-seal after transfer)

  2 verifier methods (delegated to AxiomTeeVerifier v2):
  - verifyTransferValidity(proof[]) returns (bool, expired, tooFar)
  - getSealedKey(tokenId) returns (bytes32)
```

## Storage layout (the dataHash + sealedKey invariant)

```
┌────────────────────────────────────────────────────────────┐
│  Agent 0 (tokenId = 0)                                       │
├────────────────────────────────────────────────────────────┤
│  on-chain:                                                  │
│    dataHash   = 0xcd77ec0d9a2cf5fe5b4d1d3e57ed3e50d…     │
│    sealedKey  = 0xe1c2…f09b (ECIES-sealed for owner)      │
│    owner      = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91│
│    verifier   = 0x24f725198d64A3b03A8386cD8fa12BD7c591734A│
│    validUntil = 1735…  (EIP-712 typed-data signed field)  │
│  0G Storage (the encrypted strategy blob):                  │
│    rootHash    = 0xcd77ec0d9a2cf5fe5b4d1d3e57ed3e50d…      │
│    size        = 1024 bytes                                 │
│    numChunks   = 1 (< 10 MB auto-chunk threshold)            │
│  re-seal invariant:                                          │
│    transfer 0 → 1: old owner reveals sealedKey to new owner │
│    new owner must call setSealedKey(newKey) within 7 days   │
│    else future /v1/ownership requests for this tokenId are │
│    rejected by the oracle (BUGS-WAVE6B-01)                   │
└────────────────────────────────────────────────────────────┘
```

## 0G docs reference (the canonical 3 sources for Wave 0)

- **https://docs.0g.ai/ai-context** — precompile + provider + flow table
- **https://github.com/0gfoundation/0g-compute-skills** — `@0glabs/0g-serving-broker` + inference + streaming + image + audio SKILL.md
- **https://github.com/0gfoundation/0g-agent-skills** — 21 SKILL.md (adopted into `.claude/skills/`)

---

**Live state summary at v1.0.0:**
- 4 contracts deployed + verified on 0G Galileo (chainId 16602)
- 9/9 E2E live (chainHead 38,919,827)
- 35+ git commits on master
- ~13,000-line BUGS.md with on-chain proof for every finding
- 21 SKILL.md + 6 patterns under .claude/ (Wave 11 C + Wave 12 F)
- MP4 rendered: `apps/bench/demo-video/out/axiom-demo-3min.mp4` (10.6 MB, h264 1920x1080 30fps aac 180.032s)
- v1.0.0 tag (local; `git push` is the user's job)
