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
    address public bob = address(0x3000000000000000000000000000000000000003);
    address public teeSigner = address(0x4000000000000000000000000000000000000004);
    address public treasury = address(0x5000000000000000000000000000000000000005);
    address public mockUsdc = address(0x6000000000000000000000000000000000000006);

    IntelligentData[] public benchData;

    function setUp() public {
        // Build test data for mint
        benchData = new IntelligentData[](1);
        benchData[0] = IntelligentData({dataDescription: "v1", dataHash: keccak256("test-data")});

        // Deploy Verifier
        AxiomTeeVerifier verifierImpl = new AxiomTeeVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl),
            abi.encodeWithSelector(
                AxiomTeeVerifier.initialize.selector,
                admin,
                teeSigner,
                7 days
            )
        );
        verifier = AxiomTeeVerifier(address(verifierProxy));

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
        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(
                AxiomStrategyVault.initialize.selector,
                address(nft),
                admin
            )
        );
        vault = AxiomStrategyVault(payable(address(vaultProxy)));

        // Deploy Payment Processor (UUPS proxy pattern)
        AxiomPaymentProcessor ppImpl = new AxiomPaymentProcessor();
        ERC1967Proxy ppProxy = new ERC1967Proxy(
            address(ppImpl),
            abi.encodeWithSelector(
                AxiomPaymentProcessor.initialize.selector,
                address(nft),
                mockUsdc,
                treasury,
                100, // 1% protocol fee
                admin
            )
        );
        paymentProcessor = AxiomPaymentProcessor(address(ppProxy));
    }

    // ── Deploy gas ──────────────────────────────────────────────────

    function testGas_deployVerifier() public {
        AxiomTeeVerifier impl = new AxiomTeeVerifier();
        new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                AxiomTeeVerifier.initialize.selector,
                admin,
                teeSigner,
                7 days
            )
        );
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
        AxiomStrategyVault impl = new AxiomStrategyVault();
        new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                AxiomStrategyVault.initialize.selector,
                address(nft),
                admin
            )
        );
    }

    function testGas_deployPaymentProcessor() public {
        AxiomPaymentProcessor impl = new AxiomPaymentProcessor();
        new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                AxiomPaymentProcessor.initialize.selector,
                address(nft),
                mockUsdc,
                treasury,
                100,
                admin
            )
        );
    }

    // ── NFT functions ───────────────────────────────────────────────

    function testGas_nftMint() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(benchData, alice);
    }

    function testGas_nftCreatorOf() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(benchData, alice);
        nft.creatorOf(0);
    }

    function testGas_nftOwnerOf() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(benchData, alice);
    }

    function testGas_nftTransfer() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(benchData, alice);
        vm.prank(alice);
        // Bare ERC-721 transfers are disabled; iTransfer* required.
        vm.expectRevert();
        nft.transferFrom(alice, bob, 0);
    }

    function testGas_nftSafeTransfer() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        nft.mint{value: 0.01 ether}(benchData, alice);
        vm.prank(alice);
        vm.expectRevert();
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

    function testGas_verifierProposeSigner() public {
        vm.prank(admin);
        verifier.proposeSigner(address(0x7000000000000000000000000000000000000007));
    }

    // ── Vault functions ─────────────────────────────────────────────

    function testGas_vaultDeposit() public {
        // Mint a token to alice so tokenId 0 exists for the vault deposit.
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        uint256 tid = nft.mint{value: 0.01 ether}(benchData, alice);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vault.deposit{value: 1 ether}(tid);
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
