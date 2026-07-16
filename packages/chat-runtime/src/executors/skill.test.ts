import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEndpoint, capArrays, runSkillTool } from "./skill.js";
import type { ToolRuntime } from "../transport.js";

function makeCtx(overrides: Partial<ToolRuntime> = {}): ToolRuntime {
  return {
    http: {
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({}),
      }),
    },
    session: { chainId: 1 },
    mode: "sign",
    ...overrides,
  } as ToolRuntime;
}

describe("resolveEndpoint", () => {
  it("preserves underscores in OSINT actions", () => {
    assert.equal(resolveEndpoint("osint_sec_edgar"), "/v1/skills/osint/sec_edgar");
    assert.equal(resolveEndpoint("osint_ofac_sdn"), "/v1/skills/osint/ofac_sdn");
    assert.equal(
      resolveEndpoint("osint_entity_resolve"),
      "/v1/skills/osint/entity_resolve",
    );
  });
});

describe("runSkillTool", () => {
  it("returns {ok:false} for unknown skill without throwing", async () => {
    const res = await runSkillTool("no_such_skill", {}, makeCtx());
    assert.equal(res.ok, false);
  });

  it("returns {ok:false} for a requiresWallet skill with no wallet", async () => {
    const res = await runSkillTool("evm_tx", {}, makeCtx());
    assert.equal(res.ok, false);
  });
});

describe("capArrays", () => {
  it("caps arrays at n and flags truncation", () => {
    const big = Array.from({ length: 25 }, (_, i) => i);
    const out = capArrays(big, 20) as { truncated: boolean; data: number[] };
    assert.equal(out.data.length, 20);
    assert.equal(out.truncated, true);
  });

  it("does not flag truncation under the cap", () => {
    const small = [1, 2, 3];
    const out = capArrays(small, 20) as { truncated: boolean; data: number[] };
    assert.equal(out.data.length, 3);
    assert.equal(out.truncated, false);
  });
});
