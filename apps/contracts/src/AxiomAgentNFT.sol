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
import {IERC1822Proxiable} from "@openzeppelin/contracts/interfaces/draft-IERC1822.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
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
    ERC7857IDataStorageUpgradeable,
    ERC2771ContextUpgradeable
{
    error UseTimelockedFeeWithdrawal();
    error DataSizeExceeded(uint256 provided, uint256 max);

    /// @dev Aggregate byte budget for a token's IntelligentData[] (sum of abi.encode sizes of
    ///      every entry: dataDescription string + dataHash). Caps per-mint/update gas and the
    ///      `Updated` event payload; V3 moves payload bodies to 0G Storage (proposal 03 §2a).
    uint256 public constant MAX_I_DATA_BYTES = 4096;

    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event VerifierProposed(address indexed newVerifier);
    event VerifierProposalCancelled();
    event CreatorSet(uint256 indexed tokenId, address indexed creator);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event StorageInfoUpdated(string oldInfo, string newInfo);
    event MetadataJsonDecisionDocumented(string collectionName, string collectionSymbol, string rationaleTag);
    event FeeWithdrawalProposed(address indexed to);
    event FeeWithdrawalExecuted(address indexed to, uint256 amount);
    event FeeWithdrawalCancelled();
    event UpgradeProposed(address indexed newImplementation);
    event UpgradeExecuted(address indexed newImplementation);
    event UpgradeCancelled();
    event TrustedForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    /// @custom:storage-location erc7201:agent.storage.AxiomAgentNFT
    struct AxiomAgentNFTStorage {
        string storageInfo;
        uint256 mintFee;
        mapping(uint256 => address) creators;
        TimelockManager.State verifierTimelock;
        // V2 admin hardening (ADR-004 §1.1): appended after original fields, gap shrunk 48→44.
        // UUPS upgrade-in-place safe: pre-V2 impls read the first 4 fields + full gap; appended
        // state lives in former gap slots untouched by V1 code paths.
        TimelockManager.State feeWithdrawalTimelock;
        TimelockManager.State upgradeTimelock;
        // V3 W5 (ERC-2771 retrofit): appended at the gap tail per the V2 layout-delta rule
        // (gap shrunk 44→43; upgrade-in-place safe: pre-W5 impls never read this slot, so its
        // zero default = "no forwarder trusted" is inert until the admin wires the GasTank via
        // setTrustedForwarder). The OZ base's immutable _trustedForwarder is left unset —
        // trustedForwarder() below is overridden to read this storage field instead.
        address trustedForwarder;
        uint256[43] __gap;
    }

    using AxiomMetadataJson for uint256;
    using Strings for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bytes32 private constant STORAGE_LOCATION = 0xe982fe9a44d6409dbf89634fae06be5c796203a5c100b2ec87b395d27194a900;

    function _getAxiomAgentNFTStorage() private pure returns (AxiomAgentNFTStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() ERC2771ContextUpgradeable(address(0)) {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory storageInfo_,
        address verifierAddr,
        address admin_
    ) public virtual initializer {
        require(verifierAddr != address(0), "NoVerif");
        require(admin_ != address(0), "Zero admin");

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ERC7857_init(name_, symbol_, verifierAddr);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
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
        require(newVerifier != address(0), "NoVerif");
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

    /// @dev Fee drainage is two-step with a 1-day timelock (mirrors verifier rotation) so monitors
    ///      can react before the balance leaves the contract. ADR-004 §1.1: instant single-key
    ///      fee drain was the largest residual admin risk alongside instant upgrades.
    function proposeFeeWithdrawal(
        address payable to
    ) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Zero addr");
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.feeWithdrawalTimelock.propose(to);
        emit FeeWithdrawalProposed(to);
    }

    function executeFeeWithdrawal() external onlyRole(ADMIN_ROLE) nonReentrant {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        address to = $.feeWithdrawalTimelock.execute();
        uint256 balance = address(this).balance;
        (bool ok,) = payable(to).call{value: balance}("");
        require(ok, "Wdrw err");
        emit FeeWithdrawalExecuted(to, balance);
    }

    function cancelFeeWithdrawal() external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.feeWithdrawalTimelock.cancel();
        emit FeeWithdrawalCancelled();
    }

    function pendingFeeWithdrawal() public view returns (address) {
        return _getAxiomAgentNFTStorage().feeWithdrawalTimelock.proposed;
    }

    function pendingFeeWithdrawalExecutableAt() public view returns (uint256) {
        return _getAxiomAgentNFTStorage().feeWithdrawalTimelock.proposedAt + TimelockManager.DELAY;
    }

    /// @dev Implementation upgrades are two-step with a 1-day timelock (mirrors verifier rotation):
    ///      propose → delay → executeUpgrade, which performs the UUPS proxy upgrade. executeUpgrade
    ///      pre-validates the target (non-zero, code, ERC-1967 UUID) so a malformed proposal can be
    ///      cancelled instead of bricking the proxy at execution time.
    function proposeUpgrade(
        address newImplementation
    ) external onlyRole(ADMIN_ROLE) {
        require(newImplementation != address(0), "Zero impl");
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.upgradeTimelock.propose(newImplementation);
        emit UpgradeProposed(newImplementation);
    }

    function executeUpgrade() external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        address newImplementation = $.upgradeTimelock.execute();
        require(newImplementation.code.length > 0, "No impl");
        require(
            IERC1822Proxiable(newImplementation).proxiableUUID() == ERC1967Utils.IMPLEMENTATION_SLOT,
            "Bad UUID"
        );
        // Called from the implementation (call context): OZ's external upgradeToAndCall relay would
        // revert on its _checkProxy guard and _authorizeUpgrade would see the NFT as msg.sender. The
        // ADMIN_ROLE + 1-day timelock gate above is the authorization; ERC1967Utils.upgradeToAndCall
        // runs as an internal call, writing the proxy's EIP-1967 slot in this delegatecall context.
        ERC1967Utils.upgradeToAndCall(newImplementation, "");
        emit UpgradeExecuted(newImplementation);
    }

    function cancelUpgrade() external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        $.upgradeTimelock.cancel();
        emit UpgradeCancelled();
    }

    function pendingUpgrade() public view returns (address) {
        return _getAxiomAgentNFTStorage().upgradeTimelock.proposed;
    }

    function pendingUpgradeExecutableAt() public view returns (uint256) {
        return _getAxiomAgentNFTStorage().upgradeTimelock.proposedAt + TimelockManager.DELAY;
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

    // ─── ERC-2771 trusted forwarder (V3 W5) ───
    // The vendored OZ 5.0.2 base bakes the forwarder as an immutable; these storage-backed
    // overrides replace it so the admin can wire/un-wire the GasTank post-upgrade. A zero
    // forwarder is a valid un-wire (isTrustedForwarder guards zero).

    /// @notice Wire the ERC-2771 forwarder whose relayed calldata resolves to the signed user.
    function setTrustedForwarder(
        address newForwarder
    ) external onlyRole(ADMIN_ROLE) {
        AxiomAgentNFTStorage storage $ = _getAxiomAgentNFTStorage();
        address old = $.trustedForwarder;
        $.trustedForwarder = newForwarder;
        emit TrustedForwarderUpdated(old, newForwarder);
    }

    function trustedForwarder() public view override returns (address) {
        return _getAxiomAgentNFTStorage().trustedForwarder;
    }

    function isTrustedForwarder(
        address forwarder
    ) public view override returns (bool) {
        return forwarder != address(0) && forwarder == _getAxiomAgentNFTStorage().trustedForwarder;
    }

    /// @dev Explicit diamond overrides: ContextUpgradeable reaches this contract both directly
    ///      (via ERC721Upgradeable) and via ERC2771ContextUpgradeable, so solc requires the
    ///      derived contract to disambiguate. Delegating to the ERC-2771 variant wires every
    ///      inherited _msgSender() call site (update, refund, approvals) through forwarder
    ///      resolution.
    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    function update(
        uint256 tokenId,
        IntelligentData[] calldata newDatas
    ) public virtual whenNotPaused {
        require(_ownerOf(tokenId) == _msgSender(), "NotOwner");
        require(newDatas.length > 0, "No data");
        _checkDataSize(newDatas);
        _updateData(tokenId, newDatas);
    }

    /// @dev UUPS gate: the EIP-1967 impl-slot rewrite is protected twice — direct upgradeTo(AndCall)
    ///      stays DEFAULT_ADMIN-gated, and the primary V2 path (proposeUpgrade/executeUpgrade) adds a
    ///      1-day timelock window (ADR-004 §1.1). Keep this guard: it is what forces every rewrite of
    ///      the slot through a role check even when the new implementation does not inherit this contract.
    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function mint(
        IntelligentData[] calldata iDatas,
        address to
    ) public payable virtual whenNotPaused nonReentrant returns (uint256 tokenId) {
        require(to != address(0), "Zero addr");
        require(iDatas.length > 0, "No data");
        _checkDataSize(iDatas);
        uint256 fee = _getAxiomAgentNFTStorage().mintFee;
        require(msg.value >= fee, "Low fee");

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
        require(to != address(0), "Zero addr");
        require(iDatas.length > 0, "No data");
        _checkDataSize(iDatas);
        tokenId = _incrementTokenId();
        _updateData(tokenId, iDatas);
        _safeMint(to, tokenId);
        // Zero-creator default mirrors the 2-arg mintWithRole overload: without this, such
        // tokens would revert AgentCreatorNotRegistered in the Processor's _paySplit forever.
        if (creator == address(0)) {
            creator = to;
        }
        _getAxiomAgentNFTStorage().creators[tokenId] = creator;
        emit CreatorSet(tokenId, creator);
    }

    function creatorOf(
        uint256 tokenId
    ) public view returns (address) {
        return _getAxiomAgentNFTStorage().creators[tokenId];
    }

    function _refundExcess(
        uint256 fee
    ) internal {
        if (msg.value > fee) {
            (bool ok,) = payable(_msgSender()).call{value: msg.value - fee}("");
            require(ok, "Rfnd err");
        }
    }

    function withdrawMintFees(
        address payable /* to */
    ) external view onlyRole(DEFAULT_ADMIN_ROLE) {
        // V2 (ADR-004 §1.1): fee withdrawal is timelocked. proposeFeeWithdrawal/executeFeeWithdrawal
        // replace the old instant drain; the function stays as a view stub so the deployed ABI keeps
        // its selector for backend callers, who now get the timelock views instead of a balance sweep.
        // DEPRECATED: this stub reverts unconditionally and is scheduled for removal at the V3
        // deploy (W1-C) — backend callers must migrate to the timelocked propose/execute pair
        // before that deploy; the selector will not survive into the V3 ABI.
        revert UseTimelockedFeeWithdrawal();
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override(ERC721Upgradeable, IERC721Metadata) returns (string memory) {
        _requireOwned(tokenId);
        return tokenId.buildMetadataJsonDataUri(_intelligentDatasOf(tokenId), name(), symbol());
    }

    /// @dev Sum of abi.encode lengths across all entries — each entry is dataDescription
    ///      (unbounded string) + dataHash (fixed 32 bytes), so the total is attacker-bounded
    ///      by the string sizes alone; a single aggregate check covers mint and update.
    function _checkDataSize(
        IntelligentData[] calldata iDatas
    ) internal pure {
        uint256 total;
        for (uint256 i = 0; i < iDatas.length; i++) {
            total += abi.encode(iDatas[i]).length;
        }
        if (total > MAX_I_DATA_BYTES) revert DataSizeExceeded(total, MAX_I_DATA_BYTES);
    }
}
