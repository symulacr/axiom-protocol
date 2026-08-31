import { concatHex, keccak256, type Address, type Hex } from "viem";

/** Registry domain: keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
 *  with name "AxiomDelegationRegistry", version "1" (AxiomDelegationRegistry.sol constructor). */
export const DELEGATION_REGISTRY_DOMAIN = (
  chainId: number,
  verifyingContract: Address,
): {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
} => ({
  name: "AxiomDelegationRegistry",
  version: "1",
  chainId,
  verifyingContract,
});

/** Must byte-match the registry's DELEGATION_TYPEHASH field order (AgentDelegation). */
export const AGENT_DELEGATION_TYPES = {
  AgentDelegation: [
    { name: "agentTokenId", type: "uint256" },
    { name: "delegate", type: "address" },
    { name: "perTxCap", type: "uint256" },
    { name: "windowCap", type: "uint256" },
    { name: "windowSeconds", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "allowedSelectorsRoot", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface AgentDelegation {
  agentTokenId: bigint;
  delegate: Address;
  perTxCap: bigint;
  windowCap: bigint;
  windowSeconds: bigint;
  expiresAt: bigint;
  allowedSelectorsRoot: Hex;
  nonce: bigint;
}

export interface DelegationFormInput {
  agentTokenId: bigint;
  delegate: Address;
  perTxCap: string;
  windowCap: string;
  windowSeconds: string;
  /** Days from now; "0" = no expiry is NOT allowed by the form (registry requires future). */
  expiresInDays: string;
  /** Targets the delegate may call via delegatedExecute; root is REQUIRED non-zero. */
  allowedTargets: readonly { target: Address; selector: Hex }[];
}

export interface DelegationFormResult {
  delegation: AgentDelegation | null;
  error: string | null;
}

/** Keccak256 leaf of (target, selector) — must match the registry/vault leaf encoding. */
export function delegationLeaf(target: Address, selector: Hex): Hex {
  return keccak256(concatHex([target, selector.padEnd(10, "0") as Hex]));
}

/** Standard Merkle root from leaves (OpenZeppelin/MerkleProof.verify semantics:
 *  odd node is paired with itself). Empty input → zero root (rejected on-chain). */
export function merkleRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0)
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  let level = [...leaves];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(keccak256(concatHex([level[i]!, (level[i + 1] ?? level[i])!])));
    }
    level = next;
  }
  return level[0]!;
}

/** Parses and validates the delegation form into the on-chain struct.
 *  Validation mirrors installDelegation's checks: zero delegate, zero selector
 *  root, window cap/length set together, expiry in the future, caps positive. */
export function buildAgentDelegation(
  input: DelegationFormInput,
  nowSeconds: bigint,
): DelegationFormResult {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.delegate)) {
    return { delegation: null, error: "invalid delegate address" };
  }
  if (input.allowedTargets.length === 0) {
    return {
      delegation: null,
      error: "at least one allowed target is required",
    };
  }
  for (const t of input.allowedTargets) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(t.target)) {
      return { delegation: null, error: "invalid allowed target address" };
    }
    if (!/^0x[0-9a-fA-F]{8}$/.test(t.selector)) {
      return {
        delegation: null,
        error: "selector must be a 4-byte hex (0x + 8 chars)",
      };
    }
  }
  if (!/^\d+$/.test(input.perTxCap) || BigInt(input.perTxCap) <= 0n) {
    return {
      delegation: null,
      error: "per-tx cap must be a positive integer (wei)",
    };
  }
  const hasWindowCap =
    /^\d+$/.test(input.windowCap) && BigInt(input.windowCap) > 0n;
  const hasWindowSeconds =
    /^\d+$/.test(input.windowSeconds) && BigInt(input.windowSeconds) > 0n;
  if (hasWindowCap !== hasWindowSeconds) {
    return {
      delegation: null,
      error: "window cap and window length must be set together",
    };
  }
  if (!/^\d+$/.test(input.expiresInDays) || BigInt(input.expiresInDays) <= 0n) {
    return { delegation: null, error: "expiry must be at least 1 day ahead" };
  }
  const expiresAt = nowSeconds + BigInt(input.expiresInDays) * 86_400n;
  if (expiresAt <= nowSeconds) {
    return { delegation: null, error: "expiry must be in the future" };
  }
  const root = merkleRoot(
    input.allowedTargets.map((t) => delegationLeaf(t.target, t.selector)),
  );
  if (
    root ===
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return { delegation: null, error: "selector root required" };
  }
  return {
    delegation: {
      agentTokenId: input.agentTokenId,
      delegate: input.delegate,
      perTxCap: BigInt(input.perTxCap),
      windowCap: hasWindowCap ? BigInt(input.windowCap) : 0n,
      windowSeconds: hasWindowSeconds ? BigInt(input.windowSeconds) : 0n,
      expiresAt,
      allowedSelectorsRoot: root,
      nonce: BigInt(nowSeconds) ^ BigInt(randomUint()),
    },
    error: null,
  };
}

function randomUint(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}
