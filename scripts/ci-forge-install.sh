#!/usr/bin/env bash
# Sole pinning authority for Foundry lib deps: every rev here is the audited
# supply-chain pin (no foundry.toml [dependencies] on purpose — forge would
# submodule-ize these --no-git installs). Audited 2026-09-13: all 20 .sol files
# under lib/0g-agent-nft verified byte-identical (git blob-sha match) to
# 0gfoundation/0g-agent-nft@b86e108a49bf3601bf57f1f0b3166dce2cb15928 (same
# commit object as the 0glabs pin below).
set -euo pipefail

cd "$(dirname "$0")/../apps/contracts"

forge install foundry-rs/forge-std@v1.16.1 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-git

forge install 0glabs/0g-agent-nft@b86e108a49bf3601bf57f1f0b3166dce2cb15928 --no-git
