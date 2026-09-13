# Axiom Protocol — Mermaid Diagram Pack

Companion to `axiom-onepager.html` for the 0G Bridge Buildathon (AKINDO, 3rd Wave).
All diagrams reflect the live V2 deployment: docs/deployments/galileo-v2-2026-08-28.json (chain 16602).

---

## 1. System architecture — what runs where

```mermaid
flowchart LR
    subgraph User["👤 User"]
        W["Wallet\n(Rabby / MetaMask / WC)"]
    end

    subgraph FE["Frontend — React 19 + wagmi v3\napps/frontend"]
        UI["Console pages\n/app · /mint · /payment\n/transfer · /tick · /chat"]
        WS["WS subscriber\n(3s event floor)"]
    end

    subgraph BE["Backend — Bun + Express\n(one process, in-process services)"]
        ORCH["Orchestrator\nstrategy ticks"]
        ORACLE["Oracle (simulated TEE)\nEIP-712 sign · re-key"]
        IDX["Indexer\n3s poll · V2 events"]
        CHAT["Chat runtime\n0G Compute (qwen2.5-omni)"]
        CUST["DEK Custody\n(env-gated)"]
        KEEPER["Keeper\n(cleanExpiredProofs)"]
    end

    subgraph OG["0G modular stack"]
        CHAIN["0G Chain (16602)\n4 V2 proxies"]
        COMPUTE["0G Compute\nrouter + price caps"]
        STORAGE["0G Storage (Turbo)\nencrypted blobs"]
    end

    W -->|"EIP-6963 / 1-click"| UI
    UI -->|"REST + encode-relay"| BE
    UI <-->|"token stream / events"| WS
    WS --> BE
    ORCH -->|"0G Compute SSE"| CHAT
    CHAT --> COMPUTE
    ORACLE -->|"re-key blobs"| STORAGE
    CUST --> STORAGE
    ORCH -->|"execute() + guards"| CHAIN
    IDX -->|"3s getLogs"| CHAIN
    KEEPER -->|"cleanExpiredProofs"| CHAIN
    ORACLE -->|"EIP-712 proofs"| CHAIN
```

**Logic (1 paragraph):** One backend process hosts four traditionally-separate services
(oracle, indexer, orchestrator, chat) — cutting cross-service latency to zero and keeping
the TEE signer off the network. The frontend never talks to the chain directly except
through wagmi for user signatures; everything data-heavy flows through the backend, which
fans out to the three 0G services. The indexer's 3-second poll is the freshness floor for
every UI surface; the WS layer pushes instead of polls wherever a subscriber exists.

---

## 2. The core loop — own → fund → run → pay → transfer

```mermaid
sequenceDiagram
    autonumber
    actor U as User (wallet)
    participant FE as Frontend
    participant BE as Backend
    participant C as 0G Chain (V2)
    participant S as 0G Storage
    participant M as 0G Compute

    Note over U,M: ① MINT — strategy becomes an ownable iNFT (~5s)
    U->>FE: Pick a name
    FE->>BE: POST /v1/agents/mint/encode {name, owner}
    BE->>C: encode mint(name, keccak(name), fee)
    BE-->>FE: calldata + value
    U->>C: 1 click — sign & broadcast
    C-->>FE: iNFT #N minted (dataHash sealed in metadata)

    Note over U,M: ② FUND — vault with daily strategy guard
    U->>C: depositAndSetStrategy(N, root, limit)
    C-->>BE: Deposited + StrategySet (indexer, ≤3s)

    Note over U,M: ③ RUN — tick: AI decides, vault enforces
    FE->>M: strategy context (SSE stream)
    M-->>FE: recommendation (streamed tokens)
    FE->>C: vault.execute(proof) — strategyGuard pre-check
    C-->>U: Executed (or DailyLimitExceeded — proven revert)

    Note over U,M: ④ PAY — one canonical path
    U->>C: payForAgentAndCompute(N, provider, amounts)
    C-->>U: PaymentProcessed{creatorCut, protocolCut} + ComputeProviderPaid

    Note over U,M: ⑤ TRANSFER — ownership changes, secrets re-key (~25s)
    U->>S: new encrypted blob (receiver-keyed DEK)
    U->>BE: ownership proof (EIP-712, verifier-signed)
    BE->>C: iTransferFrom + transferAndCleanExpiredProofs
    C-->>U: ownership + proofs migrated, old proofs swept
```

**Logic:** Every arrow is one user-visible click; everything the user never sees (hash
derivation, DEK sealing, proof freshness) is server-side. The 25-second transfer is the
headline: with DEK custody enabled (`AXIOM_DEK_CUSTODY=true`), step ⑤ needs only the
receiver address + signature — the oracle re-keys from custody and deletes the row on
success.

---

## 3. Trust architecture — why the metadata stays secret

```mermaid
flowchart TB
    subgraph Mint
        DEK["DEK (symmetric key)\nnever leaves user/oracle"] --> ENC["AES-encrypt\nagent metadata"]
        ENC --> BLOB["0G Storage blob\n(rootHash = content address)"]
        DEK -->|"ECIES seal to\nverifier pubkey"| SEALED["sealedKey\n(rides in proof)"]
    end

    subgraph Transfer["On transfer — the re-key dance"]
        OLD["Old owner: old DEK"] -->|"oldDataUri + sealed DEK"| OR["Oracle"]
        OR -->|"download + decrypt"| PLAIN["plaintext metadata"]
        PLAIN -->|"re-encrypt with NEW DEK"| NEWBLOB["new blob"]
        OR -->|"ECIES seal NEW DEK\nto receiver pubkey"| NEWSEALED["new sealedKey"]
        OR -->|"EIP-712 OwnershipProof"| V["AxiomTeeVerifier\n(signer allowlist)"]
        V -->|"sig valid + fresh + unused"| NFT["AxiomAgentNFT\niTransferFrom"]
    end

    subgraph Custody["DEK Custody (AXIOM_DEK_CUSTODY=true)"]
        STORE["dek-custody.json\ntokenId → sealedDek"] -.->|"sender skips\nDEK entirely"| OR
    end
```

**Logic:** The chain only ever sees hashes and seals — never the DEK, never the plaintext.
The verifier's signer allowlist (V2) means a compromised TEE key is revoked in one tx
(same-block containment), and EIP-712 proofs are domain-bound to the verifier address with
a 7-day freshness window and one-shot nonces. The I1 storage canary catches wrong-key
downloads (AES-CTR has no auth — silent ciphertext is otherwise undetectable).

---

## 4. Payment split — one canonical path

```mermaid
flowchart LR
    P["Payer"] -->|"payForAgentAndCompute\n(tokenId, provider, amounts)"| PP["AxiomPaymentProcessor V2"]
    PP -->|"fee-on-transfer balance-diff"| SPLIT{"_paySplit()\nsingle internal"}
    SPLIT -->|"creatorCut"| CR["Creator\n(earnings credit,\nwithdrawAgentEarnings)"]
    SPLIT -->|"protocolCut (100bps)"| TR["Treasury\n(1-day timelock rotation)"]
    SPLIT -->|"computeAmount"| CP["Compute Provider\n(ComputeProviderPaid)"]
    PP -.->|"MAX_PAY invariant"| X["PayAmountExceedsCap\n(proven revert)"]
    PP -.->|"AccessControl"| Y["non-admin ops revert"]
```

**Logic:** V2 collapsed three divergent split implementations into one `_paySplit()` and
made the per-pay cap a chain invariant — the "consistent-by-luck" era (M8) is over. The
e2e failure matrix proves both the happy split (99M/1M + 50M compute) and every guard
reverting with its exact selector.

---

## 5. Resilience — the 0G adoption layer (Wave I1)

```mermaid
flowchart LR
    subgraph RPC["RPC resilience"]
        FE2["wagmi fallback()\nprimary → dRPC → Ankr\n(rank: true)"]
        BE2["ethers FallbackProvider\nquorum 1, env list"]
        FE2 -->|"live-proven: Ankr answered\nwhen primary+dRPC aborted"| CH2["0G Chain"]
        BE2 --> CH2
    end
    subgraph Data["Data integrity"]
        CAN["Storage canary\nAXIOM1 magic + parse check"] -->|"WrongKeyOrCorruptError\ninstead of silent ciphertext"| DOWN["download()"]
        RES["Checkpoint resync"] -->|"system.resync event\n(error level, loud)"| EVS["EventStore"]
    end
    subgraph Cost["Cost control"]
        CAP["X-0G-Provider-Max-Price-Usd\n(prompt/completion caps)"] --> ROUTER["0G Compute router"]
        TM["Trust-Mode: verified"] --> ROUTER
    end
```

---

## 6. Testing pyramid — what "done" means

```mermaid
flowchart TB
    subgraph E2E["Live e2e (Galileo V2)"]
        A["43/43 Live Path Gate\ncritical 12/12"]
        B["11/11 failure scenarios\nexact revert selectors"]
    end
    subgraph Chain["Foundry"]
        C["201 tests\nincl. fuzz suites"]
        D["Storage-layout append-only\nupgrade-safety"]
    end
    subgraph TS["TypeScript"]
        E["175 backend"]
        F["112 frontend"]
        G["64 chat-runtime"]
        H["47 config (incl. 12 chain-parity)"]
    end
    E2E --> RES["Everything user-visible\nproven against live V2"]
    Chain --> RES2["Governance/caps/allowlist\nproven at bytecode level"]
    TS --> RES3["Drift between layers\nmachine-pinned"]
```

---

## 7. Governance & safety surface (V2 hardening)

```mermaid
flowchart LR
    subgraph Timelocks["1-day timelocks (TimelockManager)"]
        V["Verifier rotation\npropose → 1d → execute"]
        T["Treasury rotation"]
        FEES["Fee withdrawal"]
        UP["NFT upgrades\n(proposeUpgrade/execute)"]
    end
    subgraph Immediate["Same-block containment"]
        REVOKE["Signer revoke\n(one tx, compromise contained)"]
        PAUSE["Pause (Pausable)\n+ Paused/Unpaused indexed"]
    end
    subgraph Caps["Invariants"]
        CAP["MAX_PAY"]
        LIMIT["DailyLimit per vault"]
        AGE["maxProofAge 7d\none-shot nonces"]
    end
```

---

## 8. Deployment record (live)

```mermaid
flowchart LR
    subgraph Galileo["0G Galileo testnet · chain 16602 · 2026-08-28"]
        V2V["AxiomTeeVerifier\n0x72a3…Fbb2"]
        V2N["AxiomAgentNFT\n0xdBB2…0097"]
        V2S["AxiomStrategyVault\n0x4607…c057"]
        V2P["AxiomPaymentProcessor\n0x7490…9e9c"]
        MOCK["AxiomMockUSDC\n0x354C…7d19"]
        V2N -->|"verifier()"| V2V
        V2S -->|"nft()"| V2N
        V2P -->|"AXIOM_NFT()"| V2N
        V2P -->|"paymentToken()"| MOCK
    end
```

All wiring asserts passed on-chain; full record: docs/deployments/galileo-v2-2026-08-28.json.
