// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title DeployAristotle.s.sol — Production deployment script for 0G Aristotle mainnet
/// @notice Mirrors Deploy.s.sol with extra safety controls:
///         1. Network guard (chainId 16661; Galileo via AXIOM_LEGACY=1)
///         2. Key separation check (deployer, TEE signer, oracle admin must be distinct)
///         3. Deployer balance check (>= 0.5 OG)
///         4. Post-broadcast address dump to docs/deployments/
/// @dev Run (mainnet):
///      AXIOM_DEPLOYER_PK=<pk> AXIOM_TEE_SIGNER_PK=<tee_pk> AXIOM_ORACLE_ADMIN_PK=<admin_pk> AXIOM_DEPLOY_DATE=2026-06-14 \
///      forge script script/DeployAristotle.s.sol \
///           --rpc-url https://evmrpc.0g.ai --chain-id 16661 --broadcast --slow
///      Dry-run (Galileo): add AXIOM_LEGACY=1, point --rpc-url at https://evmrpc-testnet.0g.ai --chain-id 16602
contract DeployAristotle is Script {
    /// @dev Only allowed when AXIOM_LEGACY=1.
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;
    uint256 internal constant ARISTOTLE_CHAIN_ID = 16_661;
    uint256 internal constant MAX_PROOF_AGE = 7 days;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        bool legacy = vm.envOr("AXIOM_LEGACY", false);
        if (block.chainid != ARISTOTLE_CHAIN_ID) {
            if (!(legacy && block.chainid == GALILEO_CHAIN_ID)) {
                revert WrongChain(block.chainid, ARISTOTLE_CHAIN_ID);
            }
            console2.log("[DeployAristotle] AXIOM_LEGACY=1 set -- running against Galileo testnet (chainId 16602).");
        } else {
            console2.log("[DeployAristotle] Running against Aristotle mainnet (chainId 16661).");
        }

        uint256 deployerKey = vm.envUint("AXIOM_DEPLOYER_PK");
        uint256 teeSignerKey = vm.envUint("AXIOM_TEE_SIGNER_PK");
        uint256 oracleAdminKey = vm.envUint("AXIOM_ORACLE_ADMIN_PK");
        string memory deployDate = vm.envString("AXIOM_DEPLOY_DATE");
        address deployerAddr = vm.addr(deployerKey);
        address teeSigner = vm.addr(teeSignerKey);
        address oracleAdmin = vm.addr(oracleAdminKey);

        if (deployerAddr == teeSigner) {
            revert("Key separation violation: deployer == TEE signer");
        }
        if (deployerAddr == oracleAdmin) {
            revert("Key separation violation: deployer == oracle admin");
        }
        if (teeSigner == oracleAdmin) {
            revert("Key separation violation: TEE signer == oracle admin");
        }
        console2.log("[DeployAristotle] Key separation check passed.");
        console2.log("  Deployer address:  ", deployerAddr);
        console2.log("  TEE signer address:", teeSigner);
        console2.log("  Oracle admin:      ", oracleAdmin);

        uint256 deployerBalance = deployerAddr.balance;
        uint256 minBalance = 0.5 ether;
        if (deployerBalance < minBalance) {
            revert(
                string.concat(
                    "Deployer balance too low: ",
                    vm.toString(deployerBalance),
                    " wei (need >= ",
                    vm.toString(minBalance),
                    " wei / 0.5 OG). Fund from https://faucet.0g.ai"
                )
            );
        }
        console2.log("  Deployer balance:  ", deployerBalance, "wei");

        // registerSigner is gated on AXIOM_DEPLOYER_ADDRESS via OZ Ownable.
        address axiomDeployer = vm.envAddress("AXIOM_DEPLOYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        AxiomTeeVerifier verifier = new AxiomTeeVerifier(axiomDeployer, teeSigner, MAX_PROOF_AGE);
        console2.log("AxiomTeeVerifier deployed at:", address(verifier));

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

        string memory jsonPath = string.concat("../../docs/deployments/aristotle-", deployDate, ".json");
        string memory json = _buildDeploymentJson(
            deployDate,
            block.timestamp,
            teeSigner,
            oracleAdmin,
            paymentTokenAddr,
            address(verifier),
            address(nft),
            address(implementation),
            address(vault),
            address(processor)
        );
        vm.writeFile(jsonPath, json);

        console2.log("========== Axiom Protocol deployed (Aristotle mainnet) ==========");
        console2.log("Chain ID:          ", block.chainid);
        console2.log("TEE Signer:        ", teeSigner);
        console2.log("Oracle Admin:      ", oracleAdmin);
        console2.log("Verifier:          ", address(verifier));
        console2.log("NFT proxy:         ", address(nft));
        console2.log("Vault:             ", address(vault));
        console2.log("Payment Processor: ", address(processor));
        console2.log("");
        console2.log("Addresses written to:", jsonPath);
        console2.log("JSON payload:");
        console2.log(json);
    }

    function _buildDeploymentJson(
        string memory date,
        uint256 timestamp,
        address teeSigner,
        address oracleAdmin,
        address paymentTokenAddr,
        address verifier,
        address nftProxy,
        address nftImpl,
        address vault,
        address processor
    ) internal pure returns (string memory) {
        return string.concat(
            "{\n",
            '  "network": "0G Aristotle mainnet",\n',
            '  "chainId": 16661,\n',
            '  "rpc": "https://evmrpc.0g.ai",\n',
            '  "explorer": "https://chainscan.0g.ai",\n',
            '  "storageIndexer": "https://indexer-storage-turbo.0g.ai",\n',
            '  "flowContract": "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",\n',
            '  "deployedAt": "',
            date,
            'T00:00:00Z",\n',
            '  "deployedAtUnix": ',
            vm.toString(timestamp),
            ",\n",
            '  "teeSigner": "',
            vm.toString(teeSigner),
            '",\n',
            '  "oracleAdmin": "',
            vm.toString(oracleAdmin),
            '",\n',
            '  "paymentToken": "',
            vm.toString(paymentTokenAddr),
            '",\n',
            '  "contracts": {\n',
            '    "AxiomTeeVerifier":         "',
            vm.toString(verifier),
            '",\n',
            '    "AxiomAgentNFT (proxy)":    "',
            vm.toString(nftProxy),
            '",\n',
            '    "AxiomAgentNFT (impl)":     "',
            vm.toString(nftImpl),
            '",\n',
            '    "AxiomStrategyVault":       "',
            vm.toString(vault),
            '",\n',
            '    "AxiomPaymentProcessor":    "',
            vm.toString(processor),
            '"\n',
            "  }\n",
            "}\n"
        );
    }
}
