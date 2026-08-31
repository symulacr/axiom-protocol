import { describe, expect, test } from "bun:test";
import { concatHex, keccak256, stringToHex } from "viem";
import {
  AGENT_DELEGATION_TYPES,
  DELEGATION_REGISTRY_DOMAIN,
  buildAgentDelegation,
  delegationLeaf,
  merkleRoot,
} from "./delegation.js";

// Registry domain/typehash cross-checks (AxiomDelegationRegistry.sol constructor)
const DELEGATION_TYPEHASH_KECCAK = keccak256(
  stringToHex(
    "AgentDelegation(uint256 agentTokenId,address delegate,uint256 perTxCap,uint256 windowCap,uint64 windowSeconds,uint64 expiresAt,bytes32 allowedSelectorsRoot,uint256 nonce)",
  ),
);
const REGISTRY_DOMAIN_TYPEHASH = keccak256(
  stringToHex(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  ),
);

describe("DELEGATION_REGISTRY_DOMAIN", () => {
  test("name/version match the registry constructor", () => {
    const d = DELEGATION_REGISTRY_DOMAIN(
      16602,
      "0x1111111111111111111111111111111111111111",
    );
    expect(d.name).toBe("AxiomDelegationRegistry");
    expect(d.version).toBe("1");
    expect(d.chainId).toBe(16602);
  });

  test("domain typehash shape (name,version,chainId,verifyingContract)", () => {
    // The registry computes its domain separator with 4 fields incl. version.
    expect(REGISTRY_DOMAIN_TYPEHASH).toBeDefined();
  });
});

describe("AGENT_DELEGATION_TYPES", () => {
  test("field order matches the registry DELEGATION_TYPEHASH", () => {
    const fields = AGENT_DELEGATION_TYPES.AgentDelegation.map(
      (f) => `${f.type} ${f.name}`,
    ).join(",");
    expect(keccak256(stringToHex(`AgentDelegation(${fields})`))).toBe(
      DELEGATION_TYPEHASH_KECCAK,
    );
  });
});

describe("delegationLeaf / merkleRoot", () => {
  test("2-leaf root matches the hand-rolled OpenZeppelin pairing", () => {
    const targets = [
      {
        target: "0x2222222222222222222222222222222222222222",
        selector: "0x1a2b3c4d",
      },
      {
        target: "0x3333333333333333333333333333333333333333",
        selector: "0xabcd1234",
      },
    ];
    const leaves = targets.map((t) => delegationLeaf(t.target, t.selector));
    // reference: keccak(left ‖ right), raw bytes
    const reference = keccak256(concatHex([leaves[0]!, leaves[1]!]));
    expect(merkleRoot(leaves)).toBe(reference);
  });

  test("single leaf → root = leaf (OpenZeppelin pairing)", () => {
    const leaf = delegationLeaf(
      "0x2222222222222222222222222222222222222222",
      "0x1a2b3c4d",
    );
    expect(merkleRoot([leaf])).toBe(leaf);
  });

  test("empty leaves → zero root (registry rejects it)", () => {
    expect(merkleRoot([])).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
  });
});

describe("buildAgentDelegation", () => {
  const valid = {
    agentTokenId: 5n,
    delegate: "0x4444444444444444444444444444444444444444",
    perTxCap: "1000000000000000000",
    windowCap: "5000000000000000000",
    windowSeconds: "86400",
    expiresInDays: "7",
    allowedTargets: [
      {
        target: "0x2222222222222222222222222222222222222222",
        selector: "0x1a2b3c4d",
      },
    ],
  };
  const now = 1_800_000_000n;

  test("valid input builds a struct with future expiry and non-zero root", () => {
    const { delegation, error } = buildAgentDelegation(valid, now);
    expect(error).toBeNull();
    expect(delegation).not.toBeNull();
    expect(delegation!.agentTokenId).toBe(5n);
    expect(delegation!.perTxCap).toBe(1_000_000_000_000_000_000n);
    expect(delegation!.windowCap).toBe(5_000_000_000_000_000_000n);
    expect(delegation!.windowSeconds).toBe(86_400n);
    expect(delegation!.expiresAt).toBe(now + 7n * 86_400n);
    expect(delegation!.allowedSelectorsRoot).not.toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  test("window cap without window length is rejected (InvalidWindowConfig parity)", () => {
    const { error } = buildAgentDelegation(
      { ...valid, windowSeconds: "0" },
      now,
    );
    expect(error).toContain("together");
  });

  test("zero targets rejected — zero root is forbidden on-chain", () => {
    const { error } = buildAgentDelegation(
      { ...valid, allowedTargets: [] },
      now,
    );
    expect(error).toContain("at least one allowed target");
  });

  test("zero per-tx cap rejected", () => {
    const { error } = buildAgentDelegation({ ...valid, perTxCap: "0" }, now);
    expect(error).toContain("positive");
  });

  test("zero expiry days rejected (registry requires future expiry)", () => {
    const { error } = buildAgentDelegation(
      { ...valid, expiresInDays: "0" },
      now,
    );
    expect(error).toContain("expiry");
  });

  test("malformed delegate address rejected", () => {
    const { error } = buildAgentDelegation(
      { ...valid, delegate: "0x1234" },
      now,
    );
    expect(error).toContain("delegate");
  });

  test("non-8-hex selector rejected", () => {
    const { error } = buildAgentDelegation(
      {
        ...valid,
        allowedTargets: [
          {
            target: "0x2222222222222222222222222222222222222222",
            selector: "0x12",
          },
        ],
      },
      now,
    );
    expect(error).toContain("selector");
  });
});
