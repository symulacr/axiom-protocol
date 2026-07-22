#!/usr/bin/env bash
# deploy-mainnet.sh — Deploy Axiom Protocol contracts to 0G Aristotle mainnet
# Usage: ./scripts/deploy-mainnet.sh [--dry-run|--deploy|--verify-only]
#
# 0G: zero gas fees. 0.5s block time. Without --slow, forge submits all 8 CREATEs
# with pre-computed sequential nonces — mempool orders them, all confirm in ~4s.
set -euo pipefail

RPC="https://evmrpc.0g.ai"
CHAIN=16661
VERIFIER_URL="https://chainscan.0g.ai/open/api"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_prereqs() {
 local missing=false
 for var in AXIOM_DEPLOYER_PK AXIOM_TEE_SIGNER_PK AXIOM_ORACLE_ADMIN_PK \
  AXIOM_DEPLOYER_ADDRESS CHAINSCAN_API_KEY; do
  [ -z "${!var:-}" ] && echo -e "${RED}ERROR: $var not set${NC}" >&2 && missing=true
 done
 $missing && exit 1
}

preflight() {
 echo -e "${YELLOW}[preflight] Deployer: $AXIOM_DEPLOYER_ADDRESS${NC}"
 local nonce
 nonce=$(cast nonce "$AXIOM_DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null)
 echo "  Nonce: $nonce → $((nonce + 7))  (8 CREATEs)"
 local bal
 bal=$(cast balance "$AXIOM_DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null)
 echo "  Balance: $((bal / 10 ** 18)) OG  (0G has 0 gas fees — 0.1 OG minimum)"
}

dry_run_galileo() {
 echo -e "${YELLOW}[dry-run] Galileo testnet simulation...${NC}"
 echo "  RPC: https://evmrpc-testnet.0g.ai | Chain: 16602"
 AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
  AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
  AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
  AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}" \
  AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
  PAYMENT_TOKEN_ADDR="${PAYMENT_TOKEN_ADDR:-0x354CA53bAB51C0666964fa050628d8351f8A7d19}" \
  AXIOM_LEGACY=1 \
  forge script script/DeployAristotle.s.sol \
  --rpc-url "https://evmrpc-testnet.0g.ai" --chain-id 16602 \
  --verifier custom --verifier-url "https://chainscan-testnet.0g.ai/open/api" \
  --verifier-api-key "$CHAINSCAN_API_KEY"
 echo -e "${GREEN}[dry-run] Done.${NC}"
}

main() {
 check_prereqs

 case "${1:-help}" in
 --deploy)
  preflight
  echo
  echo -e "${YELLOW}Submitting 8 CREATEs (nonces $nonce..$((nonce + 7)))...${NC}"
  AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
   AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
   AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
   AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}" \
   AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
   PAYMENT_TOKEN_ADDR="${PAYMENT_TOKEN_ADDR:-0x1f3AA82227281cA364bFb3d253B0f1af1Da6473E}" \
   forge script script/DeployAristotle.s.sol \
   --rpc-url "$RPC" --chain-id "$CHAIN" --broadcast
  echo
  echo -e "${GREEN}Deploy broadcast complete.${NC}"
  echo -e "${YELLOW}Verify: export addresses then $0 --verify-only${NC}"
  ;;
 --verify-only)
  : "${VERIFIER_PROXY:?}${NFT_PROXY:?}${VAULT_PROXY:?}${PROCESSOR_PROXY:?}"
  echo -e "${YELLOW}Verifying 4 contracts in parallel...${NC}"
  vfy() { forge verify-contract --chain-id "$CHAIN" --num-of-optimizations 300 \
   --compiler-version "v0.8.20" --verifier custom \
   --verifier-url "$VERIFIER_URL" --verifier-api-key "$CHAINSCAN_API_KEY" \
   --watch "$1" "$2:$3"; }
  vfy "$VERIFIER_PROXY" "src/verifiers/AxiomTeeVerifier.sol" AxiomTeeVerifier &
  vfy "$NFT_PROXY" "src/AxiomAgentNFT.sol" AxiomAgentNFT &
  vfy "$VAULT_PROXY" "src/AxiomStrategyVault.sol" AxiomStrategyVault &
  vfy "$PROCESSOR_PROXY" "src/AxiomPaymentProcessor.sol" AxiomPaymentProcessor &
  wait
  echo -e "${GREEN}All submitted.${NC}"
  ;;
 --dry-run)
  dry_run_galileo
  ;;
 *)
  echo "Usage: $0 [--deploy|--dry-run|--verify-only]"
  echo "  --deploy       Deploy 8 contracts (~4s)"
  echo "  --dry-run      Simulate on Galileo"
  echo "  --verify-only  Verify (set VERIFIER_PROXY NFT_PROXY VAULT_PROXY PROCESSOR_PROXY)"
  echo "Req: AXIOM_DEPLOYER_PK, AXIOM_TEE_SIGNER_PK, AXIOM_ORACLE_ADMIN_PK,"
  echo "     AXIOM_DEPLOYER_ADDRESS, CHAINSCAN_API_KEY"
  ;;
 esac
}

main "$@"
