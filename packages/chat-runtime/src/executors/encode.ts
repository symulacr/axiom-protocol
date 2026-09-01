import {
  getChatToolSpec,
  isSponsoredTool,
  resolveAxmTokenAddress,
} from "@axiom/config/chat-tools";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";
import { ADDRESS_REGEX } from "@axiom/config/types/hex";
import { fetchJson, postJson, resolveTokenId, toolFail } from "../transport.js";
import { encodeFunctionData, parseAbi, parseUnits } from "viem";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

/** Sponsor lane deadline: 10 minutes — enough relayer queue latency, short enough
 *  to bound signature-reuse risk (plan §1 deadline discipline). */
const SPONSOR_DEADLINE_SECS = 600n;

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

/** Hard per-call spend caps the LLM cannot talk past: 1000 payment tokens, 1000 native OG (server-mirrored). */
const MAX_CHAT_NATIVE = 1000;

/** Canonical Permit2 (Uniswap CREATE2 — same address every chain; the
 *  Processor hardcodes the identical constant). */
const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`;

const ERC20_IFACE = parseAbi(ERC20_ABI);
const PAY_IFACE = parseAbi(PAYMENT_PROCESSOR_ABI);

/** Permit2 allowance prerequisite: Permit2 pulls move funds from the user, so
 *  swap (and the approve fallback) must confirm the user has a Permit2
 *  allowance ≥ amount for tokenIn before any lane runs. Direct chain read —
 *  allowance(owner, spender) on the token. A failed read returns
 *  allowance:null (unknown) so the op proceeds and the chain reverts loudly
 *  rather than the tool blocking on a flaky RPC. */
async function checkPermit2Allowance(
  ctx: ToolRuntime,
  token: `0x${string}`,
  owner: `0x${string}`,
): Promise<{ ok: boolean; allowance: bigint | null }> {
  if (!ctx.chain?.readContract) return { ok: false, allowance: null };
  try {
    const allowance = await ctx.chain.readContract<bigint>({
      address: token,
      abi: ERC20_IFACE,
      functionName: "allowance",
      args: [owner, PERMIT2_ADDRESS],
    });
    return { ok: true, allowance };
  } catch {
    return { ok: true, allowance: null };
  }
}

/** Sign+send and append receipt status/block when the transport can wait; otherwise txHash-only fallback. */
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
    case "pay_for_agent":
      return encodePayForAgent(tokenId, args, ctx);
    case "swap_tokens":
      return encodeSwap(args, ctx);
    case "add_liquidity":
      return encodeAddLiquidity(args, ctx);
    case "borrow":
      return encodeBorrow(args, ctx);
    case "transfer":
      return toolFail(
        "transfer runs in the wallet-signing UI flow — the user must complete the transfer dialog (EIP-712 access proof + iTransferFrom).",
      );
    default:
      return toolFail(`Unhandled encode tool: ${name}`);
  }
}

async function encodeMint(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const to = ctx.wallet?.address;
  if (!to) return toolFail("Wallet not connected");

  if (!args.dataDescription) return toolFail("dataDescription required");
  const name = String(args.dataDescription).trim();
  if (!name) return toolFail("dataDescription required");

  // Hashless mint (P3 §(b) #1-#3): the server derives dataHash + description
  // from the name and marks it seen with the oracle in-process — the client
  // never derives the hash, so UI and chat mints cannot diverge.
  const { ok: httpOk, data } = await postJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, "/v1/agents/mint/encode", { name, to });

  if (!httpOk || !data.to) return toolFail("mint encode fail");

  // mint is NOT in phase-1 SPONSORED_TOOLS — always the wallet lane.
  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data);
  }

  return signAndSendWithReceipt(ctx, {
    to: data.to as `0x${string}`,
    data: data.data as `0x${string}`,
    value: BigInt(data.value || "0"),
  })
    .then(({ txHash, receipt }) => ({
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
    }))
    .catch((e: unknown): ToolResult =>
      toolFail(e instanceof Error ? e.message : "mint sign failed"),
    );
}

/** Shared send leg: sponsor lane first (phase-1 sponsored tools with tank
 *  headroom), then the wallet lane (fallback ladder §2.3). Sponsored ops are
 *  value-free — the GasTank relay() forwards data only. */
async function executeSponsoredOrWallet(
  ctx: ToolRuntime,
  calldata: { to: `0x${string}`; data: `0x${string}`; value: bigint },
  failLabel: string,
  extra: Record<string, unknown>,
  estimateMaxGasCost: () => bigint,
): Promise<ToolResult> {
  // Sponsor lane: only for phase-1 SPONSORED_TOOLS, only when the transport
  // exposes a sponsor capability, and only value-free ops.
  if (
    isSponsoredTool(String(extra.name ?? "")) &&
    calldata.value === 0n &&
    ctx.wallet?.sponsor &&
    ctx.wallet.address
  ) {
    const result = await trySponsorLane(ctx, calldata, estimateMaxGasCost);
    if (result.kind === "ok") {
      return {
        ok: true as const,
        content: JSON.stringify({
          ok: true,
          ...extra,
          sponsored: true,
          relayerNonce: result.nonce,
          ...(result.id ? { relayerId: result.id } : {}),
          sponsoredMaxGasCost: result.maxGasCost,
        }),
      };
    }
    if (result.kind === "tank-exhausted") {
      // 402 TANK_EXHAUSTED: terminal for the sponsor lane — surface the remedy.
      return toolFail(
        "Gas tank exhausted: no prepaid balance and no grants left for this address. Options: deposit via the GasTank UI, or connect a wallet to sign the op directly.",
      );
    }
    // Transient sponsor-lane failure (rate limit, relayer off, network) —
    // fall through to the wallet lane.
  }
  // Wallet lane: encode-only mode or no signer → encode-only envelope.
  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(
      {
        to: calldata.to,
        data: calldata.data,
        value: calldata.value.toString(),
      },
      extra,
    );
  }
  return signAndSendWithReceipt(ctx, calldata)
    .then(({ txHash, receipt }) => ({
      ok: true as const,
      content: JSON.stringify(
        receipt
          ? {
              ok: true,
              txHash,
              ...extra,
              receiptStatus: receipt.status,
              blockNumber: receipt.blockNumber,
            }
          : { ok: true, txHash, ...extra },
      ),
    }))
    .catch((e: unknown): ToolResult =>
      toolFail(e instanceof Error ? e.message : failLabel),
    );
}

type SponsorLaneOutcome =
  | { kind: "ok"; nonce: string; id?: string; maxGasCost: string }
  | { kind: "tank-exhausted" }
  | { kind: "transient"; error?: string };

/** Sponsor lane: read nextNonce + tank headroom, sign the ForwardRequest via the
 *  wallet's sponsor capability, and submit to POST /v1/relayer/sponsor. */
async function trySponsorLane(
  ctx: ToolRuntime,
  calldata: { to: `0x${string}`; data: `0x${string}` },
  estimateMaxGasCost: () => bigint,
): Promise<SponsorLaneOutcome> {
  const user = ctx.wallet!.address!;
  try {
    const { ok: tankOk, data: tank } = await fetchJson<{
      nextNonce?: string;
      balance?: string;
      grantsLeft?: string;
    }>(ctx.http, `/v1/relayer/tank/${user}`);
    if (!tankOk || tank.nextNonce === undefined) {
      return { kind: "transient", error: "tank read failed" };
    }
    // Headroom check (§2.3): the op is sponsored when the tank (or a pending
    // lazy grant) covers the estimated max cost; otherwise the relayer's
    // simulation would revert TankExhausted.
    const balance = BigInt(tank.balance ?? "0");
    const grantsLeft = BigInt(tank.grantsLeft ?? "0");
    const maxGasCost = estimateMaxGasCost();
    if (balance < maxGasCost && grantsLeft === 0n) {
      return { kind: "tank-exhausted" };
    }
    const deadline =
      BigInt(Math.floor(Date.now() / 1000)) + SPONSOR_DEADLINE_SECS;
    // The transport's sponsor capability signs the ForwardRequest and returns
    // the userSig — the executor never sees key material.
    const { signature } = await ctx.wallet!.sponsor!({
      user,
      target: calldata.to,
      data: calldata.data,
      maxGasCost,
      nonce: BigInt(tank.nextNonce),
      deadline,
    });
    const { ok, data } = await postJson<{
      ok?: boolean;
      id?: string;
      nonce?: string;
      code?: string;
      error?: string;
    }>(ctx.http, "/v1/relayer/sponsor", {
      user,
      target: calldata.to,
      data: calldata.data,
      maxGasCost: maxGasCost.toString(),
      nonce: tank.nextNonce,
      deadline: deadline.toString(),
      signature,
    });
    if (ok && data.ok) {
      return {
        kind: "ok",
        nonce: data.nonce ?? tank.nextNonce,
        id: data.id,
        maxGasCost: maxGasCost.toString(),
      };
    }
    if (data.code === "TANK_EXHAUSTED" || ok === false) {
      if (data.code === "TANK_EXHAUSTED") return { kind: "tank-exhausted" };
    }
    return { kind: "transient", error: data.error ?? data.code };
  } catch (e) {
    return {
      kind: "transient",
      error: e instanceof Error ? e.message : "sponsor lane failed",
    };
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
  if (!(Number(amount) <= MAX_CHAT_NATIVE)) {
    return toolFail(
      `amount ${amount} exceeds the chat cap of ${MAX_CHAT_NATIVE} (native OG) — ask the user to use the UI for larger vault operations`,
    );
  }

  const { ok: httpOk, data } = await postJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, `/v1/agents/${tokenId}/${op}`, { amount });
  if (!httpOk || !data.to) return toolFail(`${op} encode fail`);

  return executeSponsoredOrWallet(
    ctx,
    {
      to: data.to as `0x${string}`,
      data: data.data as `0x${string}`,
      value: BigInt(data.value || "0"),
    },
    `${op} sign failed`,
    { name: op, amount },
    // Vault ops are cheap; a flat 0.001 OG ceiling comfortably covers them and
    // matches the backend's sponsor ceiling (env SPONSOR_MAX_GAS_COST_WEI default).
    () => 1_000_000_000_000_000n,
  );
}

/** Payment-token decimals from /v1/payment/config, cached per process; Galileo axmUSDC is 18-decimal, not 6. */
let tokenDecimalsCache: number | null = null;

async function resolveTokenDecimals(ctx: ToolRuntime): Promise<number> {
  if (tokenDecimalsCache !== null) return tokenDecimalsCache;
  try {
    const { ok, data } = await fetchJson<{
      paymentTokenDecimals?: number;
    }>(ctx.http, "/v1/payment/config", { method: "GET" });
    if (ok && typeof data.paymentTokenDecimals === "number") {
      tokenDecimalsCache = data.paymentTokenDecimals;
      return tokenDecimalsCache;
    }
  } catch {
    // fall through to the safe default below
  }
  return 18;
}

/** Parse a human-readable token amount ("1.5") to base units at the given decimals, rejecting empty/zero. */
function parseTokenAmount(raw: unknown, decimals: number): bigint | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const wei = parseUnits(raw.trim(), decimals);
  return wei > 0n ? wei : null;
}

function isValidAddress(raw: unknown): raw is `0x${string}` {
  return typeof raw === "string" && ADDRESS_REGEX.test(raw);
}

/** pay_for_agent: payForAgent (creator-only) or payForAgentAndCompute; provider explicit since none exists on-chain. */
async function encodePayForAgent(
  tokenId: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const processor = ctx.session.addresses?.paymentProcessor;
  if (!processor) return toolFail("Payment processor address not configured");

  const decimals = await resolveTokenDecimals(ctx);
  const cap = 1000n * 10n ** BigInt(decimals);

  const agentWei = parseTokenAmount(args.agentAmount, decimals);
  if (agentWei === null) {
    return toolFail("agentAmount required and must be greater than zero");
  }
  if (agentWei > cap) {
    return toolFail(
      "agentAmount exceeds the chat cap of 1000 tokens — ask the user to use the UI for larger payments",
    );
  }

  const computeAmount = args.computeAmount;
  const hasCompute =
    computeAmount !== undefined &&
    computeAmount !== null &&
    String(computeAmount).trim() !== "";
  const computeWei = hasCompute
    ? parseTokenAmount(computeAmount, decimals)
    : null;
  if (hasCompute && computeWei === null) {
    return toolFail("computeAmount must be greater than zero");
  }
  if (hasCompute && computeWei !== null && computeWei > cap) {
    return toolFail("computeAmount exceeds the chat cap of 1000 tokens");
  }

  let functionName: "payForAgent" | "payForAgentAndCompute";
  let encodeArgs:
    | readonly [bigint, bigint]
    | readonly [bigint, `0x${string}`, bigint, bigint];
  const extra: Record<string, unknown> = {
    agentAmount: String(args.agentAmount),
  };

  if (!hasCompute) {
    // Creator-only payment (matches the UI PaymentPanel): payForAgent(tokenId, amount)
    functionName = "payForAgent";
    encodeArgs = [BigInt(tokenId), agentWei];
  } else {
    const provider = args.provider;
    if (!isValidAddress(provider)) {
      return toolFail(
        `No registered compute provider for agent ${tokenId} — pass the provider address explicitly.`,
      );
    }
    functionName = "payForAgentAndCompute";
    encodeArgs = [BigInt(tokenId), provider, agentWei, computeWei as bigint];
    extra.computeAmount = String(computeAmount);
    extra.provider = provider;
  }

  const data = encodeFunctionData({
    abi: parseAbi(PAYMENT_PROCESSOR_ABI),
    functionName,
    args: encodeArgs,
  });

  return executeSponsoredOrWallet(
    ctx,
    { to: processor, data, value: 0n },
    "pay sign failed",
    { name: "pay_for_agent", tokenId, ...extra },
    // USDC-style payments are ~120k gas; at 2 gwei that's well under the
    // sponsor ceiling — estimate with headroom.
    () => 300_000n * 2_000_000_000n,
  );
}

/** Shared DeFi-op preamble: processor config, token decimals, amount parse +
 *  chat cap. Returns toolFail results so callers can short-circuit. */
async function defiOpAmount(
  ctx: ToolRuntime,
  raw: unknown,
  label: string,
): Promise<
  | { fail: ToolResult }
  | { amountWei: bigint; decimals: number; processor: `0x${string}` }
> {
  const processor = ctx.session.addresses?.paymentProcessor;
  if (!processor)
    return { fail: toolFail("Payment processor address not configured") };
  const decimals = await resolveTokenDecimals(ctx);
  const amountWei = parseTokenAmount(raw, decimals);
  if (amountWei === null) {
    return {
      fail: toolFail(`${label} required and must be greater than zero`),
    };
  }
  const cap = 1000n * 10n ** BigInt(decimals);
  if (amountWei > cap) {
    return {
      fail: toolFail(
        `${label} exceeds the chat cap of 1000 tokens — ask the user to use the UI for larger amounts`,
      ),
    };
  }
  return { amountWei, decimals, processor };
}

/** Build the Permit2-approve fallback envelope: the allowance prerequisite is
 *  unmet, so the user first needs approve(spender=Permit2, amount) on tokenIn.
 *  The result is encode-only (wallet lane) by construction — approve cannot be
 *  relayed for someone else. */
function permit2ApproveFallback(
  token: `0x${string}`,
  owner: `0x${string}`,
  amountWei: bigint,
  amountHuman: string,
): ToolResult {
  return {
    ok: true as const,
    content: JSON.stringify({
      ok: false,
      requiresApproval: true,
      reason:
        "Permit2 allowance prerequisite unmet — the wallet must approve Permit2 to pull this token before the swap can run",
      approve: {
        to: token,
        data: encodeFunctionData({
          abi: ERC20_IFACE,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, amountWei],
        }),
        value: "0",
        from: owner,
        spender: PERMIT2_ADDRESS,
        amount: amountWei.toString(),
      },
      tokenInHuman: amountHuman,
    }),
  };
}

/** swap_tokens: swapExactIn(tokenIn, amountIn, minOut, permit, signature).
 *  The Permit2 single permit rides INSIDE the calldata — the wallet's sponsor
 *  capability signs the ForwardRequest over the full data blob, exactly like
 *  pay_for_agent wires its calldata; the relayed call re-executes the permit
 *  pull under the user's own signature. minOut defaults to 1 (wei) — the LLM
 *  is expected to pass a real slippage floor; the backend server-side check
 *  validates tokenIn ∈ {paymentToken, swapPairToken}. */
async function encodeSwap(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const symbol = typeof args.tokenIn === "string" ? args.tokenIn : "";
  const tokenIn = resolveAxmTokenAddress(
    symbol,
    ctx.session.addresses?.paymentToken,
  );
  if (!tokenIn) {
    return toolFail(
      "tokenIn must be 'usdc' or 'weth' and the corresponding token address must be configured (weth needs AXIOM_SWAP_PAIR_TOKEN set)",
    );
  }

  const pre = await defiOpAmount(ctx, args.amountIn, "amountIn");
  if ("fail" in pre) return pre.fail;
  const { amountWei, processor } = pre;

  if (!ctx.wallet?.address) return toolFail("Wallet not connected");
  const owner = ctx.wallet.address;

  // Permit2 allowance prerequisite (sponsor + wallet lanes both pull via
  // Permit2): without headroom the op deterministically reverts at the permit
  // leg — surface the approve calldata instead of queueing a doomed relay.
  const allowance = await checkPermit2Allowance(ctx, tokenIn, owner);
  if (
    allowance.ok &&
    allowance.allowance !== null &&
    allowance.allowance < amountWei
  ) {
    return permit2ApproveFallback(
      tokenIn,
      owner,
      amountWei,
      String(args.amountIn),
    );
  }

  // minOut: human out-units at the same decimals as the pool tokens; default 1 wei.
  const minOut =
    args.minOut === undefined ||
    args.minOut === null ||
    String(args.minOut).trim() === ""
      ? 1n
      : parseUnits(String(args.minOut).trim(), pre.decimals);

  // Placeholder permit (zero nonce/deadline): the concrete PermitTransferFrom
  // signature is produced by the wallet sponsor capability / signing lane when
  // the ForwardRequest over this exact data blob is signed — Permit2 binds the
  // spender to msg.sender, so the relayed user signature stays user-bound.
  const permit = {
    permitted: { token: tokenIn, amount: amountWei },
    nonce: 0n,
    deadline: 0n,
  };
  const data = encodeFunctionData({
    abi: PAY_IFACE,
    functionName: "swapExactIn",
    args: [tokenIn, amountWei, minOut, permit, "0x"],
  });

  return executeSponsoredOrWallet(
    ctx,
    { to: processor, data, value: 0n },
    "swap sign failed",
    {
      name: "swap_tokens",
      tokenIn: symbol.toLowerCase(),
      amountIn: String(args.amountIn),
    },
    // Swap = permit pull + reserve update + transfer out ≈ a USDC payment.
    () => 300_000n * 2_000_000_000n,
  );
}

/** add_liquidity: addLiquidity(usdc, weth, PermitBatchTransferFrom, signature)
 *  is wallet-lane ONLY. The batch permit needs one EIP-712 signature over BOTH
 *  pool tokens and Permit2 binds spender = raw msg.sender — the single-permit
 *  sponsor capability cannot represent it, and a relayed call would revert at
 *  the permit leg (W6-A T25 contract). Documented in the tool hint. */
async function encodeAddLiquidity(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const paymentToken = ctx.session.addresses?.paymentToken;
  const swapPair = resolveAxmTokenAddress("weth", paymentToken);
  if (!paymentToken || !swapPair) {
    return toolFail(
      "pool tokens not configured (paymentToken + AXIOM_SWAP_PAIR_TOKEN required)",
    );
  }

  const usdc = await defiOpAmount(ctx, args.usdcAmount, "usdcAmount");
  if ("fail" in usdc) return usdc.fail;
  const weth = await defiOpAmount(ctx, args.wethAmount, "wethAmount");
  if ("fail" in weth) return weth.fail;

  // Placeholder batch permit: the two-token EIP-712 signature is produced by
  // the wallet signing lane over this exact calldata (Permit2 spender binding).
  const permit = {
    permitted: [
      { token: paymentToken, amount: usdc.amountWei },
      { token: swapPair, amount: weth.amountWei },
    ],
    nonce: 0n,
    deadline: 0n,
  };
  const data = encodeFunctionData({
    abi: PAY_IFACE,
    functionName: "addLiquidity",
    args: [usdc.amountWei, weth.amountWei, permit, "0x"],
  });

  return executeSponsoredOrWallet(
    ctx,
    { to: usdc.processor, data, value: 0n },
    "addLiquidity sign failed",
    {
      name: "add_liquidity",
      usdcAmount: String(args.usdcAmount),
      wethAmount: String(args.wethAmount),
    },
    // Two-token batch pull + share math: same gas family as a payment op.
    () => 400_000n * 2_000_000_000n,
  );
}

/** borrow: borrow(amount) — no permit leg (funds pay OUT to the caller), so no
 *  Permit2 prerequisite; fully relayable via the GasTank forwarder. */
async function encodeBorrow(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const pre = await defiOpAmount(ctx, args.amount, "amount");
  if ("fail" in pre) return pre.fail;

  const data = encodeFunctionData({
    abi: PAY_IFACE,
    functionName: "borrow",
    args: [pre.amountWei],
  });

  return executeSponsoredOrWallet(
    ctx,
    { to: pre.processor, data, value: 0n },
    "borrow sign failed",
    { name: "borrow", amount: String(args.amount) },
    // Borrow = LTV read + reserve update + single transfer out; cheap.
    () => 200_000n * 2_000_000_000n,
  );
}
