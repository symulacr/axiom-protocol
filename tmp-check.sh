#!/bin/bash
cd /home/eya/og
echo "=== Check if @axiom/config in frontend node_modules is symlink ==="
ls -la apps/frontend/node_modules/@axiom/config 2>&1
echo ""
echo "=== real path ==="
realpath apps/frontend/node_modules/@axiom/config 2>&1
echo ""
echo "=== Check in node_modules/.pnpm ==="
ls -la apps/frontend/node_modules/.pnpm/@axiom*/node_modules/@axiom/config 2>&1 || echo "Not found in .pnpm"
echo ""
echo "=== packages/config src stats ==="
stat --format='%Y %y %n' packages/config/src/*.ts | sort
echo ""
echo "=== packages/config dist stats ==="
stat --format='%Y %y %n' packages/config/dist/*.js | sort
