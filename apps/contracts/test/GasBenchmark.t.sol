// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";

/// @title GasBenchmark
/// @notice Minimal gas benchmark for core Axiom contracts on 0G Chain
contract GasBenchmark is Test {
    AxiomAgentNFT public nft;
    AxiomTeeVerifier public verifier;
    AxiomPaymentProcessor public paymentProcessor;
    AxiomStrategyVault public vault;

    address public admin = address(0x1000000000000000000000000000000000000001);
    address public alice = address(0x2000000000000000000000000000000000000002);
    address public bob   = address(0x3000000000000000000000000000000000000003);
    address public teeSigner = address(0x4000000000000000000000000000000000000004);
    address public treasury   = address(0x5000000000000000000000000000000000000005);
    address public mockUsdc   = address(0x6000000000000000000000000000000000000006);

    IntelligentData[] public testData;

    function setUp() public {
        // Build test data for mint
        testData = new IntelligentData[](1);
        testData[0] = IntelligentData({
            dataDescription: "v1",
            dataHash: keccak256("test-data")
        });

        // Deploy Verifier
        verifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);

        // Deploy NFT (UUPS proxy pattern)
        AxiomAgentNFT implementation = new AxiomAgentNFT();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                address(verifier),
                admin
            )
        );
        nft = AxiomAgentNFT(address(proxy));

        // Deploy Strategy Vault
        vault = new AxiomStrategyVault(address(nft), admin);

        // Deploy Payment Processor
        // constructor(nftAddr, paymentTokenAddr, treasuryAddr, protocolFeeBps_, initialOwner)
        paymentProcessor = new AxiomPaymentProcessor(
            address(nft),
            mockUsdc,
            treasury,
            100,  // 1% protocol fee
            admin
        );
    }

    // ── Deploy gas ──────────────────────────────────────────────────

    function testGas_deployVerifier() public {
        new AxiomTeeVerifier(admin, teeSigner, 7 days);
    }

    function testGas_deployNFTImplementation() public {
        new AxiomAgentNFT();
    }

    function testGas_deployNFTProxy() public {
        AxiomAgentNFT impl = new AxiomAgentNFT();
        new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                address(verifier),
                admin
            )
        );
    }

    function testGas_deployStrategyVault() public {
        new AxiomStrategyVault(address(nft), admin);
    }

    function testGas_deployPaymentProcessor() public {
        new AxiomPaymentProcessor(
            address(nft),
            mockUsdc,
            treasury,
            100,
            admin
        );
    }

    // ── NFT functions ───────────────────────────────────────────────

    function testGas_nftMint() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(testData, alice);
    }

    function testGas_nftCreatorOf() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(testData, alice);
        nft.creatorOf(0);
    }

    function testGas_nftOwnerOf() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(testData, alice);
        nft.ownerOf(0);
    }

    function testGas_nftTransfer() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(testData, alice);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 0);
    }

    function testGas_nftSafeTransfer() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(testData, alice);
        vm.prank(alice);
        nft.safeTransferFrom(alice, bob, 0);
    }

    // ── Verifier functions (read-only) ──────────────────────────────

    function testGas_verifierMaxProofAge() public view {
        verifier.maxProofAgeSeconds();
    }

    function testGas_verifierOwner() public view {
        verifier.owner();
    }

    function testGas_verifierRegisteredSigner() public view {
        verifier.registeredSigner();
    }

    function testGas_verifierRegisterSigner() public {
        vm.prank(admin);
        verifier.registerSigner(address(0x7000000000000000000000000000000000000007));
    }

    // ── Vault functions ─────────────────────────────────────────────

    function testGas_vaultDeposit() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.deposit{value: 1 ether}(0);
    }

    // ── Payment Processor functions ─────────────────────────────────

    function testGas_paymentPause() public {
        vm.prank(admin);
        paymentProcessor.pause();
    }

    function testGas_paymentUnpause() public {
        vm.prank(admin);
        paymentProcessor.pause();
        vm.prank(admin);
        paymentProcessor.unpause();
    }

    function testGas_paymentProtocolFee() public view {
        paymentProcessor.protocolFeeBps();
    }

    function testGas_paymentPaymentToken() public view {
        paymentProcessor.paymentToken();
    }
}
