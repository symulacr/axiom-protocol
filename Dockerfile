# ──────────────────────────────────────────────────────────
# Stage 1 — Foundry pre-compilation
# Compiles Solidity contracts and extracts ABIs / storage layouts.
# No forge binary leaks into the runtime image.
# ──────────────────────────────────────────────────────────
FROM ghcr.io/foundry-rs/foundry:latest AS foundry-builder

COPY apps/contracts/ /build/
WORKDIR /build

# Install OpenZeppelin + forge-std + 0g-agent-nft dependencies
RUN forge install foundry-rs/forge-std@v1.16.1 --no-git \
    && forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git \
    && forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-git \
    && forge install 0glabs/0g-agent-nft --no-git

# Compile all contracts
RUN forge build --out /artifacts

# Extract storage layouts for the two primary contracts
RUN forge inspect AxiomAgentNFT storage-layout --json \
        > /artifacts/AxiomAgentNFT.storage-layout.json \
    && forge inspect AxiomStrategyVault storage-layout --json \
        > /artifacts/AxiomStrategyVault.storage-layout.json

# ──────────────────────────────────────────────────────────
# Stage 2 — Node.js build
# Installs workspace deps, compiles TypeScript.
# ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

# Copy workspace manifests for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json    apps/backend/package.json
COPY apps/oracle/package.json     apps/oracle/package.json
COPY apps/frontend/package.json   apps/frontend/package.json
COPY packages/chat-runtime/package.json  packages/chat-runtime/package.json
COPY packages/config/package.json        packages/config/package.json

RUN pnpm install --frozen-lockfile

# Copy source for packages that the backend build depends on
COPY packages/config/         packages/config/
COPY packages/chat-runtime/   packages/chat-runtime/
COPY apps/backend/            apps/backend/

# Build in dependency order (mirrors railway-build.sh)
RUN pnpm --filter @axiom/config build \
    && pnpm --filter @axiom/chat-runtime build \
    && pnpm --filter @axiom/backend build

# ──────────────────────────────────────────────────────────
# Stage 3 — Runtime (minimal, no build tools)
# ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json    apps/backend/package.json
COPY packages/chat-runtime/package.json  packages/chat-runtime/package.json
COPY packages/config/package.json        packages/config/package.json

RUN pnpm install --frozen-lockfile --prod

# Pre-compiled contract artifacts (ABIs + storage layouts) — no forge binary
COPY --from=foundry-builder /artifacts/ /app/apps/contracts/artifacts/

# Compiled JS output
COPY --from=builder /app/apps/backend/dist/   /app/apps/backend/dist/
COPY --from=builder /app/packages/config/dist/ /app/packages/config/dist/
COPY --from=builder /app/packages/chat-runtime/dist/ /app/packages/chat-runtime/dist/

# Runtime source needed at execution time (orchestrator spawns, config lookups)
COPY packages/config/src/          packages/config/src/
COPY packages/chat-runtime/src/    packages/chat-runtime/src/
COPY apps/backend/src/             apps/backend/src/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/backend/dist/index.js"]
