#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @axiom/config build
# Force a real recompile: nixpacks caches *.tsbuildinfo across deploys,
# so tsc --incremental skips emitting changed source.
find apps -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true

case "${RAILWAY_SERVICE_NAME:-backend}" in
  indexer)
    pnpm --filter @axiom/indexer build
    ;;
  oracle)
    pnpm --filter @axiom/oracle build
    ;;
  backend|*)
    pnpm --filter @axiom/chat-runtime build
    pnpm --filter @axiom/backend build
    ;;
esac