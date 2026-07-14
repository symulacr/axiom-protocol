import { getChatToolSpec } from "@axiom/config/chat-tools";
import type { ToolResult } from "../types.js";
import type { ToolRuntime } from "../transport.js";

const PREFIX_MAP: Record<string, string> = {
  evm_: "/v1/skills/evm/",
  stocks_: "/v1/skills/stocks/",
  unbroker_: "/v1/skills/unbroker/",
  osint_: "/v1/skills/osint/",
  oss_forensics_: "/v1/skills/oss-forensics/",
};

export function resolveEndpoint(name: string): string {
  for (const [prefix, base] of Object.entries(PREFIX_MAP)) {
    if (name.startsWith(prefix)) {
      return `${base}${name.slice(prefix.length)}`;
    }
  }
  throw new Error(`Unknown skill tool: ${name}`);
}

export async function runSkillTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (spec?.requiresWallet && !ctx.wallet?.address) {
    return fail("Wallet not connected");
  }
  if (spec?.requiresTokenId && !args.tokenId && !ctx.session.lastTokenId) {
    return fail("tokenId required");
  }

  if (name.startsWith("evm_") && spec?.parameters?.required?.includes("address")) {
    args.address ??= ctx.wallet?.address ?? ctx.session.walletAddress;
  }

  const requiredParams = spec?.parameters?.required ?? [];
  const missingParams = requiredParams.filter(
    (p) => args[p] === undefined || args[p] === null || args[p] === "",
  );
  if (missingParams.length > 0) {
    const needsWallet = name.startsWith("evm_") && missingParams.includes("address");
    const guidance = needsWallet
      ? "Connect the wallet (or provide an address) before calling this tool."
      : `Ask the user to provide it (use the Ask User tool) before calling ${name}.`;
    return {
      ok: false,
      content: JSON.stringify({
        error: `Missing required parameter(s): ${missingParams.join(", ")}. ${guidance}`,
      }),
    };
  }

  let endpoint: string;
  try {
    endpoint = resolveEndpoint(name);
  } catch {
    return fail(`Unknown skill tool: ${name}`);
  }

  const res = await ctx.http.fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...args,
      context: {
        chainId: ctx.session.chainId,
        walletAddress: ctx.wallet?.address ?? ctx.session.walletAddress,
        agentNft: ctx.session.addresses?.agentNft,
        vault: ctx.session.addresses?.vault,
        lastTokenId: ctx.session.lastTokenId,
      },
    }),
  });

  if (!res.ok) {
    let details: unknown = null;
    try {
      details = await res.json();
    } catch {
      details = await res.text();
    }
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

export function capArrays(v: unknown, n: number): unknown {
  if (Array.isArray(v)) {
    return { truncated: v.length > n, data: v.slice(0, n) };
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, capArrays(x, n)]),
    );
  }
  return v;
}

function fail(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}
