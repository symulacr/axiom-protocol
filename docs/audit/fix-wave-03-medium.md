# Wave F3: Medium Priority Fixes — Closure Report

**Date:** 2026-06-28  
**Status:** 8/8 completed | Build: ✅ passes

---

| ID | Task | File(s) | Status |
|---|---|---|---|
| **F3-A1** | Consolidate address resolution to single source | `packages/config/src/addresses.ts`, `apps/backend/src/index.ts` | ✅ Done |
| **F3-A2** | Centralize event definitions | `apps/indexer/src/watcher.ts` (-51 lines) | ✅ Done |
| **F3-A3** | Oracle structured logging | `apps/oracle/src/server.ts` (6 console.log→JSON) | ✅ Done |
| **F3-A4** | Remove omnichron from deps | 2 package.json + lockfile | ✅ Done |
| **F3-A5** | OG→AXIOM env rename | `packages/config/src/env-schema.ts` | ✅ Done |
| **F3-A6** | Clean 8 tmp scripts from root | Root directory | ✅ Done |
| **F3-A7** | Remove 17 dead constants/variables | constants.ts, networks.ts, addresses.ts, 0g.ts | ✅ Done |
| **F3-A8** | Remove 3 dead barrel re-exports | `packages/config/src/abis/index.ts` | ✅ Done |

**Lines removed:** 411 total across 16 files.

## Verified
- `pnpm build` — passes cleanly
- All dead code removals proven via import tracing before deletion
