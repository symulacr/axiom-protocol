import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import { HTTP, getRelayerConfig, isFaucetEnabled } from "./constants.js";
import {
  SPONSORED_TOOLS,
  isSponsoredTool,
  getChatToolSpec,
  resolveAxmTokenAddress,
} from "./chat-tools.js";
import { CHAT_BENCH_ENCODE_TOOLS } from "./chat-tools.js";
import { resolveAddressOptional, resolveAddress } from "./addresses.js";
import {
  GAS_TANK_DOMAIN_NAME,
  GAS_TANK_DOMAIN_VERSION,
  GAS_TANK_FORWARD_REQUEST_TYPES,
} from "./eip712.js";
import { GAS_TANK_ABI } from "./abis/index.js";

describe("relayer config surface (V3 W5-B)", () => {
  test("HTTP.PAYMENT_REQUIRED is 402", () => {
    assert.equal(HTTP.PAYMENT_REQUIRED, 402);
  });

  test("SPONSORED_TOOLS set is exactly {withdraw, pay_for_agent} + the W9 DeFi ops", () => {
    assert.deepEqual([...SPONSORED_TOOLS], [
      "withdraw",
      "pay_for_agent",
      "swap_tokens",
      "borrow",
    ]);
    assert.equal(isSponsoredTool("withdraw"), true);
    assert.equal(isSponsoredTool("pay_for_agent"), true);
    assert.equal(isSponsoredTool("mint_agent"), false);
    assert.equal(isSponsoredTool("deposit"), false);
  });

  test("W9 DeFi tools are cataloged encode-class + wallet-gated + medium friction, and swap_tokens/borrow are sponsored", () => {
    for (const name of ["swap_tokens", "add_liquidity", "borrow"] as const) {
      const spec = getChatToolSpec(name);
      assert.ok(spec, `${name} in catalog`);
      assert.equal(spec.class, "encode", `${name} is encode-class`);
      assert.equal(spec.requiresWallet, true, `${name} requires a wallet`);
      assert.equal(spec.friction, "medium", `${name} friction medium`);
      assert.ok(spec.hint.includes("GasTank"), `${name} hint documents the GasTank lane`);
    }
    assert.ok(getChatToolSpec("add_liquidity")!.hint.includes("Permit2"));
    assert.equal(isSponsoredTool("swap_tokens"), true);
    assert.equal(isSponsoredTool("borrow"), true);
    // add_liquidity needs a Permit2 BATCH signature the sponsor capability
    // cannot produce → stays in the wallet lane, outside SPONSORED_TOOLS.
    assert.equal(isSponsoredTool("add_liquidity"), false);
    assert.deepEqual(
      CHAT_BENCH_ENCODE_TOOLS.filter((n) =>
        ["swap_tokens", "add_liquidity", "borrow"].includes(n),
      ),
      ["swap_tokens", "add_liquidity", "borrow"],
    );
  });

  test("resolveAxmTokenAddress maps pool symbols from session/env addresses", () => {
    const usdc = "0x354ca53bab51c0666964fa050628d8351f8a7d19";
    const weth = "0x62e5ead40c2105d44a705e87f370776bd12bf6ec";
    assert.equal(resolveAxmTokenAddress("usdc", usdc), usdc);
    assert.equal(resolveAxmTokenAddress("USDC", usdc), usdc);
    assert.equal(resolveAxmTokenAddress("weth", usdc, { AXIOM_SWAP_PAIR_TOKEN: weth }), weth);
    // unconfigured sides → null, never a fabricated address
    assert.equal(resolveAxmTokenAddress("weth", usdc, {}), null);
    assert.equal(resolveAxmTokenAddress("usdc", undefined), null);
    assert.equal(resolveAxmTokenAddress("btc", usdc, { AXIOM_SWAP_PAIR_TOKEN: weth }), null);
    assert.equal(
      resolveAxmTokenAddress("weth", usdc, { AXIOM_SWAP_PAIR_TOKEN: "not-an-address" }),
      null,
    );
  });

  test("relayer defaults + env overrides", () => {
    const dflt = getRelayerConfig({});
    assert.equal(dflt.intervalMs, 3_000);
    assert.equal(dflt.batchMax, 64);
    assert.equal(dflt.sponsorRatePerMin, 6);
    assert.equal(dflt.sponsorMaxGasCostWei, 1_000_000_000_000_000n);
    assert.equal(dflt.sponsorMaxInflightPerUser, 2);
    assert.equal(dflt.faucetAmountUsdc, 1_000_000_000n);
    const env = getRelayerConfig({
      AXIOM_RELAYER_INTERVAL_MS: "5000",
      AXIOM_RELAYER_SPONSOR_RATE_PER_MIN: "10",
      AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI: "2000000000000000",
      AXIOM_FAUCET_AMOUNT_USDC: "2000000000",
    });
    assert.equal(env.intervalMs, 5_000);
    assert.equal(env.sponsorRatePerMin, 10);
    assert.equal(env.sponsorMaxGasCostWei, 2_000_000_000_000_000n);
    assert.equal(env.faucetAmountUsdc, 2_000_000_000n);
  });

  test("faucet kill-switch defaults on and honors AXIOM_FAUCET_ENABLED=false", () => {
    assert.equal(isFaucetEnabled({}), true);
    assert.equal(isFaucetEnabled({ AXIOM_FAUCET_ENABLED: "false" }), false);
    assert.equal(isFaucetEnabled({ AXIOM_FAUCET_ENABLED: "true" }), true);
  });

  test("gasTank address is optional (resolveAddressOptional) and env-keyed", () => {
    assert.equal(resolveAddressOptional("gasTank", {}), undefined);
    const addr = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    assert.equal(
      resolveAddressOptional("gasTank", { AXIOM_GAS_TANK_ADDRESS: addr }),
      addr,
    );
    assert.throws(() => resolveAddress("gasTank", {}));
  });

  test("GasTank EIP-712 domain + ForwardRequest types match lane A", () => {
    assert.equal(GAS_TANK_DOMAIN_NAME, "AxiomGasTank");
    assert.equal(GAS_TANK_DOMAIN_VERSION, "1");
    assert.deepEqual(
      GAS_TANK_FORWARD_REQUEST_TYPES.ForwardRequest.map(
        (f) => `${f.name}:${f.type}`,
      ),
      [
        "user:address",
        "target:address",
        "data:bytes",
        "maxGasCost:uint256",
        "nonce:uint256",
        "deadline:uint256",
      ],
    );
  });

  test("GAS_TANK_ABI adapted to lane A's committed source (delta notes)", () => {
    // Lane A deltas vs the interface-spec draft: RelayED arg order differs,
    // ReserveExhausted (not ReserveDepleted), grantsUsed mapping (no grantsOf),
    // grantCredit() (no refill), no merkleProof on relay().
    const joined = (GAS_TANK_ABI as readonly string[]).join("\n");
    assert.match(
      joined,
      /event Relayed\(address indexed user, address indexed relayer, address indexed target, bool success, uint256 measured, uint256 reimburse, uint256 nonce\)/,
    );
    assert.match(joined, /error ReserveExhausted\(\)/);
    assert.match(
      joined,
      /function grantsUsed\(address user\) view returns \(uint256\)/,
    );
    assert.match(
      joined,
      /function grantCredit\(\) returns \(uint256 credited\)/,
    );
    assert.match(
      joined,
      /function relay\(\(address user, address target, bytes data, uint256 maxGasCost, uint256 nonce, uint256 deadline\) req, bytes userSig\)/,
    );
    assert.ok(!joined.includes("merkleProof"));
    // sequential nonces: public mapping, not getNonce
    assert.match(
      joined,
      /function nonces\(address user\) view returns \(uint256\)/,
    );
    assert.ok(!joined.includes("getNonce"));
  });
});
