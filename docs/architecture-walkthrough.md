# Architecture walkthrough

Deep-dive companion to the [README architecture section](../README.md#architecture).
The component diagram lives in the README. This file carries the request lifecycle,
the user-journey traces, the payment split, and the re-key trust flow.

## Component view

```mermaid
flowchart LR
    subgraph User["User"]
        W["Wallet"]
    end
    subgraph FE["Frontend (React 19, wagmi v3)"]
        UI["Console pages"]
        WS["WS subscriber, 3s floor"]
    end
    subgraph BE["Backend, one Bun process"]
        ORCH["Orchestrator"]
        ORACLE["Oracle, simulated TEE"]
        IDX["Indexer, 3s poll"]
        CHAT["Chat runtime"]
        CUST["DEK custody, env-gated"]
    end
    subgraph OG["0G stack"]
        CHAIN["0G Aristotle mainnet 16661 (V3) + Galileo 16602 dev lane"]
        COMPUTE["0G Compute"]
        STORAGE["0G Storage Turbo"]
    end
    W -->|"EIP-6963, one click"| UI
    UI -->|"REST + encode relay"| BE
    UI <--> WS
    WS --> BE
    ORCH --> CHAT
    CHAT --> COMPUTE
    ORACLE --> STORAGE
    CUST --> STORAGE
    ORCH --> CHAIN
    IDX -->|"3s getLogs"| CHAIN
    ORACLE -->|"EIP-712 proofs"| CHAIN
```

## Request lifecycle

One backend process hosts the oracle, indexer, orchestrator, and chat runtime. No
cross-service hops. The frontend never touches the chain except through wagmi for user
signatures; data flows through the backend, which fans out to the three 0G services.

1. Frontend actions hit the backend as REST (encode-relay pattern: the FE shows, the
   backend encodes, the user signs through wagmi).
2. The orchestrator drives strategy ticks through the chat runtime, which calls 0G
   Compute (router path, OpenAI-compatible).
3. The oracle signs EIP-712 ownership/access proofs for transfers; its storage leg
   downloads and re-keys blobs on 0G Storage Turbo.
4. The indexer polls `getLogs` on a 3-second floor and feeds the WS event stream.
5. The DEK custody store (env-gated) holds sealed DEKs between mint and first transfer.

## Agent lifecycle (sequence, mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend
    participant BE as Backend
    participant C as 0G Chain
    participant M as 0G Compute
    participant S as 0G Storage

    rect rgb(232, 244, 255)
    Note over U,S: Phase 1 · Mint (about 5s)
    U->>FE: pick agent name
    FE->>+BE: POST /v1/agents/mint/encode
    BE->>BE: derive dataHash (keccak256)
    BE-->>-FE: calldata + value
    U->>C: sign + broadcast (wagmi one-click)
    C-->>U: iNFT minted, CreatorSet
    end

    rect rgb(232, 255, 236)
    Note over U,S: Phase 2 · Fund (one merged tx)
    U->>C: depositAndSetStrategy(root, dailyLimit)
    C-->>U: Deposited + StrategySet
    end

    rect rgb(255, 248, 224)
    Note over U,S: Phase 3 · Run (AI tick, vault-enforced)
    FE->>+BE: POST /v1/chat/completions (SSE)
    BE->>+M: router call, trust-mode floor
    M-->>-BE: streamed recommendation + trace
    BE-->>-FE: SSE frames
    FE->>C: vault.execute(proof), strategyGuard pre-check
    alt within daily limit
        C-->>U: Executed
    else over limit
        C-->>U: DailyLimitExceeded
    end
    end

    rect rgb(255, 236, 236)
    Note over U,S: Phase 4 · Transfer (about 25s, secrets re-key)
    U->>+S: upload new blob, receiver-keyed DEK
    S-->>-U: rootHash stored
    U->>BE: ownership proof (EIP-712)
    BE->>C: iTransferFrom + cleanExpiredProofs
    C-->>U: ownership migrated, old proofs swept
    end
```

### Text version (renders anywhere)

```text
 User (Frontend)   Backend           TEE Oracle*            0G Chain                 0G Compute 0G Storage
|                    |                   |                     |                         |               |
==================================== STAGE 1: MINT (about 5 seconds) =====================================
| 1. pick name       |
|------------------->|
|                    | POST /mint/encode |
|                    | {name, owner}     |
| 2. derive dataHash |
|<-------------------|
|                    | keccak256(name)   |
| 3. calldata+value  |
|<-------------------|
| 4. sign + broadcast (wagmi)                                  |
|------------------------------------------------------------->|
| 5. iNFT minted, CreatorSet                                   |
|<-------------------------------------------------------------|
|                    |                   |                     |                         |               |
===================================== STAGE 2: FUND (one merged tx) ======================================
| 6. depositAndSetStrategy(root, limit)                        |
|------------------------------------------------------------->|
| 7. Deposited + StrategySet                                   |
|<-------------------------------------------------------------|
|                    |                   |                     |                         |               |
================================= STAGE 3: RUN (AI tick, vault-enforced) =================================
| 8. chat req (SSE)  |
|------------------->|
|                    | POST /v1/chat     |
|                    | (SSE stream)      |
|                    | 9. router call, trust-mode floor                                  |
|                    |------------------------------------------------------------------>|
|                    | 10. streamed recommendation                                       |
|                    |<------------------------------------------------------------------|
|                    | trace frame:      |
|                    | trust mode + usage 
| 11. SSE frames     |
|<-------------------|
| 12. vault.execute(proof)                                     |
|------------------------------------------------------------->|
|                    |                   |                     | strategyGuard pre-check;|
|                    |                   |                     | over limit:             |
|                    |                   |                     | DailyLimitExceeded      |
| 13. Executed                                                 |
|<-------------------------------------------------------------|
|                    |                   |                     |                         |               |
=========================== STAGE 4: TRANSFER (about 25 seconds, re-key dance) ===========================
| 14. start transfer |
|------------------->|
|                    | 15. rekey request |
|                    |------------------>|
|                    |                   | (in-process call)   |
|                    |                   | 16. download encrypted blob (merkle proof)                    |
|                    |                   |-------------------------------------------------------------->|
|                    |                   | decrypt + re-encrypt|
|                    |                   | (AES-256-GCM)       |
|                    |                   | receiver-keyed DEK  |
|                    |                   | 17. upload new blob (new rootHash)                            |
|                    |                   |-------------------------------------------------------------->|
|                    |                   | sign OwnershipProof |
|                    |                   | (EIP-712, domain)   |
| 18. proofs issued  |
|<-------------------|
| sign AccessProof   |
| (EIP-712)          |
| 19. submit proofs  |
|------------------->|
|                    | 20. iTransferFrom + cleanExpiredProofs  |
|                    |---------------------------------------->|
|                    |                   |                     | verify: nonce burn,     |
|                    |                   |                     | validUntil, allowlist   |
| 21. ownership migrated, proofs swept                         |
|<-------------------------------------------------------------|
| 22. success (WS)   |
|<-------------------|
|                    | WS event: success |
|                    | (3s poll floor)   |
|                    |                   |                     |                         |               |
v                    v                   v                     v                         v               v
```

## User journey

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend
    participant BE as Backend
    participant C as 0G Chain
    participant S as 0G Storage
    participant M as 0G Compute
    Note over U,M: Mint, about 5 seconds
    U->>FE: Pick a name
    FE->>BE: POST mint/encode {name, owner}
    BE->>BE: derive dataHash = keccak256(name)
    BE-->>FE: calldata + value
    U->>C: one click, sign and broadcast
    C-->>U: iNFT #N, CreatorSet
    Note over U,M: Fund, one merged transaction
    U->>C: depositAndSetStrategy(N, root, dailyLimit)
    C-->>U: Deposited + StrategySet
    Note over U,M: Run, AI decides, vault enforces
    FE->>M: strategy context, SSE
    M-->>FE: recommendation, streamed
    FE->>C: vault.execute(proof), strategyGuard pre-check
    C-->>U: Executed, or DailyLimitExceeded
    Note over U,M: Transfer, ownership moves, secrets re-key, about 25 seconds
    U->>S: new blob, receiver-keyed DEK
    U->>BE: ownership proof, EIP-712
    BE->>C: iTransferFrom + cleanExpiredProofs
    C-->>U: ownership migrated, old proofs swept
```

## Payment split (one canonical path)

```mermaid
flowchart LR
    P["Payer"] -->|"payForAgentAndCompute"| PP["PaymentProcessor"]
    PP --> SPLIT{"_paySplit()"}
    SPLIT -->|"creatorCut"| CR["Creator earnings"]
    SPLIT -->|"protocolCut, 100bps"| TR["Treasury, 1-day timelock"]
    SPLIT -->|"computeAmount"| CP["Compute provider"]
    PP -.->|"over cap"| X["PayAmountExceedsCap"]
```

## Trust: the re-key dance

```mermaid
flowchart TB
    subgraph AtMint["At mint"]
        DEK["DEK, never on chain"] --> ENC["AES-encrypt metadata"]
        ENC --> BLOB["0G blob, rootHash = content address"]
        DEK -->|"ECIES seal to verifier pubkey"| SEALED["sealedKey"]
    end
    subgraph OnTransfer["On transfer"]
        OLD["old DEK"] --> OR["Oracle downloads, decrypts"]
        OR -->|"re-encrypt, NEW DEK sealed to receiver"| NEWB["new blob"]
        OR -->|"EIP-712 proof"| V["TeeVerifier allowlist"]
        V -->|"fresh, unused, allowlisted"| NFT["iTransferFrom"]
    end
```

The chain sees hashes and sealed keys only. The verifier signer allowlist means a leaked
TEE key is revoked in one transaction. The storage canary (AXIOM1 magic prefix, made
stateless via the SDK encryption header) makes silent wrong-key ciphertext downloads
impossible; AES-CTR has no built-in auth.
