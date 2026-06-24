# Axiom Protocol — Makefile
# Canonical commands. Each command is idempotent and safe to re-run.

.PHONY: help install build test typecheck lint format clean \
        contracts-build contracts-test contracts-coverage contracts-deploy-galileo \
        contracts-verify-galileo contracts-deploy-mainnet contracts-verify-mainnet \
        oracle-test backend-test backend-run-e2e frontend-build \
        dev-up dev-down logs

# Default: show help
help:
	@echo "Axiom Protocol — canonical commands"
	@echo ""
	@echo "Workspace setup:"
	@echo "  make install        - Install all workspace dependencies (pnpm i)"
	@echo "  make build          - Build all workspaces"
	@echo "  make test           - Run all tests"
	@echo "  make typecheck      - Run TypeScript typecheck across all workspaces"
	@echo "  make lint           - Run ESLint + Solhint + markdownlint"
	@echo "  make format         - Run Prettier write"
	@echo "  make clean          - Remove all build outputs"
	@echo ""
	@echo "Contracts (apps/contracts):"
	@echo "  make contracts-build        - forge build"
	@echo "  make contracts-test         - forge test -vvv"
	@echo "  make contracts-coverage     - forge coverage"
	@echo "  make contracts-deploy-galileo  - Deploy to 0G Galileo testnet"
	@echo "  make contracts-verify-galileo  - Verify on Galileo Etherscan"
	@echo "  make contracts-deploy-mainnet   - Deploy to 0G Aristotle mainnet"
	@echo "  make contracts-verify-mainnet   - Verify on mainnet Etherscan"
	@echo ""
	@echo "Oracle (apps/oracle):"
	@echo "  make oracle-test    - Run TEE signer tests"
	@echo ""
	@echo "Backend (apps/backend):"
	@echo "  make backend-test   - Run backend tests"
	@echo "  make backend-run-e2e  - Run end-to-end CLI on Galileo"
	@echo ""
	@echo "Frontend (apps/frontend):"
	@echo "  make frontend-build - Vite production build"
	@echo ""
	@echo "Local dev (Docker Compose):"
	@echo "  make dev-up         - Start oracle + backend + indexer"
	@echo "  make dev-down       - Stop local dev stack"
	@echo "  make logs           - Tail logs from local dev stack"

# ────────────────────────────────────────────────────────────
# Workspace-wide
# ────────────────────────────────────────────────────────────

install:
	pnpm i

build:
	pnpm -r run build

test:
	pnpm -r run test

typecheck:
	pnpm -r run typecheck

lint:
	pnpm -r run lint

format:
	pnpm run format

clean:
	pnpm run clean

# ────────────────────────────────────────────────────────────
# Contracts
# ────────────────────────────────────────────────────────────

contracts-build:
	cd apps/contracts && forge build

contracts-test:
	cd apps/contracts && forge test -vvv

contracts-coverage:
	cd apps/contracts && forge coverage

contracts-deploy-galileo:
	cd apps/contracts && forge script script/Deploy.s.sol --rpc-url $${OG_RPC_URL:-https://evmrpc-testnet.0g.ai} --broadcast --slow

contracts-verify-galileo:
	cd apps/contracts && npx hardhat verify --network galileo

contracts-deploy-mainnet:
	cd apps/contracts && forge script script/Deploy.s.sol --rpc-url $${OG_RPC_URL:-https://evmrpc.0g.ai} --broadcast --slow

contracts-verify-mainnet:
	cd apps/contracts && npx hardhat verify --network mainnet

# ────────────────────────────────────────────────────────────
# Oracle
# ────────────────────────────────────────────────────────────

oracle-test:
	cd apps/oracle && pnpm test

# ────────────────────────────────────────────────────────────
# Backend
# ────────────────────────────────────────────────────────────

backend-test:
	cd apps/backend && pnpm test

backend-run-e2e:
	cd apps/backend && pnpm run-e2e -- --network $${OG_NETWORK:-galileo} --verbose

# ────────────────────────────────────────────────────────────
# Frontend
# ────────────────────────────────────────────────────────────

frontend-build:
	cd apps/frontend && pnpm build

# ────────────────────────────────────────────────────────────
# Local dev
# ────────────────────────────────────────────────────────────

dev-up:
	docker compose -f apps/indexer/docker-compose.yml --env-file .env up -d

dev-down:
	docker compose -f apps/indexer/docker-compose.yml down

logs:
	docker compose -f apps/indexer/docker-compose.yml logs -f --tail=100
