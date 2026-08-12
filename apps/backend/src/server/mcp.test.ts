import { test } from "bun:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Parallel bun test workers share no env; give this file its own EventStore
// data dir so on-disk event-store.lock never contends with sibling workers.
process.env.AXIOM_DATA_DIR = join(tmpdir(), `axiom-be-${process.pid}`);

import { startServer, type ServerConfig } from "../server.js";

const TEST_SIGNER = new Wallet("0x" + "33".repeat(32));
const MOCK_ADDRESSES = {
	agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
	vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
	verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
};

function makeConfig(extraEnv?: Record<string, string>): ServerConfig {
	return {
		bind: "127.0.0.1",
		port: 0,
		evmRpc: "http://127.0.0.1:1",
		signer: TEST_SIGNER,
		oracleBaseUrl: "http://127.0.0.1:1",
		addresses: MOCK_ADDRESSES,
		env: {
			AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32),
			...extraEnv,
		} as unknown as ServerConfig["env"],
	};
}

interface Booted {
	baseUrl: string;
	close: () => Promise<void>;
}

async function boot(config: ServerConfig): Promise<Booted> {
	const { httpServer } = startServer(config);
	const address = await new Promise<AddressInfo>((resolve, reject) => {
		httpServer.once("listening", () => {
			resolve(httpServer.address() as AddressInfo);
		});
		httpServer.once("error", reject);
	});
	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		close: async () => {
			httpServer.closeAllConnections?.();
			await new Promise<void>((resolve) => httpServer.close(() => resolve()));
		},
	};
}

async function mcpRequest(
	baseUrl: string,
	body: unknown,
	extraHeaders?: Record<string, string>,
): Promise<{ status: number; headers: Headers; json: () => Promise<unknown> }> {
	const res = await fetch(`${baseUrl}/mcp`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			// MCP streamable HTTP requires an Accept of application/json
			// and/or text/event-stream (406 otherwise).
			accept: "application/json, text/event-stream",
			...extraHeaders,
		},
		body: JSON.stringify(body),
	});
	return { status: res.status, headers: res.headers, json: () => res.json() };
}

async function initialize(
	baseUrl: string,
	extraHeaders?: Record<string, string>,
): Promise<string> {
	const { status, headers } = await mcpRequest(
		baseUrl,
		{
			jsonrpc: "2.0",
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "axiom-mcp-test", version: "0.0.0" },
			},
			id: 1,
		},
		extraHeaders,
	);
	assert.equal(status, 200, "initialize must return 200");
	const sessionId = headers.get("mcp-session-id");
	assert.ok(sessionId, "initialize must set mcp-session-id header");
	return sessionId;
}

test("MCP tools/list exposes the six read-only tools (auth disabled)", async () => {
	const prev = process.env.AXIOM_DISABLE_AUTH;
	process.env.AXIOM_DISABLE_AUTH = "true";
	const booted = await boot(makeConfig());
	try {
		const sessionId = await initialize(booted.baseUrl);
		const res = await mcpRequest(
			booted.baseUrl,
			{ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 },
			{ "mcp-session-id": sessionId },
		);
		assert.equal(res.status, 200);
		const payload = (await res.json()) as {
			result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] };
		};
		const names = payload.result.tools.map((t) => t.name).sort();
		assert.deepEqual(names, [
			"get_agent_performance",
			"get_agent_performance_batch",
			"get_events",
			"get_payment_config",
			"list_agents",
			"list_routes",
		]);
		for (const tool of payload.result.tools) {
			assert.equal(
				tool.annotations?.readOnlyHint,
				true,
				`${tool.name} must be read-only`,
			);
		}
	} finally {
		await booted.close();
		process.env.AXIOM_DISABLE_AUTH = prev;
	}
});

test("MCP tools/call list_routes returns real repo route data via the REST facade", async () => {
	const prev = process.env.AXIOM_DISABLE_AUTH;
	process.env.AXIOM_DISABLE_AUTH = "true";
	const booted = await boot(makeConfig());
	try {
		const sessionId = await initialize(booted.baseUrl);
		const res = await mcpRequest(
			booted.baseUrl,
			{
				jsonrpc: "2.0",
				method: "tools/call",
				params: { name: "list_routes", arguments: {} },
				id: 3,
			},
			{ "mcp-session-id": sessionId },
		);
		assert.equal(res.status, 200);
		const payload = (await res.json()) as {
			result: { content: { type: string; text: string }[]; isError?: boolean };
		};
		assert.equal(payload.result.isError, false);
		const text = payload.result.content[0]?.text ?? "";
		const data = JSON.parse(text) as {
			routes: { path: string }[];
			meta: { version: string };
		};
		const paths = data.routes.map((r) => r.path);
		assert.ok(paths.includes("/v1/routes"), "routes include /v1/routes");
		assert.ok(paths.includes("/mcp"), "routes include /mcp");
		assert.ok(
			typeof data.meta.version === "string" && data.meta.version.length > 0,
			"meta.version present",
		);
	} finally {
		await booted.close();
		process.env.AXIOM_DISABLE_AUTH = prev;
	}
});

test("MCP requires the server API key; client keys and no key are rejected", async () => {
	const prevDisable = process.env.AXIOM_DISABLE_AUTH;
	const prevClient = process.env.AXIOM_CLIENT_API_KEY;
	process.env.AXIOM_DISABLE_AUTH = "false";
	process.env.AXIOM_CLIENT_API_KEY = "browser-key";
	const booted = await boot(
		makeConfig({ AXIOM_API_KEY: "server-secret" }),
	);
	try {
		// No key → 401 from the global API-key middleware
		const anon = await mcpRequest(booted.baseUrl, {
			jsonrpc: "2.0",
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "axiom-mcp-test", version: "0.0.0" },
			},
			id: 1,
		});
		assert.equal(anon.status, 401, "no key must be rejected");

		// Client key → 403 (client allowlist denies /mcp)
		const client = await mcpRequest(
			booted.baseUrl,
			{
				jsonrpc: "2.0",
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "axiom-mcp-test", version: "0.0.0" },
				},
				id: 1,
			},
			{ "x-api-key": "browser-key" },
		);
		assert.equal(client.status, 403, "client key must be rejected on /mcp");

		// Server key → initialize succeeds
		const sessionId = await initialize(booted.baseUrl, {
			"x-api-key": "server-secret",
		});
		assert.ok(sessionId.length > 0, "server key initializes a session");
	} finally {
		await booted.close();
		process.env.AXIOM_DISABLE_AUTH = prevDisable;
		process.env.AXIOM_CLIENT_API_KEY = prevClient;
	}
});
