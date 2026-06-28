# Wave 4-A7: Refactoring Opportunities — Closure Report

**Protocol:** 7×4 Wave Codebase Audit  
**Date:** 2026-06-28  
**Monorepo:** Axiom Protocol (`/home/eya/og`)  
**Agent:** W4-A7 Refactoring Opportunity Agent

---

## Executive Summary

This report synthesizes findings from Waves 1–3 (21 agents) plus fresh analysis of orphaned config, deploy scripts, test coverage, duplicate code, and structural anti-patterns. **30 total recommendations** across 4 priority levels.

**Cross-wave themes:**
- **W1-A5 + W3-A4 + W3-A7:** `OG_*` → `AXIOM_*` naming migration is 40% complete — env vars, addresses, and configs use both prefixes with 15+ backward-compat aliases. Every release widens the migration gap.
- **W1-A3 + W3-A5:** `omnichron` dependency is dead in 3 packages — flagged independently but still installed.
- **W2-A6 + W2-A5 + this report:** Graceful shutdown is inconsistent — 2 of 3 apps have SIGTERM handlers, zero apps have `unhandledRejection`, heartbeat timers leak.
- **W3-A1 + W3-A3 + W3-A2:** 4 dead files, 3 dead components, 48 dead functions, 17 dead variables — no cleanup effort started.

---

## Priority Matrix

### P0 — Critical (security, data loss, or money risk)

| # | Priority | File:Line | Problem | Impact | Suggested Fix | Effort |
|---|----------|-----------|---------|--------|---------------|--------|
| 1 | **P0** | All entry points (apps/backend/src/index.ts, apps/oracle/src/index.ts, apps/indexer/src/index.ts) | **No `process.on('unhandledRejection')` handler** in any app. Async promise rejections are silently swallowed. | Silent data loss, unreported failures, difficult root-cause analysis in production. | Add `process.on('unhandledRejection', (reason) => { console.error('[FATAL] Unhandled rejection:', reason); process.exit(1); })` to all 3 entry points. | 15 min |
| 2 | **P0** | apps/oracle/src/server.ts:141-231 (`/v1/ownership`) | **Unsafe `throw err` on line 150** — inside the try/catch for Zod parsing, non-Zod errors are re-thrown with no outer handler. If `ownershipBodySchema.parse()` throws a non-Zod runtime error, it escapes to Express's default handler. | Could expose internal error details to callers; inconsistent error response shape. | Wrap the full route body in a single try/catch instead of nesting. Remove bare `throw err`. See `/v1/transfer-validity` pattern. | 30 min |
| 3 | **P0** | apps/oracle/src/server.ts:233-241 (`/v1/agents/mint`) | **Zero error handling** — if `mintDataHashSchema.parse()` throws (malformed body), there's no try/catch. The global Express error handler on line 243 catches it, but the response format is inconsistent. | Runtime errors produce raw Express HTML error pages in some configurations. | Add try/catch consistent with other routes. | 15 min |
| 4 | **P0** | apps/backend/src/orchestrator/index.ts:88-129 | **OpenAI completion calls have no per-request timeout**. The `getClient()` creates an OpenAI client without setting `timeout` in `runTick()`'s inference path. A hanging model blocks the entire StrategyRunner | Hanging inference blocks strategy ticks indefinitely — no circuit breaker. | Pass explicit `timeout: 30_000` (or configurable) to `client.chat.completions.create()`. The `createRouterClient()` in router.ts does accept a timeout parameter but `runTick()` doesn't call it. | 30 min |

### P1 — High (bugs, maintainability debt)

| # | Priority | File:Line | Problem | Impact | Suggested Fix | Effort |
|---|----------|-----------|---------|--------|---------------|--------|
| 5 | **P1** | apps/backend/src/server.ts:126-134 + backend/src/index.ts | **Backend has no SIGTERM handler** — the heartbeat timer (`setInterval` on line 126) leaks on process exit, preventing graceful shutdown. Indexer (oracle/index.ts:42-51) and oracle (indexer/src/index.ts:256-260) handle SIGTERM/SIGINT; backend doesn't. Cross-wave: W2-A6 flagged this. | On deploy/restart: active WebSocket connections dropped ungracefully, in-flight events lost, heartbeat timer keeps event-loop alive. | Add `process.on("SIGTERM")` / `process.on("SIGINT")` in backend/src/index.ts that closes HTTP server, clears heartbeatTimer, and drains EventStore. | 1h |
| 6 | **P1** | apps/indexer/docker-compose.yml:14 | **Missing `da-client.env.example`** — docker-compose references `./da-client.env.example` on line 14 but the file doesn't exist in the indexer directory. `docker compose up` fails with "file not found". | Docker-based indexer deployment is broken. | Create `apps/indexer/da-client.env.example` with required 0G DA configuration. Or remove `env_file` and inline vars. | 30 min |
| 7 | **P1** | apps/backend/src/utils/constants.ts:11,17 | **Dead constants `BLOCK_SCAN_RANGE` and `DEFAULT_MAX_TOKENS`** — exported but never imported anywhere. Cross-wave: W3-A4 found these, no one cleaned them up. | Code debt — confuse maintainers. The hardcoded `max_tokens: 2048` in server.ts:166 should reference `DEFAULT_MAX_TOKENS` if kept, or delete both. | Remove dead constants (or wire the live ones). | 5 min |
| 8 | **P1** | apps/oracle/src/server.ts:11 | **Dead import: `createApiKeyAuth`** — imported but never called. The oracle server bypasses API key auth entirely (the `/health` and all routes are unprotected by key auth). Cross-wave: W3-A5 flagged this. | Misleading import; creates false sense of security. | Remove import. If API key auth is desired for oracle routes, apply the middleware. | 5 min |
| 9 | **P1** | apps/frontend/src/ (entire) | **Frontend has ZERO TypeScript tests.** 19 custom hooks, 16 components, 4 pages, 4 utility files — no `.test.ts` or `.test.tsx` files exist. Backend also has 0 test files despite having `"test": "node --import tsx --test src/**/*.test.ts"` in package.json (would match nothing). Only the oracle has 1 test file. | UI regressions impossible to catch automatically; backend business logic untested. | Add test infrastructure (Vitest for frontend, build on node:test for backend). Prioritize: hooks that call backend, payment flows, agent transfer flows. | 3-5d per app |
| 10 | **P1** | apps/contracts/script/Deploy.s.sol:23 | **`AXIOM_DEPLOYER_ADDRESS` env var required but not documented** — `vm.envAddress("AXIOM_DEPLOYER_ADDRESS")` on line 23 will fail at runtime if this variable isn't set. It's not in `.env.example`, `.env.galileo.example`, or any docs. | Any deployer running the script from docs instructions gets an opaque runtime error. | Add to `.env.galileo.example` and deploy docs. Either document as required, or derive from `DEPLOYER_PK` with `vm.addr()`. | 15 min |
| 11 | **P1** | apps/frontend/src/config/chains.ts:1-38 | **Hardcoded chain RPC URLs in frontend** — `chains.ts` hardcodes `https://evmrpc-testnet.0g.ai` and `https://evmrpc.0g.ai` rather than reading from env or `@axiom/config/networks`. Frontend would need code changes to switch networks. | Prevents runtime network switching; diverges from the single-source-of-truth in `packages/config/src/networks.ts`. | Import `OG_NETWORKS` from `@axiom/config/networks` and derive chain configs dynamically. | 1h |

### P2 — Medium (cleanup, consolidation)

| # | Priority | File:Line | Problem | Impact | Suggested Fix | Effort |
|---|----------|-----------|---------|--------|---------------|--------|
| 12 | **P2** | Root `.env.vercel`, `.env.vercel.tmp` | **Live Vercel OIDC tokens committed to repo** — both files contain valid JWT tokens for Vercel deployment authentication. While tokens have short expiry, committing them is a security anti-pattern. | Token leakage via git history. Vercel recommends `.env.vercel` in `.gitignore`. | Add `.env.vercel*` to `.gitignore`. Remove committed files from git history (`git rm --cached`). | 15 min |
| 13 | **P2** | Root `tmp_audit.sh`, `tmp_extra.sh`, `tmp_find.sh`, `tmp_ci.sh`, `tmp_check_ignore.sh`, `tmp-run.sh`, `tmp-check.sh`, `tmp-timestamps.sh` | **8 transient tmp_* scripts at repo root** — likely created during audit sessions, never cleaned up. | Root directory clutter; confuses new contributors about which scripts are canonical. | Delete all `tmp_*` scripts. Move any useful ones to `.agents/` or document them. | 10 min |
| 14 | **P2** | apps/backend/dist-test/wayback.js vs apps/backend/src/services/wayback.ts | **Wayback service duplication** — `dist-test/wayback.js` is a compiled JS copy of the TS source, but manually maintained and potentially diverging. The two implementations have slightly different error handling patterns. | Duplicated code that can drift — W3-A7 flagged legacy patterns. The dist-test version exists for quick CDX API testing but should derive from source. | Remove `dist-test/wayback.js` (it's a build artifact). Use `tsx` to run the TS source directly in tests. | 30 min |
| 15 | **P2** | packages/config/package.json (dependencies) + apps/backend/package.json | **`omnichron` unused in 3 packages** — Cross-wave finding (W1-A3 + W3-A5): dead dependency in `packages/config`, `apps/backend`, and likely bench. ~600KB dependency downloaded and installed for nothing. | Unnecessary install time, disk usage, and attack surface. | `pnpm remove omnichron` from all packages. The Wayback service now uses direct CDX API calls (backend/src/services/wayback.ts), not omnichron. | 15 min |
| 16 | **P2** | packages/config/src/storage/0g.ts | **0G Storage SDK has no configurable timeout** — `uploadToStorage` and `downloadFromStorage` call the SDK directly without passing a timeout or abort signal. A network hang blocks the caller indefinitely. Cross-wave: W2-A5 flagged this. | Network partition can hang the indexer or oracle permanently. | Add `AbortSignal.timeout()` to SDK calls, or pass through timeout from caller. | 1h |
| 17 | **P2** | apps/indexer/src/index.ts + sink.ts | **Duplicate env loading** — indexer uses `loadEnv()` directly (index.ts:19) AND `getEnvWithAlias()` for specific vars AND re-reads `process.env["OG_CHAIN_ID"]` at call time in sink.ts:56. Three different env access patterns in one app. | Inconsistent env resolution; `OG_CHAIN_ID` check at call time bypasses the `AXIOM_*` canonical naming. | Consolidate all env access through the Zod schema. Remove inline `process.env["OG_CHAIN_ID"]` in sink.ts in favor of the parsed schema. | 1h |
| 18 | **P2** | apps/indexer/src/watcher.ts | **Indexer watcher.tick() is a single 165-line function** — does checkpoint loading, RPC polling, event decoding, sink dispatch, and checkpoint saving in one monolithic try/catch. | Hard to test, risky to modify. The decode loop (lines 568-572) correctly uses `if (ev === null) continue` to skip bad logs (W2 flagged incorrectly), but the function length is a maintenance risk. | Extract: `pollWindow()`, `decodeLogs()`, `saveCursor()` into separate methods. | 2h |
| 19 | **P2** | `.env` root file | **3 private keys all set to the same value** — `DEPLOYER_PK`, `TEE_SIGNER_PK`, `ORACLE_ADMIN_PK` all use the same key `0x5db6cf...7a7e4`. Cross-wave: W1-A5 flagged this. | Testnet, so no real risk, but normalizes insecure behavior. Key separation on mainnet is critical — the code path assumes they're different. | Add a `# TESTNET ONLY — MUST SEPARATE ON MAINNET` comment. Document key separation requirements. | 5 min |
| 20 | **P2** | apps/backend/src/compute/router.ts:44 | **Env vars re-resolved on every call** — `createRouterClient()` calls `process.env.AXIOM_COMPUTE_DIRECT_KEY`, `process.env.AXIOM_COMPUTE_API_KEY` etc. on every invocation. Cross-wave: W2-A4 noted this. | Zero caching of env-derived configuration. Each call re-reads and re-parses env vars. Read during startup instead. | Resolve compute API key at module initialization or StrategyRunner construction, not per-call. | 30 min |
| 21 | **P2** | packages/config/src/env-schema.ts:20 | **`OG_COMPUTE_BASE_URL` accepted as env var** but the schema comment says "misnamed — actual is `OG_COMPUTE_BASE_URL`" (W3-A4 dead var finding). The env already has both `OG_COMPUTE_BASE_URL` AND the correct `AXIOM_COMPUTE_BASE_URL`. | Dual naming confusion. The shared schema should prefer `AXIOM_*` form only. | Add `AXIOM_COMPUTE_BASE_URL` to shared schema, deprecate `OG_COMPUTE_BASE_URL`. Unify in `.env.example`. | 30 min |

### P3 — Low (nice-to-have)

| # | Priority | File:Line | Problem | Impact | Suggested Fix | Effort |
|---|----------|-----------|---------|--------|---------------|--------|
| 22 | **P3** | Root Makefile | **`contracts-deploy-mainnet` target references forge script** but comment says "not yet safe" — the target exists and would run if invoked. | One mis-typed `make contracts-deploy-mainnet` could deploy to mainnet accidentally. | Add a confirmation prompt or `exit 1` guard until mainnet deploy is properly tested. | 30 min |
| 23 | **P3** | apps/frontend/src/components/MonoInput.tsx, MutedText.tsx, MetadataGrid.tsx | **3 dead components** — never imported anywhere (cross-validated by W3-A1 + W3-A3 + this report). | Unnecessary files cluttering the components directory. | Delete all 3 files. | 5 min |
| 24 | **P3** | apps/frontend/src/utils/events.ts | **Dead utility file** — never imported anywhere. Cross-wave: W3-A1 + W3-A2 both flagged. | Dead code. | Delete file. | 2 min |
| 25 | **P3** | apps/backend/src/storage/ | **Empty directory** — reserved for future 0G Storage client but unused. Cross-wave: W1 flagged this. | Confuses developers browsing the structure. | Add a `.gitkeep` with a README note, or remove directory until needed. | 5 min |
| 26 | **P3** | Root `$E2E_DEMO_DIR/` symlink | **Shell variable syntax in directory name** — `$E2E_DEMO_DIR/` symlink at root will confuse tools and shell completion. | Unusual naming that can break scripts. | Rename to `e2e-demo/` or similar. | 5 min |
| 27 | **P3** | Root `cleanup.sh` | **Unknown cleanup script at root** — 187 bytes, no documentation. Could delete important state if run carelessly. | Risk of accidental data loss. | Document or remove. | 15 min |
| 28 | **P3** | apps/contracts/script/DeployAristotle.s.sol:154-176 | **`_buildDeploymentJson()` writes to `docs/deployments/`** which is git-committed — would leak contract addresses into version control on every deploy. | Git history pollution with deployment artifacts. | Write to `.deployments/` (gitignored) or `broadcast/` only. | 30 min |
| 29 | **P3** | apps/frontend/src/abi/addresses.ts:11 | **`mockUsdc` address exported** — only used for Galileo testnet, shouldn't be in shared frontend config. Cross-wave: W3-A4 flagged this as dead. | Testnet-only address in shared config; could confuse mainnet deployments. | Remove from production build path or conditionally include. | 30 min |
| 30 | **P3** | Root `docs/changelog-v0.2.*.md` | **Changelogs exist in `docs/` but no root `CHANGELOG.md`** — version history is discoverable but not at the standard location. Cross-wave: W1-A7 flagged this. | Standard tooling (`auto-changelog`, GitHub releases UI) expects root CHANGELOG.md. | Create root CHANGELOG.md that links to per-version docs, or consolidate. | 1h |

---

## Cross-Wave Synthesis

### Theme 1: The OG→AXIOM Naming Migration is Stuck at 40%

**Files involved:** `.env`, `apps/backend/src/env-schema.ts`, `apps/backend/src/index.ts`, `apps/indexer/src/sink.ts`, `packages/config/src/env.ts`, `packages/config/src/env-schema.ts`, `.env.example`, `.env.galileo.example`

**Evidence:** 15+ backward-compat aliases exist (W3-A7). The `.env` file has both `OG_RPC_URL` and `AXIOM_EVM_RPC`. The indexer sink still reads `OG_CHAIN_ID` at call time. The backend index.ts uses deprecated `OG_CHAIN_ID` via `env.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID`. The shared config's `getEnvWithAlias` function exists specifically for this transition.

**Recommendation:** Designate a single release to cut all OG_* aliases. Plan: (1) Remove all OG_* fallbacks from Zod schemas, (2) Replace `getEnvWithAlias` calls with direct canonical lookups, (3) Update `.env` and `.env.example` to AXIOM_* only, (4) Update all deploy scripts and docs references. **Effort: 4h.**

### Theme 2: Unused Dependencies Are Accumulating

| Package | Unused Dep | Weight | Flagged By |
|---------|-----------|--------|------------|
| `packages/config` | `omnichron` | ~600KB | W1-A3, W3-A5, W4-A7 |
| `apps/backend` | `omnichron` | ~600KB | W1-A3, W3-A5, W4-A7 |
| `apps/bench` | 3+ unused deps | Unknown | W3-A5 |
| `apps/backend` | `ethereum-cryptography` (devDep) | ~200KB | W1-A3 |

**Recommendation:** Run `depcheck` on each workspace package. Remove dead deps in one sweep.

### Theme 3: Inconsistent Error Handling Infrastructure

Three apps, three different approaches:
| App | unhandledRejection | SIGTERM | Global Error Handler | Route-Level try/catch | Tested |
|-----|-------------------|---------|---------------------|----------------------|--------|
| Backend | **Missing** | **Missing** | Good (server.ts:261) | Most routes | 0 tests |
| Oracle | **Missing** | Good (index.ts:42) | Good (server.ts:243) | Mixed (2 of 4 have issues) | 1 test |
| Indexer | Good (index.ts:254) | Good (implied via `main().catch`) | N/A (single loop) | Good | 0 tests |

**Recommendation:** Add missing handlers to all 3 apps in one PR. Add `node --test` tests for error paths.

### Theme 4: Zero TypeScript Test Coverage

| Package | Source files | Test files | Test framework | Test command works? |
|---------|-------------|------------|----------------|---------------------|
| `apps/backend` | 22 files | 0 | `node:test` (configured) | No — glob matches nothing |
| `apps/frontend` | ~45 files | 0 | None installed | N/A |
| `apps/indexer` | 4 files | 0 | `node:test` (configured) | No |
| `apps/oracle` | ~10 files | 1 | `node:test` | Yes (1 test) |
| `packages/config` | ~20 files | 0 | None | N/A |
| `apps/contracts` | ~15 Solidity | 10 `.t.sol` | Forge test | Yes (good coverage) |

**Solidity is well-tested** (10 test files including fuzz + invariant). TypeScript is **essentially untested**. The backend's `test` script in package.json runs `node --import tsx --test src/**/*.test.ts` — which matches zero files. The CI runs test on line 50 of `typescript.yml`: `pnpm --filter @axiom/backend --filter @axiom/oracle --filter @axiom/indexer --parallel test` — this is a no-op for backend and indexer.

**Recommendation:** Remove the misleading test scripts from package.json until real tests exist, OR add smoke tests (server starts, health endpoint returns 200) as a minimum bar.

---

## Agent Inventory Index

This report synthesized findings from:
- **W1-A1 through W1-A7** — Architecture, module structure, deps, domain logic, config, tech stack, docs (7 agents)
- **W2-A1 through W2-A7** — Request flows, call chains, data transformation, state management, error flows, async/side-effects, external integrations (7 agents)
- **W3-A1 through W3-A7** — Dead files, dead functions, dead classes, dead variables, dead imports, unreachable code, legacy code (7 agents)
- **W4-A7** — This agent: orphaned config analysis, deploy script audit, test coverage audit, cross-wave synthesis, fresh findings on missing da-client.env.example, dead constants, duplicate env loading, unsafe throw in oracle, committed OIDC tokens, transient scripts (1 agent)

**Total: 22 agents, 30 recommendations across 4 priority levels.**

---

*End of Wave 4-A7 Refactoring Opportunities Report.*
