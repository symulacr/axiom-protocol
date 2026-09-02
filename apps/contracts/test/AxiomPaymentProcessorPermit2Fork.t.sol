// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ISignatureTransfer} from "../src/permit2/ISignatureTransfer.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {LiveForkTest} from "./helpers/LiveForkTest.sol";

interface IERC20Probe {
    function balanceOf(
        address
    ) external view returns (uint256);
    function transfer(
        address,
        uint256
    ) external returns (bool);
}

/// @dev Minimal stand-in for AxiomAgentNFT.
contract MockAxiomAgentNFTFork is IAxiomAgentNFT {
    mapping(uint256 => address) internal _creators;

    function setCreator(
        uint256 tokenId,
        address creator
    ) external {
        _creators[tokenId] = creator;
    }

    function creatorOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _creators[tokenId];
    }

    function ownerOf(
        uint256
    ) external pure override returns (address) {
        return address(0);
    }
}

/// @notice Fork-gated test: real Permit2 at the canonical address on a live 0G Galileo fork
///         (skipped unless FOUNDRY_LIVE_FORK=1). Proves the witness lane's EIP-712 hashing matches
///         production Permit2 end-to-end — the unit stub cannot fully certify that.
/// @dev    Requires PERMIT2_FUNDED_KEY (private key of an EOA holding the payment token on
///         Galileo, already approved for Permit2). Defaults target the deployed AxiomMockUSDC;
///         override with PERMIT2_TOKEN for another token. Mint some via the mock's public mint
///         (vm.store/prank as appropriate) or fund the key out-of-band before running.
contract AxiomPaymentProcessorPermit2ForkTest is LiveForkTest {
    AxiomPaymentProcessor internal processor;
    MockAxiomAgentNFTFork internal nft;
    IERC20Probe internal token;

    address internal treasury = address(0x0A1D);
    address internal creator = address(0xC0FFEE);
    address internal payer;
    uint256 internal payerKey;

    uint256 internal constant AGENT_TOKEN_ID = 1;
    uint256 internal constant PROTOCOL_FEE_BPS = 250; // 2.5%
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Deployed AxiomMockUSDC (docs/deployments/galileo-v2-2026-08-28.json)
    address internal constant DEFAULT_TOKEN = 0x354CA53bAB51C0666964fa050628d8351f8A7d19;

    event PaymentProcessed(
        uint256 indexed agentTokenId,
        address indexed payer,
        address indexed creator,
        uint256 amount,
        uint256 creatorCut,
        uint256 protocolCut
    );

    function setUp() public {
        _skipUnlessLiveFork();
        vm.createSelectFork(_forkRpcUrl(), _forkPinBlock());

        payerKey = vm.envUint("PERMIT2_FUNDED_KEY");
        payer = vm.addr(payerKey);

        try vm.envAddress("PERMIT2_TOKEN") returns (address t) {
            token = IERC20Probe(t);
        } catch {
            token = IERC20Probe(DEFAULT_TOKEN);
        }

        nft = new MockAxiomAgentNFTFork();
        nft.setCreator(AGENT_TOKEN_ID, creator);
        AxiomPaymentProcessor impl = new AxiomPaymentProcessor();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                impl.initialize.selector, address(nft), address(token), treasury, PROTOCOL_FEE_BPS, payer
            )
        );
        processor = AxiomPaymentProcessor(address(proxy));

        // Live Permit2 sanity: the canonical address must hold code on the fork.
        require(PERMIT2.code.length > 0, "Permit2 missing on fork");
    }

    /// @notice Full happy path against production Permit2: sign -> permitWitnessTransferFrom ->
    ///         split. Amounts sized from the funder's actual balance.
    function test_fork_payForAgentWithPermit2_realPermit2() public {
        uint256 balance = token.balanceOf(payer);
        require(balance > 0, "funder holds no payment token; set PERMIT2_FUNDED_KEY with funds");
        uint256 amount = balance / 100; // pay 1% of the funder balance

        uint256 nonce = 0;
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), address(token), amount));
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,AgentPayment witness)TokenPermissions(address token,uint256 amount)"
                ),
                tokenPermissionsHash,
                address(processor),
                nonce,
                deadline,
                keccak256(
                    abi.encode(keccak256("AgentPayment(uint256 agentTokenId,uint256 amount)"), AGENT_TOKEN_ID, amount)
                )
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                        keccak256("Permit2"),
                        block.chainid,
                        PERMIT2
                    )
                ),
                structHash
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });

        uint256 payerBefore = token.balanceOf(payer);
        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, amount - expectedProtocolCut, expectedProtocolCut);

        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, permit, abi.encodePacked(r, s, v));

        assertEq(token.balanceOf(payer), payerBefore - amount, "real Permit2 pulled exactly `amount`");
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "treasury received protocol cut via real Permit2");
        assertEq(processor.agentEarningsOf(creator), amount - expectedProtocolCut, "creator credited via real Permit2");
    }
}
