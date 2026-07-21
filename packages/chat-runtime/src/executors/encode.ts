import { getChatToolSpec } from "@axiom/config/chat-tools";
import { fetchJson } from "../http-json.js";
import { keccak256, toHex } from "viem";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";
import { success, fail } from "../tool-result.js";

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

  if (!args.dataDescription) return fail("dataDescription required");
  // dataHash is optional for first-time users. When omitted, derive a stable
  // placeholder hash from the agent name so minting works without manual
  // metadata hashing; real sealed data can be associated later via update().
  const dataHash =
    typeof args.dataHash === "string" && args.dataHash.length > 0
      ? String(args.dataHash)
      : keccak256(toHex(String(args.dataDescription)));

  const body = {
    dataDescription: String(args.dataDescription),
    dataHash,
    to,
  };

  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, "/v1/agents/mint/encode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!httpOk || !data.to) return fail("mint encode fail");

  await registerDataHashWithOracle(ctx, dataHash, to);

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
  if (!args.amount) return fail("amount required");
  const amount = String(args.amount);

  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, `/v1/agents/${tokenId}/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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


async function registerDataHashWithOracle(
  ctx: ToolRuntime,
  dataHash: string,
  to: string,
): Promise<void> {
  const oracleUrl = ctx.oracleUrl;
  if (!oracleUrl) return;

  const url = `${oracleUrl.replace(/\/$/, "")}/v1/agents/mint`;
  try {
    const { ok } = await fetchJson<{ ok?: boolean }>(ctx.http, url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataHash, to }),
    });
    if (!ok) {
      console.warn(
        `[mint_agent] oracle registration returned ok:false for dataHash=${dataHash} (non-fatal)`,
      );
    }
  } catch (e) {
    console.warn(
      `[mint_agent] oracle registration failed for dataHash=${dataHash} (non-fatal): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

