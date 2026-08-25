import { test } from "bun:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import { PaymentProcessorClient } from "./processor.js";

const PROCESSOR_ADDRESS = ("0x" + "ab".repeat(20)) as `0x${string}`;
const TOKEN_ADDRESS = ("0x" + "cd".repeat(20)) as `0x${string}`;

function makeClient(): PaymentProcessorClient {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:1");
  const signer = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
  return new PaymentProcessorClient({
    address: PROCESSOR_ADDRESS,
    signer,
    provider,
    paymentTokenAddress: TOKEN_ADDRESS,
  });
}

test("encodeWithdrawEarnings emits the withdrawAgentEarnings() selector with no args", () => {
  const client = makeClient();
  const tx = client.encodeWithdrawEarnings();
  const iface = new ethers.Interface(PAYMENT_PROCESSOR_ABI);
  const selector = iface.getFunction("withdrawAgentEarnings")!.selector;
  assert.equal(
    tx.data,
    selector,
    "no-arg encoding must be exactly the 4-byte selector (contract AxiomPaymentProcessor.sol:418)",
  );
});

test("encodeWithdrawEarnings targets the payment processor with zero value", () => {
  const client = makeClient();
  const tx = client.encodeWithdrawEarnings();
  assert.equal(tx.to, PROCESSOR_ADDRESS);
  assert.equal(tx.value, 0n);
});

test("encodeWithdrawEarnings calldata decodes back to a no-arg call", () => {
  const client = makeClient();
  const tx = client.encodeWithdrawEarnings();
  const iface = new ethers.Interface(PAYMENT_PROCESSOR_ABI);
  const parsed = iface.parseTransaction({ data: tx.data });
  assert.equal(parsed?.name, "withdrawAgentEarnings");
  assert.equal(parsed?.args.length, 0);
});
