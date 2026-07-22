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

CAST=/home/eya/.foundry/bin/cast
FORGE=/home/eya/.foundry/bin/forge

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/apps/contracts"
WALLETS_DIR="$REPO_ROOT/wallets"

# Key source tracking: var_name -> "description (source)"
declare -A KEY_SOURCE

# Load a wallet key: first from env var, fallback to wallet file
load_wallet_key() {
 local var_name="$1"
 local wallet_file="$2"
 local label="$3"

 if [ -n "${!var_name:-}" ]; then
  KEY_SOURCE["$var_name"]="$label (environment variable)"
  return
 fi

 if [ -f "$wallet_file" ]; then
  local pk
  pk=$(jq -r '.[0].private_key // empty' "$wallet_file")
  if [ -n "$pk" ]; then
   printf -v "$var_name" "%s" "$pk"
   KEY_SOURCE["$var_name"]="$label (wallet file: $wallet_file)"
   return
  fi
 fi

 # Still not set — will be caught by check_prereqs
 :
}

check_prereqs() {
 local missing=false

 # 1. Auto-detect wallets from disk
 load_wallet_key AXIOM_DEPLOYER_PK "$WALLETS_DIR/deployer.json" "Deployer"
 load_wallet_key AXIOM_TEE_SIGNER_PK "$WALLETS_DIR/tee-signer.json" "TEE Signer"
 load_wallet_key AXIOM_ORACLE_ADMIN_PK "$WALLETS_DIR/oracle-admin.json" "Oracle Admin"

 # 2. Validate required vars
 for var in AXIOM_DEPLOYER_PK AXIOM_TEE_SIGNER_PK AXIOM_ORACLE_ADMIN_PK \
  CHAINSCAN_API_KEY; do
  if [ -z "${!var:-}" ]; then
   echo -e "${RED}ERROR: $var not set${NC}" >&2
   missing=true
  fi
 done

 # 3. Auto-derive AXIOM_DEPLOYER_ADDRESS from deployer PK if not set
 if [ -z "${AXIOM_DEPLOYER_ADDRESS:-}" ] && [ -n "${AXIOM_DEPLOYER_PK:-}" ]; then
  AXIOM_DEPLOYER_ADDRESS=$($CAST wallet address --private-key "$AXIOM_DEPLOYER_PK")
  echo -e "${YELLOW}[auto] Derived AXIOM_DEPLOYER_ADDRESS=$AXIOM_DEPLOYER_ADDRESS from deployer PK${NC}"
 fi

 # 4. Auto-set AXIOM_DEPLOY_DATE
 AXIOM_DEPLOY_DATE="${AXIOM_DEPLOY_DATE:-$(date +%Y-%m-%d)}"

 if $missing; then
  exit 1
 fi

 # Print key sources
 echo -e "${GREEN}Key sources:${NC}"
 for var in AXIOM_DEPLOYER_PK AXIOM_TEE_SIGNER_PK AXIOM_ORACLE_ADMIN_PK; do
  printf "  %-30s → %s\n" "$var" "${KEY_SOURCE[$var]:-unknown}"
 done
 if [ -n "${KEY_SOURCE[AXIOM_DEPLOYER_ADDRESS]:-}" ]; then
  printf "  %-30s → %s\n" "AXIOM_DEPLOYER_ADDRESS" "${KEY_SOURCE[AXIOM_DEPLOYER_ADDRESS]}"
 else
  printf "  %-30s → %s\n" "AXIOM_DEPLOYER_ADDRESS" "auto-derived from deployer PK"
 fi
 echo "  AXIOM_DEPLOY_DATE=$AXIOM_DEPLOY_DATE"
}

# Auto-detect PAYMENT_TOKEN_ADDR from latest deploy record
auto_payment_token() {
 if [ -n "${PAYMENT_TOKEN_ADDR:-}" ]; then
  echo -e "${YELLOW}[payment] PAYMENT_TOKEN_ADDR from env: $PAYMENT_TOKEN_ADDR${NC}"
  return
 fi
 local latest
 latest=$(find "$REPO_ROOT/docs/deployments" -maxdepth 1 -name 'aristotle-*.json' 2>/dev/null | sort -r | head -1) || true
 if [ -n "$latest" ] && [ -f "$latest" ]; then
  PAYMENT_TOKEN_ADDR=$(jq -r '.paymentToken // empty' "$latest")
  if [ -n "$PAYMENT_TOKEN_ADDR" ]; then
   echo -e "${YELLOW}[payment] PAYMENT_TOKEN_ADDR from $latest: $PAYMENT_TOKEN_ADDR${NC}"
   return
  fi
 fi
 # Fallback: MockUSDC from the existing deployment
 PAYMENT_TOKEN_ADDR="0x1f3AA82227281cA364bFb3d253B0f1af1Da6473E"
 echo -e "${YELLOW}[payment] Using default PAYMENT_TOKEN_ADDR: $PAYMENT_TOKEN_ADDR${NC}"
}

preflight() {
 echo -e "${YELLOW}[preflight] Deployer: $AXIOM_DEPLOYER_ADDRESS${NC}"
 local nonce
 nonce=$($CAST nonce "$AXIOM_DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null)
 echo "  Nonce: $nonce → $((nonce + 7))  (8 CREATEs)"
 local bal
 bal=$($CAST balance "$AXIOM_DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null)
 echo "  Balance: $((bal / 10 ** 18)) OG  (0G has 0 gas fees — 0.1 OG minimum)"
}

# Run precompile if available
auto_precompile() {
 local script="$CONTRACTS_DIR/scripts/precompile-artifacts.sh"
 if [ -f "$script" ]; then
  echo -e "${YELLOW}[precompile] Running $script...${NC}"
  (cd "$CONTRACTS_DIR" && bash "$script")
 fi
}

# Run ABI generation if available
auto_generate_abis() {
 local script="$CONTRACTS_DIR/scripts/generate-abis.sh"
 if [ -f "$script" ]; then
  echo -e "${YELLOW}[abi] Generating TypeScript ABIs...${NC}"
  (cd "$CONTRACTS_DIR" && bash "$script")
 fi
}

# Parse broadcast output and write deploy records
post_deploy() {
 local broadcast_file="$CONTRACTS_DIR/broadcast/DeployAristotle.s.sol/16661/run-latest.json"

 if [ ! -f "$broadcast_file" ]; then
  echo -e "${RED}ERROR: Broadcast output not found at $broadcast_file${NC}" >&2
  return 1
 fi

 # Extract addresses from broadcast transactions
 local tee_verifier nft_impl nft_proxy vault processor

 tee_verifier=$(jq -r '.transactions[] | select(.contractName=="AxiomTeeVerifier") | .contractAddress' "$broadcast_file")
 nft_impl=$(jq -r '.transactions[] | select(.contractName=="AxiomAgentNFT") | .contractAddress' "$broadcast_file")
 nft_proxy=$(jq -r '.transactions[] | select(.contractName=="ERC1967Proxy") | .contractAddress' "$broadcast_file")
 vault=$(jq -r '.transactions[] | select(.contractName=="AxiomStrategyVault") | .contractAddress' "$broadcast_file")
 processor=$(jq -r '.transactions[] | select(.contractName=="AxiomPaymentProcessor") | .contractAddress' "$broadcast_file")

 # Validate all addresses were found
 if [ -z "$tee_verifier" ] || [ -z "$nft_impl" ] || [ -z "$nft_proxy" ] ||
  [ -z "$vault" ] || [ -z "$processor" ]; then
  echo -e "${RED}ERROR: Failed to extract one or more contract addresses from broadcast${NC}" >&2
  echo "  tee_verifier=$tee_verifier nft_impl=$nft_impl nft_proxy=$nft_proxy vault=$vault processor=$processor" >&2
  return 1
 fi

 # Derive teeSigner and oracleAdmin addresses from their PKs
 local tee_signer_addr oracle_admin_addr
 tee_signer_addr=$($CAST wallet address --private-key "$AXIOM_TEE_SIGNER_PK")
 oracle_admin_addr=$($CAST wallet address --private-key "$AXIOM_ORACLE_ADMIN_PK")

 local date_str="$AXIOM_DEPLOY_DATE"

 # Write deploy record to docs/deployments/
 local deploy_dir="$REPO_ROOT/docs/deployments"
 mkdir -p "$deploy_dir"
 local record_file="$deploy_dir/aristotle-$date_str.json"

 cat >"$record_file" <<ENDJSON
{
  "network": "0G Aristotle mainnet",
  "chainId": $CHAIN,
  "rpc": "$RPC",
  "explorer": "https://chainscan.0g.ai",
  "storageIndexer": "https://indexer-storage-turbo.0g.ai",
  "flowContract": "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  "deployedAt": "${date_str}T00:00:00Z",
  "deployedAtUnix": $(date +%s),
  "teeSigner": "$tee_signer_addr",
  "oracleAdmin": "$oracle_admin_addr",
  "paymentToken": "$PAYMENT_TOKEN_ADDR",
  "contracts": {
    "AxiomTeeVerifier":         "$tee_verifier",
    "AxiomAgentNFT (proxy)":    "$nft_proxy",
    "AxiomAgentNFT (impl)":     "$nft_impl",
    "AxiomStrategyVault":       "$vault",
    "AxiomPaymentProcessor":    "$processor"
  }
}
ENDJSON

 echo -e "${GREEN}[deploy] Written deploy record: $record_file${NC}"

 # Write config/deployed.json (create if not exists)
 local config_dir="$REPO_ROOT/packages/config"
 local deployed_file="$config_dir/deployed.json"

 mkdir -p "$config_dir"

 cat >"$deployed_file" <<ENDJSON
{
  "teeVerifier":      "$tee_verifier",
  "agentNft":         "$nft_proxy",
  "nftImpl":          "$nft_impl",
  "strategyVault":    "$vault",
  "paymentProcessor": "$processor",
  "paymentToken":     "$PAYMENT_TOKEN_ADDR"
}
ENDJSON

 echo -e "${GREEN}[deploy] Written config addresses: $deployed_file${NC}"
}

# Print deploy summary
print_summary() {
 local broadcast_file="$CONTRACTS_DIR/broadcast/DeployAristotle.s.sol/16661/run-latest.json"

 if [ ! -f "$broadcast_file" ]; then
  echo -e "${YELLOW}Summary not available — broadcast file not found.${NC}"
  return
 fi

 local tee_verifier nft_impl nft_proxy vault processor
 tee_verifier=$(jq -r '.transactions[] | select(.contractName=="AxiomTeeVerifier") | .contractAddress' "$broadcast_file")
 nft_impl=$(jq -r '.transactions[] | select(.contractName=="AxiomAgentNFT") | .contractAddress' "$broadcast_file")
 nft_proxy=$(jq -r '.transactions[] | select(.contractName=="ERC1967Proxy") | .contractAddress' "$broadcast_file")
 vault=$(jq -r '.transactions[] | select(.contractName=="AxiomStrategyVault") | .contractAddress' "$broadcast_file")
 processor=$(jq -r '.transactions[] | select(.contractName=="AxiomPaymentProcessor") | .contractAddress' "$broadcast_file")

 echo
 echo -e "${GREEN}================================================================================${NC}"
 echo -e "${GREEN} Deploy Summary — $AXIOM_DEPLOY_DATE${NC}"
 echo -e "${GREEN}--------------------------------------------------------------------------------${NC}"
 echo -e " AxiomTeeVerifier:      $tee_verifier"
 echo -e "  Explorer: https://chainscan.0g.ai/address/$tee_verifier"
 echo -e " AxiomAgentNFT (proxy): $nft_proxy"
 echo -e "  Explorer: https://chainscan.0g.ai/address/$nft_proxy"
 echo -e " AxiomAgentNFT (impl):  $nft_impl"
 echo -e "  Explorer: https://chainscan.0g.ai/address/$nft_impl"
 echo -e " AxiomStrategyVault:    $vault"
 echo -e "  Explorer: https://chainscan.0g.ai/address/$vault"
 echo -e " AxiomPaymentProcessor: $processor"
 echo -e "  Explorer: https://chainscan.0g.ai/address/$processor"
 echo -e "${GREEN}--------------------------------------------------------------------------------${NC}"
 echo -e " Verify:"
 echo -e "  VERIFIER_PROXY=$tee_verifier \\"
 echo -e "  NFT_PROXY=$nft_proxy \\"
 echo -e "  VAULT_PROXY=$vault \\"
 echo -e "  PROCESSOR_PROXY=$processor \\"
 echo -e "  $0 --verify-only"
 echo -e "${GREEN}================================================================================${NC}"
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
  $FORGE script "$CONTRACTS_DIR/script/DeployAristotle.s.sol" \
  --root "$CONTRACTS_DIR" \
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

  # Auto-detect payment token from latest deploy record
  auto_payment_token

  # Pre-deploy: run precompile artifacts
  auto_precompile

  local nonce
  nonce=$($CAST nonce "$AXIOM_DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null)
  echo
  echo -e "${YELLOW}Submitting 8 CREATEs (nonces $nonce..$((nonce + 7)))...${NC}"

  # Confirmation prompt
  echo
  echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  About to deploy to 0G Aristotle mainnet (chain $CHAIN)         ║${NC}"
  echo -e "${RED}║  Deployer: $AXIOM_DEPLOYER_ADDRESS${NC}"
  echo -e "${RED}║  Payment token: $PAYMENT_TOKEN_ADDR${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
  read -r -p "Confirm? [y/N] " response
  case "$response" in
  [yY][eE][sS] | [yY]) ;;
  *)
   echo "Aborted."
   exit 1
   ;;
  esac

  # Actual deploy
  AXIOM_DEPLOYER_PK="$AXIOM_DEPLOYER_PK" \
   AXIOM_TEE_SIGNER_PK="$AXIOM_TEE_SIGNER_PK" \
   AXIOM_ORACLE_ADMIN_PK="$AXIOM_ORACLE_ADMIN_PK" \
   AXIOM_DEPLOY_DATE="$AXIOM_DEPLOY_DATE" \
   AXIOM_DEPLOYER_ADDRESS="$AXIOM_DEPLOYER_ADDRESS" \
   PAYMENT_TOKEN_ADDR="$PAYMENT_TOKEN_ADDR" \
   $FORGE script "$CONTRACTS_DIR/script/DeployAristotle.s.sol" \
   --root "$CONTRACTS_DIR" \
   --rpc-url "$RPC" --chain-id "$CHAIN" --broadcast
  echo
  echo -e "${GREEN}Deploy broadcast complete.${NC}"

  # Post-deploy: write deploy records
  post_deploy

  # Post-deploy: auto-run ABI generation
  auto_generate_abis

  # Print summary
  print_summary
  ;;
 --verify-only)
  : "${VERIFIER_PROXY:?}${NFT_PROXY:?}${VAULT_PROXY:?}${PROCESSOR_PROXY:?}"
  echo -e "${YELLOW}Verifying 4 contracts in parallel...${NC}"
  vfy() { $FORGE verify-contract --chain-id "$CHAIN" --num-of-optimizations 300 \
   --compiler-version "v0.8.20" --verifier custom \
   --verifier-url "$VERIFIER_URL" --verifier-api-key "$CHAINSCAN_API_KEY" \
   --root "$CONTRACTS_DIR" \
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
  echo "     CHAINSCAN_API_KEY"
  echo "     (wallet files in wallets/*.json used as fallback for PKs)"
  ;;
 esac
}

main "$@"
