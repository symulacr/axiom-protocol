import { describe, expect, test } from "bun:test";
import type { WebSocket } from "ws";
import {
  broadcast,
  registerClient,
  unregisterClient,
  type ConnectedClient,
} from "./broadcaster.js";

function fakeClient(topics: string[]): {
  client: ConnectedClient;
  sent: string[];
} {
  const sent: string[] = [];
  const socket = {
    readyState: 1, // OPEN
    OPEN: 1, // ws WebSocket exposes the constant on the prototype
    bufferedAmount: 0,
    send: (m: string) => void sent.push(m),
    terminate: () => void 0,
  } as unknown as WebSocket;
  return {
    client: { socket, topics: new Set(topics) },
    sent,
  };
}

describe("ws broadcaster topic matching", () => {
  test("wildcard * subscriber receives every topic (frontend /transactions stream)", () => {
    const wild = fakeClient(["*"]);
    registerClient(wild.client);
    try {
      broadcast("Transfer", { tokenId: "1" });
      broadcast("PaymentSplit", { tokenId: "1" });
      expect(wild.sent.length).toBe(2);
      expect(JSON.parse(wild.sent[0]).topic).toBe("Transfer");
    } finally {
      unregisterClient(wild.client);
    }
  });

  test("trailing-wildcard prefix subscriptions match (agent.*)", () => {
    const prefixSub = fakeClient(["agent.*"]);
    const other = fakeClient(["vault.*"]);
    registerClient(prefixSub.client);
    registerClient(other.client);
    try {
      broadcast("agent.2", {});
      broadcast("vault.9", {});
      expect(prefixSub.sent.length).toBe(1);
      expect(other.sent.length).toBe(1);
    } finally {
      unregisterClient(prefixSub.client);
      unregisterClient(other.client);
    }
  });

  test("exact subscriptions still receive only their topic; no subscribers = no send", () => {
    const exact = fakeClient(["Transfer"]);
    registerClient(exact.client);
    try {
      broadcast("Transfer", {});
      broadcast("Updated", {});
      expect(exact.sent.length).toBe(1);
    } finally {
      unregisterClient(exact.client);
    }
    const lone = fakeClient(["Transfer"]);
    registerClient(lone.client);
    unregisterClient(lone.client);
    broadcast("Transfer", {});
    expect(lone.sent.length).toBe(0);
  });
});
