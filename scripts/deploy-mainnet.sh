#!/usr/bin/env bash
# deploy-mainnet.sh — Deploy Axiom Protocol contracts to 0G Aristotle mainnet
# Usage: ./scripts/deploy-mainnet.sh [--dry-run|--deploy|--resume|--verify-only]
#
# 0G Chain: zero gas fees (base fee = 0), 0.5s block time, 100M block gas limit.
# Without --slow, forge submits all 8 CREATEs with pre-computed nonces in rapid
# succession. 0G's mempool orders by nonce — all confirm in ~4s.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHAIN_ID=16661
RPC_URL="https://evmrpc.0g.ai"
VERIFIER_URL="https://chainscan.0g.ai/open/api"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── prereqs ───────────────────────────────────────────
check_prereqs() {
 local missing=false
 for var in AXIOM_DEPLOYER_PK AXIOM_TEE_SIGNER_PK AXIOM_ORACLE_ADMIN_PK \
  AXIOM_DEPLOYER_ADDRESS CHAINSCAN_API_KEY; do
  if [ -z "${!var:-}" ]; then
   echo -e "${RED}ERROR: $var is not set${NC}" >&2
   missing=true
  fi
 done
 if $missing; then
  echo "  Required: AXIOM_DEPLOYER_PK AXIOM_TEE_SIGNER_PK AXIOM_ORACLE_ADMIN_PK"
  echo "  Required: AXIOM_DEPLOYER_ADDRESS CHAINSCAN_API_KEY"
  echo "  Optional: AXIOM_DEPLOY_DATE PAYMENT_TOKEN_ADDR"
  exit 1
 fi
}

# ─── dry-run on Galileo ────────────────────────────────
dry_run_galileo() {
 echo -e "${YELLOW}[dry-run] Testing against Galileo testnet...${NC}"
 echo "  RPC: https://evmrpc-testnet.0g.ai | Chain: 16602"
 AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
  AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
  AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
  AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}" \
  AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
  PAYMENT_TOKEN_ADDR="${PAYMENT_TOKEN_ADDR:-0x354CA53bAB51C0666964fa050628d8351f8A7d19}" \
  AXIOM_LEGACY=1 \
  forge script script/DeployAristotle.s.sol \
  --rpc-url "https://evmrpc-testnet.0g.ai" \
  --chain-id 16602 \
  --verifier custom \
  --verifier-url "https://chainscan-testnet.0g.ai/open/api" \
  --verifier-api-key "$CHAINSCAN_API_KEY"
 echo -e "${GREEN}[dry-run] Simulation complete.${NC}"
}

# ─── main ──────────────────────────────────────────────
main() {
 check_prereqs

 case "${1:-help}" in
 --dry-run)
  dry_run_galileo
  ;;
 --deploy)
  echo -e "${YELLOW}[deploy] Submitting 8 CREATEs to Aristotle mainnet...${NC}"
  echo -e "${YELLOW}  0G: 0 gwei gas, 0.5s block — confirms in ~4s${NC}"
  AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
   AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
   AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
   AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}" \
   AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
   PAYMENT_TOKEN_ADDR="${PAYMENT_TOKEN_ADDR:-0x1f3AA82227281cA364bFb3d253B0f1af1Da6473E}" \
   forge script script/DeployAristotle.s.sol \
   --rpc-url "https://evmrpc.0g.ai" --chain-id 16661 --broadcast
  echo ""
  echo -e "${GREEN}Deploy broadcast complete.${NC}"
  echo -e "${YELLOW}Set proxy addresses and verify:${NC}"
  echo "  export VERIFIER_PROXY=<addr> NFT_PROXY=<addr> VAULT_PROXY=<addr> PROCESSOR_PROXY=<addr>"
  echo "  $0 --verify-only"
  ;;
 --verify-only)
  : "${VERIFIER_PROXY:?}"
  : "${NFT_PROXY:?}"
  : "${VAULT_PROXY:?}"
  : "${PROCESSOR_PROXY:?}"
  echo -e "${YELLOW}Verifying 4 contracts in parallel...${NC}"
  verify_one() {
   forge verify-contract --chain-id 16661 --num-of-optimizations 300 \
    --compiler-version "v0.8.20" --verifier custom \
    --verifier-url "https://chainscan.0g.ai/open/api" \
    --verifier-api-key "$CHAINSCAN_API_KEY" \
    --watch "$1" "$2:$3"
  }
  verify_one "$VERIFIER_PROXY" "src/verifiers/AxiomTeeVerifier.sol" AxiomTeeVerifier &
  verify_one "$NFT_PROXY" "src/AxiomAgentNFT.sol" AxiomAgentNFT &
  verify_one "$VAULT_PROXY" "src/AxiomStrategyVault.sol" AxiomStrategyVault &
  verify_one "$PROCESSOR_PROXY" "src/AxiomPaymentProcessor.sol" AxiomPaymentProcessor &
  wait
  echo -e "${GREEN}All verifications submitted.${NC}"
  ;;
 *)
  echo "Usage: $0 [--dry-run|--deploy|--verify-only]"
  echo ""
  echo "  --deploy       Deploy 8 contracts in ~4s (no --slow)"
  echo "  --dry-run      Simulate on Galileo testnet"
  echo "  --verify-only  Verify deployed contracts (requires PROXY addrs)"
  echo ""
  echo "Required: AXIOM_DEPLOYER_PK, AXIOM_TEE_SIGNER_PK,"
  echo "          AXIOM_ORACLE_ADMIN_PK, AXIOM_DEPLOYER_ADDRESS, CHAINSCAN_API_KEY"
  ;;
 esac
}

main "$@"
