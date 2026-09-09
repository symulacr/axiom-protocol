import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import type http from "node:http";
import { Wallet } from "ethers";
import { InMemoryStorage } from "@axiom/config/storage/0g";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Data dir must be pinned before the EventStore singleton is created (file lock).
process.env.AXIOM_DATA_DIR = join(tmpdir(), `axiom-chat-test-${process.pid}`);
// Direct-compute env so createRouterClient builds against the fetch stub.
process.env.AXIOM_COMPUTE_DIRECT_KEY = "test-key";
process.env.AXIOM_COMPUTE_DIRECT_URL = "http://127.0.0.1:1/v1/proxy";

import { registerChatRoutes, healTranscriptMessages } from "./chat.js";
import { getEventStore } from "../events/store.js";
import type { ServerConfig } from "../config-types.js";

const CHAIN_ID = 16602;

function makeConfig(storage?: InMemoryStorage): ServerConfig {
  return {
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: new Wallet("0x" + "44".repeat(32)),
    env: { AXIOM_CHAIN_ID: CHAIN_ID } as ServerConfig["env"],
    ...(storage ? { chatStorage: storage } : {}),
  } as ServerConfig;
}

async function serve(
  config: ServerConfig,
): Promise<{ server: http.Server; url: string }> {
  const app = express();
  app.use(express.json());
  registerChatRoutes(app, config, CHAIN_ID);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${port}` };
}

/* ------------------------------------------------------------------ */
/* B5: terminal SSE trace frame must carry usage when the provider    */
/* sent it — wherever it rode in the stream.                          */
/* ------------------------------------------------------------------ */

const USAGE = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 };
const X_TRACE = {
  request_id: "req-1",
  provider: "0x" + "ab".repeat(20),
  billing: { total_cost: "91425000000000" },
};

function contentChunk(text: string, usage?: unknown): unknown {
  return {
    id: "cmpl-1",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { content: text } }],
    ...(usage !== undefined ? { usage } : {}),
  };
}

function terminalChunk(fields: Record<string, unknown>): unknown {
  return {
    id: "cmpl-1",
    object: "chat.completion.chunk",
    choices: [],
    ...fields,
  };
}

function sseBody(chunks: unknown[]): string {
  return (
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

/** Run one completion against a stubbed upstream stream; return the parsed
 *  {type:"trace"} frame (or null when none was emitted). */
async function runCompletion(
  chunks: unknown[],
): Promise<Record<string, unknown> | null> {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request ? new URL(input.url) : new URL(String(input));
    // Only the compute upstream is stubbed; the test's own request to the
    // local server (and anything else) passes through to the real fetch.
    if (url.port === "1") {
      return new Response(sseBody(chunks), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return prevFetch(input, init);
  }) as typeof fetch;
  const { server, url } = await serve(makeConfig());
  try {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    const frames = text
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice("data: ".length))
      .filter((l) => l !== "[DONE]")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const trace = frames.find((f) => f.type === "trace");
    return (trace?.trace as Record<string, unknown> | undefined) ?? null;
  } finally {
    globalThis.fetch = prevFetch;
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("B5: usage passthrough in the terminal trace frame", () => {
  test("usage on the terminal chunk rides through with x_0g_trace (guard)", async () => {
    const trace = await runCompletion([
      contentChunk("hello"),
      terminalChunk({ usage: USAGE, x_0g_trace: X_TRACE }),
    ]);
    assert.ok(trace, "trace frame emitted");
    assert.deepEqual(trace.usage, USAGE);
    assert.equal(trace.request_id, "req-1");
  });

  test("usage on a non-terminal chunk survives into the trace frame", async () => {
    // Provider shape B5 covers: token counts on the last content chunk, billing
    // on the empty-choices terminal chunk — the old first-capture logic dropped it.
    const trace = await runCompletion([
      contentChunk("hello", USAGE),
      terminalChunk({ x_0g_trace: X_TRACE }),
    ]);
    assert.ok(trace, "trace frame emitted");
    assert.deepEqual(trace.usage, USAGE);
    assert.equal(trace.request_id, "req-1");
  });

  test("usage and x_0g_trace split across two terminal chunks merge", async () => {
    const trace = await runCompletion([
      contentChunk("hello"),
      terminalChunk({ usage: USAGE }),
      terminalChunk({ x_0g_trace: X_TRACE }),
    ]);
    assert.ok(trace, "trace frame emitted");
    assert.deepEqual(trace.usage, USAGE);
    assert.equal(trace.request_id, "req-1");
  });

  test("a usage-only stream (no terminal chunk at all) still earns a frame", async () => {
    const trace = await runCompletion([contentChunk("hello", USAGE)]);
    assert.ok(trace, "trace frame emitted for usage-only stream");
    assert.deepEqual(trace.usage, USAGE);
  });

  test("absent usage stays absent — the frame is not fabricated", async () => {
    const trace = await runCompletion([
      contentChunk("hello"),
      terminalChunk({ x_0g_trace: X_TRACE }),
    ]);
    assert.ok(trace, "trace frame emitted");
    assert.equal(trace?.usage, undefined);
    assert.equal(trace.request_id, "req-1");
  });
});

/* ------------------------------------------------------------------ */
/* B6a: restore-time transcript healing                                */
/* ------------------------------------------------------------------ */

describe("healTranscriptMessages", () => {
  const user = (content: string) => ({ role: "user", content });
  const assistant = (content: string) => ({ role: "assistant", content });
  const assistantWithCalls = {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "call_1", function: { name: "vault_balance", arguments: "{}" } },
    ],
  };
  const tool = (content: string) => ({
    role: "tool",
    content,
    tool_call_id: "call_1",
  });

  test("drops a transcript that opens on an orphan tool block", () => {
    const healed = healTranscriptMessages([
      tool("orphan one"),
      tool("orphan two"),
      user("hi"),
    ]);
    assert.deepEqual(healed, [user("hi")]);
  });

  test("drops a mid-array tool whose assistant lead lacks tool_calls", () => {
    const healed = healTranscriptMessages([
      user("a"),
      assistant("plain text"),
      tool("orphan"),
      user("b"),
    ]);
    assert.deepEqual(healed, [user("a"), assistant("plain text"), user("b")]);
  });

  test("keeps a legal assistant(tool_calls) → tool block intact", () => {
    const msgs = [
      user("balance?"),
      assistantWithCalls,
      tool("1.0 OG"),
      tool("meta ok"),
      assistant("1.0 OG"),
    ];
    assert.deepEqual(healTranscriptMessages(msgs), msgs);
  });

  test("an assistant with an empty tool_calls array opens no block", () => {
    const healed = healTranscriptMessages([
      { role: "assistant", content: "x", tool_calls: [] },
      tool("orphan"),
      user("b"),
    ]);
    assert.deepEqual(healed, [
      { role: "assistant", content: "x", tool_calls: [] },
      user("b"),
    ]);
  });

  test("a tool block re-opens after a later assistant with tool_calls", () => {
    const msgs = [
      tool("orphan opener"),
      user("q"),
      assistantWithCalls,
      tool("kept"),
    ];
    assert.deepEqual(healTranscriptMessages(msgs), [
      user("q"),
      assistantWithCalls,
      tool("kept"),
    ]);
  });
});

describe("GET /v1/chat/history heals restored transcripts (B6a)", () => {
  const wallet = new Wallet("0x" + "77".repeat(32));
  const walletKey = wallet.address.toLowerCase();

  async function proofHeaders(): Promise<Record<string, string>> {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await wallet.signMessage(
      `axiom-chat-history-v1:${walletKey}:${ts}`,
    );
    return {
      "x-wallet-address": walletKey,
      "x-wallet-timestamp": String(ts),
      "x-wallet-signature": sig,
    };
  }

  test("an orphan-opening transcript is healed at read; the blob is untouched", async () => {
    const storage = new InMemoryStorage();
    const orphanMessages = [
      { role: "tool", content: "stale result", tool_call_id: "call_9" },
      { role: "user", content: "what is my balance" },
      { role: "assistant", content: "1.0 OG" },
    ];
    const transcript = {
      threadId: walletKey,
      wallet: walletKey,
      messages: orphanMessages,
      msgCount: orphanMessages.length,
      ts: Date.now(),
    };
    const raw = new TextEncoder().encode(JSON.stringify(transcript));
    const { rootHash } = await storage.upload(raw);
    getEventStore().append({
      source: "chat",
      chainId: CHAIN_ID,
      eventName: "transcript",
      blockNumber: 0,
      txHash: rootHash,
      logIndex: 0,
      payload: {
        rootHash,
        threadId: walletKey,
        msgCount: orphanMessages.length,
        ts: transcript.ts,
        wallet: walletKey,
      },
    });

    const { server, url } = await serve(makeConfig(storage));
    try {
      const res = await fetch(`${url}/v1/chat/history?wallet=${walletKey}`, {
        headers: await proofHeaders(),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        count: number;
        transcripts: Array<{
          messages: Array<{ role: string }>;
          msgCount: number;
          healedToolOrphans?: number;
        }>;
      };
      const restored = body.transcripts.find(
        (t) => t.messages.length > 0 && t.healedToolOrphans !== undefined,
      );
      assert.ok(restored, "the healed transcript is in the response");
      assert.deepEqual(
        restored.messages.map((m) => m.role),
        ["user", "assistant"],
      );
      assert.equal(restored.msgCount, 2);
      assert.equal(restored.healedToolOrphans, 1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
    // Stored blob is immutable: the heal happened at read time only.
    const stored = JSON.parse(
      new TextDecoder().decode(await storage.download(rootHash)),
    ) as { messages: unknown[]; msgCount: number };
    assert.equal(stored.messages.length, 3);
    assert.equal(stored.msgCount, 3);
  });

  test("history still 401s without a wallet proof", async () => {
    const { server, url } = await serve(makeConfig(new InMemoryStorage()));
    try {
      const res = await fetch(`${url}/v1/chat/history?wallet=${walletKey}`);
      assert.equal(res.status, 401);
      const body = (await res.json()) as { code?: string };
      assert.equal(body.code, "WALLET_PROOF_INVALID");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
