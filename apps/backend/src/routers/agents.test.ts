import { test } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import { Wallet, getBytes, toBeHex } from "ethers";
import type { Hex } from "viem";
import {
  ownershipMessageHash,
  DEFAULT_EIP712_DOMAIN,
  type OwnershipProofInput,
  type Eip712Domain,
} from "@axiom/config";
import { assertTrustedOracleSigner, registerAgentRoutes } from "./agents.js";
import type { ServerConfig } from "../server.js";

// ---- helpers ----------------------------------------------------------------

/** Minimal express Response spy that records status + json body (ala sendError). */
function fakeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    locals: Record<string, unknown>;
    status(code: number): unknown;
    json(b: unknown): unknown;
  } = {
    statusCode: 0,
    body: undefined,
    locals: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res;
}

function makeInput(): OwnershipProofInput {
  return {
    dataHash: ("0x" + "ab".repeat(32)) as Hex,
    sealedKey: ("0x" + "11".repeat(32)) as Hex,
    targetPubkey: ("0x" + "22".repeat(33)) as Hex,
    to: ("0x" + "33".repeat(20)) as Hex,
    nft: ("0x" + "44".repeat(20)) as Hex,
    nonce: toBeHex(1n) as Hex,
    validUntil: 9_999_999_999n,
  };
}

/** Sign an ownership digest exactly as the TEE oracle would. */
function signOwnership(input: OwnershipProofInput, signer: Wallet, domain: Eip712Domain): Hex {
  const sig = signer.signingKey.sign(getBytes(ownershipMessageHash(input, domain)));
  return sig.serialized as Hex;
}

// ---- unit: the real trust check --------------------------------------------

test("assertTrustedOracleSigner accepts a signature from the configured trusted signer", () => {
  const trusted = Wallet.createRandom();
  const input = makeInput();
  const signature = signOwnership(input, trusted);
  const res = fakeRes();
  const ok = assertTrustedOracleSigner(
    res,
    signature,
    input,
    trusted.address as Hex,
    DEFAULT_EIP712_DOMAIN,
  );
  assert.equal(ok, true, "valid signature from the trusted key must be accepted");
  assert.equal(res.statusCode, 0, "no error status set on acceptance");
  assert.equal(res.body, undefined);
});

test("assertTrustedOracleSigner rejects a valid signature from a non-trusted key", () => {
  // Mirrors a malicious/swapped oracle: it signs with its OWN key. The server
  // must check against the CONFIGURED trusted address, not the oracle's claim.
  const trusted = Wallet.createRandom();
  const attacker = Wallet.createRandom();
  const input = makeInput();
  const signature = signOwnership(input, attacker);
  const res = fakeRes();
  const ok = assertTrustedOracleSigner(
    res,
    signature,
    input,
    trusted.address as Hex,
    DEFAULT_EIP712_DOMAIN,
  );
  assert.equal(ok, false, "signature from a non-trusted key must be rejected");
  assert.equal(res.statusCode, 502);
  assert.equal((res.body as { code?: string }).code, "ORACLE_SIGNATURE_INVALID");
});

test("assertTrustedOracleSigner is domain-bound (wrong verifier's signature rejected)", () => {
  const trusted = Wallet.createRandom();
  const altDomain: Eip712Domain = {
    chainId: 16602n,
    verifyingContract: "0x0000000000000000000000000000000000000001",
  };
  const input = makeInput();
  const signature = signOwnership(input, trusted, altDomain);
  const res = fakeRes();
  const ok = assertTrustedOracleSigner(
    res,
    signature,
    input,
    trusted.address as Hex,
    DEFAULT_EIP712_DOMAIN,
  );
  assert.equal(ok, false, "signature minted for another verifier must not verify");
  assert.equal(res.statusCode, 502);
});

// ---- integration: the real /transfer route wiring --------------------------

// Build a real express app through registerAgentRoutes with a mocked oracle
// that signs with a key OTHER than the backend's configured trusted signer.
function buildTransferApp(trustedPk: Hex, oracleSigner: Wallet) {
  const trustedAddr = new Wallet(trustedPk).address as Hex;
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: new Wallet(trustedPk),
    oracleBaseUrl: "http://oracle",
    addresses: {
      agentNft: ("0x" + "aa".repeat(20)) as Hex,
      vault: ("0x" + "bb".repeat(20)) as Hex,
      verifier: ("0x" + "cc".repeat(20)) as Hex,
    },
    env: { AXIOM_TEE_SIGNER_PK: trustedPk } as unknown as ServerConfig["env"],
  } as unknown as ServerConfig;

  // Malicious oracle: signs with `oracleSigner` (not the trusted key) and
  // claims signer = its own address. Before the fix the route compared the
  // recovered signer to this self-claim and accepted it. The mock signs the
  // exact input the route hands it (as a real oracle would).
  const oracle = {
    signOwnership: async (args: {
      dataHash: Hex;
      sealedKey: Hex;
      targetPubkey: Hex;
      to: Hex;
      nft: Hex;
      nonce: bigint;
      validUntil: bigint;
    }) => {
      const input: OwnershipProofInput = {
        dataHash: args.dataHash,
        sealedKey: args.sealedKey,
        targetPubkey: args.targetPubkey,
        to: args.to,
        nft: args.nft,
        nonce: args.nonce,
        validUntil: args.validUntil,
      };
      return {
        signature: signOwnership(input, oracleSigner),
        signer: oracleSigner.address as Hex,
      };
    },
  } as unknown as Parameters<typeof registerAgentRoutes>[3];

  const app = express();
  app.use(express.json());
  registerAgentRoutes(
    app,
    config,
    {} as unknown as Parameters<typeof registerAgentRoutes>[2],
    oracle,
    DEFAULT_EIP712_DOMAIN,
    null,
  );
  return { app, trustedAddr };
}

const transferBody = {
  to: ("0x" + "33".repeat(20)) as Hex,
  receiverPubKey64: ("0x04" + "ab".repeat(64)) as Hex,
  dataHash: ("0x" + "cd".repeat(32)) as Hex,
  sealedKey: ("0x" + "00".repeat(32)) as Hex,
};

test("POST /v1/agents/:id/transfer rejects a malicious oracle (non-trusted signer) with 502", async () => {
  const trustedPk = ("0x" + "5d".repeat(32)) as Hex;
  const attacker = Wallet.createRandom(); // NOT the trusted key
  const { app } = buildTransferApp(trustedPk, attacker);
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/agents/1/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferBody),
    });
    assert.equal(
      res.status,
      502,
      "route must reject when the oracle signs with a non-trusted key",
    );
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "ORACLE_SIGNATURE_INVALID");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /v1/agents/:id/transfer accepts a legitimate oracle signing with the trusted key", async () => {
  const trustedPk = ("0x" + "5d".repeat(32)) as Hex;
  const trustedWallet = new Wallet(trustedPk); // oracle signs with the trusted key
  const { app } = buildTransferApp(trustedPk, trustedWallet);
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/agents/1/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferBody),
    });
    assert.equal(res.status, 200, "route must accept when the oracle signs with the trusted key");
    const body = (await res.json()) as { ok?: boolean; stage?: string };
    assert.equal(body.ok, true);
    assert.equal(body.stage, "challenge");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
