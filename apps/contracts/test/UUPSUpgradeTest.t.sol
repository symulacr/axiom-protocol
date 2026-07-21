// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice Minimal V2 implementation extending AxiomAgentNFT for UUPS upgrade testing.
///         Deployed as a standalone implementation target; the existing proxy upgrades
///         to this address and delegatecalls into it. Inherits UUPSUpgradeable through
///         AxiomAgentNFT so that proxiableUUID() returns the expected EIP-1967 slot.
contract AxiomAgentNFTV2 is AxiomAgentNFT {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev Required by UUPSUpgradeable. This contract is never proxied itself,
    ///      so this gate is never invoked.
    function _authorizeUpgrade(address) internal override {}

    /// @notice New function available only after upgrading to v2.
    function versionV2() public pure returns (string memory) {
        return "2.0.0";
    }
}

/// @title UUPSUpgradeTest
/// @notice Tests that UUPS upgrades preserve contract state and enforce
///         access control on the upgrade authority.
/// @dev Uses the same ERC1967Proxy + AxiomAgentNFT deployment pattern as
///      AxiomAgentNFT.t.sol, then exercises the UUPS upgrade path.
contract UUPSUpgradeTest is Test {
    AxiomAgentNFT public nft;
    AxiomTeeVerifier public verifier;

    address public admin = address(0x1001);
    address public alice = address(0xA11C);
    address public bob = address(0xB0B0);
    address public teeSigner = address(0x7E11);

    function setUp() public {
        // Deploy minimal verifier (mint does not interact with it, but initialize
        // requires a non-zero verifier address).
        verifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);

        // Deploy v1 implementation + proxy, then initialize through the proxy.
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

    /// @notice Upgrade to v2 preserves all existing state (token ownership,
    ///         metadata, etc.) and makes new functions available.
    function test_UUPS_UpgradePreservesState() public {
        // Mint token 1 to alice
        vm.prank(alice);
        IntelligentData[] memory data = _makeData(bytes32(uint256(1)));
        uint256 tokenId = nft.mint(data, alice);

        // Record pre-upgrade state
        assertEq(nft.name(), "Axiom Agent NFT", "pre-upgrade: name matches");
        assertEq(nft.symbol(), "AXM-A", "pre-upgrade: symbol matches");
        assertEq(nft.ownerOf(tokenId), alice, "pre-upgrade: token 1 owned by alice");
        assertEq(
            nft.intelligentDatasOf(tokenId)[0].dataHash,
            bytes32(uint256(1)),
            "pre-upgrade: data hash preserved"
        );

        // Deploy v2 implementation
        AxiomAgentNFTV2 v2 = new AxiomAgentNFTV2();

        // Upgrade proxy to v2 (admin has DEFAULT_ADMIN_ROLE)
        vm.prank(admin);
        nft.upgradeToAndCall(address(v2), "");

        // Verify state preserved after upgrade
        assertEq(nft.ownerOf(tokenId), alice, "post-upgrade: token 1 still owned by alice");
        assertEq(nft.name(), "Axiom Agent NFT", "post-upgrade: name preserved");
        assertEq(nft.symbol(), "AXM-A", "post-upgrade: symbol preserved");
        assertEq(
            nft.intelligentDatasOf(tokenId)[0].dataHash,
            bytes32(uint256(1)),
            "post-upgrade: data hash preserved"
        );

        // New v2 function is callable through the upgraded proxy
        string memory v2Version = AxiomAgentNFTV2(address(nft)).versionV2();
        assertEq(v2Version, "2.0.0", "new v2 function returns correct version");
    }

    /// @notice Non-admin caller cannot invoke upgradeToAndCall.
    function test_UUPS_NonAdminCannotUpgrade() public {
        AxiomAgentNFTV2 v2 = new AxiomAgentNFTV2();

        // bob lacks DEFAULT_ADMIN_ROLE => AccessControlUnauthorizedAccount
        bytes32 defaultAdminRole = nft.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                bob,
                defaultAdminRole
            )
        );
        vm.prank(bob);
        nft.upgradeToAndCall(address(v2), "");
    }
}
