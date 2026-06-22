// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";
import {TransferValidityProof, AccessProof, OwnershipProof, OracleType} from "../src/interfaces/IERC7857DataVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract AxiomAgentNFTTest is Test {
    AxiomAgentNFT public nft;
    AxiomTeeVerifier public verifier;

    address public admin;
    address public alice;
    address public bob;
    address public carol;

    uint256 internal constant ADMIN_KEY = 0xAD0000000000000000000000000000000000000000000000000000000000AD;
    uint256 internal constant ALICE_KEY = 0xA11C0000000000000000000000000000000000000000000000000000000A11C;
    uint256 internal constant BOB_KEY   = 0xB0B000000000000000000000000000000000000000000000000000000B0B000;
    uint256 internal constant CAROL_KEY = 0xCA20000000000000000000000000000000000000000000000000000000CA2;
    uint256 internal constant TEE_SIGNER_KEY = 0xA11CE00000000000000000000000000000000000000000000000000000A11C;

    bytes constant ALICE_PUB64 = hex"8517ac9f78ea4ac7d1b49080b2b4dfae7f9a74706196ff07054a2487ec6aeef4ac91c131cdafda05d68788a64269d079bec396a26901732c45eca768402f27c7";
    bytes constant BOB_PUB64   = hex"1d3015ac205ab30d45136c50fd02acceb9ee36a564ba4bbab360503994c4d00d0aff28a0f89ce9534b2f4f55000ea0b540f783c75ea46d2d84b6934e021fbe99";
    bytes constant CAROL_PUB64 = hex"e2c27802172b6a2f02217de87f502211850f257f1fe5f66cf05928467f6aeae788ee4a5bc7ee7c817b224be835df5bd04b85affd4c7121b801689ccd83e493e2";
    bytes constant ADMIN_PUB64 = hex"704bad530a71af03b909fe53754132a6ed93eefb530beda9ea0a2eb70e0bfcf6734138928c2a65d1252ef13a005710a9e8b2d7a4e584a47d8646e6b66b439ed1";

    address public teeSigner;

    function setUp() public {
        admin = vm.addr(ADMIN_KEY);
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        carol = vm.addr(CAROL_KEY);
        teeSigner = vm.addr(TEE_SIGNER_KEY);

        verifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);
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
    }

    function _makeData(bytes32 dataHash) internal pure returns (IntelligentData[] memory) {
        IntelligentData[] memory data = new IntelligentData[](1);
        data[0] = IntelligentData({dataDescription: "v1", dataHash: dataHash});
        return data;
    }

    /// @dev Build a single TransferValidityProof for an iTransferFrom(alice -> bob) flow.
    ///      Uses real secp256k1 uncompressed pubkeys precomputed from the test keys.
    ///      The pubkeys satisfy Utils.pubKeyToAddress(pub) == to, so the default wanted
    ///      receiver check in ERC7857Upgradeable._proofCheck no longer reverts.
    function _makeProofs(address, /* from */ address to, bytes32 dataHash, uint256 nonce) internal view returns (TransferValidityProof[] memory proofs) {
        bytes memory pub = _pubKeyOf(to);
        bytes memory sealedKey = new bytes(64);
        // EIP-712 deadline: 1 day in the future, comfortably inside any reasonable
        // `maxProofAgeSeconds` (default 7 days, see AxiomTeeVerifier.sol).
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, to, address(nft), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_SIGNER_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        uint256 receiverKey = _keyOf(to);
        bytes32 accessMsg = _accessDigest(dataHash, pub, to, address(nft), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKey, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
            ownershipProof: OwnershipProof({oracleType: OracleType.TEE, dataHash: dataHash, sealedKey: sealedKey, targetPubkey: pub, nonce: nonce, proof: ownershipSig, validUntil: validUntil})
        });
    }

    function _pubKeyOf(address user) internal view returns (bytes memory) {
        if (user == alice) return ALICE_PUB64;
        if (user == bob) return BOB_PUB64;
        if (user == carol) return CAROL_PUB64;
        if (user == admin) return ADMIN_PUB64;
        revert("Unknown user");
    }

    function _keyOf(address user) internal view returns (uint256) {
        if (user == alice) return ALICE_KEY;
        if (user == bob) return BOB_KEY;
        if (user == carol) return CAROL_KEY;
        if (user == admin) return ADMIN_KEY;
        revert("Unknown user");
    }

    // ─── EIP-712 typehashes (must mirror AxiomTeeVerifier.sol) ────────
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );
    bytes32 internal constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("AxiomTeeVerifier"),
            keccak256("1"),
            block.chainid,
            address(verifier)
        ));
    }

    function _ownershipDigest(
        bytes32 dataHash,
        bytes memory sealedKey,
        bytes memory pub,
        address to,
        address nftAddr,
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                OWNERSHIP_PROOF_TYPEHASH,
                dataHash,
                keccak256(sealedKey),
                keccak256(pub),
                to,
                nftAddr,
                nonce,
                validUntil
            ))
        ));
    }

    function _accessDigest(
        bytes32 dataHash,
        bytes memory pub,
        address to,
        address nftAddr,
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                ACCESS_PROOF_TYPEHASH,
                dataHash,
                keccak256(pub),
                to,
                nftAddr,
                nonce,
                validUntil
            ))
        ));
    }

    function _mintTo(address to) internal returns (uint256 tokenId) {
        vm.prank(to);
        IntelligentData[] memory data = _makeData(bytes32(uint256(uint160(to))));
        tokenId = nft.mint(data, to);
    }

    function test_initialize_setsRolesAndOwner() public view {
        assertEq(nft.name(), "Axiom Agent NFT");
        assertEq(nft.symbol(), "AXM-A");
        assertTrue(nft.hasRole(nft.ADMIN_ROLE(), admin));
        assertTrue(nft.hasRole(nft.OPERATOR_ROLE(), admin));
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), admin));
        assertEq(address(nft.verifier()), address(verifier));
    }

    function test_mint_happy() public {
        uint256 tokenId = _mintTo(alice);
        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(nft.creatorOf(tokenId), alice);
        assertEq(nft.intelligentDatasOf(tokenId).length, 1);
    }

    function test_withdrawMintFees_onlyAdmin() public {
        vm.deal(address(nft), 1 ether);
        uint256 balanceBefore = bob.balance;
        vm.prank(admin);
        nft.withdrawMintFees(payable(bob));
        assertEq(bob.balance, balanceBefore + 1 ether);
        assertEq(address(nft).balance, 0);
    }

    function test_withdrawMintFees_revertNotAdmin() public {
        vm.deal(address(nft), 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        nft.withdrawMintFees(payable(bob));
    }

    function test_mint_revertZeroAddress() public {
        IntelligentData[] memory data = _makeData(bytes32(uint256(0x1234)));
        vm.expectRevert("Zero address");
        nft.mint(data, address(0));
    }

    function test_mint_revertEmptyData() public {
        IntelligentData[] memory data = new IntelligentData[](0);
        vm.expectRevert("Empty data array");
        nft.mint(data, alice);
    }

    function test_iTransferFrom_happy() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, 1);
        vm.prank(alice);
        nft.iTransferFrom(alice, bob, tokenId, proofs);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_iTransferFrom_revertBadOracleSig() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, 2);
        proofs[0].ownershipProof.proof[0] = bytes1(uint8(proofs[0].ownershipProof.proof[0]) ^ 0xff);
        vm.prank(alice);
        vm.expectRevert();
        nft.iTransferFrom(alice, bob, tokenId, proofs);
    }

    function test_iTransferFrom_revertBadAccessSig() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, 3);
        proofs[0].accessProof.proof[0] = bytes1(uint8(proofs[0].accessProof.proof[0]) ^ 0xff);
        vm.prank(alice);
        vm.expectRevert();
        nft.iTransferFrom(alice, bob, tokenId, proofs);
    }

    function test_iTransferFrom_revertEmptyProofs() public {
        uint256 tokenId = _mintTo(alice);
        TransferValidityProof[] memory empty = new TransferValidityProof[](0);
        vm.prank(alice);
        vm.expectRevert();
        nft.iTransferFrom(alice, bob, tokenId, empty);
    }

    function test_iTransferFrom_revertNotOwner() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, 4);
        vm.prank(carol);
        vm.expectRevert();
        nft.iTransferFrom(alice, bob, tokenId, proofs);
    }

    function test_iTransferFrom_revertReplay() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, 5);
        vm.prank(alice);
        nft.iTransferFrom(alice, bob, tokenId, proofs);
        vm.prank(bob);
        vm.expectRevert();
        nft.iTransferFrom(bob, carol, tokenId, proofs);
    }

    function test_iTransferFrom_revertMixedProofs() public {
        uint256 tokenId = _mintTo(alice);
        bytes32 dataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;

        // Build two independently valid proofs for the same transfer.
        TransferValidityProof[] memory proofsA = _makeProofs(alice, bob, dataHash, 100);
        TransferValidityProof[] memory proofsB = _makeProofs(alice, bob, dataHash, 101);

        // Mix accessProof from A with ownershipProof from B. The nonces differ,
        // so the verifier must reject this before signature recovery.
        TransferValidityProof[] memory mixed = new TransferValidityProof[](1);
        mixed[0] = TransferValidityProof({
            accessProof: proofsA[0].accessProof,
            ownershipProof: proofsB[0].ownershipProof
        });

        vm.prank(alice);
        vm.expectRevert(AxiomTeeVerifier.ProofFieldMismatch.selector);
        nft.iTransferFrom(alice, bob, tokenId, mixed);
    }

    function test_verifyTransferValidity_revertMixedProofs_direct() public {
        bytes32 dataHash = bytes32(uint256(0xdeadbeef));

        // Build two independently valid proofs for different transfers.
        TransferValidityProof[] memory proofsA = _makeProofs(alice, bob, dataHash, 200);
        TransferValidityProof[] memory proofsB = _makeProofs(alice, carol, dataHash, 201);

        // Mix accessProof from A with ownershipProof from B (targetPubkeys differ).
        TransferValidityProof[] memory mixed = new TransferValidityProof[](1);
        mixed[0] = TransferValidityProof({
            accessProof: proofsA[0].accessProof,
            ownershipProof: proofsB[0].ownershipProof
        });

        vm.expectRevert(AxiomTeeVerifier.ProofFieldMismatch.selector);
        verifier.verifyTransferValidity(mixed, address(0), address(0));
    }

    function test_updateVerifier_onlyOperator() public {
        AxiomTeeVerifier newVerifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);
        vm.prank(admin);
        nft.updateVerifier(address(newVerifier));
        assertEq(address(nft.verifier()), address(newVerifier));
    }

    function test_updateVerifier_revertNotOperator() public {
        AxiomTeeVerifier newVerifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);
        vm.prank(alice);
        vm.expectRevert();
        nft.updateVerifier(address(newVerifier));
    }

    function test_pause_unpause() public {
        vm.prank(admin);
        nft.pause();
        vm.expectRevert();
        _mintTo(alice);
        vm.prank(admin);
        nft.unpause();
        _mintTo(alice);
    }

    function test_authorizeUsage_revertTooMany() public {
        uint256 tokenId = _mintTo(alice);
        vm.startPrank(alice);
        for (uint256 i = 0; i < 100; i++) {
            nft.authorizeUsage(tokenId, address(SafeCast.toUint160(0x1000 + i)));
        }
        vm.expectRevert();
        nft.authorizeUsage(tokenId, address(uint160(0x2000)));
        vm.stopPrank();
    }

    function test_update_onlyOwner() public {
        uint256 tokenId = _mintTo(alice);
        IntelligentData[] memory newData = _makeData(bytes32(uint256(2)));
        vm.prank(alice);
        nft.update(tokenId, newData);
        assertEq(nft.intelligentDatasOf(tokenId)[0].dataHash, bytes32(uint256(2)));
    }

    function test_update_revertNotOwner() public {
        uint256 tokenId = _mintTo(alice);
        IntelligentData[] memory newData = _makeData(bytes32(uint256(2)));
        vm.prank(bob);
        vm.expectRevert("Not owner");
        nft.update(tokenId, newData);
    }

    // ─── UUPS upgrade authorization (F-02) ─────────────────────────
    // EIP-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    // Source: https://eips.ethereum.org/EIPS/eip-1967
    bytes32 internal constant EIP1967_IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function test_upgrade_onlyOwner() public {
        MockAxiomAgentNFTV2 mockV2 = new MockAxiomAgentNFTV2();
        // Non-owner (alice) calls upgradeToAndCall through the proxy.
        // _authorizeUpgrade → onlyOwner → revert with OwnableUnauthorizedAccount(alice).
        // See: https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableOwnableUnauthorizedAccount-address-
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice)
        );
        nft.upgradeToAndCall(address(mockV2), "");
    }

    function test_upgrade_owner_succeeds() public {
        MockAxiomAgentNFTV2 mockV2 = new MockAxiomAgentNFTV2();
        address proxyAddr = address(nft);
        address oldImpl = address(vm.load(proxyAddr, EIP1967_IMPL_SLOT) == bytes32(0)
            ? address(0)
            : address(uint160(uint256(vm.load(proxyAddr, EIP1967_IMPL_SLOT)))));
        assertTrue(oldImpl != address(0), "pre-upgrade: impl slot must be set");
        assertTrue(oldImpl != address(mockV2), "pre-upgrade: impl must differ from mockV2");

        // Owner (admin) upgrades; should succeed and rewrite the EIP-1967 implementation slot.
        vm.prank(admin);
        nft.upgradeToAndCall(address(mockV2), "");

        address newImpl = address(uint160(uint256(vm.load(proxyAddr, EIP1967_IMPL_SLOT))));
        assertEq(newImpl, address(mockV2), "post-upgrade: impl slot must point at mockV2");

        // Proxy is still functional: the storage-layout contract (AxiomAgentNFT at the old impl)
        // is gone, but the proxy still works for the new implementation. A view call that does
        // not depend on contract-specific state should still succeed (selector routing).
        // We use the OZ ERC-1967 slot read as the canary.
        assertEq(
            uint256(vm.load(proxyAddr, EIP1967_IMPL_SLOT)),
            uint256(uint160(address(mockV2))),
            "post-upgrade: EIP-1967 slot must equal mockV2"
        );
    }
}

/// @notice Minimal UUPS-compatible "V2" implementation used solely to exercise the
///         AxiomAgentNFT._authorizeUpgrade gate. Inherits UUPSUpgradeable so its
///         proxiableUUID() returns ERC1967Utils.IMPLEMENTATION_SLOT (the security check
///         performed by UUPSUpgradeable._upgradeToAndCallUUPS).
/// @dev    We intentionally do NOT inherit from AxiomAgentNFT: the test only needs a
///         new implementation address whose proxiableUUID() returns the right slot.
///         Source: https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable
contract MockAxiomAgentNFTV2 is UUPSUpgradeable {
    /// @notice Required override of UUPSUpgradeable._authorizeUpgrade. The new implementation
    ///         is only used as a UUPS target in this test; it is never itself a proxy, so
    ///         this gate is never invoked. We supply a no-op to satisfy the abstract contract.
    function _authorizeUpgrade(address) internal override {}
}
