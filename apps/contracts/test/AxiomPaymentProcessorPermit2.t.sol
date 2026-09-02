// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ISignatureTransfer} from "../src/permit2/ISignatureTransfer.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";

/// @dev Minimal ERC-20 used in the permit2 tests (same shape as AxiomPaymentProcessor.t.sol).
contract MockPermit2ERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

/// @dev Stub Permit2 implementing only `permitWitnessTransferFrom` with the exact EIP-712
///      hashing of upstream Uniswap/permit2 (SignatureTransfer.sol + PermitHash.sol + EIP712.sol,
///      domain: name "Permit2", chainId block.chainid, verifyingContract = this). Deployed and
///      then vm.etch'ed onto the canonical PERMIT2 address (the processor hardcodes it), so the
///      domain's verifyingContract matches what the production lane targets on Galileo.
///      Nonce handling mirrors upstream: unordered bitmap keyed (owner, nonce >> 8), bit 1 << (nonce & 255).
///      W6-A: also implements the bare `permitTransferFrom` / `permitBatchTransferFrom`
///      (same witnessless struct hash, upstream PermitHash.hash types) so the stub satisfies the
///      extended ISignatureTransfer and the swap suite can etch it too.
contract MockPermit2 is ISignatureTransfer {
    bytes32 private constant _TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    string private constant _PERMIT_WITNESS_TYPEHASH_STUB =
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,";
    string private constant _PERMIT_TRANSFER_TYPEHASH_STUB =
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)";
    string private constant _PERMIT_BATCH_TRANSFER_TYPEHASH_STUB =
        "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)";
    bytes32 private constant _PERMIT_BATCH_TYPEHASH =
        keccak256(
            "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant _DOMAIN_TYPE_HASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 private constant _HASHED_NAME = keccak256("Permit2");

    error InvalidNonce();
    error SignatureDeadlineExpired();
    error InvalidSigner();

    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(_DOMAIN_TYPE_HASH, _HASHED_NAME, block.chainid, address(this)));
    }

    function permitWitnessTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external override {
        if (block.timestamp > permit.deadline) revert SignatureDeadlineExpired();

        uint256 wordPos = permit.nonce >> 8;
        uint256 bit = 1 << (permit.nonce & 255);
        uint256 bitmap = nonceBitmap[owner][wordPos];
        if (bitmap & bit != 0) revert InvalidNonce();
        nonceBitmap[owner][wordPos] = bitmap | bit;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(abi.encodePacked(_PERMIT_WITNESS_TYPEHASH_STUB, witnessTypeString)),
                keccak256(abi.encode(_TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount)),
                msg.sender,
                permit.nonce,
                permit.deadline,
                witness
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != owner) revert InvalidSigner();

        ERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }

    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external override {
        if (block.timestamp > permit.deadline) revert SignatureDeadlineExpired();

        uint256 wordPos = permit.nonce >> 8;
        uint256 bit = 1 << (permit.nonce & 255);
        uint256 bitmap = nonceBitmap[owner][wordPos];
        if (bitmap & bit != 0) revert InvalidNonce();
        nonceBitmap[owner][wordPos] = bitmap | bit;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(bytes(_PERMIT_TRANSFER_TYPEHASH_STUB)),
                keccak256(abi.encode(_TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount)),
                msg.sender,
                permit.nonce,
                permit.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != owner) revert InvalidSigner();

        ERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }

    function permitBatchTransferFrom(
        PermitBatchTransferFrom memory permit,
        SignatureTransferDetails[] calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external override {
        if (block.timestamp > permit.deadline) revert SignatureDeadlineExpired();

        uint256 wordPos = permit.nonce >> 8;
        uint256 bit = 1 << (permit.nonce & 255);
        uint256 bitmap = nonceBitmap[owner][wordPos];
        if (bitmap & bit != 0) revert InvalidNonce();
        nonceBitmap[owner][wordPos] = bitmap | bit;

        bytes32[] memory permittedHashes = new bytes32[](permit.permitted.length);
        for (uint256 i = 0; i < permit.permitted.length; ++i) {
            permittedHashes[i] =
                keccak256(abi.encode(_TOKEN_PERMISSIONS_TYPEHASH, permit.permitted[i].token, permit.permitted[i].amount));
        }

        bytes32 structHash = keccak256(
            abi.encode(
                _PERMIT_BATCH_TYPEHASH,
                keccak256(abi.encodePacked(permittedHashes)),
                msg.sender,
                permit.nonce,
                permit.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != owner) revert InvalidSigner();

        for (uint256 i = 0; i < permit.permitted.length; ++i) {
            ERC20(permit.permitted[i].token).transferFrom(owner, transferDetails[i].to, transferDetails[i].requestedAmount);
        }
    }
}

/// @dev Minimal stand-in for AxiomAgentNFT (same as AxiomPaymentProcessor.t.sol).
contract MockAxiomAgentNFTPermit2 is IAxiomAgentNFT {
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

contract AxiomPaymentProcessorPermit2Test is Test {
    AxiomPaymentProcessor internal processor;
    MockPermit2ERC20 internal token;
    MockAxiomAgentNFTPermit2 internal nft;

    address internal owner = address(0x0A11CE);
    address internal treasury = address(0x0A1D);
    address internal creator = address(0xC0FFEE);
    address internal payer; // derived from payerKey — must match the Permit2 signer
    uint256 internal payerKey = 0xA11CE;

    uint256 internal constant AGENT_TOKEN_ID = 1;
    uint256 internal constant PROTOCOL_FEE_BPS = 250; // 2.5%
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    event PaymentProcessed(
        uint256 indexed agentTokenId,
        address indexed payer,
        address indexed creator,
        uint256 amount,
        uint256 creatorCut,
        uint256 protocolCut
    );

    function setUp() public {
        payer = vm.addr(payerKey);

        // The processor hardcodes the canonical PERMIT2 address; etch the stub's runtime code
        // onto it so unit tests exercise the exact call path (no Permit2 source dependency).
        MockPermit2 mock = new MockPermit2();
        vm.etch(PERMIT2, address(mock).code);

        token = new MockPermit2ERC20();
        nft = new MockAxiomAgentNFTPermit2();
        nft.setCreator(AGENT_TOKEN_ID, creator);
        AxiomPaymentProcessor impl = new AxiomPaymentProcessor();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(
                impl.initialize.selector, address(nft), address(token), treasury, PROTOCOL_FEE_BPS, owner
            )
        );
        processor = AxiomPaymentProcessor(address(proxy));

        assertEq(address(mock).code.length, PERMIT2.code.length, "stub etched at canonical address");
    }

    struct SignedPermit {
        ISignatureTransfer.PermitTransferFrom permit;
        bytes signature;
    }

    /// @dev Builds the witness Permit2 signature exactly as a wallet would: EIP-712 domain
    ///      (name "Permit2", chainId, verifyingContract = canonical PERMIT2), struct hash per
    ///      upstream PermitHash.hashWithWitness with spender = processor and the
    ///      AgentPayment witness.
    function _signPermit(
        uint256 signKey,
        uint256 agentTokenId,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        uint256 permittedAmount
    ) internal view returns (SignedPermit memory p) {
        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), address(token), permittedAmount)
        );
        bytes32 witnessTypeHash = keccak256("AgentPayment(uint256 agentTokenId,uint256 amount)");
        bytes32 structHash = keccak256(
            abi.encode(
                // Full referenced-type concat (EIP-712 wallet order: primary def, then
                // referenced defs in field order — permitted→TokenPermissions, witness→AgentPayment),
                // matching Permit2's hashWithWitness typeHash = keccak(stub ++ witnessTypeString):
                keccak256(
                    "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,AgentPayment witness)TokenPermissions(address token,uint256 amount)AgentPayment(uint256 agentTokenId,uint256 amount)"
                ),
                tokenPermissionsHash,
                address(processor),
                nonce,
                deadline,
                keccak256(abi.encode(witnessTypeHash, agentTokenId, amount))
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signKey, digest);
        p.permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: permittedAmount}),
            nonce: nonce,
            deadline: deadline
        });
        p.signature = abi.encodePacked(r, s, v);
    }

    function _defaultPermit(
        uint256 amount,
        uint256 nonce
    ) internal view returns (SignedPermit memory) {
        return _signPermit(payerKey, AGENT_TOKEN_ID, amount, nonce, block.timestamp + 1 hours, amount);
    }

    function _defaultPermit(
        uint256 amount,
        uint256 nonce,
        uint256 permittedAmount
    ) internal view returns (SignedPermit memory) {
        return _signPermit(payerKey, AGENT_TOKEN_ID, amount, nonce, block.timestamp + 1 hours, permittedAmount);
    }

    function _defaultPermit(
        uint256 amount,
        uint256 nonce,
        uint256 permittedAmount,
        uint256 deadline
    ) internal view returns (SignedPermit memory) {
        return _signPermit(payerKey, AGENT_TOKEN_ID, amount, nonce, deadline, permittedAmount);
    }

    // ─── happy path ─────────────────────────────────────────────────
    function test_payForAgentWithPermit2_creditsCreatorAndTransfersToken() public {
        uint256 amount = 1000e6;
        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedCreatorCut = amount - expectedProtocolCut;
        SignedPermit memory p = _defaultPermit(amount, 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        assertEq(token.balanceOf(payer), amount, "payer pre-balance");
        assertEq(token.balanceOf(address(processor)), 0, "processor pre-balance");

        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, expectedCreatorCut, expectedProtocolCut);

        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);

        assertEq(token.balanceOf(payer), 0, "payer debited via permit2");
        assertEq(token.balanceOf(address(processor)), expectedCreatorCut, "processor holds creator cut");
        assertEq(token.balanceOf(treasury), expectedProtocolCut, "treasury received protocol cut");
        assertEq(processor.agentEarningsOf(creator), expectedCreatorCut, "creator earnings credited");
        assertEq(processor.totalOutstandingEarnings(), expectedCreatorCut, "outstanding tracked");
    }

    function test_payForAgentWithPermit2_nonceSingleUse_revertsOnReuse() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0);

        token.mint(payer, 2 * amount);
        vm.prank(payer);
        token.approve(PERMIT2, 2 * amount);

        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);

        vm.expectRevert(); // MockPermit2.InvalidNonce
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_nonceIndependence() public {
        uint256 amount = 100e6;
        SignedPermit memory p1 = _defaultPermit(amount, 0);
        SignedPermit memory p2 = _defaultPermit(amount, 1);

        token.mint(payer, 2 * amount);
        vm.prank(payer);
        token.approve(PERMIT2, 2 * amount);

        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p1.permit, p1.signature);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p2.permit, p2.signature);
        assertEq(processor.agentEarningsOf(creator), 2 * (amount - (amount * PROTOCOL_FEE_BPS) / 10_000));
    }

    // ─── validation reverts (must not consume the permit nonce) ─────
    function test_payForAgentWithPermit2_revertsWhenPermitTokenMismatch() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0);

        // Sign the permit for the real token, then point the submitted permit at another token.
        p.permit.permitted.token = address(0xDEAD);

        vm.expectRevert(AxiomPaymentProcessor.InvalidPermitToken.selector);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_revertsWhenPermittedBelowRequested() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0, amount - 1);

        vm.expectRevert(abi.encodeWithSelector(AxiomPaymentProcessor.InvalidPermitAmount.selector, amount - 1, amount));
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_revertsWhenDeadlineExpired() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0, amount, block.timestamp - 1);

        vm.expectRevert(
            abi.encodeWithSelector(AxiomPaymentProcessor.PermitExpired.selector, block.timestamp - 1, block.timestamp)
        );
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_revertsOnZeroAmount() public {
        SignedPermit memory p = _defaultPermit(0, 0);

        vm.expectRevert(AxiomPaymentProcessor.ZeroAmount.selector);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, 0, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_revertsWhenCreatorNotRegistered() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _signPermit(payerKey, 999, amount, 0, block.timestamp + 1 hours, amount);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        vm.expectRevert(AxiomPaymentProcessor.AgentCreatorNotRegistered.selector);
        processor.payForAgentWithPermit2(999, amount, payer, p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_revertsWhenPaused() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        vm.prank(owner);
        processor.pause();

        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
    }

    // ─── signature / witness binding ────────────────────────────────
    function test_payForAgentWithPermit2_revertsWhenWrongSigner() public {
        uint256 amount = 100e6;
        SignedPermit memory p = _defaultPermit(amount, 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        // Signature signed by payerKey but submitted for a different owner.
        vm.expectRevert(); // MockPermit2.InvalidSigner
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, address(0xF00D), p.permit, p.signature);
    }

    function test_payForAgentWithPermit2_witnessBindsAgentTokenId() public {
        uint256 amount = 100e6;
        // Signed for agent 1, submitted for agent 2 — the witness must invalidate the signature.
        SignedPermit memory p = _defaultPermit(amount, 0);

        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        vm.expectRevert(); // MockPermit2.InvalidSigner
        processor.payForAgentWithPermit2(2, amount, payer, p.permit, p.signature);

        // And the correctly-bound call still succeeds with the same signature.
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
        assertGt(processor.agentEarningsOf(creator), 0, "witness-bound pay succeeded");
    }

    // ─── MAX_PAY cap on the permit lane ─────────────────────────────
    function test_payForAgentWithPermit2_enforcesMaxPayCap_beforePermitConsumption() public {
        uint256 cap = 500e6;
        vm.prank(owner);
        processor.setMaxPayCap(cap);

        uint256 amount = 1000e6;
        SignedPermit memory p = _defaultPermit(amount, 0);
        token.mint(payer, amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        vm.expectRevert(abi.encodeWithSelector(AxiomPaymentProcessor.PayAmountExceedsCap.selector, amount, cap));
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);

        // Cap check fires BEFORE permit2 consumes the nonce: the same signature can be retried
        // after the cap is raised.
        vm.prank(owner);
        processor.setMaxPayCap(2000e6);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
        assertGt(processor.agentEarningsOf(creator), 0, "retry after cap raise succeeded");
    }

    // ─── over-permitted amounts ─────────────────────────────────────
    function test_payForAgentWithPermit2_permittedAboveRequested_usesRequestedOnly() public {
        uint256 amount = 100e6;
        uint256 permitted = 2 * amount;
        SignedPermit memory p = _defaultPermit(amount, 0, permitted);

        token.mint(payer, permitted);
        vm.prank(payer);
        token.approve(PERMIT2, permitted);

        uint256 expectedProtocolCut = (amount * PROTOCOL_FEE_BPS) / 10_000;
        vm.expectEmit(true, true, true, true);
        emit PaymentProcessed(AGENT_TOKEN_ID, payer, creator, amount, amount - expectedProtocolCut, expectedProtocolCut);

        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);
        assertEq(token.balanceOf(payer), permitted - amount, "only requested amount pulled");
    }

    // ─── split equivalence with the approval lane ───────────────────
    function test_payForAgentWithPermit2_splitMatchesPayForAgent() public {
        uint256 amount = 1000e6;

        token.mint(payer, 2 * amount);
        vm.prank(payer);
        token.approve(address(processor), amount);
        vm.prank(payer);
        token.approve(PERMIT2, amount);

        vm.prank(payer);
        processor.payForAgent(AGENT_TOKEN_ID, amount);
        uint256 refCreator = processor.agentEarningsOf(creator);
        uint256 refTreasury = token.balanceOf(treasury);

        SignedPermit memory p = _defaultPermit(amount, 0);
        processor.payForAgentWithPermit2(AGENT_TOKEN_ID, amount, payer, p.permit, p.signature);

        assertEq(processor.agentEarningsOf(creator) - refCreator, refCreator, "same creator cut per pay");
        assertEq(token.balanceOf(treasury) - refTreasury, refTreasury, "same protocol cut per pay");
    }
}
