# Multi-stage Node 22 build for the Axiom on-chain event indexer.
#
# Build context is the repo root (./) so that all workspace dependencies
# and the shared tsconfig.base.json resolve correctly.
#
# Standard pnpm monorepo Docker pattern:
#   1. Copy root manifests + all package.json files
#   2. Install deps (full workspace, only needed packages resolved)
#   3. Copy source for target package + workspace deps
#   4. Build with --filter
#
# Stage 1: install deps + compile TypeScript via pnpm
# Stage 2: runtime image (only built artifacts + production deps)

# ─── Stage 1: builder ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Enable corepack for pnpm (matches root packageManager field)
RUN corepack enable && corepack prepare pnpm@latest --activate

# 1. Copy root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# 2. Copy only the package.json files needed for workspace resolution
#    (pnpm resolves workspace:* from the lockfile via package names)
COPY apps/indexer/package.json apps/indexer/package.json
COPY packages/config/package.json packages/config/package.json

# 3. Install all deps (pnpm resolves workspace:* from the monorepo)
#    --frozen-lockfile ensures deterministic installs
RUN pnpm install --frozen-lockfile

# 4. Copy source for the indexer and its workspace dependency (@axiom/config)
COPY packages/config/ packages/config/
COPY apps/indexer/ apps/indexer/

# 5. Build only the indexer (its workspace deps are built transitively)
RUN pnpm --filter @axiom/indexer build

# ─── Stage 2: runtime ───────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only the compiled output, node_modules, and the vendored proto
COPY --from=builder /build/apps/indexer/dist/ dist/
COPY --from=builder /build/node_modules/ node_modules/
COPY --from=builder /build/apps/indexer/src/disperser.proto dist/disperser.proto

# The indexer polls 0G Galileo testnet and prints one JSON event per
# line to stdout.  Stderr is reserved for structured operational logs.
CMD ["node", "dist/index.js"]
