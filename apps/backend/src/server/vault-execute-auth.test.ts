import assert from "node:assert/strict";
import { test } from "bun:test";
import type { Request, Response } from "express";
import {
  createApiKeyAuth,
  requireServerAuth,
  type AuthRequest,
} from "@axiom/config/middleware/auth";

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

test("client key cannot pass requireServerAuth (vault execute gate)", () => {
  const auth = createApiKeyAuth("server-secret", ["/health"], false, "browser-key");
  const req = {
    path: "/v1/vaults/1/execute",
    headers: { "x-api-key": "browser-key" },
  } as unknown as AuthRequest;
  auth(req as Request, mockRes().res, () => {});
  assert.equal(req.authPrincipal, "client");
  const { res, state } = mockRes();
  let next = false;
  requireServerAuth(req as Request, res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(state.statusCode, 403);
});

test("server key passes requireServerAuth", () => {
  const auth = createApiKeyAuth("server-secret", ["/health"], false, "browser-key");
  const req = {
    path: "/v1/vaults/1/execute",
    headers: { "x-api-key": "server-secret" },
  } as unknown as AuthRequest;
  auth(req as Request, mockRes().res, () => {});
  assert.equal(req.authPrincipal, "server");
  let next = false;
  requireServerAuth(req as Request, mockRes().res, () => {
    next = true;
  });
  assert.equal(next, true);
});
