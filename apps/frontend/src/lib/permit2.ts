import type { Address } from "viem";

/** Canonical Permit2 deployment (Uniswap CREATE2 — identical address on every
 * supported chain, verified on Galileo; the Processor hardcodes the same constant). */
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** Permit2's EIP-712 domain carries NO version field (Permit2 EIP712.sol:
 * keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)")). */
export const PERMIT2_DOMAIN = (
  chainId: number,
): { name: string; chainId: number; verifyingContract: Address } => ({
  name: "Permit2",
  chainId,
  verifyingContract: PERMIT2_ADDRESS,
});

/** Mirrors the Processor's witness variant byte-for-byte. Permit2 hashes witness
 * permits against the stub string `_PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB` +
 * the witness type string + the TokenPermissions tail, so the EIP-712 types the
 * wallet signs MUST be: PermitWitnessTransferFrom(TokenPermissions permitted,
 * address spender, uint256 nonce, uint256 deadline, AgentPayment witness) with
 * TokenPermissions(address token,uint256 amount) and AgentPayment(uint256
 * agentTokenId,uint256 amount). Field order is load-bearing. */
export const PERMIT2_WITNESS_TYPES = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "AgentPayment" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  AgentPayment: [
    { name: "agentTokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
  ],
} as const;

/** ISignatureTransfer.PermitTransferFrom — note there is NO owner field; the
 * owner is a separate call parameter on payForAgentWithPermit2 and Permit2
 * reverts unless the signature recovers to it. */
export interface PermitTransferFrom {
  permitted: { token: Address; amount: bigint };
  nonce: bigint;
  deadline: bigint;
}

export interface PermitWitnessMessage {
  permitted: { token: Address; amount: bigint };
  /** Spender inside the signed message is the settlement contract (the
   * Processor — Permit2's msg.sender), never a relayer. */
  spender: Address;
  nonce: bigint;
  deadline: bigint;
  witness: { agentTokenId: bigint; amount: bigint };
}

/** Fresh unordered-nonce nonce for a one-tx-lifetime signature. Crypto-random
 * so concurrent permits never collide on the same (word, bit). */
export function randomPermitNonce(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

export interface BuildPermit2WitnessArgs {
  chainId: number;
  paymentToken: Address;
  /** Permitted amount the user signs away (base units). */
  permittedAmount: bigint;
  /** Amount actually pulled by the Processor (<= permittedAmount; the witness
   * binds this value so a captured signature cannot be reused for more). */
  payAmount: bigint;
  spender: Address;
  agentTokenId: bigint;
  /** Unix seconds; the Processor pre-checks expiry before Permit2 burns the nonce. */
  deadline: bigint;
  nonce?: bigint;
}

/** Builds the typed data for signTypedData that payForAgentWithPermit2 will
 * redeem: witness = AgentPayment{agentTokenId, payAmount}. */
export function buildPermit2WitnessTypedData(args: BuildPermit2WitnessArgs): {
  domain: ReturnType<typeof PERMIT2_DOMAIN>;
  types: typeof PERMIT2_WITNESS_TYPES;
  primaryType: "PermitWitnessTransferFrom";
  message: PermitWitnessMessage;
  permit: PermitTransferFrom;
} {
  const nonce = args.nonce ?? randomPermitNonce();
  const permitted = {
    token: args.paymentToken,
    amount: args.permittedAmount,
  };
  return {
    domain: PERMIT2_DOMAIN(args.chainId),
    types: PERMIT2_WITNESS_TYPES,
    primaryType: "PermitWitnessTransferFrom",
    message: {
      permitted,
      spender: args.spender,
      nonce,
      deadline: args.deadline,
      witness: { agentTokenId: args.agentTokenId, amount: args.payAmount },
    },
    permit: { permitted, nonce, deadline: args.deadline },
  };
}
