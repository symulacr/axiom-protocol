#!/bin/bash
cd /home/eya/og
echo "=== @axiom/config in frontend node_modules ==="
file apps/frontend/node_modules/@axiom/config
echo "=== real path ==="
realpath apps/frontend/node_modules/@axiom/config 2>&1
echo "=== src env.ts timestamp ==="
stat --format='%Y %y %n' packages/config/src/env.ts
echo "=== dist env.js timestamp ==="
stat --format='%Y %y %n' packages/config/dist/env.js
echo "=== dist env.js.map timestamp ==="
stat --format='%Y %y %n' packages/config/dist/env.js.map
echo "=== dist networks.js timestamp ==="
stat --format='%Y %y %n' packages/config/dist/networks.js
echo "=== all config dist js sorted ==="
stat --format='%Y %y %n' packages/config/dist/*.js | sort -n
echo "=== all config src ts sorted ==="
stat --format='%Y %y %n' packages/config/src/*.ts | sort -n
