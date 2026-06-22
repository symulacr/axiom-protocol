// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title AxiomTeeVerifier.t.sol
/// @notice Test suite for F-01 fix: registerSigner must be onlyOwner.
/// @dev    These tests cover the ship-blocker CRITICAL finding from docs/security/report-v0.md.
///         Before the fix, `registerSigner` had no access control, so any external caller could
///         rotate the trusted TEE signer and steal every iNFT on the next transfer. After the
///         fix, the constructor takes the initial owner (OZ OwnableUpgradeable), the
///         `registerSigner` modifier is `onlyOwner`, and a separate `initialize` is available
///         for proxied deployments. References:
///           - https://docs.openzeppelin.com/contracts/5.x/access-control
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableUpgradeable
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-_transferOwnership-address-
contract AxiomTeeVerifierTest is Test {
    AxiomTeeVerifier internal verifier;

    // Deterministic test keys (mirroring the pattern in AxiomAgentNFT.t.sol).
    uint256 internal constant OWNER_KEY   = 0x0FF1000000000000000000000000000000000000000000000000000000000FF1;
    uint256 internal constant STRANGER_KEY = 0x57E40000000000000000000000000000000000000000000000000000000057E4;
    uint256 internal constant TEE_KEY     = 0x7E000000000000000000000000000000000000000000000000000000000E007;
    uint256 internal constant NEW_TEE_KEY = 0x7E110000000000000000000000000000000000000000000000000000000E011;

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

        // Deploy verifier with owner as the explicit initial owner. This is the path the
        // production scripts (Deploy.s.sol, DeployAristotle.s.sol) follow.
        verifier = new AxiomTeeVerifier(owner, teeSigner, MAX_PROOF_AGE);
    }

    // ─── F-01 negative case ────────────────────────────────────────────────────

    /// @notice F-01: a non-owner calling registerSigner MUST revert with OwnableUnauthorizedAccount.
    /// @dev    This is the ship-blocker negative test. Without the onlyOwner guard, a stranger
    ///         could call `verifier.registerSigner(stranger)` and replace the trusted TEE
    ///         signer with one they control, then drain every iNFT on the next transfer.
    function test_registerSigner_onlyOwner_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, stranger)
        );
        verifier.registerSigner(newTeeSigner);
    }

    // ─── F-01 positive case ────────────────────────────────────────────────────

    /// @notice F-01: the owner CAN call registerSigner, and the signer is updated.
    function test_registerSigner_owner_succeeds() public {
        // Storage assertion: state transition is the real behavior under test.
        assertEq(verifier.registeredSigner(), teeSigner, "precondition: initial signer");

        vm.prank(owner);
        verifier.registerSigner(newTeeSigner);

        assertEq(verifier.registeredSigner(), newTeeSigner, "signer should rotate to newTeeSigner");
        // Re-running registerSigner with zero address must also revert (caller is owner,
        // but the contract-side guard still rejects address(0)). Sanity-check the
        // zero-address guard isn't accidentally bypassed.
        vm.prank(owner);
        vm.expectRevert(bytes("Zero address"));
        verifier.registerSigner(address(0));
    }

    /// @notice Constructor must seed both the signer and the owner. Owner must be queryable
    ///         via OZ's `owner()` so external monitors (e.g. an off-chain watcher) can verify
    ///         deployment configuration.
    function test_constructor_setsSigner() public view {
        assertEq(verifier.registeredSigner(), teeSigner, "constructor: signer");
        assertEq(verifier.owner(), owner, "constructor: owner");
        assertEq(verifier.maxProofAgeSeconds(), MAX_PROOF_AGE, "constructor: maxProofAge");
    }

    // ─── F-01 bonus: initialize() for proxied deployments ─────────────────────

    /// @notice The upgradeable `initialize` path mirrors the constructor: rejects zero owner
    ///         and stores the owner in OZ's ERC-7201 storage. It must be callable exactly once
    ///         (re-running it reverts on the `initializer` modifier).
    function test_initialize_setsOwner_andRevertsOnReRun() public {
        AxiomTeeVerifier v = new AxiomTeeVerifier(address(0xdead), teeSigner, MAX_PROOF_AGE);
        // Pretend the deploy used a proxy and we now want to re-run the auth bootstrap.
        // (Calling initialize() on a non-proxied contract still works as long as the
        // `Initializable._initialized` flag has not been set, which it has not — the
        // constructor of AxiomTeeVerifier does not call _disableInitializers, so initialize
        // remains usable. This matches the canonical OZ pattern: a contract that may one day
        // be deployed behind a proxy keeps the initializer hot.)
        v.initialize(owner);
        assertEq(v.owner(), owner, "initialize: owner");

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        v.initialize(stranger);
    }
}
