#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/contracts"

forge install foundry-rs/forge-std@v1.16.1 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-git

forge install 0glabs/0g-agent-nft@b86e108a49bf3601bf57f1f0b3166dce2cb15928 --no-git
