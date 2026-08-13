// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title RedeployVaultProcessor.s.sol — prototype: new vault + processor with merged txs
/// @notice Deploys NEW implementations + NEW ERC1967 proxies for AxiomStrategyVault and
///         AxiomPaymentProcessor (the two contracts gaining depositAndSetStrategy /
///         payForAgentAndCompute), REUSING the deployed NFT + MockUSDC. Used to measure
///         the before/after tx-count + wall-time win of the merged functions.
/// @dev    Owner/treasury MUST be the Galileo admin (DEPLOYER_PK → 0xaf7c581b…).
///         Do NOT use ORACLE_ADMIN_PK (0x5db6… → mainnet admin 0x437371dB).
/// @dev    Invocation (default profile, via_ir ON — never FOUNDRY_PROFILE=dev):
///   DEPLOYER_PK=<pk> AGENT_NFT_ADDRESS=<nft> AXIOM_PAYMENT_TOKEN=<usdc> \
///   forge script script/RedeployVaultProcessor.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
contract RedeployVaultProcessor is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[RedeployVaultProcessor] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address admin = vm.addr(deployerKey);

        address nftProxy = vm.envAddress("AGENT_NFT_ADDRESS");
        address paymentToken = vm.envAddress("AXIOM_PAYMENT_TOKEN");

        vm.startBroadcast(deployerKey);

        // --- AxiomStrategyVault (new impl + new proxy) ---
        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(
                AxiomStrategyVault.initialize.selector,
                nftProxy,
                admin // _owner = Galileo admin
            )
        );
        AxiomStrategyVault vault = AxiomStrategyVault(payable(address(vaultProxy)));
        console2.log("[RedeployVaultProcessor] AxiomStrategyVault impl at :", address(vaultImpl));
        console2.log("[RedeployVaultProcessor] AxiomStrategyVault proxy at:", address(vault));

        // --- AxiomPaymentProcessor (new impl + new proxy) ---
        AxiomPaymentProcessor processorImpl = new AxiomPaymentProcessor();
        ERC1967Proxy processorProxy = new ERC1967Proxy(
            address(processorImpl),
            abi.encodeWithSelector(
                AxiomPaymentProcessor.initialize.selector,
                nftProxy,
                paymentToken,
                admin, // treasury = Galileo admin
                uint256(100), // 1% protocol fee (unchanged)
                admin // initialOwner = Galileo admin
            )
        );
        AxiomPaymentProcessor processor = AxiomPaymentProcessor(address(processorProxy));
        console2.log("[RedeployVaultProcessor] AxiomPaymentProcessor impl at :", address(processorImpl));
        console2.log("[RedeployVaultProcessor] AxiomPaymentProcessor proxy at:", address(processor));

        vm.stopBroadcast();

        // --- Post-deploy wiring asserts (mirror Deploy.s.sol / DeployAristotle) ---
        require(address(vault.nft()) == nftProxy, "vault.nft() != AGENT_NFT_ADDRESS");
        require(address(processor.AXIOM_NFT()) == nftProxy, "processor.AXIOM_NFT() != AGENT_NFT_ADDRESS");
        require(processor.paymentToken() == paymentToken, "processor.paymentToken() != AXIOM_PAYMENT_TOKEN");

        console2.log("========== RedeployVaultProcessor summary ==========");
        console2.log("Network:             0G Galileo testnet (chainId 16602)");
        console2.log("Admin (owner/treas):", admin);
        console2.log("NFT proxy (reused): ", nftProxy);
        console2.log("USDC token (reused):", paymentToken);
        console2.log("Vault proxy:        ", address(vault));
        console2.log("Processor proxy:    ", address(processor));
        console2.log("New fns: depositAndSetStrategy / payForAgentAndCompute live");
    }
}
