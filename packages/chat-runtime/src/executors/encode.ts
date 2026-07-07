import { getChatToolSpec } from "@axiom/config/chat-tools";
import { humanAbi } from "../abi.js";
import { fetchJson } from "../http-json.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

export async function runEncodeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (!spec) return fail(`Unknown encode tool: ${name}`);

  if (spec.requiresWallet && !ctx.wallet?.address) {
    return fail("Wallet not connected");
  }

  const tokenId = String(args.tokenId ?? ctx.session.lastTokenId ?? "");

  if (spec.requiresTokenId && !tokenId) {
    return fail("tokenId required");
  }

  const preflight = await Promise.all([
    spec.requiresWallet && ctx.http
      ? fetchJson<{ agents: unknown[] }>(
          ctx.http,
          `/v1/agents?owner=${ctx.wallet!.address}`,
        ).catch(() => ({ ok: false, data: { agents: [] }, status: 0 }))
      : Promise.resolve(null),
    name === "mint_agent" && ctx.chain?.readContract && ctx.session.addresses?.agentNft
      ? ctx.chain.readContract<bigint>({
          address: ctx.session.addresses.agentNft,
          abi: humanAbi(["function mintFee() view returns (uint256)"]),
          functionName: "mintFee",
        })
      : Promise.resolve(null),
    tokenId && ctx.chain?.readContract && ctx.session.addresses?.vault
      ? ctx.chain.readContract<bigint>({
          address: ctx.session.addresses.vault,
          abi: humanAbi(["function balanceOf(uint256) view returns (uint256)"]),
          functionName: "balanceOf",
          args: [BigInt(tokenId)],
        })
      : Promise.resolve(null),
  ]);

  void preflight;

  switch (name) {
    case "mint_agent":
      return encodeMint(args, ctx);
    case "deposit":
      return encodeVaultOp("deposit", tokenId, args, ctx);
    case "withdraw":
      return encodeVaultOp("withdraw", tokenId, args, ctx);
    default:
      return fail(`Unhandled encode tool: ${name}`);
  }
}

async function encodeMint(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const to = ctx.wallet?.address;
  if (!to) return fail("Wallet not connected");

  const body = {
    dataDescription: String(args.dataDescription ?? ""),
    dataHash: String(args.dataHash ?? "0x"),
    to,
  };

  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, "/v1/agents/mint/encode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!httpOk || !data.to) return fail("mint encode fail");

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return success({
      ok: true,
      encodeOnly: true,
      to: data.to,
      data: data.data,
      value: data.value,
    });
  }

  try {
    const txHash = await ctx.wallet.signAndSend({
      to: data.to as `0x${string}`,
      data: data.data as `0x${string}`,
      value: BigInt(data.value),
    });
    return success({ ok: true, txHash });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "mint sign failed");
  }
}

async function encodeVaultOp(
  op: "deposit" | "withdraw",
  tokenId: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const amount = String(args.amount ?? (op === "deposit" ? "0" : "1"));
  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, `/v1/agents/${tokenId}/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });

  if (!httpOk || !data.to) return fail(`${op} encode fail`);

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return success({
      ok: true,
      encodeOnly: true,
      to: data.to,
      data: data.data,
      value: data.value,
      amount,
    });
  }

  try {
    const txHash = await ctx.wallet.signAndSend({
      to: data.to as `0x${string}`,
      data: data.data as `0x${string}`,
      value: BigInt(data.value || "0"),
    });
    return success({ ok: true, txHash, amount });
  } catch (e) {
    return fail(e instanceof Error ? e.message : `${op} sign failed`);
  }
}

function success(obj: Record<string, unknown>): ToolResult {
  return { ok: true, content: JSON.stringify(obj) };
}

function fail(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}