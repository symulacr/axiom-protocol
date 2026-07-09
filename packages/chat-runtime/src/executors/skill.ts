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
    return {
      ok: false,
      content: JSON.stringify({
        error: `Skill ${name} failed: ${res.status}`,
      }),
    };
  }

  const data = await res.json();
  return { ok: true, content: JSON.stringify(data) };
}
