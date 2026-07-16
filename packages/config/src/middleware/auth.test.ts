import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createApiKeyAuth,
  requireServerAuth,
  timingSafeTokenInList,
  type AuthRequest,
} from "./auth.js";

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

test("server key sets authPrincipal server", () => {
  const mw = createApiKeyAuth("srv-secret", ["/health"], false, "cli-public");
  const req = {
    path: "/v1/x",
    headers: { "x-api-key": "srv-secret" },
  } as unknown as AuthRequest;
  let next = false;
  mw(req, mockRes().res, () => {
    next = true;
  });
  assert.equal(next, true);
  assert.equal(req.authPrincipal, "server");
});

test("client key sets authPrincipal client", () => {
  const mw = createApiKeyAuth("srv-secret", ["/health"], false, "cli-public");
  const req = {
    path: "/v1/x",
    headers: { "x-api-key": "cli-public" },
  } as unknown as AuthRequest;
  let next = false;
  mw(req, mockRes().res, () => {
    next = true;
  });
  assert.equal(next, true);
  assert.equal(req.authPrincipal, "client");
});

test("requireServerAuth rejects client principal", () => {
  const req = { authPrincipal: "client" } as AuthRequest;
  const { res, state } = mockRes();
  let next = false;
  requireServerAuth(req as Request, res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(state.statusCode, 403);
});

test("requireServerAuth allows server principal", () => {
  const req = { authPrincipal: "server" } as AuthRequest;
  let next = false;
  requireServerAuth(req as Request, mockRes().res, () => {
    next = true;
  });
  assert.equal(next, true);
});

test("timingSafeTokenInList matches", () => {
  assert.equal(timingSafeTokenInList("abc", ["x", "abc"]), true);
  assert.equal(timingSafeTokenInList("nope", ["x", "abc"]), false);
});
