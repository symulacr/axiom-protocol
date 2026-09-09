import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
  CHAT_TOOL_CATALOG,
  SPONSORED_TOOLS,
  getChatToolSpec,
  resolveContextWindow,
  resolveMaxCompletionTokens,
} from "./chat-tools.js";

// Catalog invariants the agent loop relies on: the frontend TOOLS builder maps
// name/hint/parameters verbatim into the model's tools payload, so a schema or
// naming defect here reaches the model directly.
describe("chat tool catalog invariants", () => {
  it("tool names are unique", () => {
    const names = CHAT_TOOL_CATALOG.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("every tool has a non-empty label, hint, and an object schema", () => {
    for (const t of CHAT_TOOL_CATALOG) {
      assert.ok(t.label.trim(), `${t.name} label`);
      assert.ok(t.hint.trim(), `${t.name} hint`);
      assert.ok(t.parameters, `${t.name} parameters`);
      assert.equal(t.parameters?.type, "object", `${t.name} schema type`);
    }
  });

  it("required params are declared in properties and every property has a type", () => {
    for (const t of CHAT_TOOL_CATALOG) {
      const p = t.parameters;
      assert.ok(p, t.name);
      for (const [key, prop] of Object.entries(p.properties)) {
        assert.ok(prop.type, `${t.name}.${key} has a type`);
        if (prop.enum !== undefined) {
          assert.ok(
            Array.isArray(prop.enum) && prop.enum.length > 0,
            `${t.name}.${key} enum is a non-empty array`,
          );
        }
      }
      for (const req of p.required ?? []) {
        assert.ok(
          req in p.properties,
          `${t.name} required '${req}' missing from properties`,
        );
      }
    }
  });

  it("requiresTokenId tools declare a tokenId parameter", () => {
    for (const t of CHAT_TOOL_CATALOG) {
      if (t.requiresTokenId) {
        assert.ok(
          t.parameters && "tokenId" in t.parameters.properties,
          `${t.name} requiresTokenId but declares no tokenId param`,
        );
      }
    }
  });

  it("SPONSORED_TOOLS are encode-class, wallet-gated catalog tools", () => {
    for (const name of SPONSORED_TOOLS) {
      const spec = getChatToolSpec(name);
      assert.ok(spec, `${name} in catalog`);
      assert.equal(spec?.class, "encode", `${name} class`);
      assert.equal(spec?.requiresWallet, true, `${name} wallet gate`);
    }
  });

  it("read-only EVM skill hints do not promise writes", () => {
    const tx = getChatToolSpec("evm_tx");
    assert.ok(tx);
    assert.match(tx.hint, /receipt/);
    assert.doesNotMatch(tx.hint, /build, sign|broadcast/i);
    const contract = getChatToolSpec("evm_contract");
    assert.ok(contract);
    assert.doesNotMatch(contract.hint, /write to/i);
  });

  it("every schema serializes to plain JSON (tools API payload)", () => {
    for (const t of CHAT_TOOL_CATALOG) {
      assert.doesNotThrow(() => JSON.stringify(t.parameters), t.name);
    }
  });
});

// Live catalog probe 2026-09-09: deepseek-v4-flash context_length is 1,000,000
// with max_completion_tokens 39,321 and discounted cached_prompt pricing. The
// static fallbacks must match so offline resolution stays honest.
describe("model window fallbacks match the live 0G catalog", () => {
  it("deepseek-v4-flash resolves to the probed 1M window + 393216 completion", () => {
    assert.equal(resolveContextWindow("deepseek-v4-flash"), 1_000_000);
    assert.equal(resolveMaxCompletionTokens("deepseek-v4-flash"), 393_216);
  });

  it("live catalog values still win over the fallback", () => {
    assert.equal(
      resolveContextWindow("deepseek-v4-flash", { "deepseek-v4-flash": 500 }),
      500,
    );
  });

  it("unknown models fall back to 32768 and no completion reserve", () => {
    assert.equal(resolveContextWindow("never-heard-of-it"), 32768);
    assert.equal(resolveMaxCompletionTokens("never-heard-of-it"), undefined);
  });
});

// P1: the CONTINUITY chain promises "set strategy"; the catalog now carries a
// real encode tool backed by the /v1/agents/:id/set-strategy relay route.
describe("set_strategy catalog entry", () => {
  it("is an encode-class, wallet+token gated tool with dailyLimit required", () => {
    const spec = getChatToolSpec("set_strategy");
    assert.ok(spec, "set_strategy in catalog");
    assert.equal(spec.class, "encode");
    assert.equal(spec.requiresWallet, true);
    assert.equal(spec.requiresTokenId, true);
    assert.deepEqual(spec.parameters?.required, ["tokenId", "dailyLimit"]);
    assert.ok(spec.parameters?.properties.validUntilDay, "expiry param");
    assert.ok(spec.parameters?.properties.root, "Merkle root param");
  });

  it("is not sponsored (wallet lane only; the relay allowlist excludes it)", () => {
    assert.ok(!(SPONSORED_TOOLS as readonly string[]).includes("set_strategy"));
  });
});
