// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomDelegationRegistry} from "../src/AxiomDelegationRegistry.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockAxiomAgentNFT is IAxiomAgentNFT {
    mapping(uint256 => address) internal _owners;

    function setOwner(
        uint256 tokenId,
        address owner
    ) external {
        _owners[tokenId] = owner;
    }

    function ownerOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _owners[tokenId];
    }

    function creatorOf(
        uint256
    ) external pure override returns (address) {
        return address(0);
    }
}

contract NativeSink {
    uint256 public lastValue;
    bytes public lastData;

    function pay() external payable {
        lastValue = msg.value;
        lastData = msg.data;
    }

    function doNothing() external {}
}

contract AxiomDelegationRegistryTest is Test {
    AxiomDelegationRegistry internal registry;
    MockAxiomAgentNFT internal nft;
    NativeSink internal sink;
    // Deployed in setUp: new NativeSink() inside an isolated-vm.prank test would get a
    // different address than the one the leaf/root was computed against in setUp.
    NativeSink internal other;

    address internal registryOwner = address(0x0A11CE);
    uint256 internal constant OWNER_PK = 0xA11CE;
    address internal tokenOwner = vm.addr(OWNER_PK); // owner signs installs with this key
    address internal delegate = address(0xD1);

    uint256 internal constant TOKEN_ID = 1;

    bytes32 internal constant DELEGATION_TYPEHASH = keccak256(
        "AgentDelegation(uint256 agentTokenId,address delegate,uint256 perTxCap,uint256 windowCap,uint64 windowSeconds,uint64 expiresAt,bytes32 allowedSelectorsRoot,uint256 nonce)"
    );

    event DelegationInstalled(
        uint256 indexed agentTokenId, address indexed delegate, uint64 expiresAt, uint256 perTxCap, uint256 windowCap
    );
    event DelegationRevoked(uint256 indexed agentTokenId);
    event DelegatedExecuted(
        uint256 indexed agentTokenId,
        address indexed delegate,
        address indexed target,
        uint256 value,
        bytes32 actionHash
    );

    function setUp() public {
        nft = new MockAxiomAgentNFT();
        nft.setOwner(TOKEN_ID, tokenOwner);
        registry = new AxiomDelegationRegistry(nft, registryOwner);
        sink = new NativeSink();
        other = new NativeSink();
    }

    // ---------------------------------------------------------------- helpers

    function _delegation() internal view returns (AxiomDelegationRegistry.AgentDelegation memory d) {
        d = AxiomDelegationRegistry.AgentDelegation({
            agentTokenId: TOKEN_ID,
            delegate: delegate,
            perTxCap: 1 ether,
            windowCap: 2 ether,
            windowSeconds: 1 days,
            expiresAt: uint64(block.timestamp + 30 days),
            allowedSelectorsRoot: _sinkPayRoot(),
            nonce: 1
        });
    }

    function _sinkPayRoot() internal view returns (bytes32) {
        return keccak256(abi.encode(address(sink), sink.pay.selector));
    }

    function _sign(
        AxiomDelegationRegistry.AgentDelegation memory d,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                DELEGATION_TYPEHASH,
                d.agentTokenId,
                d.delegate,
                d.perTxCap,
                d.windowCap,
                d.windowSeconds,
                d.expiresAt,
                d.allowedSelectorsRoot,
                d.nonce
            )
        );
        bytes32 message = keccak256(abi.encodePacked("\x19\x01", registry.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, message);
        return abi.encodePacked(r, s, v);
    }

    function _install(
        AxiomDelegationRegistry.AgentDelegation memory d
    ) internal {
        registry.installDelegation(d, _sign(d, OWNER_PK));
    }

    function _payCall() internal view returns (bytes memory) {
        return abi.encodeWithSelector(sink.pay.selector);
    }

    // ---------------------------------------------------------------- install

    function test_install_happyPath() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        vm.expectEmit(true, true, true, true);
        emit DelegationInstalled(TOKEN_ID, delegate, d.expiresAt, d.perTxCap, d.windowCap);
        vm.prank(delegate); // install is permissionless — the owner signature is the authority
        registry.installDelegation(d, _sign(d, OWNER_PK));

        AxiomDelegationRegistry.AgentDelegation memory stored = registry.getDelegation(TOKEN_ID);
        assertEq(stored.delegate, delegate);
        assertEq(stored.perTxCap, d.perTxCap);
        assertEq(stored.windowCap, d.windowCap);
        assertEq(stored.expiresAt, d.expiresAt);
        assertTrue(registry.isDelegationActive(TOKEN_ID));
        assertTrue(registry.usedNonces(TOKEN_ID, 1));
    }

    function test_install_wrongSigner_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        bytes memory sig = _sign(d, 0xBAD); // signed by a non-owner key
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.NotTokenOwner.selector);
        registry.installDelegation(d, sig);
    }

    function test_install_staleSig_afterOwnerChange_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        bytes memory sig = _sign(d, OWNER_PK);
        address buyer = address(0xB2E2);
        nft.setOwner(TOKEN_ID, buyer); // token transferred after signing
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.NotTokenOwner.selector);
        registry.installDelegation(d, sig); // live-ownerOf check invalidates the stale sig
    }

    function test_install_nonceReplay_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);
        bytes memory _sig = _sign(d, OWNER_PK);
        vm.expectRevert(AxiomDelegationRegistry.DelegationNonceUsed.selector);
        registry.installDelegation(d, _sig);
    }

    function test_install_expired_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.expiresAt = uint64(block.timestamp); // not strictly future
        bytes memory _sig = _sign(d, OWNER_PK);
        vm.expectRevert(AxiomDelegationRegistry.DelegationExpired.selector);
        registry.installDelegation(d, _sig);
    }

    function test_install_zeroSelectorRoot_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.allowedSelectorsRoot = bytes32(0);
        bytes memory _sig = _sign(d, OWNER_PK);
        vm.expectRevert(AxiomDelegationRegistry.SelectorNotAllowed.selector);
        registry.installDelegation(d, _sig);
    }

    function test_install_invalidWindowConfig_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.windowCap = 0; // windowSeconds set but windowCap unset
        bytes memory _sig = _sign(d, OWNER_PK);
        vm.expectRevert(AxiomDelegationRegistry.InvalidWindowConfig.selector);
        registry.installDelegation(d, _sig);

        AxiomDelegationRegistry.AgentDelegation memory d2 = _delegation();
        d2.windowSeconds = 0; // windowCap set but windowSeconds unset
        bytes memory _sig2 = _sign(d2, OWNER_PK);
        vm.expectRevert(AxiomDelegationRegistry.InvalidWindowConfig.selector);
        registry.installDelegation(d2, _sig2);
    }

    function test_install_replacesPrevious_withFreshSig() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        address delegate2 = address(0xD2);
        AxiomDelegationRegistry.AgentDelegation memory d2 = d;
        d2.delegate = delegate2;
        d2.nonce = 2; // fresh nonce, fresh owner signature
        _install(d2);

        AxiomDelegationRegistry.AgentDelegation memory stored = registry.getDelegation(TOKEN_ID);
        assertEq(stored.delegate, delegate2);
        assertTrue(registry.usedNonces(TOKEN_ID, 2));
    }

    // ---------------------------------------------------------------- execute

    function test_execute_happyPath_forwardsValue() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        registry.delegatedExecute{value: 0.5 ether}(
            TOKEN_ID,
            address(sink),
            0.5 ether,
            _payCall(),
            new bytes32[](0) // single-leaf root: empty proof
        );
        assertEq(address(sink).balance, 0.5 ether);
        assertEq(sink.lastValue(), 0.5 ether);
        assertEq(address(registry).balance, 0); // registry holds no funds
        assertEq(address(delegate).balance, 0.5 ether);
    }

    function test_execute_emitsActionHash() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        bytes32 actionHash = keccak256(abi.encode(address(sink), 0.5 ether, keccak256(_payCall())));
        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectEmit(true, true, true, true);
        emit DelegatedExecuted(TOKEN_ID, delegate, address(sink), 0.5 ether, actionHash);
        registry.delegatedExecute{value: 0.5 ether}(TOKEN_ID, address(sink), 0.5 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_notDelegate_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(tokenOwner, 1 ether);
        vm.prank(tokenOwner); // even the NFT owner is not the delegate
        vm.expectRevert(AxiomDelegationRegistry.NotDelegate.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_noDelegation_reverts() public {
        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.NoActiveDelegation.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_expiry() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.warp(d.expiresAt + 1);
        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.DelegationExpired.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_perTxCap() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 2 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.CapExceeded.selector);
        registry.delegatedExecute{value: 1.1 ether}(
            TOKEN_ID,
            address(sink),
            1.1 ether,
            _payCall(),
            new bytes32[](0) // 1.1 > perTxCap 1.0
        );
    }

    function test_execute_windowAccumulation_thenExceeded() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 5 ether);
        vm.startPrank(delegate);
        registry.delegatedExecute{value: 1 ether}(TOKEN_ID, address(sink), 1 ether, _payCall(), new bytes32[](0));
        registry.delegatedExecute{value: 1 ether}(TOKEN_ID, address(sink), 1 ether, _payCall(), new bytes32[](0)); // exactly at windowCap 2
        vm.expectRevert(AxiomDelegationRegistry.WindowExceeded.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
        vm.stopPrank();
        assertEq(address(sink).balance, 2 ether);
    }

    function test_execute_windowReset_afterWindowElapses() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.perTxCap = 1.5 ether; // windowCap 2e is the looser window bound; perTxCap binds harder
        d.windowCap = 2 ether;
        d.windowSeconds = 1 days;
        d.nonce = 4;
        _install(d);

        vm.deal(delegate, 5 ether);
        vm.startPrank(delegate);
        registry.delegatedExecute{value: 1.5 ether}(TOKEN_ID, address(sink), 1.5 ether, _payCall(), new bytes32[](0));
        vm.expectRevert(AxiomDelegationRegistry.WindowExceeded.selector); // 1.5 + 0.6 > 2e window
        registry.delegatedExecute{value: 0.6 ether}(TOKEN_ID, address(sink), 0.6 ether, _payCall(), new bytes32[](0));

        vm.warp(block.timestamp + 1 days + 1); // next window id
        vm.expectRevert(AxiomDelegationRegistry.CapExceeded.selector); // 1.8e > perTxCap 1.5e, window allows
        registry.delegatedExecute{value: 1.8 ether}(TOKEN_ID, address(sink), 1.8 ether, _payCall(), new bytes32[](0));
        vm.stopPrank();
        assertEq(address(sink).balance, 1.5 ether);
        // Reverted calls roll back: spent is still the first-window debit, window id not yet advanced.
        (uint128 spent, uint64 windowId) = registry.windows(TOKEN_ID);
        assertEq(spent, 1.5 ether);
        assertEq(windowId, uint64((block.timestamp - 1 days - 1) / 1 days));
    }

    function test_execute_zeroWindowConfig_skipsWindowAccounting() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.windowCap = 0;
        d.windowSeconds = 0;
        _install(d);

        vm.deal(delegate, 10 ether);
        vm.startPrank(delegate);
        registry.delegatedExecute{value: 1 ether}(TOKEN_ID, address(sink), 1 ether, _payCall(), new bytes32[](0));
        registry.delegatedExecute{value: 1 ether}(TOKEN_ID, address(sink), 1 ether, _payCall(), new bytes32[](0));
        vm.stopPrank();
        assertEq(address(sink).balance, 2 ether); // perTxCap is the only bound
    }

    function test_execute_zeroRootDelegate_revertsSelectorNotAllowed() public {
        // Defense-in-depth: a zero root can never be installed, so the on-chain path to an
        // unrestricted delegate is the storage-slot path — still guard execute. Direct
        // storage writes: _delegations base slot = 2 (slots 0/1 are Ownable._owner /
        // Pausable._paused; the guard's _status is transient, nft/domainSeparator are
        // immutables), delegate at +1, perTxCap at +2, windowSeconds/expiresAt packed at +4
        // (expiresAt in the high half). The injected
        // delegate is the test contract itself so the execute call needs no vm.prank — a
        // cheatcall after vm.prank runs in the isolated context and vm.store writes there
        // do not persist to the main context.
        bytes32 base = keccak256(abi.encode(TOKEN_ID, uint256(2)));
        vm.store(address(registry), bytes32(uint256(base) + 1), bytes32(uint256(uint160(address(this)))));
        vm.store(address(registry), bytes32(uint256(base) + 2), bytes32(uint256(1 ether)));
        vm.store(address(registry), bytes32(uint256(base) + 4), bytes32(uint256(type(uint64).max) << 64));
        vm.deal(address(this), 1 ether);
        vm.expectRevert(AxiomDelegationRegistry.SelectorNotAllowed.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_wrongProof_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.InvalidMerkleProof.selector);
        registry.delegatedExecute{value: 0.1 ether}(
            TOKEN_ID, address(sink), 0.1 ether, _payCall(), _proveAgainst(bytes32(uint256(0xDEAD)))
        );
    }

    function test_execute_unlistedTarget_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.InvalidMerkleProof.selector);
        registry.delegatedExecute{value: 0.1 ether}(
            TOKEN_ID,
            address(other),
            0.1 ether,
            _payCall(),
            new bytes32[](0) // (other,pay) not in root
        );
    }

    function test_execute_unlistedSelector_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.InvalidMerkleProof.selector);
        registry.delegatedExecute{value: 0}(
            TOKEN_ID, address(sink), 0, abi.encodeWithSelector(sink.doNothing.selector), new bytes32[](0)
        );
    }

    function test_execute_multiLeafRoot_correctProof() public {
        bytes32 leafA = keccak256(abi.encode(address(sink), sink.pay.selector));
        bytes32 leafB = keccak256(abi.encode(address(other), other.pay.selector));
        // OZ pairs are sorted (a < b ? keccak(a,b) : keccak(b,a)); the proof is for leafA,
        // so its sibling is always leafB — only the root's pair order depends on sorting.
        bytes32[] memory proofA = _singleProof(leafB);
        (bytes32 lo, bytes32 hi) = leafA < leafB ? (leafA, leafB) : (leafB, leafA);

        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.allowedSelectorsRoot = keccak256(abi.encode(lo, hi));
        _install(d);

        vm.deal(delegate, 2 ether);
        vm.prank(delegate);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), proofA);
        assertEq(address(sink).balance, 0.1 ether);
    }

    function _singleProof(
        bytes32 sibling
    ) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = sibling;
    }

    function _proveAgainst(
        bytes32 fakeRoot
    ) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = fakeRoot;
    }

    // Valid proof shape but its leaf is the sibling (other,pay) — target/selector mismatch.
    function _proveOther() internal view returns (bytes32[] memory p) {
        p = _singleProof(keccak256(abi.encode(address(other), other.pay.selector)));
    }

    function test_execute_valueMismatch_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(abi.encodeWithSelector(AxiomDelegationRegistry.ValueMismatch.selector, 0.5 ether, 0.1 ether));
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.5 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_shortData_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.SelectorNotAllowed.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, hex"abcd", new bytes32[](0));
    }

    function test_execute_paused_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.prank(registryOwner);
        registry.pause();
        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert("EnforcedPause()");
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_execute_failingTarget_revertsAndRollsBackWindow() public {
        // Second delegation (fresh nonce) whitelists sink.doNothing — non-payable, so a
        // 1-ether call reverts inside the target and the whole tx rolls back.
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.nonce = 2;
        d.allowedSelectorsRoot = keccak256(abi.encode(address(sink), sink.doNothing.selector));
        _install(d);

        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.CallFailed.selector);
        registry.delegatedExecute{value: 1 ether}(
            TOKEN_ID, address(sink), 1 ether, abi.encodeWithSelector(sink.doNothing.selector), new bytes32[](0)
        );
        // Window debit rolled back with the revert — reinstall a pay-cap delegation (fresh
        // nonce) and verify the full cap is still available.
        AxiomDelegationRegistry.AgentDelegation memory d2 = _delegation();
        d2.nonce = 3;
        _install(d2);
        vm.prank(delegate);
        registry.delegatedExecute{value: 1 ether}(TOKEN_ID, address(sink), 1 ether, _payCall(), new bytes32[](0));
        assertEq(address(sink).balance, 1 ether);
    }

    // ---------------------------------------------------------------- revoke

    function test_revoke_immediacy() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.prank(tokenOwner);
        vm.expectEmit(true, false, false, false);
        emit DelegationRevoked(TOKEN_ID);
        registry.revokeDelegation(TOKEN_ID);

        assertFalse(registry.isDelegationActive(TOKEN_ID));
        vm.deal(delegate, 1 ether);
        vm.prank(delegate);
        vm.expectRevert(AxiomDelegationRegistry.NoActiveDelegation.selector);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));
    }

    function test_revoke_nonOwner_reverts() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.prank(delegate); // the delegate cannot self-perpetuate
        vm.expectRevert(AxiomDelegationRegistry.NotTokenOwner.selector);
        registry.revokeDelegation(TOKEN_ID);
        assertTrue(registry.isDelegationActive(TOKEN_ID));
    }

    function test_revoke_byNewOwner_afterTransfer() public {
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        address buyer = address(0xB2E2);
        nft.setOwner(TOKEN_ID, buyer);
        vm.prank(buyer); // live ownerOf — buyer strips the seller's delegate
        registry.revokeDelegation(TOKEN_ID);
        assertFalse(registry.isDelegationActive(TOKEN_ID));
    }

    // ---------------------------------------------------------------- integration

    function test_integration_delegatedVaultExecute_underCaps() public {
        // Vault wired to the same mock NFT; token owner funds it and sets a strategy.
        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl), abi.encodeWithSelector(vaultImpl.initialize.selector, address(nft), registryOwner)
        );
        AxiomStrategyVault vault = AxiomStrategyVault(payable(address(vaultProxy)));

        vm.deal(tokenOwner, 10 ether);
        vm.startPrank(tokenOwner);
        vault.deposit{value: 2 ether}(TOKEN_ID);
        bytes memory innerData = abi.encodeWithSelector(sink.pay.selector);
        uint256 innerValue = 1.5 ether;
        bytes32 vaultLeaf = keccak256(abi.encode(address(sink), innerValue, keccak256(innerData)));
        vault.setStrategy(TOKEN_ID, vaultLeaf, 5 ether, 0);
        vm.stopPrank();

        // Delegation whitelists ONLY vault.execute — the registry root is the restriction.
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        d.allowedSelectorsRoot = keccak256(abi.encode(address(vault), vault.execute.selector));
        d.perTxCap = 0; // value carried through the registry is 0 — the vault spends its own balance
        d.windowCap = 0;
        d.windowSeconds = 0;
        _install(d);

        bytes memory callData = abi.encodeWithSelector(
            vault.execute.selector, TOKEN_ID, address(sink), innerValue, innerData, new bytes32[](0)
        );
        vm.prank(delegate);
        registry.delegatedExecute(TOKEN_ID, address(vault), 0, callData, new bytes32[](0));

        assertEq(address(sink).balance, innerValue, "vault paid the sink");
        assertEq(vault.balanceOf(TOKEN_ID), 2 ether - innerValue, "vault balance debited");
        assertTrue(address(registry).balance == 0, "registry holds no funds");
    }

    function test_integration_vaultPayoutViaDelegate_forwardedToDelegate() public {
        // A whitelisted target that returns native to msg.sender (the registry) — the leftover
        // must be forwarded to the delegate, keeping the registry empty.
        AxiomDelegationRegistry.AgentDelegation memory d = _delegation();
        _install(d);

        vm.deal(address(registry), 0.3 ether); // simulate native stranded by a target payout
        assertEq(address(registry).balance, 0.3 ether);

        vm.deal(delegate, 0.1 ether);
        vm.prank(delegate);
        registry.delegatedExecute{value: 0.1 ether}(TOKEN_ID, address(sink), 0.1 ether, _payCall(), new bytes32[](0));

        assertEq(address(registry).balance, 0, "leftover forwarded");
        assertEq(address(delegate).balance, 0.3 ether);
        assertEq(address(sink).balance, 0.1 ether);
    }
}
