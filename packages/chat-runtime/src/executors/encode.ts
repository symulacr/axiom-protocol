import { getChatToolSpec } from "@axiom/config/chat-tools";
import { fetchJson, resolveTokenId, toolFail } from "../transport.js";
import { keccak256, toHex } from "viem";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

function encodeOnlyResult(
  data: { to: string; data: string; value: string },
  extra?: Record<string, unknown>,
): ToolResult {
  return {
    ok: true as const,
    content: JSON.stringify({
      ok: true,
      encodeOnly: true,
      to: data.to,
      data: data.data,
      value: data.value,
      ...extra,
    }),
  };
}

/** Sign+send, then wait for the receipt when the transport supports it (the
 *  transport owns the ~60s ceiling). Appends confirmation to the tool result
 *  so the LLM reports "confirmed" instead of a bare hash; a transport without
 *  receipt support (or a wait timeout) falls back to txHash-only — never breaks. */
async function signAndSendWithReceipt(
  ctx: ToolRuntime,
  calldata: { to: `0x${string}`; data: `0x${string}`; value: bigint },
): Promise<{
  txHash: `0x${string}`;
  receipt?: { status: string; blockNumber: string };
}> {
  const txHash = await ctx.wallet!.signAndSend!(calldata);
  if (!ctx.wallet?.waitForReceipt) return { txHash };
  try {
    const receipt = await ctx.wallet.waitForReceipt(txHash);
    if (!receipt) return { txHash };
    return {
      txHash,
      receipt: {
        status: receipt.status,
        blockNumber: receipt.blockNumber.toString(),
      },
    };
  } catch {
    return { txHash };
  }
}

export async function runEncodeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (!spec) return toolFail(`Unknown encode tool: ${name}`);

  if (spec.requiresWallet && !ctx.wallet?.address) {
    return toolFail("Wallet not connected");
  }

  const tokenId = resolveTokenId(args, ctx);

  if (spec.requiresTokenId && !tokenId) {
    return toolFail("tokenId required");
  }

  switch (name) {
    case "mint_agent":
      return encodeMint(args, ctx);
    case "deposit":
      return encodeVaultOp("deposit", tokenId, args, ctx);
    case "withdraw":
      return encodeVaultOp("withdraw", tokenId, args, ctx);
    case "transfer":
      return toolFail(
        "transfer runs in the wallet-signing UI flow — the user must complete the transfer dialog (EIP-712 access proof + iTransferFrom).",
      );
    default:
      return {
        ok: false as const,
        content: JSON.stringify({ error: `Unhandled encode tool: ${name}` }),
      };
  }
}

async function encodeMint(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const to = ctx.wallet?.address;
  if (!to) return toolFail("Wallet not connected");

  if (!args.dataDescription) return toolFail("dataDescription required");
  // dataHash must match the UI mint wizard: keccak256(toHex(trimmed description)); the oracle signs only hashes it has seen, so both mint paths MUST derive identically — until upload, this name hash stands in for the payload's 0G Merkle root.
  const description = String(args.dataDescription).trim();
  // dataHash omitted → name-derived placeholder keeps first-time mints working; real sealed data attaches later via update().
  const dataHash =
    typeof args.dataHash === "string" && args.dataHash.length > 0
      ? String(args.dataHash)
      : keccak256(toHex(description));

  const body = {
    dataDescription: description,
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

  if (!httpOk || !data.to) return toolFail("mint encode fail");

  try {
    await registerDataHashWithOracle(ctx, dataHash, to);
  } catch (e) {
    return toolFail(
      e instanceof Error ? e.message : "oracle registration failed",
    );
  }

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data);
  }

  try {
    const { txHash, receipt } = await signAndSendWithReceipt(ctx, {
      to: data.to as `0x${string}`,
      data: data.data as `0x${string}`,
      value: BigInt(data.value),
    });
    return {
      ok: true as const,
      content: JSON.stringify(
        receipt
          ? {
              ok: true,
              txHash,
              receiptStatus: receipt.status,
              blockNumber: receipt.blockNumber,
            }
          : { ok: true, txHash },
      ),
    };
  } catch (e) {
    return toolFail(e instanceof Error ? e.message : "mint sign failed");
  }
}

async function encodeVaultOp(
  op: "deposit" | "withdraw",
  tokenId: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  if (!args.amount) return toolFail("amount required");
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

  if (!httpOk || !data.to) return toolFail(`${op} encode fail`);

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data, { amount });
  }

  try {
    const { txHash, receipt } = await signAndSendWithReceipt(ctx, {
      to: data.to as `0x${string}`,
      data: data.data as `0x${string}`,
      value: BigInt(data.value || "0"),
    });
    return {
      ok: true as const,
      content: JSON.stringify(
        receipt
          ? {
              ok: true,
              txHash,
              amount,
              receiptStatus: receipt.status,
              blockNumber: receipt.blockNumber,
            }
          : { ok: true, txHash, amount },
      ),
    };
  } catch (e) {
    return toolFail(e instanceof Error ? e.message : `${op} sign failed`);
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
  // Fatal like the UI wizard: a chat-minted agent whose hash was never seen by
  // the oracle becomes un-transferable ("Unknown dataHash" at transfer time).
  const { ok } = await fetchJson<{ ok?: boolean }>(ctx.http, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataHash, to }),
  });
  if (!ok) {
    throw new Error(
      `oracle registration failed for dataHash=${dataHash} (mint aborted)`,
    );
  }
}
