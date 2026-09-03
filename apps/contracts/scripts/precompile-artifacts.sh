#!/usr/bin/env bash
set -euo pipefail

# Pre-compile Foundry artifacts (ABIs + storage layouts) for the four primary contracts.
# Run locally or in CI. Outputs land in apps/contracts/artifacts/ and are git-committed
# or volume-mounted — never built inside Docker.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
ARTIFACTS_DIR="$CONTRACTS_DIR/artifacts"

cd "$CONTRACTS_DIR"

# Ensure dependencies are present (idempotent)
if [ ! -d lib/forge-std ]; then
  forge install foundry-rs/forge-std@v1.16.1 --no-git
  forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
  forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-git
  forge install 0glabs/0g-agent-nft@b86e108a49bf3601bf57f1f0b3166dce2cb15928 --no-git
fi

# Compile
forge build

# Clean output
rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/abi" "$ARTIFACTS_DIR/storage-layout"

CONTRACTS=(
  AxiomAgentNFT
  AxiomStrategyVault
  AxiomPaymentProcessor
  AxiomTeeVerifier
)

for name in "${CONTRACTS[@]}"; do
  forge inspect "$name" abi --json >"$ARTIFACTS_DIR/abi/$name.json"
  forge inspect "$name" storage-layout --json >"$ARTIFACTS_DIR/storage-layout/$name.json"
done

echo "✓ Artifacts written to $ARTIFACTS_DIR"
ls -lR "$ARTIFACTS_DIR"
