# Axiom Protocol — Architecture & Sequence Diagrams

## High-Level Service Topology

```mermaid
graph TB
    subgraph Frontend["Frontend (Vite + React 18 + wagmi v2)"]
        UI[Pages & Components]
        Hooks[Custom Hooks<br/>useTransfer, useMint, usePayment...]
        DS[Design System<br/>ui.tsx — 17 primitives]
    end

    subgraph Backend["Backend (Express + TypeScript)"]
        R[Routers<br/>health, agents, vault,<br/>compute, payment, events]
        S[Services<br/>AgentService, VaultService,<br/>PaymentService...]
        DI[DI Container]
        ES[In-Memory EventStore]
        WS[WebSocket Server<br/>/v1/stream]
    end

    subgraph Oracle["Oracle (TEE Signer)"]
        OR[Express Router]
        SG[Signer — EIP-712<br/>OwnershipProofs]
        CR[AES-256-GCM + ECIES<br/>Encryption/Decryption]
        S3[0G Storage Adapter]
    end

    subgraph Indexer["Indexer (TypeScript)"]
        WT[Watcher — eth_getLogs<br/>POLL_WINDOW=50 blocks]
        EV[Event Decoder<br/>viem parseAbiItem]
        DA[DA Client — gRPC DisperseBlob]
    end

    subgraph OG_Chain["0G Chain (Galileo testnet / Aristotle mainnet)"]
        NFT[AxiomAgentNFT<br/>ERC-7857 UUPS Proxy]
        VAULT[AxiomStrategyVault<br/>Per-token vault]
        VERIFIER[AxiomTeeVerifier<br/>EIP-712 proof verification]
        PAY[AxiomPaymentProcessor<br/>ERC-20 payment splitter]
    end

    subgraph OG_Storage["0G Storage"]
        IND[Indexer — upload/download<br/>@0gfoundation/0g-storage-ts-sdk]
    end

    subgraph OG_Compute["0G Compute (Router API)"]
        RTR[Router API — OpenAI-compatible<br/>/v1/chat/completions]
    end

    subgraph OG_DA["0G DA"]
        DA_GRPC[gRPC DisperseBlob]
    end

    UI --> Hooks
    Hooks -->|HTTP REST| R
    Hooks -->|WebSocket| WS
    Hooks -->|wagmi| NFT
    Hooks -->|wagmi| VERIFIER
    Hooks -->|wagmi| PAY

    R --> S
    S --> DI
    S --> ES
    DI -->|ethers| NFT
    DI -->|ethers| VAULT
    DI -->|ethers| VERIFIER
    DI -->|fetch| OR
    DI -->|SDK| IND

    OR --> SG
    OR --> CR
    OR --> S3
    S3 -->|SDK| IND

    WT -->|eth_getLogs| OG_Chain
    WT --> EV
    EV -->|POST /v1/events| R
    EV --> DA
    DA -->|gRPC| DA_GRPC
```

---

## Sequence Diagrams

### 1. Mint Flow — User Creates iNFT Agent

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant NFT as AxiomAgentNFT
    participant Oracle as TEE Oracle
    participant S3 as 0G Storage

    User->>FE: Fill MintForm
    FE->>BE: POST /v1/agents/mint
    Note over BE: Zod validation
    
    BE->>NFT: read mintFee()
    BE->>NFT: mint(iDatas, owner) {value: fee}
    NFT-->>BE: tokenId, Transfer log
    
    BE->>Oracle: POST /v1/agents/mint
    Note over Oracle: register dataHash in seen-set
    
    BE-->>FE: { tokenId, dataHash, txHash }
    FE-->>User: Show success + link
    
    alt Oracle registration fails
        Note over BE: console.warn — non-fatal
        Note over BE: Transfer still works if /v1/transfer-validity is used
    end
```

### 2. Transfer Flow — iNFT Ownership Transfer with Re-Key

```mermaid
sequenceDiagram
    actor Owner
    actor Receiver
    participant FE as Frontend
    participant BE as Backend
    participant Oracle as TEE Oracle
    participant S3 as 0G Storage
    participant NFT as AxiomAgentNFT
    participant Verifier as AxiomTeeVerifier

    Owner->>FE: Open TransferModal
    FE->>FE: generate 32-byte random nonce
    Owner->>FE: Fill receiver address + pubkey + optional re-key inputs

    Note over FE: PHASE 1: CHALLENGE
    FE->>BE: POST /v1/agents/:id/transfer
    
    alt Has re-key inputs (oldDataKey + oldDataUri)
        BE->>Oracle: POST /v1/transfer-validity
        Oracle->>S3: download(oldDataUri)
        S3-->>Oracle: old ciphertext
        Oracle->>Oracle: aesGcmDecrypt(oldKey, oldCipher)
        Oracle->>Oracle: aesGcmEncrypt(freshKey, plaintext)
        Oracle->>S3: upload(newBlob)
        S3-->>Oracle: newDataHash
        Oracle->>Oracle: sealKeyForReceiver(pubkey, freshKey)
        Oracle->>Oracle: signOwnership(newDataHash, sealedKey, ...)
        Oracle-->>BE: { newDataHash, sealedKey, ownershipSig }
        BE-->>FE: { stage: "challenge", rekeyed: true, ... }
    else Sign-only
        BE->>Oracle: POST /v1/ownership
        Oracle->>Oracle: check seen-set, signOwnership
        Oracle-->>BE: { ownershipSig, signer }
        BE-->>FE: { stage: "challenge", ... }
    end

    Note over FE: PHASE 2: RECEIVER SIGNS
    FE->>FE: signTypedData_v4 (EIP-712 AccessProof)
    Note over FE: domain: AxiomTeeVerifier
    Note over FE: types: dataHash, targetPubkey, to, nft, nonce, validUntil

    Note over FE: PHASE 3: FINALIZE
    FE->>BE: POST /v1/agents/:id/transfer (with signed AccessProof)
    BE->>BE: recoverAccessSigner — EIP-712 recover
    BE->>Oracle: POST /v1/ownership (final sealedKey)
    Oracle-->>BE: ownershipProof
    BE-->>FE: { stage: "final", accessProof, ownershipProof }

    Note over FE: PHASE 4: ON-CHAIN
    FE->>NFT: iTransferFrom(from, to, tokenId, [proofs])
    NFT->>Verifier: verifyTransferValidity(proofs, to, nft)
    Note over Verifier: check usedProofs, validUntil, maxProofAge
    Note over Verifier: ECDSA.recover(accessProof) == to
    Note over Verifier: ecrecover(ownershipProof) == registeredSigner
    Verifier-->>NFT: proofOutput (sealedKeys[])
    NFT->>NFT: safeTransferFrom(from, to, tokenId)
    NFT->>NFT: emit PublishedSealedKey(to, tokenId, sealedKeys)
    NFT-->>FE: tx receipt
    FE-->>Owner: Transfer confirmed
```

### 3. Strategy Tick Flow — Orchestrator Execution

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant Compute as 0G Compute Router
    participant NFT as AxiomAgentNFT
    participant Vault as AxiomStrategyVault
    participant S3 as 0G Storage

    User->>FE: Click "Execute Tick"
    FE->>BE: POST /v1/orchestrator/tick

    Note over BE: StrategyRunner.runTick()
    par Fan-out (Promise.all)
        BE->>Compute: chat.completions.create(model, messages)
        Note over Compute: OpenAI-compatible /v1/chat

        BE->>Vault: balanceOf(tokenId)
        BE->>Vault: strategyOf(tokenId)
        BE->>Vault: getLogs (StrategySet, Deposited)

        BE->>S3: download(modelDataRoot)
    end

    Compute-->>BE: LLM JSON response { action, amount, reason }
    Vault-->>BE: vault balance + strategy state
    S3-->>BE: storage root hash + size

    BE->>BE: parseRecommendation(rawOutput)

    opt action != "hold"
        BE->>Vault: execute(tokenId, target, value, data, proof)
        Note over Vault: MerkleProof.verify(actionHash, strategyRoot, proof)
        Note over Vault: Check dailyLimit not exceeded
        Vault-->>BE: Executed event + result bytes
    end

    BE-->>FE: TickResult { recommendation, onchain, storage, execution, durationMs }
    FE-->>User: Show recommendation + execution result
```

### 4. Event Streaming Flow — Indexer → Backend → Frontend

```mermaid
sequenceDiagram
    participant Indexer as Indexer (Watcher)
    participant Chain as 0G Chain
    participant BE as Backend
    participant FE as Frontend

    loop Every POLL_INTERVAL_MS (12s)
        Indexer->>Chain: eth_getLogs(fromBlock, toBlock, addresses, topics)
        Chain-->>Indexer: Log[]

        Note over Indexer: Checkpoint: save nextBlock

        Indexer->>Indexer: decodeEventLog for each log
        
        alt DA enabled
            Indexer->>Indexer: batch events → DisperseBlob gRPC
        end

        Indexer->>BE: POST /v1/events { source:"indexer", eventName, payload }
        BE->>BE: EventStore.append()
        BE->>BE: broadcast(eventName, payload) via WebSocket
        BE-->>Indexer: 200 OK
    end

    par WebSocket (real-time)
        FE->>BE: ws:// /v1/stream?topic=Transfer&topic=PaymentProcessed
        BE-->>FE: { topic: "Transfer", payload: {...} }
    and Polling (fallback)
        FE->>BE: GET /v1/events?owner=0x...
        BE-->>FE: { events: StoredEvent[] }
    end
```

### 5. Payment Flow — Royalty + Agent Payments

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant Payment as AxiomPaymentProcessor
    participant Token as ERC-20 (MockUSDC)

    Note over User, Token: PAY FOR AGENT
    User->>FE: Click Pay
    FE->>BE: POST /v1/agents/:id/pay { amount }
    BE->>BE: getPayment() → lazy-init PaymentProcessorClient
    BE->>Token: approve(processor, amount)
    BE->>Payment: payForAgent(tokenId, amount)
    Payment->>Token: safeTransferFrom(payer, processor, amount)
    Note over Payment: Split: creatorCut (royalty) + protocolCut
    Payment-->>BE: PaymentProcessed event
    BE-->>FE: { ok, tokenId, amount, txHash }

    Note over User, Token: SET ROYALTY
    User->>FE: Enter bps
    FE->>BE: POST /v1/agents/:id/royalty { bps }
    BE->>Payment: encodeSetRoyalty(tokenId, bps)
    Note over BE: Returns encoded calldata only
    BE-->>FE: { to, data, value }
    FE->>Payment: useSendTransaction({ to, data, value })
    Payment-->>FE: tx hash
```

### 6. Data Flow — Request Lifecycle Through the Stack

```mermaid
flowchart LR
    subgraph Inbound["HTTP Request"]
        A[Client] --> B[Express Middleware Stack]
    end

    B --> C1[Request ID]
    B --> C2[Helmet CSP]
    B --> C3[CORS]
    B --> C4[API Key Auth]
    B --> C5[Rate Limit<br/>100/min]
    B --> C6[JSON Parser<br/>2mb limit]
    B --> C7[Request Logger<br/>method URL status duration]

    C7 --> D{Route Router}

    D -->|/health| E1[Health Router]
    D -->|/v1/agents| E2[Agent Router]
    D -->|/v1/vaults| E3[Vault Router]
    D -->|/v1/compute| E4[Compute Router]
    D -->|/v1/events| E5[Events Router]
    D -->|/v1/orchestrator| E6[Orchestrator Router]
    D -->|/v1/payment| E7[Payment Router]

    E1 --> F[Zod Validation]
    E2 --> F
    E3 --> F
    E4 --> F
    E5 --> F
    E6 --> F
    E7 --> F

    F -->|Valid| G[Service Layer]
    F -->|Invalid| H[400 Bad Request]

    G --> I{External Call?}
    I -->|Contract| J[ethers TypedContract]
    I -->|Oracle| K[DefaultSignerOracleClient]
    I -->|Storage| L[ZeroGStorage SDK]
    I -->|Compute| M[OpenAI SDK]

    J --> N[Response + Broadcast]
    K --> N
    L --> N
    M --> N

    N --> O[Global Error Handler]
    O -->|ZodError| P[400]
    O -->|Upstream Error| Q[502]
    O -->|Internal| R[500]
    O -->|Success| S[200 + JSON]
```

---

## Deployment Topology

```mermaid
graph TB
    subgraph Galileo["0G Galileo Testnet (chainId 16602)"]
        directions["RPC: https://evmrpc-testnet.0g.ai<br/>Explorer: chainscan-galileo.0g.ai"]
    end

    subgraph Services["Backend Services"]
        BE["Backend (:3000)<br/>Express + TypeScript"]
        OR["Oracle (:8787)<br/>TEE Signer + Crypto"]
        IDX["Indexer<br/>Block Poller + Event Decoder"]
    end

    subgraph Storage_Infra["0G Infra"]
        STORAGE["Storage Indexer<br/>indexer-storage-testnet-turbo.0g.ai"]
        COMPUTE["Compute Router<br/>router-api-testnet.integratenetwork.work"]
        DA["DA Node<br/>dgrpc-testnet.0g.ai:9090"]
    end

    subgraph Frontend_Host["Frontend"]
        VERCEL["Vercel Deployment<br/>axiom-protocol.vercel.app"]
    end

    BE -->|ethers RPC| Galileo
    BE -->|SDK| STORAGE
    BE -->|OpenAI| COMPUTE
    BE -->|HTTP| OR
    IDX -->|eth_getLogs| Galileo
    IDX -->|HTTP POST /v1/events| BE
    IDX -->|gRPC DisperseBlob| DA
    OR -->|SDK| STORAGE
    VERCEL -->|HTTPS REST| BE
    VERCEL -->|wagmi RPC| Galileo
    VERCEL -->|WS| BE
```
