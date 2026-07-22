import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";

import {
  startServer,
  assertStartupAuthNotDisabledInProduction,
  type ServerConfig,
} from "../server.js";

const TEST_SIGNER = new Wallet("0x" + "33".repeat(32));
const MOCK_ADDRESSES = {
  agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
  vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
  verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
};

function makeConfig(): ServerConfig {
  return {
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: TEST_SIGNER,
    oracleBaseUrl: "http://127.0.0.1:1",
    addresses: MOCK_ADDRESSES,
    env: { AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32) } as unknown as ServerConfig["env"],
  };
}

async function bootThenClose(config: ServerConfig): Promise<void> {
  const { httpServer } = startServer(config);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", () => resolve());
    httpServer.once("error", reject);
  });
  httpServer.closeAllConnections?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

test("guard refuses AXIOM_DISABLE_AUTH=true in NODE_ENV=production", () => {
  assert.throws(
    () =>
      assertStartupAuthNotDisabledInProduction({
        AXIOM_DISABLE_AUTH: "true",
        NODE_ENV: "production",
      }),
    /Refusing to start/,
  );
});

test("guard allows AXIOM_DISABLE_AUTH=true in NODE_ENV=test", () => {
  assert.doesNotThrow(() =>
    assertStartupAuthNotDisabledInProduction({
      AXIOM_DISABLE_AUTH: "true",
      NODE_ENV: "test",
    }),
  );
});

test("guard allows AXIOM_DISABLE_AUTH=true when NODE_ENV is unset", () => {
  assert.doesNotThrow(() =>
    assertStartupAuthNotDisabledInProduction({ AXIOM_DISABLE_AUTH: "true" }),
  );
});

test("guard allows AXIOM_DISABLE_AUTH=true in NODE_ENV=development", () => {
  assert.doesNotThrow(() =>
    assertStartupAuthNotDisabledInProduction({
      AXIOM_DISABLE_AUTH: "true",
      NODE_ENV: "development",
    }),
  );
});

test("guard allows production with auth enabled", () => {
  assert.doesNotThrow(() =>
    assertStartupAuthNotDisabledInProduction({
      AXIOM_DISABLE_AUTH: "false",
      NODE_ENV: "production",
    }),
  );
});

test("startServer refuses to boot with disable-auth in production", () => {
  const prevDisable = process.env.AXIOM_DISABLE_AUTH;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.AXIOM_DISABLE_AUTH = "true";
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => startServer(makeConfig()), /Refusing to start/);
  } finally {
    process.env.AXIOM_DISABLE_AUTH = prevDisable;
    process.env.NODE_ENV = prevNodeEnv;
  }
});

test("startServer boots normally with disable-auth in NODE_ENV=test", async () => {
  const prevDisable = process.env.AXIOM_DISABLE_AUTH;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.AXIOM_DISABLE_AUTH = "true";
  process.env.NODE_ENV = "test";
  try {
    await bootThenClose(makeConfig());
  } finally {
    process.env.AXIOM_DISABLE_AUTH = prevDisable;
    process.env.NODE_ENV = prevNodeEnv;
  }
});
