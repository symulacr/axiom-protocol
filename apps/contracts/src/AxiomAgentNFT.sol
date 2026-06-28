// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

// UUPS upgradeability is mandated by the security report F-02.
// Canonical references:
//   - https://docs.openzeppelin.com/contracts/5.x/upgradeable#upgradeable-proxy
//   - https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable
//   - https://eips.ethereum.org/EIPS/eip-1967
// Per OZ guidance, the implementation behind an ERC1967 proxy MUST inherit UUPSUpgradeable
// and override _authorizeUpgrade with an access check; otherwise the proxy is effectively
// non-upgradeable (the EIP-1967 slot writes from a UUPS upgrade would all revert on the
// missing proxiableUUID security check).
import {ERC7857Upgradeable} from "./ERC7857Upgradeable.sol";
import {ERC7857CloneableUpgradeable} from "./extensions/ERC7857CloneableUpgradeable.sol";
import {ERC7857AuthorizeUpgradeable} from "./extensions/ERC7857AuthorizeUpgradeable.sol";
import {ERC7857IDataStorageUpgradeable} from "./extensions/ERC7857IDataStorageUpgradeable.sol";
import {IntelligentData} from "./interfaces/IERC7857Metadata.sol";
import {AxiomMetadataJson} from "./extensions/AxiomMetadataJson.sol";

/// @notice Concrete ERC-7857 iNFT contract for the Axiom Protocol
/// @dev Composes the canonical 3 ERC-7857 extensions (Cloneable + Authorize + IDataStorage)
///      + OZ AccessControl + ReentrancyGuard + Pausable + ERC721Upgradeable
/// @dev Adapted from https://github.com/0gfoundation/0g-agent-nft (MIT) — same composition
contract AxiomAgentNFT is
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ERC7857CloneableUpgradeable,
    ERC7857AuthorizeUpgradeable,
    ERC7857IDataStorageUpgradeable
{
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event CreatorSet(uint256 indexed tokenId, address indexed creator);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event StorageInfoUpdated(string oldInfo, string newInfo);
    event MetadataJsonDecisionDocumented(string collectionName, string collectionSymbol, string rationaleTag);

    /// @custom:storage-location erc7201:agent.storage.AxiomAgentNFT
    struct AxiomAgentNFTStorage {
        string storageInfo;
        uint256 mintFee;
        mapping(uint256 => address) creators;
    }

    using AxiomMetadataJson for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    string public constant VERSION = "1.0.0";

    // keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomAgentNFT")) - 1)) & ~bytes32(uint256(0xff))
    // Canonical ERC-7201 formula (OZ v5).
    bytes32 private constant STORAGE_LOCATION = 0xe982fe9a44d6409dbf89634fae06be5c796203a5c100b2ec87b395d27194a900;

    function _getAxiomAgentNFTStorage() private pure returns (AxiomAgentNFTStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory storageInfo_,
        address verifierAddr,
        address admin_
    ) public virtual initializer {
        require(verifierAddr != address(0), "Zero verifier address");
        require(admin_ != address(0), "Zero admin address");

        __AccessControl_init();
        __Ownable_init(admin_);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ERC7857_init(name_, symbol_, verifierAddr);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(OPERATOR_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);

        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.storageInfo = storageInfo_;
        emit MetadataJsonDecisionDocumented(name(), symbol(), "2RH-REJECTED-v1");
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721Upgradeable, ERC7857AuthorizeUpgradeable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _intelligentDatasOf(
        uint256 tokenId
    )
        internal
        view
        virtual
        override(ERC7857Upgradeable, ERC7857IDataStorageUpgradeable)
        returns (IntelligentData[] memory)
    {
        return ERC7857IDataStorageUpgradeable._intelligentDatasOf(tokenId);
    }

    function _intelligentDatasLengthOf(
        uint256 tokenId
    ) internal view virtual override(ERC7857Upgradeable, ERC7857IDataStorageUpgradeable) returns (uint256) {
        return ERC7857IDataStorageUpgradeable._intelligentDatasLengthOf(tokenId);
    }

    function _updateData(
        uint256 tokenId,
        IntelligentData[] memory newDatas
    ) internal virtual override(ERC7857Upgradeable, ERC7857IDataStorageUpgradeable) {
        ERC7857IDataStorageUpgradeable._updateData(tokenId, newDatas);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(AccessControlUpgradeable, ERC7857Upgradeable, ERC7857AuthorizeUpgradeable, ERC7857CloneableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function updateVerifier(
        address newVerifier
    ) public virtual onlyRole(OPERATOR_ROLE) {
        require(newVerifier != address(0), "Zero address");
        address oldVerifier = address(verifier());
        _setVerifier(newVerifier);
        emit VerifierUpdated(oldVerifier, newVerifier);
    }

    function setMintFee(
        uint256 newFee
    ) external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        uint256 oldFee = $.mintFee;
        $.mintFee = newFee;
        emit MintFeeUpdated(oldFee, newFee);
    }

    function mintFee() public view returns (uint256) {
        return _getAxiomAgentNFTStorage().mintFee;
    }

    function setStorageInfo(
        string memory newInfo
    ) external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        string memory old = $.storageInfo;
        $.storageInfo = newInfo;
        emit StorageInfoUpdated(old, newInfo);
    }

    function storageInfo() public view returns (string memory) {
        return _getAxiomAgentNFTStorage().storageInfo;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function update(
        uint256 tokenId,
        IntelligentData[] calldata newDatas
    ) public virtual whenNotPaused {
        require(_ownerOf(tokenId) == msg.sender, "Not owner");
        require(newDatas.length > 0, "Empty data array");
        _updateData(tokenId, newDatas);
    }

    /// @dev    Required by UUPSUpgradeable. Without this override, UUPSUpgradeable._authorizeUpgrade
    ///         reverts with "UUPSUnauthorizedCallContext". Per OZ docs, the canonical override is:
    ///         https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable-_authorizeUpgrade-address-
    ///         The EIP-1967 implementation slot is rewritten by the upgrade; the security check
    ///         here is the only thing preventing an attacker from bricking or replacing the
    ///         implementation. We restrict upgrades to the owner (the same address that holds
    ///         DEFAULT_ADMIN_ROLE), which matches the deploy-time trust assumption in
    ///         script/Deploy.s.sol.
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function mint(
        IntelligentData[] calldata iDatas,
        address to
    ) public payable virtual whenNotPaused nonReentrant returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(iDatas.length > 0, "Empty data array");
        require(msg.value >= _getAxiomAgentNFTStorage().mintFee, "Insufficient mint fee");

        tokenId = _incrementTokenId();
        _safeMint(to, tokenId);
        _getAxiomAgentNFTStorage().creators[tokenId] = to;
        emit CreatorSet(tokenId, to);
        _updateData(tokenId, iDatas);
        _refundExcess();
    }

    function mintWithRole(
        IntelligentData[] calldata iDatas,
        address to
    ) public virtual onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(iDatas.length > 0, "Empty data array");
        tokenId = _incrementTokenId();
        _safeMint(to, tokenId);
        _updateData(tokenId, iDatas);
    }

    function mintWithRole(
        IntelligentData[] calldata iDatas,
        address to,
        address creator
    ) public virtual onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(iDatas.length > 0, "Empty data array");
        tokenId = _incrementTokenId();
        _safeMint(to, tokenId);
        _updateData(tokenId, iDatas);
        if (creator != address(0)) {
            _getAxiomAgentNFTStorage().creators[tokenId] = creator;
            emit CreatorSet(tokenId, creator);
        }
    }

    function creatorOf(
        uint256 tokenId
    ) public view returns (address) {
        return _getAxiomAgentNFTStorage().creators[tokenId];
    }

    function _refundExcess() internal {
        uint256 fee = _getAxiomAgentNFTStorage().mintFee;
        if (msg.value > fee) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }
    }

    function withdrawMintFees(
        address payable to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Zero address");
        uint256 balance = address(this).balance;
        (bool ok,) = to.call{value: balance}("");
        require(ok, "Withdraw failed");
    }
}
