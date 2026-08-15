#!/usr/bin/env bash
# generate-production-wallets.sh — Generate production wallet keypairs for Axiom Protocol
#
# Creates wallets/deployer.json, wallets/tee-signer.json, wallets/oracle-admin.json
# with freshly generated addresses, plus a wallets/.env file for sourcing.
#
# Usage:
#   WALLETS_DIR=/path/to/wallets ./scripts/generate-production-wallets.sh
set -euo pipefail

CAST="/home/eya/.foundry/bin/cast"
WALLETS_DIR="${WALLETS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/wallets}"

# ── Preliminaries ────────────────────────────────────────────────────────
if ! [ -x "$CAST" ]; then
  echo "ERROR: cast not found at $CAST" >&2
  echo "Install foundry: curl -L https://foundry.paradigm.xyz | bash" >&2
  exit 1
fi

mkdir -p "$WALLETS_DIR"

if [ -f "$WALLETS_DIR/deployer.json" ]; then
  echo "ERROR: $WALLETS_DIR/deployer.json already exists — refusing to overwrite." >&2
  echo "  To regenerate, delete or move the existing file first." >&2
  exit 1
fi

# ── Wallet generation ────────────────────────────────────────────────────
gen_wallet() {
  local label="$1"
  local outfile="$2"
  local output
  output=$("$CAST" wallet new)
  local addr pk
  addr=$(echo "$output" | sed -n 's/^Address:\s*\(0x[0-9a-fA-F]*\).*/\1/p')
  pk=$(echo "$output" | sed -n 's/^Private key:\s*\(0x[0-9a-fA-F]*\).*/\1/p')

  if [ -z "$addr" ] || [ -z "$pk" ]; then
    echo "ERROR: Failed to parse cast output for $label" >&2
    echo "  Output was: $output" >&2
    exit 1
  fi

  printf '[\n  {\n    "address": "%s",\n    "private_key": "%s"\n  }\n]\n' "$addr" "$pk" >"$outfile"
  chmod 600 "$outfile"

  # export for caller to capture
  echo "$addr|$pk"
}

echo "Generating 3 production keypairs..."
echo ""

deployer_out=$(gen_wallet "deployer" "$WALLETS_DIR/deployer.json")
tee_out=$(gen_wallet "tee-signer" "$WALLETS_DIR/tee-signer.json")
oracle_out=$(gen_wallet "oracle-admin" "$WALLETS_DIR/oracle-admin.json")

deployer_addr=$(echo "$deployer_out" | cut -d'|' -f1)
deployer_pk=$(echo "$deployer_out" | cut -d'|' -f2)
tee_addr=$(echo "$tee_out" | cut -d'|' -f1)
tee_pk=$(echo "$tee_out" | cut -d'|' -f2)
oracle_addr=$(echo "$oracle_out" | cut -d'|' -f1)
oracle_pk=$(echo "$oracle_out" | cut -d'|' -f2)

# ── .env file ────────────────────────────────────────────────────────────
ENV_FILE="$WALLETS_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE exists — appending new keys (manual review recommended)." >&2
fi

{
  echo "# Axiom Protocol — Production Wallets"
  echo "# Generated: $(date --iso-8601=seconds)"
  echo "# Do not commit this file."
  echo ""
  echo "export AXIOM_DEPLOYER_PK=$deployer_pk"
  echo "export AXIOM_TEE_SIGNER_PK=$tee_pk"
  echo "export AXIOM_ORACLE_ADMIN_PK=$oracle_pk"
  echo "export AXIOM_DEPLOYER_ADDRESS=$deployer_addr"
} >>"$ENV_FILE"
chmod 600 "$ENV_FILE"

echo ""
echo "====================  PRODUCTION WALLETS CREATED  ===================="
echo ""
echo "  Deployer:    $deployer_addr"
echo "  TEE Signer:  $tee_addr"
echo "  Oracle Admin: $oracle_addr"
echo ""
echo "  Key files:  $WALLETS_DIR/deployer.json"
echo "              $WALLETS_DIR/tee-signer.json"
echo "              $WALLETS_DIR/oracle-admin.json"
echo "  Env file:   $ENV_FILE"
echo ""
echo "  ┌────────────────────────────────────────────────────────────────┐"
echo "  │  REMINDER: Fund these 3 addresses from the 0G faucet before    │"
echo "  │  deploying. 0G mainnet: https://faucet.0g.ai                  │"
echo "  │  Galileo testnet: https://faucet-testnet.0g.ai                │"
echo "  └────────────────────────────────────────────────────────────────┘"
echo ""
echo "  Set PAYMENT_TOKEN_ADDR in $ENV_FILE if the default is wrong."
echo "  Source it: source $ENV_FILE"
echo ""
