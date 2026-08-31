// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISignatureTransfer — minimal Uniswap Permit2 SignatureTransfer interface
/// @notice Vendored (trimmed) from https://github.com/Uniswap/permit2 (MIT), src/interfaces/ISignatureTransfer.sol @ main.
///         Only what AxiomPaymentProcessor consumes: `PermitTransferFrom` + `permitWitnessTransferFrom` (single-token).
///         Batch variants, `permitTransferFrom`, and nonce-invalidation entry points are dropped — add them
///         (byte-compatible with upstream) if a future lane needs them.
/// @dev Requires the payer to have approved the canonical Permit2 contract (`permit2`) to spend the payment token.
///      Replay protection: Permit2 burns the signature's unordered nonce internally (nonceBitmap) — callers must NOT
///      layer their own nonce accounting.
interface ISignatureTransfer {
    /// @notice Thrown when the requested amount for a transfer is larger than the permissioned amount
    /// @param maxAmount The maximum amount a spender can request to transfer
    error InvalidAmount(uint256 maxAmount);

    /// @notice Emits an event when the owner successfully invalidates an unordered nonce.
    event UnorderedNonceInvalidation(address indexed owner, uint256 word, uint256 mask);

    /// @notice The token and amount details for a transfer signed in the permit transfer signature
    struct TokenPermissions {
        // ERC20 token address
        address token;
        // the maximum amount that can be spent
        uint256 amount;
    }

    /// @notice The signed permit message for a single token transfer
    /// @dev Matches upstream exactly — there is NO `owner` field; the owner/signer is passed separately
    ///      to `permitWitnessTransferFrom` and Permit2 reverts unless the signature recovers to it.
    struct PermitTransferFrom {
        // the permitted token and maximum amount
        TokenPermissions permitted;
        // a unique value for every token owner's signature to prevent signature replays
        uint256 nonce;
        // deadline on the permit signature
        uint256 deadline;
    }

    /// @notice Specifies the recipient address and amount for the transfer.
    /// @dev Reverts if the requested amount is greater than the permitted signed amount.
    struct SignatureTransferDetails {
        // recipient address
        address to;
        // spender requested amount
        uint256 requestedAmount;
    }

    /// @notice A map from token owner address and a caller specified word index to a bitmap. Used to set bits in the bitmap to prevent against signature replay protection
    /// @dev Uses unordered nonces so that permit messages do not need to be spent in a certain order
    function nonceBitmap(
        address,
        uint256
    ) external view returns (uint256);

    /// @notice Transfers a token using a signed permit message, binding extra witness data into the signed message.
    /// @dev The witness type string must follow EIP712 ordering of nested structs and must include the TokenPermissions type definition
    /// @dev Reverts if the requested amount is greater than the permitted signed amount
    /// @param permit The permit data signed over by the owner
    /// @param owner The owner of the tokens to transfer (must recover from `signature`)
    /// @param transferDetails The spender's requested transfer details for the permitted token
    /// @param witness Extra data to include when checking the user signature
    /// @param witnessTypeString The EIP-712 type definition for remaining string stub of the typehash
    /// @param signature The signature to verify
    function permitWitnessTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) external;
}
