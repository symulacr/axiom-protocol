import { WebSocket } from "ws";
import { bigintReplacer } from "@axiom/config/types/bigint";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("ws");

export interface ConnectedClient {
  socket: WebSocket;
  topics: Set<string>;
  missedPings: number;
}

const _clients = new Set<ConnectedClient>();
const _clientIds = new WeakMap<WebSocket, string>();
const _clientMap = new Map<string, ConnectedClient>();
// Reverse index: subscription prefix -> subscribed clients, for cheap fan-out.
const _topicIndex = new Map<string, Set<ConnectedClient>>();

function topicPrefixOf(topic: string): string {
  return topic.replace("*", "");
}

function indexAdd(client: ConnectedClient): void {
  for (const topic of client.topics) {
    const prefix = topicPrefixOf(topic);
    let set = _topicIndex.get(prefix);
    if (!set) {
      set = new Set();
      _topicIndex.set(prefix, set);
    }
    set.add(client);
  }
}

function indexRemove(client: ConnectedClient): void {
  for (const topic of client.topics) {
    const prefix = topicPrefixOf(topic);
    const set = _topicIndex.get(prefix);
    if (set) {
      set.delete(client);
      if (set.size === 0) _topicIndex.delete(prefix);
    }
  }
}

export function broadcast(topic: string, payload: unknown): void {
  const msg = JSON.stringify(
    { topic, payload, ts: Date.now() },
    bigintReplacer,
  );
  const prefix = topicPrefixOf(topic);
  const subscribed = _topicIndex.get(prefix);
  if (!subscribed || subscribed.size === 0) return;

  for (const c of subscribed) {
    if (c.socket.readyState !== c.socket.OPEN) continue;
    if (c.socket.bufferedAmount > 65536) continue;
    try {
      c.socket.send(msg);
    } catch (err) {
      log.warn("broadcast send failed for client, removing", {
        error: extractErrorMessage(err),
      });
      c.socket.terminate();
      unregisterClient(c);
    }
  }
}

export function registerClient(client: ConnectedClient): string {
  const id = crypto.randomUUID();
  _clients.add(client);
  _clientIds.set(client.socket, id);
  _clientMap.set(id, client);
  indexAdd(client);
  return id;
}

export function unregisterClient(client: ConnectedClient): void {
  indexRemove(client);
  _clients.delete(client);
  const id = _clientIds.get(client.socket);
  if (id) {
    _clientMap.delete(id);
    _clientIds.delete(client.socket);
  }
}

export function getClients(): Set<ConnectedClient> {
  return _clients;
}

export function sendToTopic(topicPrefix: string, data: unknown): number {
  const msg = JSON.stringify(
    { topic: topicPrefix, payload: data, ts: Date.now() },
    bigintReplacer,
  );
  let sent = 0;
  const seen = new Set<ConnectedClient>();
  for (const [prefix, clients] of _topicIndex) {
    if (!topicPrefix.startsWith(prefix)) continue;
    for (const client of clients) {
      if (seen.has(client)) continue;
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      try {
        client.socket.send(msg);
        sent++;
        seen.add(client);
      } catch (err) {
        log.warn("sendToTopic failed for client, removing", {
          error: extractErrorMessage(err),
        });
        client.socket.terminate();
        unregisterClient(client);
      }
    }
  }
  return sent;
}
