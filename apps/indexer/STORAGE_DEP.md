# Storage SDK Migration — COMPLETE

The package `@0gfoundation/0g-ts-sdk` has been renamed to `@0gfoundation/0g-storage-ts-sdk`.

## Verification
- `@0gfoundation/0g-ts-sdk` removed from `apps/indexer/package.json` (was a dead dependency — no source imports)
- Indexer uses no `0gfoundation` packages — the dependency was a hoisting artifact
- Storage is handled via gRPC (DA) and direct HTTP (indexer API), not the SDK
- Typecheck passes
