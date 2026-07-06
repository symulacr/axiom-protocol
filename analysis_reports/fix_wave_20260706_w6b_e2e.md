# Fix Wave — Agent W6-B (E2E Step Decomposition)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/cli/e2e/steps.ts` (new), `apps/backend/src/cli/run-e2e.ts`  
**Audit refs:** P3-5 (`fix_manifest.md` § W6-B)

## Fixes Applied

### P3-5 — Decompose `main()` god-function into step modules

**Before:** `run-e2e.ts` contained a monolithic `main()` (~385 lines) with inline crypto, storage, HTTP, and on-chain logic. A `FLAG` comment noted the function exceeded the 100-line threshold.

**After:** Step handlers extracted to `cli/e2e/steps.ts`; `main()` is a thin orchestrator that wires env/wallets and calls steps in order.

| Export | Step(s) | Responsibility |
|--------|---------|----------------|
| `printE2eBanner` | — | Config banner |
| `runHealthStep` | 1 | `GET /health` via `fetchJson` |
| `runStrategyStep` | 2 | Build StrategySpec JSON |
| `runEncryptStep` | 3 | AES-GCM encrypt + ECIES seal |
| `runUploadStep` | 4 | 0G Storage upload |
| `runMintStep` | 5 | Oracle `POST /v1/agents/mint` |
| `runSkippedVaultSteps` | 6–7 | Skipped wallet-owned vault ops |
| `runTickStep` | 8 | `POST /v1/orchestrator/tick` via `postStep` |
| `runTransferSteps` | 8.5, 9 | Re-seal dataKey + two-stage transfer |
| `runOnChainTransferStep` | 10 | `iTransferFrom` on-chain |
| `printReport` | — | Summary table + exit code |

Each step receives only the deps it needs (`backendUrl`, `oracleUrl`, wallets, `postStep`, `fetchJson`, addresses, etc.) as function parameters. Shared `stepResults` mutation remains in `cli/e2e/http.ts` (unchanged from W5-C).

**`run-e2e.ts` orchestrator (post-refactor):**

```typescript
async function main(): Promise<void> {
  printE2eBanner({ ... });
  await runHealthStep(BACKEND_URL, fetchJson);
  const strategyJson = runStrategyStep();
  const { blob, sealedKey } = runEncryptStep(DEPLOYER_PK, strategyJson);
  const upload = await runUploadStep({ storageRpc, rpc, signer: deployer, blob });
  await runMintStep(ORACLE_URL, upload.rootHash, fetchJson);
  runSkippedVaultSteps();
  const tokenId = "0";
  await runTickStep({ backendUrl, postStep, vault, agentNft, tokenId });
  const finalResp = await runTransferSteps({ ... });
  await runOnChainTransferStep({ ... });
  printReport();
}
```

## Line Counts

| File | Before | After | Δ |
|------|--------|-------|---|
| `cli/run-e2e.ts` | 483 | 137 | −346 |
| `cli/e2e/steps.ts` | — | 507 | +507 (new) |
| **`main()` body** | **~385** | **53** | **−332** |

`main()` body is now well under the 80-line target.

## Behavior Preservation

- CLI banner text unchanged
- Step numbering 1–10 (plus 8.5 console label) unchanged
- `stepResults` push semantics unchanged for all steps
- `postStep` / `fetchJson` imported from existing modules (`e2e/http.ts`, `utils/fetch-json.ts`)
- Pass/fail summary and `process.exit(1)` on failure unchanged

## Verification

```bash
pnpm --filter @axiom/backend typecheck   # pass
pnpm --filter @axiom/backend test        # 7/7 pass
```

## Files Changed

| File | Changes |
|------|---------|
| `cli/e2e/steps.ts` | **NEW** — step handler modules |
| `cli/run-e2e.ts` | Env/wallet bootstrap + thin `main()` orchestrator |

## Manifest Status Updates

| ID | Status |
|----|--------|
| P3-5 | **Done** (full `main()` decomposition complete) |

## Follow-ups (out of scope)

- Optional Zod validation in `fetchJson` (P3-7 extension)
- Unit-test individual step functions with injected mocks
- Reuse `fetchJson` in `oracle/client.ts` and other HTTP callers