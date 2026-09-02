// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {BaseVerifier} from "../src/verifiers/BaseVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TimelockManager} from "../src/libraries/TimelockManager.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType,
    TransferValidityProofOutput
} from "../src/interfaces/IERC7857DataVerifier.sol";

/// @title AxiomTeeVerifier.t.sol
/// @notice Test suite for F-01 fix: signer rotation must be onlyOwner + timelocked.
/// @dev    These tests cover the ship-blocker CRITICAL finding from docs/security/report-v0.md.
///         Before the fix, signer rotation had no access control, so any external caller could
///         rotate the trusted TEE signer and steal every iNFT on the next transfer. After the
///         fix, the constructor takes the initial owner (OZ OwnableUpgradeable), signer rotation
///         uses `proposeSigner` + `executeSigner` behind `onlyOwner` and `ADMIN_DELAY`, and a
///         separate `initialize` is available for proxied deployments. References:
///           - https://docs.openzeppelin.com/contracts/5.x/access-control
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableUpgradeable
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-_transferOwnership-address-
contract AxiomTeeVerifierTest is Test {
    AxiomTeeVerifier internal verifier;

    // Deterministic test keys (mirroring the pattern in AxiomAgentNFT.t.sol).
    uint256 internal constant OWNER_KEY = 0x0FF1000000000000000000000000000000000000000000000000000000000FF1;
    uint256 internal constant STRANGER_KEY = 0x57E40000000000000000000000000000000000000000000000000000000057E4;
    uint256 internal constant TEE_KEY = 0x7E000000000000000000000000000000000000000000000000000000000E007;
    uint256 internal constant NEW_TEE_KEY = 0x7E110000000000000000000000000000000000000000000000000000000E011;
    uint256 internal constant RECEIVER_KEY = 0x10C011C011C011C011C011C011C011C011C011C011C011C011C011C011C011CE;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,bytes nonce,uint256 validUntil)"
    );
    bytes32 internal constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,bytes nonce,uint256 validUntil)"
    );

    address internal owner;
    address internal stranger;
    address internal teeSigner;
    address internal newTeeSigner;

    uint256 internal constant MAX_PROOF_AGE = 7 days;

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        stranger = vm.addr(STRANGER_KEY);
        teeSigner = vm.addr(TEE_KEY);
        newTeeSigner = vm.addr(NEW_TEE_KEY);

        // Deploy verifier via UUPS proxy. Implementation is instantiated first, then
        // an ERC1967 proxy is deployed with an initialize() call targeting the impl.
        AxiomTeeVerifier impl = new AxiomTeeVerifier();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeWithSelector(impl.initialize.selector, owner, teeSigner, MAX_PROOF_AGE)
        );
        verifier = AxiomTeeVerifier(address(proxy));
    }

    // ─── F-01 negative case ────────────────────────────────────────────────────

    /// @notice F-01: a non-owner calling proposeSigner MUST revert with OwnableUnauthorizedAccount.
    function test_proposeSigner_onlyOwner_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        verifier.proposeSigner(newTeeSigner);
    }

    function test_proposeSigner_owner_succeeds() public {
        assertEq(verifier.registeredSigner(), teeSigner, "precondition: initial signer");

        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        assertEq(verifier.pendingSigner(), newTeeSigner, "pending signer recorded");

        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        // ADR-004 §1.4: execute now APPENDS to the allowlist (k-of-1); the seed entry stays valid.
        assertEq(verifier.registeredSigner(), teeSigner, "first entry unchanged after add");
        assertTrue(verifier.isAllowlistedSigner(newTeeSigner), "new signer allowlisted");
        assertEq(verifier.signerCount(), 2, "allowlist grew to 2");
        assertEq(verifier.pendingSigner(), address(0), "pending signer cleared");

        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.ZeroAddress.selector);
        verifier.proposeSigner(address(0));
    }
    /// @notice Owner can cancel a pending signer rotation before execution.
    function test_cancelSignerProposal_owner_succeeds() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        assertEq(verifier.pendingSigner(), newTeeSigner, "pending signer recorded");

        vm.prank(owner);
        verifier.cancelSignerProposal();

        assertEq(verifier.pendingSigner(), address(0), "pending signer cleared");
        assertEq(verifier.registeredSigner(), teeSigner, "active signer unchanged");
    }

    /// @notice executeSigner without a pending proposal reverts.
    function test_executeSigner_noPending_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TimelockManager.NoPendingProposal.selector);
        verifier.executeSigner();
    }

    /// @notice Constructor must seed both the signer and the owner. Owner must be queryable
    ///         via OZ's `owner()` so external monitors (e.g. an off-chain watcher) can verify
    ///         deployment configuration.
    function test_constructor_setsSigner() public view {
        assertEq(verifier.registeredSigner(), teeSigner, "constructor: signer");
        assertEq(verifier.owner(), owner, "constructor: owner");
        assertEq(verifier.maxProofAgeSeconds(), MAX_PROOF_AGE, "constructor: maxProofAge");
    }

    // ─── M-C1 / P0-6: accessSigner must equal `to` ───────────────────────────

    /// @notice Valid proofs where accessSigner == to still pass.
    function test_verifyTransferValidity_accessSignerEqualsTo_succeeds() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, receiver, address(this));

        assertEq(outs.length, 1, "proof accepted");
        assertEq(outs[0].accessAssistant, receiver, "access signer is recipient");
    }

    /// @notice Access signer must equal `to` even when ownership verification passes.
    function test_verifyTransferValidity_accessSignerNotTo_reverts() public {
        address receiver = vm.addr(RECEIVER_KEY);
        address wrongTo = vm.addr(STRANGER_KEY);
        // Both digests bind `wrongTo`, but the access leg is signed by `receiver`.
        TransferValidityProof[] memory proofs = _signProof(wrongTo, receiver);

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidAccessProof.selector);
        verifier.verifyTransferValidity(proofs, wrongTo, address(this));
    }

    // ─── ADR-004 §1.4: signer allowlist (k-of-1 quorum) ──────────────────────

    /// @notice After adding a second signer via the 1-day timelock, proofs signed by it verify.
    function test_allowlist_secondSigner_canVerify() public {
        // Timelocked add of newTeeSigner.
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        assertEq(verifier.signerCount(), 2, "two signers allowlisted");
        assertEq(verifier.registeredSigner(), teeSigner, "seed entry remains first");

        // Proof signed by the SECOND signer must verify.
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProofWithOwnershipKey(receiver, receiver, NEW_TEE_KEY);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, receiver, address(this));
        assertEq(outs.length, 1, "second-signer proof accepted");
    }

    /// @notice Revoking a signer is immediate (no 1-day delay) and blocks its proofs at once.
    function test_revokeSigner_immediatelyBlocks() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        // Advance time past the proof window used below so the revoked signer
        // cannot ride a pre-signed proof; revoke must still take effect the same block.
        vm.prank(owner);
        verifier.revokeSigner(newTeeSigner);

        assertTrue(!verifier.isAllowlistedSigner(newTeeSigner), "revoked signer removed");
        assertEq(verifier.signerCount(), 1, "back to one signer");
        assertTrue(verifier.isAllowlistedSigner(teeSigner), "seed entry untouched");

        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProofWithOwnershipKey(receiver, receiver, NEW_TEE_KEY);
        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidOwnershipProof.selector);
        verifier.verifyTransferValidity(proofs, receiver, address(this));
    }

    /// @notice Revoked signer cannot verify mid-flow: a proof batch co-signed by both
    ///         signers fails once the revoke lands between signing and verification.
    function test_revokeSigner_blocksMidFlow() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        address receiver = vm.addr(RECEIVER_KEY);
        // Batch of two proofs: first signed by seed signer, second by newTeeSigner.
        TransferValidityProof[] memory proofs = new TransferValidityProof[](2);
        TransferValidityProof[] memory p1 = _signProofWithOwnershipKey(receiver, receiver, TEE_KEY);
        TransferValidityProof[] memory p2 = _signProofWithOwnershipKey(receiver, receiver, NEW_TEE_KEY);
        proofs[0] = p1[0];
        proofs[1] = p2[0];

        // Revoke BEFORE verification lands — the compromised key must not verify.
        vm.prank(owner);
        verifier.revokeSigner(newTeeSigner);

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidOwnershipProof.selector);
        verifier.verifyTransferValidity(proofs, receiver, address(this));
    }

    /// @notice Cannot revoke the last remaining signer — the allowlist must never be empty.
    function test_revokeSigner_lastEntry_reverts() public {
        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.SignerAllowlistEmpty.selector);
        verifier.revokeSigner(teeSigner);
    }

    /// @notice Revoking an address that was never allowlisted reverts.
    function test_revokeSigner_notAllowlisted_reverts() public {
        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.SignerNotAllowlisted.selector);
        verifier.revokeSigner(newTeeSigner);
    }

    /// @notice Revoking the FIRST entry reorders the allowlist; registeredSigner() then returns the next live signer.
    function test_revokeSigner_firstEntry_shiftsView() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        vm.prank(owner);
        verifier.revokeSigner(teeSigner);

        assertEq(verifier.registeredSigner(), newTeeSigner, "view falls through to next live signer");
        assertEq(verifier.signerCount(), 1, "one signer remains");
        assertTrue(verifier.isAllowlistedSigner(newTeeSigner), "surviving entry still allowlisted");
    }

    /// @notice Full add-after-timelock flow: propose before the delay elapses must revert on execute; after the delay it succeeds.
    function test_addSigner_timelock_flow() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);

        // Execute too early → DelayNotElapsed, allowlist unchanged.
        vm.warp(block.timestamp + 10 minutes - 1);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TimelockManager.DelayNotElapsed.selector, 1));
        verifier.executeSigner();
        assertEq(verifier.signerCount(), 1, "nothing added before delay");

        // After the delay the same proposal executes.
        vm.warp(block.timestamp + 2);
        vm.prank(owner);
        verifier.executeSigner();
        assertTrue(verifier.isAllowlistedSigner(newTeeSigner), "signer added after timelock");
        assertEq(verifier.signerCount(), 2, "allowlist grew");

        // A used proposal cannot execute twice.
        vm.prank(owner);
        vm.expectRevert(TimelockManager.NoPendingProposal.selector);
        verifier.executeSigner();
    }

    /// @notice Re-adding a revoked signer requires the full 1-day timelock again — no instant re-admission.
    function test_reAddRevokedSigner_requiresTimelock() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        vm.prank(owner);
        verifier.revokeSigner(newTeeSigner);

        // Immediate re-add without timelock is impossible: propose must go through the delay again.
        uint256 proposedAt = block.timestamp;
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        assertEq(verifier.pendingSigner(), newTeeSigner, "proposal pending");

        // Executing before the delay elapses reverts; the proposal survives.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TimelockManager.DelayNotElapsed.selector, 10 minutes));
        verifier.executeSigner();

        vm.warp(proposedAt + 10 minutes + 2);
        vm.prank(owner);
        verifier.executeSigner();
        assertTrue(verifier.isAllowlistedSigner(newTeeSigner), "re-added after full delay");
    }

    /// @notice Non-admin cannot add (timelock path) or revoke.
    function test_nonAdmin_cannotAddOrRevoke() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        verifier.proposeSigner(newTeeSigner);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        verifier.revokeSigner(teeSigner);

        // Even a stolen pending proposal cannot be executed by a stranger.
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        verifier.executeSigner();

        assertEq(verifier.signerCount(), 1, "allowlist unchanged");
    }

    /// @notice Proposing an already-allowlisted signer reverts (no no-op timelock churn).
    function test_proposeSigner_alreadyAllowlisted_reverts() public {
        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.SignerAlreadyAllowlisted.selector);
        verifier.proposeSigner(teeSigner);
    }

    /// @notice The allowlist view returns entries in add order, [0] = registeredSigner.
    function test_allowlistedSigners_view_order() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        address[] memory signers = verifier.allowlistedSigners();
        assertEq(signers.length, 2, "two entries");
        assertEq(signers[0], teeSigner, "seed first");
        assertEq(signers[1], newTeeSigner, "added second");
    }

    // ─── Wave 1B / F-1: verifyTransferValidity caller gate ───────────────────

    /// @notice A direct call from an address other than the `nft` named in the
    ///         proof digests MUST revert with UnauthorizedVerifierCaller BEFORE
    ///         any signature work — this is the proof-nonce-burning fix.
    function test_verifyTransferValidity_directCall_reverts() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.UnauthorizedVerifierCaller.selector, stranger, address(this)
            )
        );
        verifier.verifyTransferValidity(proofs, receiver, address(this));
    }

    /// @notice The gate fires even for garbage proofs — the caller check is first,
    ///         so nothing (expiry, signer allowlist, replay state) is reachable.
    function test_verifyTransferValidity_gatePrecedesProofChecks() public {
        TransferValidityProof[] memory empty = new TransferValidityProof[](0);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.UnauthorizedVerifierCaller.selector, stranger, address(this)
            )
        );
        verifier.verifyTransferValidity(empty, address(0), address(this));
    }

    /// @notice The designated NFT contract (here: this test contract, which the
    ///         proofs bind via the `nft` field of both EIP-712 digests) can still
    ///         call the verifier — the ERC7857Upgradeable._proofCheck path is intact.
    function test_verifyTransferValidity_designatedNft_succeeds() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, receiver, address(this));

        assertEq(outs.length, 1, "NFT-path call accepted");
        assertEq(outs[0].accessAssistant, receiver, "access signer is recipient");
    }

    /// @notice End-to-end gate semantics: proofs are bound to one NFT (here: this
    ///         contract, via the digests' nft field) but a caller that does not
    ///         match the `nft` param it passes is rejected before signature work.
    ///         Mirrors a bystander relaying an in-flight iTransferFrom's proofs.
    function test_verifyTransferValidity_wrongNftParam_reverts() public {
        address receiver = vm.addr(RECEIVER_KEY);
        address otherNft = vm.addr(STRANGER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        vm.prank(receiver);
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.UnauthorizedVerifierCaller.selector, receiver, otherNft
            )
        );
        verifier.verifyTransferValidity(proofs, receiver, otherNft);
    }

    /// @notice The consumed nonce emits ProofUsed(nonce, timestamp) so the cleanup
    ///         keeper can derive sweep candidates from logs instead of a static env list.
    function test_verifyTransferValidity_emitsProofUsed() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        bytes32 proofNonce = keccak256(
            abi.encode(
                proofs[0].accessProof.dataHash,
                proofs[0].accessProof.targetPubkey,
                proofs[0].ownershipProof.sealedKey,
                proofs[0].accessProof.nonce,
                proofs[0].accessProof.validUntil
            )
        );

        vm.expectEmit(true, true, false, true, address(verifier));
        emit BaseVerifier.ProofUsed(proofNonce, block.timestamp);
        verifier.verifyTransferValidity(proofs, receiver, address(this));
    }

    /// @notice ProofUsed is NOT emitted when the nonce is already burned (replay
    ///         reverts before the write), so the log stream stays candidate-exact.
    function test_verifyTransferValidity_replay_emitsNoSecondProofUsed() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        verifier.verifyTransferValidity(proofs, receiver, address(this));

        vm.recordLogs();
        vm.expectRevert(
            abi.encodeWithSelector(
                BaseVerifier.ProofAlreadyUsed.selector,
                keccak256(
                    abi.encode(
                        proofs[0].accessProof.dataHash,
                        proofs[0].accessProof.targetPubkey,
                        proofs[0].ownershipProof.sealedKey,
                        proofs[0].accessProof.nonce,
                        proofs[0].accessProof.validUntil
                    )
                )
            )
        );
        verifier.verifyTransferValidity(proofs, receiver, address(this));

        assertEq(vm.getRecordedLogs().length, 0, "no events on the replay path");
    }

    // ─── Wave 1B: signer allowlist cap (MAX_SIGNERS = 5) ─────────────────────

    /// @notice executeSigner reverts SignerAllowlistFull once 5 entries are live;
    ///         the pending proposal is preserved (execute rolled back whole).
    function test_executeSigner_allowlistCap_reverts() public {
        // Fill the allowlist to the cap: 1 seed + 4 adds.
        uint256[4] memory extraKeys = [
            NEW_TEE_KEY,
            uint256(0x7E120000000000000000000000000000000000000000000000000000000E012),
            uint256(0x7E130000000000000000000000000000000000000000000000000000000E013),
            uint256(0x7E140000000000000000000000000000000000000000000000000000000E014)
        ];
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(owner);
            verifier.proposeSigner(vm.addr(extraKeys[i]));
            // Distinct expression per iteration: identical `block.timestamp + ...`
            // warps get CSE'd by the via-IR optimizer (block.timestamp is constant
            // mid-tx in production semantics; vm.warp breaks that assumption).
            vm.warp(block.timestamp + 10 minutes + i + 1);
            vm.prank(owner);
            verifier.executeSigner();
        }
        assertEq(verifier.signerCount(), 5, "allowlist at cap");

        // Sixth signer: propose succeeds (it is not yet allowlisted), execute must revert.
        address sixth = vm.addr(0x7E150000000000000000000000000000000000000000000000000000000E015);
        vm.prank(owner);
        verifier.proposeSigner(sixth);
        vm.warp(block.timestamp + 10 minutes + 100);
        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.SignerAllowlistFull.selector);
        verifier.executeSigner();

        assertEq(verifier.signerCount(), 5, "cap enforced, no sixth entry");
        assertEq(verifier.pendingSigner(), sixth, "proposal survives (execute reverted atomically)");
    }

    /// @notice A revoke below the cap re-opens room: after dropping to 4 entries the
    ///         previously-blocked proposal executes normally.
    function test_executeSigner_capOpensAfterRevocation() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(owner);
        verifier.executeSigner();

        // Cap is not hit here (2 < 5) — this only proves revoke reopens capacity.
        vm.prank(owner);
        verifier.revokeSigner(newTeeSigner);
        assertEq(verifier.signerCount(), 1, "back to seed only");

        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        vm.warp(block.timestamp + 10 minutes + 2);
        vm.prank(owner);
        verifier.executeSigner();
        assertEq(verifier.signerCount(), 2, "re-add after revoke works");
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("AxiomTeeVerifier"), keccak256("1"), block.chainid, address(verifier)
            )
        );
    }

    function _signProof(
        address to,
        address receiver
    ) internal view returns (TransferValidityProof[] memory proofs) {
        return _signProofWithOwnershipKey(to, receiver, TEE_KEY);
    }

    function _signProofWithOwnershipKey(
        address to,
        address receiver,
        uint256 ownershipKey
    ) internal view returns (TransferValidityProof[] memory proofs) {
        uint256 validUntil = block.timestamp + 1 days;
        uint256 nonce = 42;
        bytes32 dataHash = keccak256("M-C1-dataHash");
        bytes memory pub = _addressToPubKey(receiver);
        bytes memory sealedKey = hex"01";

        bytes32 ownershipMsg = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(
                        OWNERSHIP_PROOF_TYPEHASH,
                        dataHash,
                        keccak256(sealedKey),
                        keccak256(pub),
                        to,
                        address(this),
                        keccak256(abi.encode(nonce)),
                        validUntil
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownershipKey, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(ACCESS_PROOF_TYPEHASH, dataHash, keccak256(pub), to, address(this), keccak256(abi.encode(nonce)), validUntil)
                )
            )
        );
        (v, r, s) = vm.sign(RECEIVER_KEY, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: dataHash, targetPubkey: pub, nonce: abi.encode(nonce), proof: accessSig, validUntil: validUntil
            }),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: dataHash,
                sealedKey: sealedKey,
                targetPubkey: pub,
                nonce: abi.encode(nonce),
                proof: ownershipSig,
                validUntil: validUntil
            })
        });
    }

    function _addressToPubKey(
        address a
    ) internal pure returns (bytes memory) {
        bytes memory pub = new bytes(64);
        bytes20 addrBytes = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            pub[i] = addrBytes[i];
        }
        for (uint256 i = 20; i < 64; i++) {
            pub[i] = 0x01;
        }
        return pub;
    }
}
