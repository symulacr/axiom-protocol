// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

// UUPS mandated by security report F-02: without an _authorizeUpgrade override, OZ proxy upgrades revert.
import {ERC7857Upgradeable} from "./ERC7857Upgradeable.sol";
import {ERC7857CloneableUpgradeable} from "./extensions/ERC7857CloneableUpgradeable.sol";
import {ERC7857AuthorizeUpgradeable} from "./extensions/ERC7857AuthorizeUpgradeable.sol";
import {ERC7857IDataStorageUpgradeable} from "./extensions/ERC7857IDataStorageUpgradeable.sol";
import {IntelligentData} from "./interfaces/IERC7857Metadata.sol";
import {TransferValidityProof} from "./interfaces/IERC7857DataVerifier.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {AxiomMetadataJson} from "./extensions/AxiomMetadataJson.sol";
import {TimelockManager} from "./libraries/TimelockManager.sol";
using TimelockManager for TimelockManager.State;

/// @notice Concrete ERC-7857 iNFT composing the 3 canonical extensions + OZ AccessControl/ReentrancyGuard/Pausable/ERC721 (0G reference, MIT)
/// @dev Integrators must use `iTransfer`/`iTransferFrom` with proofs — bare ERC-721 transfers skip `PublishedSealedKey` and break decryptability.
contract AxiomAgentNFT is
    AccessControlUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable,
    ERC7857CloneableUpgradeable,
    ERC7857AuthorizeUpgradeable,
    ERC7857IDataStorageUpgradeable
{
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event VerifierProposed(address indexed newVerifier);
    event VerifierProposalCancelled();
    event CreatorSet(uint256 indexed tokenId, address indexed creator);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event StorageInfoUpdated(string oldInfo, string newInfo);
    event MetadataJsonDecisionDocumented(string collectionName, string collectionSymbol, string rationaleTag);


    /// @custom:storage-location erc7201:agent.storage.AxiomAgentNFT
    struct AxiomAgentNFTStorage {
        string storageInfo;
        uint256 mintFee;
        mapping(uint256 => address) creators;
        TimelockManager.State verifierTimelock;
        uint256[48] __gap;
    }

    using AxiomMetadataJson for uint256;
    using Strings for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

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
    ) internal virtual override(ERC7857Upgradeable, ERC7857AuthorizeUpgradeable) whenNotPaused returns (address) {
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

    /// @dev Verifier rotation is two-step with a 1-day timelock so monitors can react before execution.
    function proposeVerifier(
        address newVerifier
    ) external onlyRole(ADMIN_ROLE) {
        require(newVerifier != address(0), "Zero verifier");
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.verifierTimelock.propose(newVerifier);
        emit VerifierProposed(newVerifier);
    }

    function executeVerifier() external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        address oldVerifier = address(verifier());
        address result = $.verifierTimelock.execute();
        _setVerifier(result);
        emit VerifierUpdated(oldVerifier, result);
    }

    function cancelVerifierProposal() external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.verifierTimelock.cancel();
        emit VerifierProposalCancelled();
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

    function pendingVerifier() public view returns (address) {
        return _getAxiomAgentNFTStorage().verifierTimelock.proposed;
    }

    function pendingVerifierExecutableAt() public view returns (uint256) {
        return _getAxiomAgentNFTStorage().verifierTimelock.proposedAt + TimelockManager.DELAY;
    }

    /// @notice Tx-reduction merge of authorizeAndDelegate + revokeAuthorization: authorizes `delegate`
    ///         for `tokenId`, sets it as the owner's access assistant, then immediately revokes the
    ///         authorization — final state = accessAssistants[msg.sender] == delegate, authorizedUsers empty.
    ///         Safe in one tx because no _update (which clears authorized users) runs between add and remove.
    /// @dev No production producer of this calldata outside the contract; roadmap decision pending (ledger M1).
    function authorizeDelegateAndRevoke(
        address delegate,
        uint256 tokenId
    ) external whenNotPaused {
        require(_ownerOf(tokenId) == msg.sender, "Not owner");
        _authorizeUsage(tokenId, delegate);
        delegateAccess(delegate);
        revokeAuthorization(tokenId, delegate);
    }

    /// @notice Tx-reduction merge of iTransferFrom + cleanExpiredProofs: transfers `tokenId` from
    ///         `from` to `to` with proofs, then asks the verifier to reclaim expired proof storage
    ///         for `cleanupNonces`. The just-used proof nonce is never deleted (fresh timestamp
    ///         fails the now > timestamp + maxAge check), so this is safe to call with it included.
    function transferAndCleanExpiredProofs(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs,
        bytes32[] calldata cleanupNonces
    ) external {
        iTransferFrom(from, to, tokenId, proofs);
        verifier().cleanExpiredProofs(cleanupNonces);
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

    /// @dev UUPS gate: the EIP-1967 impl-slot rewrite is protected only by this check; DEFAULT_ADMIN_ROLE keeps governance in AccessControl.
    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function mint(
        IntelligentData[] calldata iDatas,
        address to
    ) public payable virtual whenNotPaused nonReentrant returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(iDatas.length > 0, "Empty data array");
        uint256 fee = _getAxiomAgentNFTStorage().mintFee;
        require(msg.value >= fee, "Insufficient mint fee");

        tokenId = _incrementTokenId();
        _updateData(tokenId, iDatas);
        _safeMint(to, tokenId);
        _getAxiomAgentNFTStorage().creators[tokenId] = to;
        emit CreatorSet(tokenId, to);
        _refundExcess(fee);
    }

    function mintWithRole(
        IntelligentData[] calldata iDatas,
        address to
    ) public virtual onlyRole(MINTER_ROLE) whenNotPaused nonReentrant returns (uint256 tokenId) {
        // Role-minted tokens default to `to` as creator so payForAgent/creatorOf
        // behave identically to the public mint path (which sets creators[tokenId] = to).
        return _mintWithRole(iDatas, to, to);
    }

    function mintWithRole(
        IntelligentData[] calldata iDatas,
        address to,
        address creator
    ) public virtual onlyRole(MINTER_ROLE) whenNotPaused nonReentrant returns (uint256 tokenId) {
        return _mintWithRole(iDatas, to, creator);
    }

    function _mintWithRole(
        IntelligentData[] calldata iDatas,
        address to,
        address creator
    ) internal returns (uint256 tokenId) {
        require(to != address(0), "Zero address");
        require(iDatas.length > 0, "Empty data array");
        tokenId = _incrementTokenId();
        _updateData(tokenId, iDatas);
        _safeMint(to, tokenId);
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

    function _refundExcess(uint256 fee) internal {
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

    function tokenURI(uint256 tokenId) public view virtual override(ERC721Upgradeable, IERC721Metadata) returns (string memory) {
        _requireOwned(tokenId);
        return tokenId.buildMetadataJsonDataUri(_intelligentDatasOf(tokenId), name(), symbol());
    }
}
