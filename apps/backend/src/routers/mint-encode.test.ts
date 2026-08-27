// Mirrors the mint/encode route harness: real express app + registerAgentRoutes
// with an InMemoryStorage oracle and a provider stub whose JsonRpcAbiProvider
// answers only mintFee() (no chain calls needed to encode the mint calldata).
process.env.AXIOM_TEE_SIGNER_PK = "0x" + "11".repeat(32);

import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { keccak256, Interface } from "ethers";
import { toHex } from "viem";
import { z } from "zod";
import { InMemoryStorage } from "@axiom/config/storage/0g";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { deriveMintDataHash } from "@axiom/config/types/hex";
import type { OracleRouteDeps } from "../oracle/routes.js";
import { registerAgentRoutes } from "./agents.js";
import type { ServerConfig } from "../server.js";

const NFT_ADDR = ("0x" + "aa".repeat(20)) as `0x${string}`;
const OWNER = "0x0000000000000000000000000000000000000beE";
const OWNER_CHECKSUMMED = OWNER;
const MINT_FEE = 123n;

let server: Server;
let baseUrl: string;
let storage: InMemoryStorage;

beforeAll(() => {
  storage = new InMemoryStorage();
  const oracle = { storage } as unknown as OracleRouteDeps;
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    addresses: { agentNft: NFT_ADDR },
    env: { AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32) },
  } as unknown as ServerConfig;
  // Provider stub: only mintFee() is consulted on this route path.
  const provider = {
    call: async () =>
      Interface.from(AGENT_NFT_ABI).encodeFunctionResult("mintFee", [MINT_FEE]),
  } as unknown as Parameters<typeof registerAgentRoutes>[2];

  const app = express();
  app.use(express.json());
  registerAgentRoutes(
    app,
    config,
    provider,
    oracle,
    {
      chainId: 16602n,
    } as Parameters<typeof registerAgentRoutes>[4],
    null,
  );
  // Mirror server.ts registerErrorHandlers: zod failures must surface as 400 JSON.
  app.use(
    (
      err: Error & { issues?: unknown },
      _req: unknown,
      res: { status: (n: number) => { json: (b: unknown) => void } },
      _next: unknown,
    ) => {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed" });
        return;
      }
      res.status(500).json({ error: err.message });
    },
  );
  server = app.listen(0, "127.0.0.1");
  server.unref();
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

function post(
  path: string,
  body: unknown,
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  return (async () => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  })();
}

test("mint/encode hashless shape derives dataHash from name, marks it seen, encodes mint", async () => {
  const res = await post("/v1/agents/mint/encode", {
    name: "Nova",
    owner: OWNER,
  });
  assert.equal(
    res.status,
    200,
    `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  const expectedHash = deriveMintDataHash("Nova");
  assert.equal(
    expectedHash,
    keccak256(toHex("Nova")),
    "derivation matches keccak256(toHex(name))",
  );
  assert.equal(res.body.to, NFT_ADDR);
  assert.equal(res.body.value, MINT_FEE.toString());
  assert.match(res.body.data as string, /^0x[0-9a-fA-F]+$/);

  const data = res.body.data as `0x${string}`;
  const [iDatas, toArg] = Interface.from(AGENT_NFT_ABI).decodeFunctionData(
    "mint",
    data,
  ) as [{ dataDescription: string; dataHash: string }[], string];
  assert.equal(toArg.toLowerCase(), OWNER.toLowerCase());
  assert.equal(iDatas.length, 1);
  assert.equal(
    iDatas[0].dataDescription,
    "Nova — ownable AI agent on Axiom Protocol (0G / ERC-7857)",
  );
  assert.equal(iDatas[0].dataHash.toLowerCase(), expectedHash.toLowerCase());
  // the folded markDataHashSeen makes the hash oracle-visible immediately
  assert.equal(
    storage.hasSeenDataHash(expectedHash),
    true,
    "dataHash marked seen",
  );
});

test("mint/encode legacy {dataDescription, dataHash, to} shape still works", async () => {
  const legacyHash = ("0x" + "cd".repeat(32)) as `0x${string}`;
  const res = await post("/v1/agents/mint/encode", {
    dataDescription: "legacy agent",
    dataHash: legacyHash,
    to: OWNER,
  });
  assert.equal(
    res.status,
    200,
    `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  assert.equal(res.body.to, NFT_ADDR);
  assert.equal(res.body.value, MINT_FEE.toString());
  assert.equal(storage.hasSeenDataHash(legacyHash), true);
  const [iDatas, toArg] = Interface.from(AGENT_NFT_ABI).decodeFunctionData(
    "mint",
    res.body.data as `0x${string}`,
  ) as [{ dataDescription: string; dataHash: string }[], string];
  assert.equal(iDatas[0].dataDescription, "legacy agent");
  assert.equal(iDatas[0].dataHash.toLowerCase(), legacyHash.toLowerCase());
  assert.equal(toArg.toLowerCase(), OWNER.toLowerCase());
});

test("mint/encode rejects a malformed dataHash (legacy shape guard intact)", async () => {
  const res = await post("/v1/agents/mint/encode", {
    dataDescription: "x",
    dataHash: "0x1234",
    to: OWNER,
  });
  assert.equal(res.status, 400);
});

test("mint/encode hashless shape trims the name before deriving (FE parity)", async () => {
  // FE: (agentName.trim() || "Axiom agent") — deriveDataHash trims; server must agree
  const res = await post("/v1/agents/mint/encode", {
    name: "  Nova  ",
    owner: OWNER,
  });
  assert.equal(
    res.status,
    200,
    `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  const [iDatas] = Interface.from(AGENT_NFT_ABI).decodeFunctionData(
    "mint",
    res.body.data as `0x${string}`,
  ) as [{ dataDescription: string; dataHash: string }[], string];
  assert.equal(iDatas[0].dataHash, deriveMintDataHash("Nova"));
  assert.equal(storage.hasSeenDataHash(deriveMintDataHash("Nova")), true);
});
