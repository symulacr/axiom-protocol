#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/contracts"

forge install foundry-rs/forge-std@v1.16.1 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-git

rm -rf lib/0g-agent-nft
cp -r vendor/0g-agent-nft lib/0g-agent-nft