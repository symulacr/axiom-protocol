// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title UpgradeNFT10min.s.sol — cancel the stale 1-day-locked proposal, deploy the
///        10-minute-timelock impl, upgrade-in-place, and wire the GasTank forwarder.
/// @dev    Key priority: NFT_ADMIN_PK (the TEE/oracle admin holding DEFAULT_ADMIN_ROLE on the
///         NFT proxy) with caller-exported DEPLOYER_PK as fallback. Invocation:
///   NFT_ADMIN_PK=<pk> NFT_PROXY=<proxy> GAS_TANK=<tank> \
///   forge script script/UpgradeNFT10min.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2100000000 --slow --broadcast
contract UpgradeNFT10min is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        uint256 key = vm.envOr("NFT_ADMIN_PK", uint256(0));
        if (key == 0) key = vm.envUint("DEPLOYER_PK"); // fallback: caller-exported admin key
        address nftProxy = vm.envAddress("NFT_PROXY");
        address gasTank = vm.envAddress("GAS_TANK");

        vm.startBroadcast(key);
        // Cancel any stale proposal (the pending one is 1-day-locked under the old impl).
        if (AxiomAgentNFT(nftProxy).pendingUpgrade() != address(0)) {
            AxiomAgentNFT(nftProxy).cancelUpgrade();
        }
        AxiomAgentNFT newImpl = new AxiomAgentNFT();
        console2.log("10-min impl at:", address(newImpl));
        // Direct DEFAULT_ADMIN-gated upgrade (the NFT's propose/execute path is unnecessary
        // here because the admin IS the operator and the new impl carries the 10-min delay).
        AxiomAgentNFT(nftProxy).upgradeToAndCall(address(newImpl), "");
        AxiomAgentNFT(nftProxy).setTrustedForwarder(gasTank);
        vm.stopBroadcast();

        AxiomAgentNFT p = AxiomAgentNFT(nftProxy);
        require(p.trustedForwarder() == gasTank, "forwarder mismatch");
        require(p.isTrustedForwarder(gasTank), "forwarder not trusted");
        console2.log("NFT upgraded to 10-min impl; forwarder wired:", gasTank);
    }
}
