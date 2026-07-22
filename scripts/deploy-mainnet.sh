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

# ─── deploy ────────────────────────────────────────────
run_deploy() {
 local mode_flags="$1"
 local verify_flag="${2:-}"

 echo -e "${YELLOW}[deploy] Submitting all 8 CREATEs...${NC}"
 echo -e "${YELLOW}  0G has 0 gwei gas + 0.5s block time — confirm in ~4s${NC}"
 AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
  AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
  AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
  AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}" \
  AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
  PAYMENT_TOKEN_ADDR="${PAYMENT_TOKEN_ADDR:-0x1f3AA82227281cA364bFb3d253B0f1af1Da6473E}" \
  forge script script/DeployAristotle.s.sol \
  --rpc-url "$RPC_URL" \
  --chain-id "$CHAIN_ID" \
  $mode_flags \
  $verify_flag \
  --verifier custom \
  --verifier-url "$VERIFIER_URL" \
  --verifier-api-key "$CHAINSCAN_API_KEY"
}

# ─── verify all (parallel) ─────────────────────────────
verify_all() {
 echo -e "${YELLOW}Verifying all contracts in parallel...${NC}"

 : "${VERIFIER_PROXY:?Must set VERIFIER_PROXY}"
 : "${NFT_PROXY:?Must set NFT_PROXY}"
 : "${VAULT_PROXY:?Must set VAULT_PROXY}"
 : "${PROCESSOR_PROXY:?Must set PROCESSOR_PROXY}"

 verify_one() {
  local addr=$1 file=$2 contract=$3
  forge verify-contract \
   --chain-id "$CHAIN_ID" \
   --num-of-optimizations 300 \
   --compiler-version "v0.8.20" \
   --verifier custom \
   --verifier-url "$VERIFIER_URL" \
   --verifier-api-key "$CHAINSCAN_API_KEY" \
   --watch "$addr" "$file:$contract"
 }

 # Run 4 verifications in parallel — they're independent HTTP POSTs
 verify_one "$VERIFIER_PROXY" "src/verifiers/AxiomTeeVerifier.sol" AxiomTeeVerifier &
 verify_one "$NFT_PROXY" "src/AxiomAgentNFT.sol" AxiomAgentNFT &
 verify_one "$VAULT_PROXY" "src/AxiomStrategyVault.sol" AxiomStrategyVault &
 verify_one "$PROCESSOR_PROXY" "src/AxiomPaymentProcessor.sol" AxiomPaymentProcessor &
 wait

 echo -e "${GREEN}All verifications submitted.${NC}"
}

# ─── dry-run on Galileo ────────────────────────────────
dry_run_galileo() {
 echo -e "${YELLOW}[dry-run] Testing against Galileo testnet...${NC}"
 echo "  RPC: https://evmrpc-testnet.0g.ai | Chain: 16602"
 echo "  Note: 0G has 0 gas fees. Balance check is 0.1 OG minimum."

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

 echo -e "${GREEN}[dry-run] Simulation complete. Review output above.${NC}"
}

# ─── main ──────────────────────────────────────────────
main() {
 check_prereqs

 case "${1:-help}" in
 --dry-run)
  dry_run_galileo
  ;;
 --deploy)
  echo -e "${YELLOW}Step 1: Deploying to Aristotle mainnet (8 txns, ~4s)...${NC}"
  run_deploy "--broadcast"
  echo -e "${GREEN}Deploy complete. Now verifying...${NC}"
  echo -e "${YELLOW}Step 2: Set VERIFIER_PROXY NFT_PROXY VAULT_PROXY PROCESSOR_PROXY from broadcast output${NC}"
  echo -e "${YELLOW}      then run: $0 --verify-only${NC}"
  ;;
 --deploy-slow)
  echo -e "${YELLOW}Deploying with --slow (safe mode, ~60s)...${NC}"
  run_deploy "--broadcast --slow" "--verify"
  echo -e "${GREEN}Deploy + verify complete.${NC}"
  ;;
 --resume)
  echo -e "${YELLOW}Resuming failed deploy...${NC}"
  run_deploy "--broadcast --resume"
  ;;
 --verify-only)
  verify_all
  ;;
 *)
  echo "Usage: $0 [--dry-run|--deploy|--deploy-slow|--resume|--verify-only]"
  echo ""
  echo "  --deploy        Fast mode: all 8 txns submitted at once (~4s)"
  echo "  --deploy-slow   Safe mode: 1 txn at a time with --slow (~60s)"
  echo "  --dry-run       Simulate on Galileo testnet (no broadcast)"
  echo "  --resume        Resume failed deploy"
  echo "  --verify-only   Verify already-deployed contracts (requires PROXY vars)"
  echo ""
  echo "0G Chain: 0 gwei gas. 0.5s block time. 8 CREATEs fit in 1-2 blocks."
  echo "Required env: AXIOM_DEPLOYER_PK, AXIOM_TEE_SIGNER_PK,"
  echo "              AXIOM_ORACLE_ADMIN_PK, AXIOM_DEPLOYER_ADDRESS, CHAINSCAN_API_KEY"
  ;;
 esac
}

main "$@"
