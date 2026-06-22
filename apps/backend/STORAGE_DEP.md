# Storage SDK Migration — COMPLETE

The package `@0gfoundation/0g-ts-sdk` has been renamed to `@0gfoundation/0g-storage-ts-sdk`.

## Verification
- `@0gfoundation/0g-ts-sdk` removed from `apps/indexer/package.json` (was a dead dependency — no source imports)
- `apps/backend/src/storage/0g.ts` imports updated to `@0gfoundation/0g-storage-ts-sdk`
- `apps/backend/src/storage/merkle.ts` imports updated accordingly
- `apps/backend/test/storage/merkle.test.ts` imports updated
- Backend `package.json` updated with explicit `@0gfoundation/0g-storage-ts-sdk` dependency
- Typecheck passes across all apps
- No breaking API changes detected
