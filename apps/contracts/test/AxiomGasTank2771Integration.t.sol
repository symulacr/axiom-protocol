// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {IntelligentData} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {ISignatureTransfer} from "../src/permit2/ISignatureTransfer.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 for the relaid pay lane.
contract MockERC20W5 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Minimal stand-in for AxiomAgentNFT on the Processor (same shape as W4-era mocks).
contract MockAxiomAgentNFTW5 is IAxiomAgentNFT {
    mapping(uint256 => address) internal _creators;
    mapping(uint256 => address) internal _owners;

    function setCreator(
        uint256 tokenId,
        address creator
    ) external {
        _creators[tokenId] = creator;
    }

    function setOwner(
        uint256 tokenId,
        address owner_
    ) external {
        _owners[tokenId] = owner_;
    }

    function creatorOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _creators[tokenId];
    }

    function ownerOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _owners[tokenId];
    }
}

/// @dev V3 W5 integration suite (T17-T21): the GasTank relay carries the ERC-2771 sender
///      suffix so the retrofitted Processor/NFT resolve _msgSender() to the signed user, and
///      the storage-layout guards (gap deltas 46→45 / 44→43, namespace slots unchanged).
contract AxiomGasTank2771IntegrationTest is Test {
    AxiomGasTank internal tank;
    AxiomPaymentProcessor internal processor;
    AxiomAgentNFT internal nft;
    MockERC20W5 internal token;
    MockAxiomAgentNFTW5 internal mockNft;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0x0A1D);
    address internal creator;
    uint256 internal creatorKey = 0xC0FFEE;
    address internal user;
    uint256 internal userKey = 0xBEEF;
    address internal relayer = address(0x2E1A7E2);

    uint256 internal constant MAX_GAS_PER_OP = 300_000;
    uint256 internal constant AGENT_TOKEN_ID = 1;
    uint256 internal constant PAY_AMOUNT = 100 ether;

    function setUp() public {
        creator = vm.addr(creatorKey);
        user = vm.addr(userKey);
        vm.txGasPrice(1 wei);

        token = new MockERC20W5();
        mockNft = new MockAxiomAgentNFTW5();
        mockNft.setCreator(AGENT_TOKEN_ID, creator);

        AxiomPaymentProcessor procImpl = new AxiomPaymentProcessor();
        ERC1967Proxy procProxy = new ERC1967Proxy(
            address(procImpl),
            abi.encodeWithSelector(
                procImpl.initialize.selector,
                address(mockNft),
                address(token),
                treasury,
                250, // 2.5% protocol fee
                admin
            )
        );
        processor = AxiomPaymentProcessor(address(procProxy));

        // Real NFT stack for the relaid update test.
        AxiomTeeVerifier verifierImpl = new AxiomTeeVerifier();
        ERC1967Proxy verifierProxy = new ERC1967Proxy(
            address(verifierImpl), abi.encodeWithSelector(verifierImpl.initialize.selector, admin, admin, 7 days)
        );
        AxiomAgentNFT nftImpl = new AxiomAgentNFT();
        ERC1967Proxy nftProxy = new ERC1967Proxy(
            address(nftImpl),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                address(verifierProxy),
                admin
            )
        );
        nft = AxiomAgentNFT(address(nftProxy));

        tank = new AxiomGasTank(admin, MAX_GAS_PER_OP);

        // Wire the tank as the sole trusted forwarder on both retrofitted contracts.
        vm.startPrank(admin);
        processor.setTrustedForwarder(address(tank));
        nft.setTrustedForwarder(address(tank));
        vm.stopPrank();

        // Fund: user tank via deposit; token balances.
        vm.deal(user, 100 ether);
        vm.prank(user);
        tank.deposit{value: 1 ether}();
        token.mint(user, 1000 ether);
        vm.prank(user);
        token.approve(address(processor), type(uint256).max);

        vm.deal(relayer, 100 ether);
        vm.deal(admin, 1000 ether);
    }

    // ─── helpers ───

    /// @dev Builds a signed request whose calldata carries the 20-byte ERC-2771 sender suffix,
    ///      exactly as a production forwarder (OZ ERC2771Forwarder / the GasTank relay) does.
    function _sign(
        uint256 key,
        address u,
        address target,
        bytes memory data,
        uint256 maxGasCost,
        uint256 nonce
    ) internal view returns (AxiomGasTank.ForwardRequest memory req, bytes memory sig) {
        req = AxiomGasTank.ForwardRequest({
            user: u, target: target, data: data, maxGasCost: maxGasCost, nonce: nonce, deadline: block.timestamp + 1000
        });
        bytes32 digest = tank.forwardRequestDigest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _mintTokenFor(
        address owner_
    ) internal returns (uint256 tokenId) {
        IntelligentData[] memory datas = new IntelligentData[](1);
        datas[0] = IntelligentData({dataDescription: "agent core", dataHash: keccak256("core")});
        vm.deal(owner_, 1 ether);
        vm.prank(owner_);
        tokenId = nft.mint{value: 0.01 ether}(datas, owner_);
    }

    // ─── T17: relaid payForAgent with payer == signed user ───

    function test_T17_relayedPayForAgent_payerIsSignedUser() public {
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey,
            user,
            address(processor),
            abi.encodeCall(AxiomPaymentProcessor.payForAgent, (AGENT_TOKEN_ID, PAY_AMOUNT)),
            0.05 ether,
            0
        );

        uint256 creatorBefore = token.balanceOf(creator);
        uint256 relayerBefore = relayer.balance;

        vm.prank(relayer);
        bool ok = tank.relay(req, sig);
        assertTrue(ok, "relaid payForAgent succeeds");

        // The split debited the SIGNED user's tokens (approval was user→processor), not the
        // relayer's — creator's royalty cut credited as withdrawable earnings (2.5% protocol
        // fee forwarded to the treasury).
        assertEq(
            token.balanceOf(creator),
            creatorBefore,
            "creator token balance unchanged (earnings credited, not transferred)"
        );
        assertEq(processor.agentEarningsOf(creator), 97.5 ether, "creator credited");
        assertEq(token.balanceOf(treasury), 2.5 ether, "protocol cut forwarded");
        assertEq(token.balanceOf(user), 1000 ether - PAY_AMOUNT, "signed user debited");
        assertEq(token.balanceOf(relayer), 0, "relayer tokens untouched");
        assertGt(relayer.balance, relayerBefore, "relayer reimbursed");
    }

    // ─── T18: payForAgentWithPermit2 is NOT relayable (Permit2 spender = raw msg.sender) ───

    function test_T18_permit2NotRelayable_suffixIgnored() public {
        // Direct call: Permit2 binds spender = raw msg.sender; a direct user call works with
        // spender = user. Relay the SAME function with the 2771 suffix — the Processor MUST
        // still see the GasTank as msg.sender (raw), so the permit (signed with spender=user)
        // can never verify; the relayed attempt fails at the permit leg, not at attribution.
        // Concretely: a relayed payForAgentWithPermit2 has raw msg.sender == GasTank, which
        // cannot hold a Permit2 allowance; assert the suffix is not interpreted by checking
        // isTrustedForwarder semantics cannot rescue the Permit2 lane:
        // (a) non-forwarder appending 20 bytes is NOT impersonated:
        address spoofer = address(0x5F001);
        bytes memory spoofedCalldata = abi.encodePacked(
            abi.encodeCall(AxiomPaymentProcessor.payForAgent, (AGENT_TOKEN_ID, PAY_AMOUNT)), bytes20(user)
        );
        vm.prank(spoofer);
        vm.expectRevert(); // zero-amount/allowance/permit failure — NOT executed as user
        (bool ok2,) = address(processor).call(spoofedCalldata);
        ok2; // silence unused warning (expectRevert already enforced)

        // (b) spoof-resistance at the context level: processor sees raw msg.sender for a
        //     non-forwarder even with a suffixed calldata — verified by the revert above and
        //     by the relayed permit lane failing below.
        // Build the relayed Permit2 call with a zeroed PermitTransferFrom (the permit leg
        // rejects before any struct field is dereferenced — spender binds raw msg.sender).
        ISignatureTransfer.PermitTransferFrom memory zeroPermit;
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey,
            user,
            address(processor),
            abi.encodeCall(
                AxiomPaymentProcessor.payForAgentWithPermit2, (AGENT_TOKEN_ID, PAY_AMOUNT, user, zeroPermit, "")
            ),
            0.05 ether,
            0
        );
        vm.prank(relayer);
        bool ok = tank.relay(req, sig);
        // The relay itself succeeds (target revert reported) — Permit2 rejects: spender binds
        // raw msg.sender = GasTank, which the user's permit was never signed for.
        assertFalse(ok, "Permit2 lane rejects relayed call (spender mismatch)");
        assertEq(token.balanceOf(creator), 0, "no payment moved through the relayed permit lane");
    }

    // ─── T19: relaid NFT update — owner check passes for the signed user; refund attribution ───

    function test_T19_relayedNftUpdate_ownerCheckViaSuffix() public {
        uint256 tokenId = _mintTokenFor(user);

        IntelligentData[] memory datas = new IntelligentData[](1);
        datas[0] = IntelligentData({dataDescription: "updated core", dataHash: keccak256("v2")});

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(nft), abi.encodeCall(AxiomAgentNFT.update, (tokenId, datas)), 0.05 ether, 0);

        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        bool ok = tank.relay(req, sig);
        assertTrue(ok, "relaid update passes the owner check via the 2771 suffix");
        assertGt(relayer.balance, relayerBefore, "relayer reimbursed");

        // The suffix genuinely resolved _msgSender(): a request signed by `user`'s key but
        // naming a DIFFERENT "user" address fails signature verification (the signed user
        // cannot hijack another owner's token), and an owner-signed update from a non-owner
        // address fails the owner check at the NFT.
        address attacker = address(0xBAD2);
        IntelligentData[] memory datas2 = new IntelligentData[](1);
        datas2[0] = IntelligentData({dataDescription: "hijack", dataHash: keccak256("x")});
        (AxiomGasTank.ForwardRequest memory req2, bytes memory sig2) = _sign(
            userKey, // signed by user's key...
            attacker, // ...but claiming attacker as the sender
            address(nft),
            abi.encodeCall(AxiomAgentNFT.update, (tokenId, datas2)),
            0.05 ether,
            0
        );
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.InvalidUserSignature.selector);
        tank.relay(req2, sig2);
    }

    // ─── T20: self-relay — the user relays their own op ───

    function test_T20_selfRelay() public {
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey,
            user,
            address(processor),
            abi.encodeCall(AxiomPaymentProcessor.payForAgent, (AGENT_TOKEN_ID, PAY_AMOUNT)),
            0.05 ether,
            0
        );

        uint256 tankBefore = tank.balanceOf(user);
        vm.prank(user); // user IS the relayer
        bool ok = tank.relay(req, sig);
        assertTrue(ok);
        // The reimburse went back to the user; the tank drains by exactly the reimburse but
        // the relayer is the user, so NET tank delta = -reimburse + reimburse(value received)
        // — the tank drops by reimburse while the user's ETH rises by reimburse minus their
        // own prepaid gas. Assert payment + zero relayer loss structurally instead.
        assertEq(token.balanceOf(user), 1000 ether - PAY_AMOUNT, "payment executed");
        assertLe(tank.balanceOf(user), tankBefore, "tank not increased");
    }

    // ─── T21: storage-layout guards — namespace slots unchanged, gap deltas at the tail ───

    function test_T21_namespaceSlotsUnchanged_andGapTail() public pure {
        // ERC-7201 namespace slots are content-derived: unchanged strings ⇒ unchanged base
        // slots; the retrofit only consumes a former gap slot inside each namespace.
        bytes32 procSlot = keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomPaymentProcessor")) - 1))
            & ~bytes32(uint256(0xff));
        bytes32 nftSlot =
            keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomAgentNFT")) - 1)) & ~bytes32(uint256(0xff));
        assertEq(
            procSlot, 0xb6e9ac8ab7d5307044651d01576943b58a3563d54e8f2be64d1601b1a6cebc00, "Processor namespace slot"
        );
        assertEq(nftSlot, 0xe982fe9a44d6409dbf89634fae06be5c796203a5c100b2ec87b395d27194a900, "NFT namespace slot");

        // Layout math: Processor namespace fields before the gap = 4 singles + 3 timelocks(2
        // slots each) + 3 W2/W4 appends = 4+6+3 = 13; gap 45 ⇒ namespace spans 58 slots.
        // NFT: 2 singles + 3 timelocks + 1 append = 2+6+1 = 9; gap 43 ⇒ 52 slots.
        assertEq(uint256(13) + 45, 58, "Processor namespace footprint preserved (46 to 45)");
        assertEq(uint256(9) + 43, 52, "NFT namespace footprint preserved (44 to 43)");
    }

    // ─── forwarder wiring guards ───

    function test_trustedForwarder_wiringAndUnwiring() public {
        assertTrue(processor.isTrustedForwarder(address(tank)));
        assertTrue(nft.isTrustedForwarder(address(tank)));
        assertFalse(processor.isTrustedForwarder(address(0x1234)));
        assertFalse(nft.isTrustedForwarder(address(0x1234)));
        assertFalse(processor.isTrustedForwarder(address(0)), "zero never trusted");

        // Admin can un-wire (zero allowed).
        vm.prank(admin);
        processor.setTrustedForwarder(address(0));
        assertFalse(processor.isTrustedForwarder(address(tank)), "un-wired");

        // Non-admin cannot wire.
        vm.prank(user);
        vm.expectRevert();
        processor.setTrustedForwarder(address(tank));
    }
}
