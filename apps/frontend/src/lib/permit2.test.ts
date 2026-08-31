import { describe, expect, test } from "bun:test";
import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  stringToHex,
} from "viem";
import {
  PERMIT2_ADDRESS,
  PERMIT2_DOMAIN,
  PERMIT2_WITNESS_TYPES,
  buildPermit2WitnessTypedData,
  randomPermitNonce,
} from "./permit2.js";

// The AgentPayment typehash the Processor constant-binds (AGENT_PAYMENT_WITNESS_TYPEHASH,
// AxiomPaymentProcessor.sol): keccak256("AgentPayment(uint256 agentTokenId,uint256 amount)")
// = 0x276d0fdb… — computed here from the FE types so a field/order drift fails this test.
const AGENT_PAYMENT_TYPEHASH =
  "0x276d0fdb23abe75e231455932314e625fc515aa5a37c6e73a306d719c2184e7e";

describe("PERMIT2_DOMAIN", () => {
  test("canonical domain: name Permit2, no version, verifyingContract = PERMIT2", () => {
    const d = PERMIT2_DOMAIN(16602);
    expect(d.name).toBe("Permit2");
    expect(d.chainId).toBe(16602);
    expect(d.verifyingContract).toBe(PERMIT2_ADDRESS);
    // EIP712.sol of Permit2 has no version field — "version" here would break the separator.
    expect("version" in d).toBe(false);
  });
});

describe("PERMIT2_WITNESS_TYPES", () => {
  test("witness typehash matches the Processor's AGENT_PAYMENT_WITNESS_TYPEHASH", () => {
    // keccak of the AgentPayment struct hash preimage equals the contract constant
    const agentPaymentEncoded =
      "AgentPayment(uint256 agentTokenId,uint256 amount)";
    expect(keccak256(stringToHex(agentPaymentEncoded))).toBe(
      AGENT_PAYMENT_TYPEHASH,
    );
  });

  test("field order is load-bearing and exact", () => {
    expect(PERMIT2_WITNESS_TYPES.TokenPermissions).toEqual([
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ]);
    expect(PERMIT2_WITNESS_TYPES.AgentPayment).toEqual([
      { name: "agentTokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ]);
  });
});

describe("buildPermit2WitnessTypedData", () => {
  const base = {
    chainId: 16602,
    paymentToken: "0x354CA53bAB51C0666964fa050628d8351f8A7d19" as const,
    permittedAmount: 2_000_000n,
    payAmount: 1_500_000n,
    spender: "0x1111111111111111111111111111111111111111" as const,
    agentTokenId: 7n,
    deadline: 1_900_000_000n,
    nonce: 42n,
  };

  test("message carries spender, witness binding and permit passthrough", () => {
    const td = buildPermit2WitnessTypedData(base);
    expect(td.primaryType).toBe("PermitWitnessTransferFrom");
    expect(td.message.spender).toBe(base.spender);
    expect(td.message.witness).toEqual({
      agentTokenId: 7n,
      amount: 1_500_000n,
    });
    expect(td.message.permitted).toEqual({
      token: base.paymentToken,
      amount: 2_000_000n,
    });
    // permit (the on-chain struct) mirrors permitted/nonce/deadline exactly
    expect(td.permit).toEqual({
      permitted: { token: base.paymentToken, amount: 2_000_000n },
      nonce: 42n,
      deadline: 1_900_000_000n,
    });
    // NO owner field inside the signed struct (canonical Permit2: separate param)
    expect("owner" in td.message).toBe(false);
    expect("owner" in td.permit).toBe(false);
  });

  test("witness amount binds the pay amount, not the permitted amount", () => {
    const td = buildPermit2WitnessTypedData(base);
    expect(td.message.witness.amount).toBe(base.payAmount);
    expect(td.message.witness.amount).not.toBe(base.permittedAmount);
  });

  test("random nonce is crypto-random, in range, and unique", () => {
    const a = randomPermitNonce();
    const b = randomPermitNonce();
    expect(a).not.toBe(b);
    expect(a >= 0n && a < 1n << 256n).toBe(true);
    expect(String(a).length).toBeGreaterThan(30); // effectively never a tiny value
  });
});

describe("Permit2 on-chain digest parity", () => {
  // Permit2's PermitHash.sol recipe, applied exactly as the deployed contract
  // computes it — a wallet signature can only verify if THIS digest matches the
  // EIP-712 digest the wallet signed (hashTypedData below).
  const TP_TYPEHASH = keccak256(
    stringToHex("TokenPermissions(address token,uint256 amount)"),
  );
  const AP_TYPEHASH = keccak256(
    stringToHex("AgentPayment(uint256 agentTokenId,uint256 amount)"),
  );
  const STUB =
    "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,";

  function permit2Digest(witnessTypeString: string): `0x${string}` {
    const typeHash = keccak256(stringToHex(STUB + witnessTypeString));
    const tpHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [TP_TYPEHASH, MESSAGE.permitted.token, MESSAGE.permitted.amount],
      ),
    );
    const wHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
        [AP_TYPEHASH, MESSAGE.witness.agentTokenId, MESSAGE.witness.amount],
      ),
    );
    const structHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "bytes32" },
        ],
        [
          typeHash,
          tpHash,
          MESSAGE.spender,
          MESSAGE.nonce,
          MESSAGE.deadline,
          wHash,
        ],
      ),
    );
    const ds = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
        ],
        [
          keccak256(
            stringToHex(
              "EIP712Domain(string name,uint256 chainId,address verifyingContract)",
            ),
          ),
          keccak256(stringToHex("Permit2")),
          16602n,
          PERMIT2_ADDRESS,
        ],
      ),
    );
    // raw-byte concat: keccak256 over 0x1901 ‖ domainSeparator ‖ structHash
    return keccak256(
      `0x1901${ds.slice(2)}${structHash.slice(2)}` as `0x${string}`,
    );
  }

  const MESSAGE = {
    permitted: {
      token: "0x354CA53bAB51C0666964fa050628d8351f8A7d19" as const,
      amount: 2_000_000n,
    },
    spender: "0x1111111111111111111111111111111111111111" as const,
    nonce: 42n,
    deadline: 1_900_000_000n,
    witness: { agentTokenId: 7n, amount: 1_500_000n },
  } as const;

  const DOMAIN = PERMIT2_DOMAIN(16602);

  test("wallet digest matches Permit2 hashing IF the witness string includes the AgentPayment struct definition", () => {
    const walletDigest = hashTypedData({
      domain: DOMAIN,
      types: PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: MESSAGE,
    });
    // EIP-712 wallets (MetaMask/viem/ethers) ALWAYS append referenced struct
    // definitions (AgentPayment) to the encodeType in alphabetical order.
    // Permit2's stub-concat must therefore include the same definition — the
    // Processor's WITNESS_TYPE_STRING must be exactly this string for the FE
    // lane to work on-chain. Currently (W2-A) it omits the AgentPayment(...)
    // definition, which this test pins as the known contract-side gap.
    const withDefinition =
      "AgentPayment witness)AgentPayment(uint256 agentTokenId,uint256 amount)TokenPermissions(address token,uint256 amount)";
    expect(permit2Digest(withDefinition)).toBe(walletDigest);
  });

  test("the CURRENT Processor witness string (definition omitted) does NOT verify a wallet signature", () => {
    const walletDigest = hashTypedData({
      domain: DOMAIN,
      types: PERMIT2_WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: MESSAGE,
    });
    const asDeployed =
      "AgentPayment witness)TokenPermissions(address token,uint256 amount)";
    expect(permit2Digest(asDeployed)).not.toBe(walletDigest);
  });
});
