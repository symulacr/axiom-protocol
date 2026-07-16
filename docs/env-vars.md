# Environment variables (generated from code truth — Wave 1)

> Source of truth order: `.env.example` → per-app `env-schema.ts` → this file.
> Package manager: **pnpm@10.22.0**. Default chainId: **16661** (Aristotle).

## .env.example keys

```
AXIOM_AGENT_LIST_CACHE_MS
AXIOM_AGENT_NFT
AXIOM_AGENT_NFT_ADDRESS
AXIOM_API_KEY
AXIOM_BACKEND_URL
AXIOM_BIND
AXIOM_CHAIN_ID
AXIOM_CHAT_STREAM_TIMEOUT_MS
AXIOM_COMPUTE_API_KEY
AXIOM_COMPUTE_BASE_URL
AXIOM_COMPUTE_DEPOSIT_AMOUNT
AXIOM_COMPUTE_MODEL
AXIOM_COMPUTE_VERIFY_TEE
AXIOM_DATA_DIR
AXIOM_DEPLOYER_ADDRESS
AXIOM_DISABLE_AUTH
AXIOM_ENCRYPTION_ALGORITHM
AXIOM_EVM_RPC
AXIOM_FRONTEND_URL
AXIOM_HEALTH_CACHE_MS
AXIOM_MOCK_USDC_ADDRESS
AXIOM_NFT
AXIOM_OPERATOR_PK
AXIOM_ORACLE_ADMIN_PK
AXIOM_ORACLE_BIND
AXIOM_ORACLE_PORT
AXIOM_ORACLE_URL
AXIOM_PAYMENT_PROCESSOR
AXIOM_PAYMENT_PROCESSOR_ADDRESS
AXIOM_PAYMENT_TOKEN
AXIOM_PORT
AXIOM_RATE_LIMIT_MAX
AXIOM_RUNTIME_SIGNER_PK
AXIOM_SENTRY_DSN
AXIOM_STORAGE_EVM_RPC
AXIOM_STORAGE_INDEXER_RPC
AXIOM_STORAGE_RPC
AXIOM_STRATEGY_VAULT
AXIOM_STRATEGY_VAULT_ADDRESS
AXIOM_TEE_SIGNER_PK
AXIOM_TEE_VERIFIER
AXIOM_TEE_VERIFIER_ADDRESS
AXIOM_TEST_RECEIVER_1_PK
AXIOM_TEST_RECEIVER_2_PK
DEPLOYER_PK
E2E_OPERATOR_ADDRESS
E2E_OPERATOR_PK
E2E_PARITY_MIN_PCT
E2E_RECEIVER_ADDRESS
E2E_RECEIVER_PK
E2E_STRICT_FUNDING
E2E_USDC_MINT_AMOUNT_HUMAN
FOUNDRY_LIVE_FORK
HEALTH_PORT
INDEXER_DA_ENABLED
RECEIVER_PK
VITE_AGENT_NFT_ADDRESS
VITE_API_KEY
VITE_BACKEND_URL
VITE_CHAT_MODEL
VITE_MOCK_USDC_ADDRESS
VITE_ORACLE_URL
VITE_PAYMENT_PROCESSOR_ADDRESS
VITE_STRATEGY_VAULT_ADDRESS
VITE_TEE_VERIFIER_ADDRESS
VITE_WALLETCONNECT_PROJECT_ID
```

## Backend schema (apps/backend/src/env-schema.ts)

```
7:    AXIOM_EVM_RPC: z.string().url(),
8:    AXIOM_ORACLE_URL: z.string().url(),
9:    AXIOM_INDEXER_API_KEY: z.string().optional(),
10:    AXIOM_STORAGE_RPC: z.string().url().optional(),
11:    AXIOM_COMPUTE_API_KEY: z.string().optional(),
12:    AXIOM_COMPUTE_VERIFY_TEE: z.string().optional(),
13:    AXIOM_ENCRYPTION_ALGORITHM: z.string().optional(),
14:    OG_COMPUTE_API_KEY: z.string().optional(),
15:    AXIOM_TEE_SIGNER_PK: hexString,
16:    DEPLOYER_PK: hexString,
17:    AXIOM_RUNTIME_SIGNER_PK: z.string().optional(),
18:    AXIOM_OPERATOR_PK: z.string().optional(),
19:    AXIOM_COMPUTE_SIGNER_PK: z.string().optional(),
20:    AXIOM_SENTRY_DSN: z.string().optional(),
21:    AXIOM_COMPUTE_MODEL: z.string().optional(),
22:    AXIOM_PORT: z.coerce.number().int().positive().default(3000),
23:    PORT: z.coerce.number().int().positive().optional(),
24:    AXIOM_BIND: z.string().default("0.0.0.0"),
25:    AXIOM_AGENT_NFT_ADDRESS: z.string().optional(),
26:    AXIOM_STRATEGY_VAULT_ADDRESS: z.string().optional(),
27:    AXIOM_TEE_VERIFIER_ADDRESS: z.string().optional(),
28:    AXIOM_PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
29:    AGENT_NFT_ADDRESS: z.string().optional(),
30:    VAULT_ADDRESS: z.string().optional(),
31:    AXIOM_TEE_VERIFIER: z.string().optional(),
32:    PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
```

## Oracle schema

```
7:    AXIOM_TEE_SIGNER_PK: hexString,
8:    AXIOM_ORACLE_URL: z.string().url().default("http://127.0.0.1:8787"),
9:    AXIOM_STORAGE_INDEXER_RPC: z.string().url().optional(),
10:    AXIOM_STORAGE_EVM_RPC: z.string().url().optional(),
11:    AXIOM_EVM_RPC: z.string().url(),
12:    AXIOM_TEE_VERIFIER_ADDRESS: address.optional(),
13:    AXIOM_TEE_VERIFIER: address.optional(),
14:    AXIOM_ORACLE_BIND: z.string().default("127.0.0.1"),
15:    AXIOM_ORACLE_PORT: z.coerce.number().int().positive().default(8787),
16:    AXIOM_STORAGE_PRIVATE_KEY: hexString.optional(),
17:    AXIOM_SENTRY_DSN: z.string().optional(),
```

## Indexer schema

```
7:    AXIOM_EVM_RPC: z.string().url(),
8:    AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16661),
9:    AXIOM_STORAGE_RPC: z.string().optional(),
10:    AXIOM_STORAGE_EVM_RPC: z.string().optional(),
11:    AXIOM_BACKEND_URL: z.string().url().optional(),
12:    AXIOM_INDEXER_API_KEY: z.string().optional(),
13:    INDEXER_DA_ENABLED: z.string().optional(),
14:    DEPLOYER_PK: hexString.optional(),
15:    STORAGE_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
16:    STORAGE_BATCH_MAX_EVENTS: z.coerce.number().int().positive().default(10),
17:    INDEXER_HEALTH_PORT: z.coerce.number().int().positive().default(9091),
18:    PORT: z.coerce.number().int().positive().optional(),
19:    INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
20:    INDEXER_POLL_WINDOW_BLOCKS: z.coerce.number().int().positive().default(500),
```

## Frontend (VITE_*)

```
apps/frontend/server.mjs:6://       /api/*     -> backend  (PROXY_BACKEND_URL — required in production)
apps/frontend/server.mjs:7://       /oracle/*  -> oracle   (PROXY_ORACLE_URL — required in production)
apps/frontend/server.mjs:38:  "PROXY_BACKEND_URL",
apps/frontend/server.mjs:42:  "PROXY_ORACLE_URL",
apps/frontend/src/config/env.ts:12:// Override per-deploy with the VITE_BACKEND_URL / VITE_ORACLE_URL build env
apps/frontend/src/config/env.ts:16:  import.meta.env.VITE_BACKEND_URL ?? "/api";
apps/frontend/src/config/env.ts:18:export const API_KEY = import.meta.env.VITE_API_KEY ?? "";
apps/frontend/src/config/env.ts:21:  import.meta.env.VITE_ORACLE_URL ?? "/oracle";
apps/frontend/src/config/env.ts:23:export const CHAT_MODEL = resolveChatModel(import.meta.env.VITE_CHAT_MODEL);
```

## Production proxy

- `PROXY_BACKEND_URL` / `PROXY_ORACLE_URL`: **required** when `NODE_ENV=production` for `apps/frontend/server.mjs`.
- Vercel static hosting does not bake Railway hosts; set `VITE_BACKEND_URL` / `VITE_ORACLE_URL` to absolute API origins if not same-origin.
