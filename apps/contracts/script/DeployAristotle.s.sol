// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title DeployAristotle.s.sol — Production deployment script for 0G Aristotle mainnet
/// @notice Mirrors `script/Deploy.s.sol` (the Galileo testnet deploy) with three extra safety
///         controls specific to a non-revertible mainnet broadcast:
///
///           1. A network guard that REFUSES to broadcast unless `block.chainid == 16661`.
///              A safe escape hatch exists: setting `AXIOM_LEGACY=1` in the env unlocks
///              chainId 16602 (Galileo) only — never any other chain — so a developer can
///              still dry-run this script against the testnet RPC before sending the real
///              mainnet transaction.
///           2. Key separation check: deployer, TEE signer, and oracle admin MUST be three
///              distinct addresses. If any two coincide, the script reverts immediately.
///           3. Deployer balance check: the deployer EOA must have >= 0.5 OG (7× gas safety
///              margin). If underfunded, the script reverts with a helpful message.
///           4. A post-broadcast confirmation step that:
///              a) writes the deployed addresses to
///                 `docs/deployments/aristotle-YYYY-MM-DD.json` (keyed by an ISO-8601 UTC date
///                 supplied via AXIOM_DEPLOY_DATE) using `vm.writeFile`, and
///              b) prints the same addresses to stdout so the operator can copy them into the
///                 matching `docs/deployments/aristotle-2026-XX-XX.md` deployment log.
///
///         Source for chainId + mainnet RPC + mainnet flow contract address:
///           https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
///           https://docs.0g.ai/ai-context
///
/// @dev Run (mainnet):
///      AXIOM_DEPLOYER_PK=<pk> AXIOM_TEE_SIGNER_PK=<tee_pk> AXIOM_ORACLE_ADMIN_PK=<admin_pk> AXIOM_DEPLOY_DATE=2026-06-14 \
///      forge script script/DeployAristotle.s.sol \
///           --rpc-url https://evmrpc.0g.ai \
///           --chain-id 16661 \
///           --broadcast --slow
///
///      Dry-run against Galileo testnet:
///      AXIOM_DEPLOYER_PK=<pk> AXIOM_TEE_SIGNER_PK=<tee_pk> AXIOM_ORACLE_ADMIN_PK=<admin_pk> AXIOM_DEPLOY_DATE=2026-06-14 \
///      AXIOM_LEGACY=1 forge script script/DeployAristotle.s.sol \
///           --rpc-url https://evmrpc-testnet.0g.ai \
///           --chain-id 16602
contract DeployAristotle is Script {
    /// @dev 0G Aristotle mainnet — https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
    uint256 internal constant ARISTOTLE_CHAIN_ID = 16661;
    /// @dev 0G Galileo testnet (only allowed when LEGACY=1) — https://docs.0g.ai/ai-context
    uint256 internal constant GALILEO_CHAIN_ID = 16602;
    /// @dev Maximum age of a transfer-validity proof, baked into the verifier bytecode.
    ///      Matches the Galileo testnet deploy (Deploy.s.sol) so testnet fixtures remain
    ///      valid against the same verifier ABI on mainnet.
    uint256 internal constant MAX_PROOF_AGE = 7 days;

    /// @notice Reverted when the script is run against an unexpected chain id.
    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        // ─── 1. Network guard ────────────────────────────────────────────────────────
        // Refuse to broadcast on any chain other than Aristotle mainnet unless the operator
        // explicitly opts in to the testnet escape hatch with `AXIOM_LEGACY=1`.
        bool legacy = vm.envOr("AXIOM_LEGACY", false);
        if (block.chainid != ARISTOTLE_CHAIN_ID) {
            if (!(legacy && block.chainid == GALILEO_CHAIN_ID)) {
                revert WrongChain(block.chainid, ARISTOTLE_CHAIN_ID);
            }
            console2.log("[DeployAristotle] AXIOM_LEGACY=1 set -- running against Galileo testnet (chainId 16602).");
        } else {
            console2.log("[DeployAristotle] Running against Aristotle mainnet (chainId 16661).");
        }

        // ─── 2. Read keys + date from env ───────────────────────────────────────────
        // All env vars use the AXIOM_* prefix for standardized secret naming.
        uint256 deployerKey = vm.envUint("AXIOM_DEPLOYER_PK");
        uint256 teeSignerKey = vm.envUint("AXIOM_TEE_SIGNER_PK");
        uint256 oracleAdminKey = vm.envUint("AXIOM_ORACLE_ADMIN_PK");
        string memory deployDate = vm.envString("AXIOM_DEPLOY_DATE");
        address deployerAddr = vm.addr(deployerKey);
        address teeSigner = vm.addr(teeSignerKey);
        address oracleAdmin = vm.addr(oracleAdminKey);

        // ─── 2b. Key separation check ────────────────────────────────────────────────
        // Ensure the three roles use distinct keys so a single compromise does not give
        // an attacker full protocol control. On testnet these may intentionally overlap;
        // the mainnet deploy MUST enforce separation.
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

        // ─── 2c. Deployer balance check ──────────────────────────────────────────────
        // Ensure the deployer EOA has sufficient native gas. The minimum threshold is
        // 0.5 OG (estimated gas ~2.4M at 30 gwei, with 7x safety margin).
        uint256 deployerBalance = deployerAddr.balance;
        uint256 minBalance = 0.5 ether;
        if (deployerBalance < minBalance) {
            revert(string.concat(
                "Deployer balance too low: ", vm.toString(deployerBalance),
                " wei (need >= ", vm.toString(minBalance), " wei / 0.5 OG). Fund from https://faucet.0g.ai"
            ));
        }
        console2.log("  Deployer balance:  ", deployerBalance, "wei");

        // The verifier's owner. Read from env so the operator can pin ownership to a multisig
        // (e.g. a Safe) without changing the broadcaster. The only account that can call
        // AxiomTeeVerifier.registerSigner is this address.
        address axiomDeployer = vm.envAddress("AXIOM_DEPLOYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        // 1. Deploy verifier (signer passed in; maxProofAge hardcoded to 7 days)
        AxiomTeeVerifier verifier = new AxiomTeeVerifier(axiomDeployer, teeSigner, MAX_PROOF_AGE);
        console2.log("AxiomTeeVerifier deployed at:", address(verifier));

        // 2. Deploy NFT implementation + ERC1967 proxy (UUPS upgradeable)
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

        // 3. Deploy StrategyVault (non-upgradeable, Ownable by oracleAdmin)
        AxiomStrategyVault vault = new AxiomStrategyVault(address(nft), oracleAdmin);
        console2.log("AxiomStrategyVault deployed at:", address(vault));

        // 4. Deploy PaymentProcessor (non-upgradeable, Ownable + treasury = oracleAdmin)
        //    paymentTokenAddr is read from the PAYMENT_TOKEN_ADDR env var (e.g. USDC.e / USDG on 0G).
        address paymentTokenAddr = vm.envAddress("PAYMENT_TOKEN_ADDR");
        AxiomPaymentProcessor processor = new AxiomPaymentProcessor(
            address(nft),
            paymentTokenAddr,
            oracleAdmin, // treasury
            100,         // 1% default protocol fee
            oracleAdmin  // owner
        );
        console2.log("AxiomPaymentProcessor deployed at:", address(processor));

        vm.stopBroadcast();

        // ─── 3. Confirmation summary ────────────────────────────────────────────────
        // The TEE signer is registered at construction time (see AxiomTeeVerifier.constructor
        // at src/verifiers/AxiomTeeVerifier.sol:43-47), so there is no separate post-deploy
        // registration tx. The signer can be rotated later via `AxiomTeeVerifier.registerSigner`
        // by the deployer (or the contract owner after ownership is transferred). See
        // README-aristotle.md for the operational runbook.

        // vm.writeFile resolves paths relative to the Forge project root (apps/contracts),
        // so `../../docs/deployments/...` reaches the monorepo docs directory.
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

    /// @dev Hand-rolled JSON builder to avoid dragging a serialization library into the script.
    ///      The shape is stable; if it grows, switch to `stdJson` from forge-std.
    ///      Marked `view` because `block.timestamp` is state (even though we never read it
    ///      here — `vm.toString(block.timestamp)` is read inside the function body).
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
            '  "deployedAt": "', date, 'T00:00:00Z",\n',
            '  "deployedAtUnix": ', vm.toString(timestamp), ',\n',
            '  "teeSigner": "', vm.toString(teeSigner), '",\n',
            '  "oracleAdmin": "', vm.toString(oracleAdmin), '",\n',
            '  "paymentToken": "', vm.toString(paymentTokenAddr), '",\n',
            '  "contracts": {\n',
            '    "AxiomTeeVerifier":         "', vm.toString(verifier),  '",\n',
            '    "AxiomAgentNFT (proxy)":    "', vm.toString(nftProxy),   '",\n',
            '    "AxiomAgentNFT (impl)":     "', vm.toString(nftImpl),    '",\n',
            '    "AxiomStrategyVault":       "', vm.toString(vault),      '",\n',
            '    "AxiomPaymentProcessor":    "', vm.toString(processor),  '"\n',
            "  }\n",
            "}\n"
        );
    }
}
