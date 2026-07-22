import assert from "node:assert/strict";
import test from "node:test";
import { buildSigner } from "./index.js";

test("buildSigner connects wallet to a provider via evmRpc", () => {
  process.env.AXIOM_COMPUTE_SIGNER_PK = "0x" + "1".repeat(64);
  process.env.AXIOM_EVM_RPC = "https://evmrpc.0g.ai";
  const signer = buildSigner({ signerPk: process.env.AXIOM_COMPUTE_SIGNER_PK });
  assert.ok(signer, "signer must be constructed");
  assert.ok(signer.provider, "signer must have a connected provider");
});
