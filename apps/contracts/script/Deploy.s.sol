// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title Deploy.s.sol — Full deployment script for Axiom Protocol on 0G Chain
/// @dev Run with:
///      DEPLOYER_PK=<pk> TEE_SIGNER_PK=<tee_pk> ORACLE_ADMIN_PK=<admin_pk>
///      forge script script/Deploy.s.sol --rpc-url $OG_RPC_URL --broadcast --slow
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        uint256 teeSignerKey = vm.envUint("TEE_SIGNER_PK");
        uint256 oracleAdminKey = vm.envUint("ORACLE_ADMIN_PK");
        address teeSigner = vm.addr(teeSignerKey);
        address oracleAdmin = vm.addr(oracleAdminKey);
        // registerSigner is gated on AXIOM_DEPLOYER_ADDRESS via OZ Ownable.
        address axiomDeployer = vm.envAddress("AXIOM_DEPLOYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        AxiomTeeVerifier verifier = new AxiomTeeVerifier(axiomDeployer, teeSigner, 7 days);

        AxiomAgentNFT implementation = new AxiomAgentNFT();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                address(verifier),
                oracleAdmin
            )
        );
        AxiomAgentNFT nft = AxiomAgentNFT(address(proxy));
        console2.log("AxiomAgentNFT proxy deployed at:", address(nft));
        console2.log("AxiomAgentNFT implementation at:", address(implementation));

        AxiomStrategyVault vault = new AxiomStrategyVault(address(nft), oracleAdmin);
        console2.log("AxiomStrategyVault deployed at:", address(vault));

        // paymentTokenAddr is read from the PAYMENT_TOKEN_ADDR env var (e.g. USDC.e / USDG on 0G).
        address paymentTokenAddr = vm.envAddress("PAYMENT_TOKEN_ADDR");
        AxiomPaymentProcessor processor = new AxiomPaymentProcessor(
            address(nft),
            paymentTokenAddr,
            oracleAdmin, // treasury
            100, // 1% default protocol fee
            oracleAdmin // owner
        );
        console2.log("AxiomPaymentProcessor deployed at:", address(processor));

        vm.stopBroadcast();

        console2.log("========== Axiom Protocol deployed ==========");
        console2.log("Network:           ", vm.envString("OG_NETWORK_NAME"));
        console2.log("Chain ID:          ", block.chainid);
        console2.log("TEE Signer:        ", teeSigner);
        console2.log("Oracle Admin:      ", oracleAdmin);
        console2.log("Verifier:          ", address(verifier));
        console2.log("NFT proxy:         ", address(nft));
        console2.log("Vault:             ", address(vault));
        console2.log("Payment Processor: ", address(processor));
    }
}
