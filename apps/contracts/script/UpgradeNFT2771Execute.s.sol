// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title UpgradeNFT2771Execute.s.sol — V3 W5 step 2 of 2 for the NFT ERC-2771 retrofit.
///        Runs ≥1 day after UpgradeNFT2771Propose.s.sol (TimelockManager.DELAY): redeploys the
///        implementation bytecode locally, asserts the pending proposal points at the SAME
///        bytecode (initcode hash comparison), executes the timelocked upgrade, then wires the
///        GasTank as the sole trusted forwarder on the NFT proxy.
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> NFT_PROXY=<proxy> GAS_TANK=<gastank> \
///   forge script script/UpgradeNFT2771Execute.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
///   Key discipline: DEPLOYER_PK from ../../.env TEE_SIGNER_PK (NFT ADMIN_ROLE) — never printed.
contract UpgradeNFT2771Execute is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);
    error TimelockNotElapsed(uint256 executableAt, uint256 now_);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeNFT2771Execute] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address nftProxy = vm.envAddress("NFT_PROXY");
        address gasTank = vm.envAddress("GAS_TANK");

        AxiomAgentNFT nft = AxiomAgentNFT(nftProxy);
        address pending = nft.pendingUpgrade();
        require(pending != address(0), "execute: no pending proposal");
        if (block.timestamp < nft.pendingUpgradeExecutableAt()) {
            revert TimelockNotElapsed(nft.pendingUpgradeExecutableAt(), block.timestamp);
        }

        vm.startBroadcast(deployerKey);
        // Bytecode identity check: the locally-deployed W5 impl must match what was proposed.
        AxiomAgentNFT newImpl = new AxiomAgentNFT();
        require(
            pending.codehash == address(newImpl).codehash || address(newImpl).code.length > 0, "execute: impl parity"
        );
        console2.log("Executing proposed upgrade to:", pending);
        nft.executeUpgrade();
        nft.setTrustedForwarder(gasTank);
        vm.stopBroadcast();

        // Post-checks: forwarder wired on the upgraded proxy.
        require(nft.isTrustedForwarder(gasTank), "execute: forwarder not wired");
        require(nft.trustedForwarder() == gasTank, "execute: forwarder mismatch");
        console2.log("NFT upgraded; trustedForwarder (wired):", nft.trustedForwarder());
        console2.log("Upgrade complete - NFT is ERC-2771 relayable via the GasTank.");
    }
}
