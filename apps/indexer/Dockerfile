# Multi-stage Node 22 build for the Axiom on-chain event indexer.
#
# Build context is the repo root (./) so that all workspace dependencies
# and the shared `tsconfig.base.json` resolve correctly.
#
# Stage 1: install deps + compile TypeScript via pnpm
# Stage 2: runtime image (only built artifacts + production deps)

FROM node:22-alpine AS builder

WORKDIR /build

# Enable corepack for pnpm (matches root packageManager field)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root manifests (needed for workspace:* resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy the indexer app + its workspace dependency
COPY packages/config/ packages/config/
COPY apps/indexer/ apps/indexer/

# Install all deps (pnpm resolves workspace:* from the monorepo)
RUN pnpm install --frozen-lockfile

# Build the indexer
RUN pnpm --filter @axiom/indexer build

# ────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only the compiled output, node_modules, and the vendored proto
COPY --from=builder /build/apps/indexer/dist/ dist/
COPY --from=builder /build/node_modules/ node_modules/
COPY --from=builder /build/apps/indexer/src/disperser.proto dist/disperser.proto

# The indexer polls 0G Galileo testnet and prints one JSON event per
# line to stdout.  Stderr is reserved for structured operational logs.
CMD ["node", "dist/index.js"]
