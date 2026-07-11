import type { ToolResult } from "../types.js";
import type { ToolRuntime } from "../transport.js";

const PREFIX_MAP: Record<string, string> = {
  evm_: "/v1/skills/evm/",
  stocks_: "/v1/skills/stocks/",
  unbroker_: "/v1/skills/unbroker/",
  osint_: "/v1/skills/osint/",
  oss_forensics_: "/v1/skills/oss-forensics/",
};

function resolveEndpoint(name: string): string {
  for (const [prefix, base] of Object.entries(PREFIX_MAP)) {
    if (name.startsWith(prefix)) {
      const action = name.slice(prefix.length).replace(/_/g, "-");
      return `${base}${action}`;
    }
  }
  throw new Error(`Unknown skill tool: ${name}`);
}

export async function runSkillTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const endpoint = resolveEndpoint(name);

  const res = await ctx.http.fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    let details: unknown = null;
    try { details = await res.json(); } catch { details = await res.text(); }
    return {
      ok: false,
      content: JSON.stringify({
        error: `Skill ${name} failed: ${res.status}`,
        details,
      }),
    };
  }

  const data = await res.json();
  return { ok: true, content: JSON.stringify(capArrays(data, 20)) };
}

function capArrays(v: unknown, n: number): unknown {
  if (Array.isArray(v)) return v.slice(0, n);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, capArrays(x, n)]),
    );
  }
  return v;
}
