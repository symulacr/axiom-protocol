// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomDelegationRegistry} from "../src/AxiomDelegationRegistry.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title DeployAristotle.s.sol — Production deployment script for 0G Aristotle mainnet
/// @notice Mirrors Deploy.s.sol with extra safety controls:
///         1. Network guard (chainId 16661; Galileo via AXIOM_LEGACY=1)
///         2. Key separation check (deployer, TEE signer, oracle admin must be distinct)
///         3. Deployer balance check (>= 0.5 OG)
///         4. Post-broadcast address dump to docs/deployments/
///         5. Full W6 surface: DelegationRegistry, GasTank, swap/LP/lend Processor
///         6. Mainnet safety gates: swap pair token + pay cap REQUIRED envs, grants OFF
///            unless AXIOM_ALLOW_GRANTS=1, relayer key != deployer
/// @dev Run (mainnet):
///      AXIOM_DEPLOYER_PK=<pk> AXIOM_TEE_SIGNER_PK=<tee_pk> AXIOM_ORACLE_ADMIN_PK=<admin_pk> \
///      AXIOM_RELAYER_ADDRESS=<addr> AXIOM_DEPLOYER_ADDRESS=<addr> PAYMENT_TOKEN_ADDR=<addr> \
///      AXIOM_SWAP_PAIR_TOKEN=<addr> AXIOM_MAX_PAY_CAP=<wei> AXIOM_DEPLOY_DATE=2026-09-01 \
///      forge script script/DeployAristotle.s.sol \
///           --rpc-url https://evmrpc.0g.ai --chain-id 16661 --broadcast --slow
///      Dry-run (Galileo): add AXIOM_LEGACY=1, point --rpc-url at https://evmrpc-testnet.0g.ai --chain-id 16602
///      NOTE: AXIOM_LEGACY=1 keeps Galileo (testnet, chainId 16602) compatibility.
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

        // Mainnet relayer separation: the relayer key that signs gasless meta-tx must never be
        // the deployer (a compromised deploy-time env would then also hold relay authority).
        address relayerAddr = vm.envAddress("AXIOM_RELAYER_ADDRESS");
        if (relayerAddr == deployerAddr) {
            revert("Relayer separation violation: AXIOM_RELAYER_ADDRESS == deployer");
        }

        uint256 deployerBalance = deployerAddr.balance;
        // 0G has 0 base fee — balance check is a safety floor, not a cost estimate.
        // Previous broadcast data shows ~10.8M gas total for all 8 CREATEs.
        // With 0 gwei gas, actual cost is near zero. 0.1 OG is a generous safety margin.
        uint256 minBalance = 0.1 ether;
        if (deployerBalance < minBalance) {
            revert(
                string.concat(
                    "Deployer balance too low: ",
                    vm.toString(deployerBalance),
                    " wei (need >= ",
                    vm.toString(minBalance),
                    " wei / 0.1 OG). 0G has zero gas fees - fund minimally from https://faucet.0g.ai"
                )
            );
        }
        console2.log("  Deployer balance:  ", deployerBalance, "wei (min 0.1 OG)");

        // ─── W6 env surface: REQUIRED swap/pay envs are validated BEFORE any broadcast. ───
        // paymentTokenAddr is read from the PAYMENT_TOKEN_ADDR env var (e.g. USDC.e / USDG on 0G).
        address paymentTokenAddr = vm.envAddress("PAYMENT_TOKEN_ADDR");
        // registerSigner is gated on AXIOM_DEPLOYER_ADDRESS via OZ Ownable.
        address axiomDeployer = vm.envAddress("AXIOM_DEPLOYER_ADDRESS");
        // The swap pair token (token B; token A is paymentToken) — on mainnet this is the real
        // WETH-like token. No default: a mainnet swap pool against a guessed token is unrecoverable.
        address swapPairToken = vm.envAddress("AXIOM_SWAP_PAIR_TOKEN");
        // maxPayCap: 0 DISABLES the per-pay cap (documented emergency-only setting on the
        // Processor). Mainnet must boot with the cap ON — REQUIRED env, no default.
        uint256 maxPayCap = vm.envUint("AXIOM_MAX_PAY_CAP");
        if (maxPayCap == 0) {
            revert("AXIOM_MAX_PAY_CAP=0 disables the pay cap on mainnet; set a real cap");
        }
        if (swapPairToken == address(0)) {
            revert("AXIOM_SWAP_PAIR_TOKEN must be the real mainnet WETH-like token address");
        }
        if (swapPairToken == paymentTokenAddr) {
            revert("AXIOM_SWAP_PAIR_TOKEN == PAYMENT_TOKEN_ADDR; setSwapPairToken reverts InvalidSwapPair");
        }
        // Optional tunables with mainnet-safe defaults.
        uint256 swapFeeBps = vm.envOr("AXIOM_SWAP_FEE_BPS", uint256(30));
        uint256 borrowFactorBps = vm.envOr("AXIOM_BORROW_FACTOR_BPS", uint256(5000));
        uint256 maxGasPerOp = vm.envOr("AXIOM_MAX_GAS_PER_OP", uint256(300_000));

        // Mainnet safety gate: the testnet growth lever (gas grants) must be explicitly enabled.
        // setGasGrant(0)/setGrantsCap(0) revert ZeroAmount on the GasTank, so "grants off" here
        // means: deploy with the contract defaults unset from env and fund NO reserve. An empty
        // gasReserve makes _lazyGrant/grantCredit revert ReserveExhausted — grants are dead until
        // the owner explicitly calls setGasGrant/setGrantsCap AND depositReserve post-deploy.
        bool allowGrants = vm.envOr("AXIOM_ALLOW_GRANTS", false);
        uint256 gasGrant = vm.envOr("AXIOM_GAS_GRANT", uint256(0.01 ether));
        uint256 grantsCap = vm.envOr("AXIOM_GRANTS_CAP", uint256(3));
        if (allowGrants && (gasGrant == 0 || grantsCap == 0)) {
            revert("AXIOM_ALLOW_GRANTS=1 requires non-zero AXIOM_GAS_GRANT and AXIOM_GRANTS_CAP; the GasTank setters revert ZeroAmount at 0");
        }
        if (!allowGrants && (vm.envExists("AXIOM_GAS_GRANT") || vm.envExists("AXIOM_GRANTS_CAP"))) {
            revert("AXIOM_GAS_GRANT/AXIOM_GRANTS_CAP set without AXIOM_ALLOW_GRANTS=1: testnet growth lever must be explicitly enabled on mainnet");
        }

        vm.startBroadcast(deployerKey);

        AxiomTeeVerifier verifierImpl = new AxiomTeeVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeWithSelector(verifierImpl.initialize.selector, axiomDeployer, teeSigner, MAX_PROOF_AGE)
        );
        AxiomTeeVerifier verifier = AxiomTeeVerifier(payable(address(verifierProxy)));
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
        AxiomAgentNFT nft = AxiomAgentNFT(payable(address(proxy)));
        console2.log("AxiomAgentNFT proxy deployed at:", address(nft));
        console2.log("AxiomAgentNFT implementation at:", address(implementation));

        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(vaultImpl.initialize.selector, address(nft), oracleAdmin)
        );
        AxiomStrategyVault vault = AxiomStrategyVault(payable(address(vaultProxy)));
        console2.log("AxiomStrategyVault deployed at:", address(vault));

        AxiomPaymentProcessor processorImpl = new AxiomPaymentProcessor();
        ERC1967Proxy processorProxy = new ERC1967Proxy(
            address(processorImpl),
            abi.encodeWithSelector(
                processorImpl.initialize.selector,
                address(nft),
                paymentTokenAddr,
                oracleAdmin, // treasury
                100, // 1% default protocol fee
                oracleAdmin // owner (DEFAULT_ADMIN_ROLE + ADMIN_ROLE)
            )
        );
        AxiomPaymentProcessor processor = AxiomPaymentProcessor(payable(address(processorProxy)));
        console2.log("AxiomPaymentProcessor deployed at:", address(processor));

        // Non-upgradeable registry (owner = admin, same shared-funding strategy as V2: TEE signer EOA).
        AxiomDelegationRegistry registry = new AxiomDelegationRegistry(IAxiomAgentNFT(address(nft)), oracleAdmin);
        console2.log("AxiomDelegationRegistry deployed at:", address(registry));

        // Non-upgradeable GasTank; owner = oracleAdmin (depositReserve/setters/recoverReserve).
        AxiomGasTank gasTank = new AxiomGasTank(oracleAdmin, maxGasPerOp);
        console2.log("AxiomGasTank deployed at:", address(gasTank));

        // Wiring proof: vault and processor must reference the deployed NFT proxy.
        assert(address(vault.nft()) == address(nft));
        assert(address(processor.AXIOM_NFT()) == address(nft));
        vm.stopBroadcast();

        // W5/W6 wiring runs under the ORACLE_ADMIN broadcast, not the deployer: ADMIN_ROLE on
        // the NFT/Processor proxies and GasTank ownership are oracleAdmin, and the three keys
        // are distinct on mainnet (key-separation check above).
        vm.startBroadcast(oracleAdminKey);
        // See the AXIOM_ALLOW_GRANTS gate: grants stay live only when the operator opted in,
        // and no reserve is funded either way (depositReserve is a deliberate post-deploy
        // operator step, never an implicit script side effect).
        if (gasGrant != 0.01 ether) gasTank.setGasGrant(gasGrant);
        if (grantsCap != 3) gasTank.setGrantsCap(grantsCap);
        nft.setTrustedForwarder(address(gasTank));
        processor.setTrustedForwarder(address(gasTank));
        processor.setAxiomVault(address(vault));
        processor.setSwapPairToken(swapPairToken);
        processor.setSwapFeeBps(swapFeeBps);
        processor.setBorrowFactorBps(borrowFactorBps);
        processor.setMaxPayCap(maxPayCap);
        vm.stopBroadcast();

        // Wiring assertions (ADR-004 §3): revert the script if any wire is misaddressed.
        require(address(nft.verifier()) == address(verifier), "wiring: nft.verifier mismatch");
        require(address(vault.nft()) == address(nft), "wiring: vault.nft mismatch");
        require(address(processor.AXIOM_NFT()) == address(nft), "wiring: processor.AXIOM_NFT mismatch");
        require(processor.paymentToken() == paymentTokenAddr, "wiring: processor.paymentToken mismatch");
        require(address(registry.nft()) == address(nft), "wiring: registry.nft mismatch");
        require(registry.owner() == oracleAdmin, "wiring: registry.owner mismatch");
        require(processor.isTrustedForwarder(address(gasTank)), "wiring: processor forwarder not trusted");
        require(processor.trustedForwarder() == address(gasTank), "wiring: processor forwarder mismatch");
        require(nft.isTrustedForwarder(address(gasTank)), "wiring: nft forwarder not trusted");
        require(nft.trustedForwarder() == address(gasTank), "wiring: nft forwarder mismatch");
        require(processor.axiomVault() == address(vault), "wiring: processor.axiomVault mismatch");
        require(processor.swapPairToken() == swapPairToken, "wiring: processor.swapPairToken mismatch");
        require(processor.swapFeeBps() == swapFeeBps, "wiring: processor.swapFeeBps mismatch");
        require(processor.borrowFactorBps() == borrowFactorBps, "wiring: processor.borrowFactorBps mismatch");
        require(processor.maxPayCap() == maxPayCap, "wiring: processor.maxPayCap mismatch");
        require(gasTank.owner() == oracleAdmin, "wiring: gasTank.owner mismatch");
        require(gasTank.maxGasPerOp() == maxGasPerOp, "wiring: gasTank.maxGasPerOp mismatch");
        // Mainnet posture: reserve unfunded at deploy. With AXIOM_ALLOW_GRANTS unset the
        // grant defaults (0.01 OG x 3) cannot fire: every _lazyGrant/grantCredit reverts
        // ReserveExhausted until the owner explicitly opts in post-deploy.
        require(gasTank.gasGrant() == gasGrant, "wiring: gasTank.gasGrant mismatch");
        require(gasTank.grantsCap() == grantsCap, "wiring: gasTank.grantsCap mismatch");
        require(gasTank.reserve() == 0, "wiring: gasTank reserve funded at deploy; depositReserve is an operator step");

        string memory jsonPath = string.concat("../../docs/deployments/aristotle-v3-", deployDate, ".json");
        string memory json = _buildDeploymentJson(
            deployDate,
            block.timestamp,
            teeSigner,
            oracleAdmin,
            paymentTokenAddr,
            swapPairToken,
            address(verifier),
            address(nft),
            address(implementation),
            address(vault),
            address(processor),
            address(registry),
            address(gasTank),
            maxPayCap,
            swapFeeBps,
            borrowFactorBps,
            maxGasPerOp,
            gasGrant,
            grantsCap
        );
        vm.writeFile(jsonPath, json);

        console2.log("========== Axiom Protocol deployed (Aristotle mainnet) ==========");
        console2.log("Chain ID:          ", block.chainid);
        console2.log("TEE Signer:        ", teeSigner);
        console2.log("Oracle Admin:      ", oracleAdmin);
        console2.log("Relayer:           ", relayerAddr);
        console2.log("Verifier:          ", address(verifier));
        console2.log("NFT proxy:         ", address(nft));
        console2.log("Vault:             ", address(vault));
        console2.log("Payment Processor: ", address(processor));
        console2.log("DelegationRegistry:", address(registry));
        console2.log("GasTank:           ", address(gasTank));
        console2.log("Swap pair token:   ", swapPairToken);
        console2.log("maxPayCap:         ", maxPayCap);
        console2.log("");
        console2.log("NEXT: decide AXIOM_ALLOW_GRANTS, then (owner) setGrantsCap/setGasGrant + depositReserve; keep the relayer key funded; run the relayer against the GasTank.");
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
        address swapPairToken,
        address verifier,
        address nftProxy,
        address nftImpl,
        address vault,
        address processor,
        address registry,
        address gasTank,
        uint256 maxPayCap,
        uint256 swapFeeBps,
        uint256 borrowFactorBps,
        uint256 maxGasPerOp,
        uint256 gasGrant,
        uint256 grantsCap
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
            '",\n',
            '    "AxiomDelegationRegistry":  "',
            vm.toString(registry),
            '",\n',
            '    "AxiomGasTank":             "',
            vm.toString(gasTank),
            '"\n',
            "  },\n",
            '  "gasTank": {\n',
            '    "note": "non-upgradeable, owner == oracleAdmin. Reserve NOT funded at deploy: with AXIOM_ALLOW_GRANTS unset the 0.01 OG x 3 grant defaults cannot fire (every _lazyGrant/grantCredit reverts ReserveExhausted). Enabling later = explicit owner setGrantsCap/setGasGrant + depositReserve.",\n',
            '    "gasGrant": "',
            vm.toString(gasGrant),
            '",\n',
            '    "grantsCap": "',
            vm.toString(grantsCap),
            '",\n',
            '    "maxGasPerOp": "',
            vm.toString(maxGasPerOp),
            '",\n',
            '    "reserve": "0"\n',
            "  },\n",
            '  "forwarderWiring": {\n',
            '    "note": "GasTank is the sole ERC-2771 trusted forwarder on the NFT and Processor.",\n',
            '    "nft.trustedForwarder": "',
            vm.toString(gasTank),
            '",\n',
            '    "processor.trustedForwarder": "',
            vm.toString(gasTank),
            '"\n',
            "  },\n",
            '  "swap": {\n',
            '    "swapPairToken": "',
            vm.toString(swapPairToken),
            '",\n',
            '    "swapFeeBps": "',
            vm.toString(swapFeeBps),
            '",\n',
            '    "borrowFactorBps": "',
            vm.toString(borrowFactorBps),
            '"\n',
            "  },\n",
            '  "caps": {\n',
            '    "maxPayCap": "',
            vm.toString(maxPayCap),
            '"\n',
            "  }\n",
            "}\n"
        );
    }
}
