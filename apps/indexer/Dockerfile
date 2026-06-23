# Multi-stage Node 22 build for the Axiom on-chain event indexer.
#
# Build context is the repo root (./) so that `../../tsconfig.base.json`
# in the extended config chain resolves correctly.
#
# Stage 1: install deps + compile TypeScript
# Stage 2: runtime image (only built artifacts + production deps)

FROM node:22-alpine AS builder

WORKDIR /build

# Copy dependency manifests and base tsconfig so that
# `extends: "../../tsconfig.base.json"` resolves to /tsconfig.base.json
COPY apps/indexer/package.json apps/indexer/tsconfig.json ./
COPY tsconfig.base.json /

RUN npm install --legacy-peer-deps

# Copy source, vendored proto
COPY apps/indexer/src/ src/
RUN npm run build

# ────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only the compiled output, node_modules, and the proto file
COPY --from=builder /build/dist/ dist/
COPY --from=builder /build/node_modules/ node_modules/
COPY --from=builder /build/src/disperser.proto dist/disperser.proto

# The indexer polls 0G Galileo testnet and prints one JSON event per
# line to stdout.  Stderr is reserved for structured operational logs.
CMD ["node", "dist/index.js"]
