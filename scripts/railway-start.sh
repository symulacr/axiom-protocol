#!/usr/bin/env bash
set -euo pipefail

case "${RAILWAY_SERVICE_NAME:-backend}" in
  indexer)
    exec node apps/indexer/dist/index.js
    ;;
  oracle)
    exec node apps/oracle/dist/index.js
    ;;
  backend|*)
    exec node apps/backend/dist/index.js
    ;;
esac