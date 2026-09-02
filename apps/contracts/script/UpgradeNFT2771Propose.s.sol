// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title UpgradeNFT2771Propose.s.sol — V3 W5 step 1 of 2 for the NFT ERC-2771 retrofit.
///        AxiomAgentNFT upgrades are gated by the 1-day TimelockManager (proposeUpgrade →
///        executeUpgrade, AxiomAgentNFT.sol), so this script ONLY proposes the new
///        implementation. Execution + forwarder wiring happens ≥1 day later in
///        UpgradeNFT2771Execute.s.sol, which asserts the pending implementation matches the
///        freshly deployed one before executing.
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> NFT_PROXY=<proxy> \
///   forge script script/UpgradeNFT2771Propose.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
///   Key discipline: DEPLOYER_PK is exported at run time from ../../.env TEE_SIGNER_PK
///   (= NFT ADMIN_ROLE) — never printed. executableAt = proposedAt + 1 days.
contract UpgradeNFT2771Propose is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeNFT2771Propose] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address nftProxy = vm.envAddress("NFT_PROXY");

        vm.startBroadcast(deployerKey);
        AxiomAgentNFT newImpl = new AxiomAgentNFT();
        console2.log("Proposed NFT implementation (ERC-2771) at:", address(newImpl));
        AxiomAgentNFT(nftProxy).proposeUpgrade(address(newImpl));
        vm.stopBroadcast();

        // Post-checks: proposal recorded, timelock window surfaced for scheduling the execute leg.
        AxiomAgentNFT nft = AxiomAgentNFT(nftProxy);
        require(nft.pendingUpgrade() == address(newImpl), "propose: pending impl mismatch");
        console2.log("pendingUpgrade:", nft.pendingUpgrade());
        console2.log("executableAt (1-day timelock):", nft.pendingUpgradeExecutableAt());
        console2.log("NEXT (>= executableAt): run UpgradeNFT2771Execute.s.sol with NFT_PROXY + GAS_TANK.");
    }
}
