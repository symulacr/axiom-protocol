#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @axiom/config build

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