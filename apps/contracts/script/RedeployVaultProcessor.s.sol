// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title RedeployVaultProcessor.s.sol — prototype: new NFT + vault + processor with merged txs
/// @notice Deploys NEW implementations + NEW ERC1967 proxies for AxiomAgentNFT (gaining
///         authorizeDelegateAndRevoke / transferAndCleanExpiredProofs), AxiomStrategyVault
///         (gaining depositSetStrategyAndWithdraw) and AxiomPaymentProcessor (gaining
///         payAndWithdrawEarnings) — 3 impls + 3 proxies — REUSING the deployed
///         TeeVerifier + MockUSDC. The NFT deploys first; the new vault + processor are
///         initialized against the NEW NFT proxy. Used to measure the before/after
///         tx-count + wall-time win of the merged functions (12 → 6 txs).
/// @dev    Owner/treasury MUST be the Galileo admin (DEPLOYER_PK → 0xaf7c581b…).
///         Do NOT use ORACLE_ADMIN_PK (0x5db6… → mainnet admin 0x437371dB).
/// @dev    TeeVerifier is reused; its proxy address is read from AXIOM_TEE_VERIFIER_ADDRESS
///         and defaults to the known Galileo address when unset.
/// @dev    Invocation (default profile, via_ir ON — never FOUNDRY_PROFILE=dev):
///   DEPLOYER_PK=<pk> AXIOM_PAYMENT_TOKEN=<usdc> \
///   [AXIOM_TEE_VERIFIER_ADDRESS=<verifier>] \
///   forge script script/RedeployVaultProcessor.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
contract RedeployVaultProcessor is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    /// @dev Reused TeeVerifier proxy on 0G Galileo testnet (default when env unset).
    address internal constant TEE_VERIFIER_GALILEO = 0x1bA37125bba23B66B549CcB33BC9B4952FD4Dcc4;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[RedeployVaultProcessor] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address admin = vm.addr(deployerKey);

        address paymentToken = vm.envAddress("AXIOM_PAYMENT_TOKEN");
        // Reused TeeVerifier proxy; defaults to the known Galileo address when unset.
        address teeVerifier = vm.envOr("AXIOM_TEE_VERIFIER_ADDRESS", TEE_VERIFIER_GALILEO);

        vm.startBroadcast(deployerKey);

        // --- AxiomAgentNFT (new impl + new proxy; authorizeDelegateAndRevoke /
        //     transferAndCleanExpiredProofs merged fns) — wired to the REUSED TeeVerifier.
        //     Deployed FIRST so the new vault/processor can be initialized against it. ---
        AxiomAgentNFT nftImpl = new AxiomAgentNFT();
        ERC1967Proxy nftProxy = new ERC1967Proxy(
            address(nftImpl),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                teeVerifier, // same reused TeeVerifier proxy
                admin // admin (same Galileo admin)
            )
        );
        AxiomAgentNFT nft = AxiomAgentNFT(address(nftProxy));
        console2.log("[RedeployVaultProcessor] AxiomAgentNFT impl at :", address(nftImpl));
        console2.log("[RedeployVaultProcessor] AxiomAgentNFT proxy at:", address(nft));

        // --- AxiomStrategyVault (new impl + new proxy) ---
        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(
                AxiomStrategyVault.initialize.selector,
                address(nft), // IAxiomAgentNFT _nft = new NFT proxy
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
                address(nft), // nftAddr = new NFT proxy
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
        require(address(vault.nft()) == address(nft), "vault.nft() != new NFT proxy");
        require(address(processor.AXIOM_NFT()) == address(nft), "processor.AXIOM_NFT() != new NFT proxy");
        require(processor.paymentToken() == paymentToken, "processor.paymentToken() != AXIOM_PAYMENT_TOKEN");
        require(address(nft.verifier()) == teeVerifier, "nft.verifier() != AXIOM_TEE_VERIFIER_ADDRESS");

        console2.log("========== RedeployVaultProcessor summary ==========");
        console2.log("Network:             0G Galileo testnet (chainId 16602)");
        console2.log("Admin (owner/treas):", admin);
        console2.log("TeeVerifier (reused):", teeVerifier);
        console2.log("USDC token (reused):", paymentToken);
        console2.log("NFT proxy (new):    ", address(nft));
        console2.log("Vault proxy:        ", address(vault));
        console2.log("Processor proxy:    ", address(processor));
        console2.log("New fns: authorizeDelegateAndRevoke / transferAndCleanExpiredProofs /");
        console2.log("         depositSetStrategyAndWithdraw / payAndWithdrawEarnings live");
    }
}
