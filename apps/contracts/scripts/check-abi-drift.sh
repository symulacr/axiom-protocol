#!/bin/bash
# CI gate: checks that generated ABIs match forge inspect output
# Exit 1 if drift detected

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/apps/contracts"
ABIS_DIR="$REPO_ROOT/packages/config/abis"

echo "Generating fresh ABIs from contracts..."
cd "$CONTRACTS_DIR"
forge inspect AxiomAgentNFT abi --json > /tmp/fresh-agentNft.json
forge inspect AxiomStrategyVault abi --json > /tmp/fresh-vault.json
forge inspect AxiomPaymentProcessor abi --json > /tmp/fresh-paymentProcessor.json
forge inspect AxiomTeeVerifier abi --json > /tmp/fresh-teeVerifier.json
forge inspect AxiomMockUSDC abi --json > /tmp/fresh-mockUsdc.json

# Compare against committed intermediate ABIs
for contract in agentNft vault paymentProcessor teeVerifier mockUsdc; do
  if ! diff -q <(jq --sort-keys . /tmp/fresh-${contract}.json) <(jq --sort-keys . "$ABIS_DIR/${contract}.json") 2>/dev/null; then
    echo "❌ ABI drift detected in ${contract}!"
    echo "   Run: cd packages/config && pnpm generate-abis && pnpm wagmi generate"
    exit 1
  fi
done

echo "✅ All ABIs match forge inspect output"
