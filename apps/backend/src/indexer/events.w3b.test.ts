import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import type { Log } from "ethers";
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { Interface } from "ethers";
import { decodeAxiomLog, TOPIC_TABLE } from "../indexer/events/parser.js";
import {
  EVENT_ABI,
  KNOWN_EVENT_NAMES,
  type EventName,
} from "../indexer/events.js";
import { buildDefaultWatchList } from "../indexer/index.js";
import { resolveIndexerAddresses } from "../indexer/events.js";

const TX = "0x" + "cd".repeat(32);
const ADDR = "0x" + "11".repeat(20);

function logFor<N extends EventName>(
  name: N,
  args: Record<string, unknown>,
  data: `0x${string}` = "0x",
  block = 500,
): Log {
  const topics = encodeEventTopics({
    abi: [EVENT_ABI[name]],
    eventName: name,
    args: args as never,
  });
  return {
    topics,
    data,
    blockNumber: block,
    transactionHash: TX,
    index: 3,
    address: ADDR,
  } as unknown as Log;
}

describe("W3-B parser coverage: ProofUsed (TeeVerifier)", () => {
  test("decodes nonce + timestamp", () => {
    const nonce = "0x" + "ab".repeat(32);
    const ev = decodeAxiomLog(
      logFor("ProofUsed", { nonce, timestamp: 1_234_567n }),
    );
    assert.ok(ev, "ProofUsed must decode");
    assert.equal(ev!.kind, "ProofUsed");
    assert.equal(ev!.nonce, nonce); // already canonical 32-byte hex
    assert.equal(ev!.timestamp, 1_234_567n);
    assert.equal(ev!.blockNumber, 500);
    assert.equal(ev!.txHash, TX);
    assert.equal(ev!.logIndex, 3);
  });

  test("normalizes short nonces to canonical 0x + 64 hex", () => {
    // Topics always carry full 32-byte words on chain; a short word is still
    // canonicalized by the parser (same path keepers use for env nonces).
    const ev = decodeAxiomLog(
      logFor("ProofUsed", {
        nonce: "0x" + "00".repeat(31) + "ab",
        timestamp: 1n,
      }),
    ) as { nonce: string } | null;
    assert.equal(ev!.nonce, "0x" + "00".repeat(31) + "ab");
  });

  test("ProofUsed topic0 matches the ethers-computed hash of the new ABI shape", () => {
    // Guards against a config-lane ABI drift silently unbinding the parser.
    const iface = new Interface([
      "event ProofUsed(bytes32 indexed nonce, uint256 indexed timestamp)",
    ]);
    assert.equal(TOPIC_TABLE.ProofUsed, iface.getEvent("ProofUsed")!.topicHash);
  });
});

describe("W3-B parser coverage: DelegationRegistry events", () => {
  test("DelegationInstalled decodes all five fields", () => {
    const delegate = "0x" + "22".repeat(20);
    // Non-indexed tail: (uint64 expiresAt, uint256 perTxCap, uint256 windowCap)
    const data = encodeAbiParameters(
      parseAbiParameters("uint64, uint256, uint256"),
      [99_999n, 1_000n, 5_000n],
    );
    const ev = decodeAxiomLog(
      logFor("DelegationInstalled", { agentTokenId: 42n, delegate }, data),
    ) as {
      kind: string;
      agentTokenId: bigint;
      delegate: string;
      expiresAt: bigint;
      perTxCap: bigint;
      windowCap: bigint;
    } | null;
    assert.ok(ev);
    assert.equal(ev!.kind, "DelegationInstalled");
    assert.equal(ev!.agentTokenId, 42n);
    assert.equal(ev!.delegate, delegate);
    assert.equal(ev!.expiresAt, 99_999n);
    assert.equal(ev!.perTxCap, 1_000n);
    assert.equal(ev!.windowCap, 5_000n);
  });

  test("DelegationRevoked decodes the tokenId", () => {
    const ev = decodeAxiomLog(
      logFor("DelegationRevoked", { agentTokenId: 7n }),
    ) as { kind: string; agentTokenId: bigint } | null;
    assert.ok(ev);
    assert.equal(ev!.kind, "DelegationRevoked");
    assert.equal(ev!.agentTokenId, 7n);
  });

  test("DelegatedExecuted decodes value-carrying execute with actionHash", () => {
    const delegate = "0x" + "33".repeat(20);
    const target = "0x" + "44".repeat(20);
    const actionHash = "0x" + "55".repeat(32);
    // Non-indexed tail: (uint256 value, bytes32 actionHash)
    const data = encodeAbiParameters(parseAbiParameters("uint256, bytes32"), [
      250n,
      actionHash as `0x${string}`,
    ]);
    const ev = decodeAxiomLog(
      logFor("DelegatedExecuted", { agentTokenId: 9n, delegate, target }, data),
    ) as {
      kind: string;
      agentTokenId: bigint;
      delegate: string;
      target: string;
      value: bigint;
      actionHash: string;
    } | null;
    assert.ok(ev);
    assert.equal(ev!.kind, "DelegatedExecuted");
    assert.equal(ev!.agentTokenId, 9n);
    assert.equal(ev!.delegate, delegate);
    assert.equal(ev!.target, target);
    assert.equal(ev!.value, 250n);
    assert.equal(ev!.actionHash, actionHash);
  });

  test("registry event topic0s are distinct and registered", () => {
    const names: EventName[] = [
      "DelegationInstalled",
      "DelegationRevoked",
      "DelegatedExecuted",
    ];
    for (const n of names) {
      assert.ok(TOPIC_TABLE[n], `${n} must be in TOPIC_TABLE`);
      assert.ok(KNOWN_EVENT_NAMES.includes(n));
    }
    assert.equal(new Set(names.map((n) => TOPIC_TABLE[n])).size, 3);
  });
});

describe("W3-B: Updated parser handles the V3 tuple-array shape", () => {
  test("newDatas array length maps to newDatasCount", () => {
    const datas = [
      { dataDescription: "a", dataHash: "0x" + "01".repeat(32) },
      { dataDescription: "b", dataHash: "0x" + "02".repeat(32) },
      { dataDescription: "c", dataHash: "0x" + "03".repeat(32) },
    ] as const;
    // Non-indexed tail: (bytes32 oldRoot, (string dataDescription, bytes32 dataHash)[] newDatas)
    const data = encodeAbiParameters(
      parseAbiParameters("bytes32, (string, bytes32)[]"),
      [
        "0x" + "aa".repeat(32),
        datas.map((d) => [d.dataDescription, d.dataHash] as const),
      ],
    );
    const ev = decodeAxiomLog(
      logFor("Updated", { tokenId: 5n, oldRoot: "0x" + "aa".repeat(32) }, data),
    ) as {
      kind: string;
      tokenId: bigint;
      oldRoot: string;
      newDatasCount: number;
    } | null;
    assert.ok(ev);
    assert.equal(ev!.kind, "Updated");
    assert.equal(ev!.tokenId, 5n);
    assert.equal(ev!.oldRoot, "0x" + "aa".repeat(32));
    assert.equal(ev!.newDatasCount, 3);
  });
});

describe("W3-B: DelegationRegistry address is env-configurable and optional", () => {
  const REG = "0xABaBaBaBABabABabAbAbABAbABabababaBaBABaB";
  const baseEnv = {
    AXIOM_AGENT_NFT_ADDRESS: "0x" + "a1".repeat(20),
    AXIOM_STRATEGY_VAULT_ADDRESS: "0x" + "a2".repeat(20),
    AXIOM_TEE_VERIFIER_ADDRESS: "0x" + "a3".repeat(20),
    AXIOM_PAYMENT_PROCESSOR_ADDRESS: "0x" + "a4".repeat(20),
  };

  test("unset AXIOM_DELEGATION_REGISTRY_ADDRESS drops only the registry watch group", () => {
    const addresses = resolveIndexerAddresses(baseEnv);
    assert.equal(addresses.AXIOM_DELEGATION_REGISTRY, undefined);
    const watchList = buildDefaultWatchList(addresses);
    assert.ok(watchList.length > 0);
    assert.ok(
      !watchList.some((w) => w.name === "DelegationInstalled"),
      "registry events must be unwatched pre-deploy",
    );
    // Core events still watched.
    assert.ok(watchList.some((w) => w.name === "Transfer"));
    assert.ok(watchList.some((w) => w.name === "ProofUsed"));
  });

  test("set address adds exactly the three registry events", () => {
    const addresses = resolveIndexerAddresses({
      ...baseEnv,
      AXIOM_DELEGATION_REGISTRY_ADDRESS: REG,
    });
    assert.equal(addresses.AXIOM_DELEGATION_REGISTRY, REG);
    const watchList = buildDefaultWatchList(addresses);
    const registryEvents = watchList.filter((w) => w.address === REG);
    assert.deepEqual(registryEvents.map((w) => w.name).sort(), [
      "DelegatedExecuted",
      "DelegationInstalled",
      "DelegationRevoked",
    ]);
  });

  test("invalid registry address fails loudly (not an address)", () => {
    // Not 40-hex → getAddress() throws inside resolveAddress.
    assert.throws(() =>
      resolveIndexerAddresses({
        ...baseEnv,
        AXIOM_DELEGATION_REGISTRY_ADDRESS: "0x1234",
      }),
    );
  });
});
