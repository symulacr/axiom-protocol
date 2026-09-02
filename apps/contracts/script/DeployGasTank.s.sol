// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title DeployGasTank.s.sol — V3 W5: deploy the non-upgradeable AxiomGasTank, upgrade the
///        PaymentProcessor to the ERC-2771 implementation, wire the GasTank as the sole trusted
///        forwarder on Processor, fund the reserve, and verify every wiring fact on-chain.
/// @notice The NFT leg is NOT executed here: AxiomAgentNFT upgrades go through the 1-day
///         timelock (proposeUpgrade → executeUpgrade). Run UpgradeNFT2771Propose.s.sol at T-0
///         and UpgradeNFT2771Execute.s.sol at T+1d; the execute script asserts the proposed
///         implementation matches before executing and wires the forwarder afterwards.
/// @dev    Invocation (default profile, via_ir ON):
///   GAS_TANK_ADMIN=<addr> MAX_GAS_PER_OP=300000 GAS_RESERVE_FUNDING=100000000000000000 \
///   PROCESSOR_PROXY=<proxy> \
///   forge script script/DeployGasTank.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
///   The broadcast key is ORACLE_ADMIN (= DEFAULT_ADMIN on the Processor proxy and ADMIN_ROLE
///   holder); export it at run time from ../../.env TEE_SIGNER_PK — NEVER print or commit it.
contract DeployGasTank is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[DeployGasTank] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address admin = vm.envAddress("GAS_TANK_ADMIN");
        uint256 maxGasPerOp = vm.envUint("MAX_GAS_PER_OP");
        uint256 reserveFunding = vm.envUint("GAS_RESERVE_FUNDING");
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");

        // Optional overrides; defaults keep the contract's 0.01 ether / 3 grant defaults.
        uint256 gasGrant = 0.01 ether;
        uint256 grantsCap = 3;
        uint256 dailyLimit = 0; // 0 = window disabled
        try vm.envUint("GAS_GRANT") returns (uint256 v) {
            gasGrant = v;
        } catch {}
        try vm.envUint("GRANTS_CAP") returns (uint256 v) {
            grantsCap = v;
        } catch {}
        try vm.envUint("DAILY_LIMIT") returns (uint256 v) {
            dailyLimit = v;
        } catch {}

        vm.startBroadcast(deployerKey);
        AxiomGasTank gasTank = new AxiomGasTank(admin, maxGasPerOp);
        console2.log("AxiomGasTank (non-upgradeable) at:", address(gasTank));
        if (gasGrant != 0.01 ether) gasTank.setGasGrant(gasGrant);
        if (grantsCap != 3) gasTank.setGrantsCap(grantsCap);
        if (dailyLimit != 0) gasTank.setDailyLimit(dailyLimit);

        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("New Processor implementation (ERC-2771) at:", address(newImpl));
        AxiomPaymentProcessor(payable(processorProxy)).upgradeToAndCall(address(newImpl), "");
        AxiomPaymentProcessor(payable(processorProxy)).setTrustedForwarder(address(gasTank));

        gasTank.depositReserve{value: reserveFunding}();
        vm.stopBroadcast();

        // Post-checks: wiring, funding, governance — asserted on-chain state, not logs.
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        require(gasTank.owner() == admin, "gastank: owner mismatch");
        require(p.isTrustedForwarder(address(gasTank)), "processor: forwarder not wired");
        require(p.trustedForwarder() == address(gasTank), "processor: forwarder mismatch");
        require(gasTank.maxGasPerOp() == maxGasPerOp, "gastank: maxGasPerOp mismatch");
        require(gasTank.gasGrant() == gasGrant, "gastank: gasGrant mismatch");
        require(gasTank.grantsCap() == grantsCap, "gastank: grantsCap mismatch");
        require(gasTank.dailyLimit() == dailyLimit, "gastank: dailyLimit mismatch");
        require(gasTank.reserve() == reserveFunding, "gastank: reserve funding mismatch");
        // Untracked balance must be zero right after funding (invariant sanity).
        require(
            address(gasTank).balance == gasTank.reserve() + gasTank.totalTankBalance(),
            "gastank: untracked balance != 0"
        );
        console2.log("GasTank deployed, Processor forwarder wired, reserve funded:", reserveFunding);
        console2.log("NEXT: run UpgradeNFT2771Propose.s.sol (1-day timelock), then execute script.");
    }
}
