#!/bin/bash
set -e
echo "=== packages/config/src/ timestamps ==="
ls -la /home/eya/og/packages/config/src/env.ts
echo ""
echo "=== packages/config/dist/ timestamps ==="
ls -la /home/eya/og/packages/config/dist/env.js
ls -la /home/eya/og/packages/config/dist/env.js.map
echo ""
echo "=== packages/config/src/ all ==="
ls -la /home/eya/og/packages/config/src/*.ts
echo ""
echo "=== packages/config/dist/ all js ==="
ls -la /home/eya/og/packages/config/dist/*.js
echo ""
echo "=== frontend node_modules symlink ==="
ls -la /home/eya/og/apps/frontend/node_modules/@axiom/config
readlink -f /home/eya/og/apps/frontend/node_modules/@axiom/config
