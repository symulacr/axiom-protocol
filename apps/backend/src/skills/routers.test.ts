import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createSkillRouters, whaleSchema } from "./routers.js";
import { REGISTERED_ROUTES } from "../routers/route-factory.js";
import type { ServerConfig } from "../server.js";

function buildSkillApp() {
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: {} as ServerConfig["signer"],
    oracleBaseUrl: "http://oracle",
    env: {} as unknown as ServerConfig["env"],
  } as unknown as ServerConfig;

  const app = express();
  app.use(express.json());
  app.use(createSkillRouters(config));
  return app;
}

test("registers all 27 skill routes under /v1/skills/", () => {
  buildSkillApp();
  const skills = REGISTERED_ROUTES.filter((r) => r.path.startsWith("/v1/skills/"));
  const unique = new Set(skills.map((r) => r.path));
  assert.equal(
    unique.size,
    27,
    `expected 27 distinct skill routes, got ${unique.size}`,
  );
  for (const p of [
    "/v1/skills/evm/wallet",
    "/v1/skills/evm/whale",
    "/v1/skills/stocks/quote",
    "/v1/skills/osint/sec_edgar",
    "/v1/skills/unbroker/analyze",
    "/v1/skills/oss-forensics/investigate",
    "/v1/skills/oss-forensics/audit",
  ]) {
    assert.ok(unique.has(p), `missing registered route ${p}`);
  }
});

test("oss_forensics/investigate without GITHUB_TOKEN returns ok:false (no crash)", async () => {
  delete process.env.GITHUB_TOKEN;
  const app = buildSkillApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(
      `http://127.0.0.1:${addr.port}/v1/skills/oss-forensics/investigate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: "axiom", repo: "protocol" }),
      },
    );
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    assert.equal(body.ok, false, `expected ok:false, got ${JSON.stringify(body)}`);
    assert.ok(body.error, "expected a structured error message");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("evm_whale honors caller values but defaults the missing block range (audit §6)", () => {
  const input = { token: "0x" + "a".repeat(40), minValue: "500" };
  const parsed = whaleSchema.parse(input);
  assert.equal(parsed.token, input.token, "caller token must be honored");
  assert.equal(parsed.minValue, "500", "caller minValue must be honored");
  assert.equal(typeof parsed.fromBlock, "number", "fromBlock should default to a number");
  assert.equal(typeof parsed.toBlock, "number", "toBlock should default to a number");
  assert.ok(parsed.toBlock >= parsed.fromBlock, "default range must be non-empty");
  // token stays required, so a call without it must fail validation.
  assert.throws(() => whaleSchema.parse({ minValue: "1" }), "token is required");
});
