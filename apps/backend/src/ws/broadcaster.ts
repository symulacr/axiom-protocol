import { WebSocket } from "ws";
import { bigintReplacer } from "@axiom/config/types/bigint";

export interface ConnectedClient {
  socket: WebSocket;
  topics: Set<string>;
  missedPings: number;
}

export const MAX_WS_CLIENTS = 1000;

const _clients = new Set<ConnectedClient>();
const _clientIds = new WeakMap<WebSocket, string>();
const _clientMap = new Map<string, ConnectedClient>();

export function broadcast(topic: string, payload: unknown): void {
  const msg = JSON.stringify({ topic, payload, ts: Date.now() }, bigintReplacer);
  for (const c of _clients) {
    if (c.socket.readyState !== c.socket.OPEN) continue;
    if (c.socket.bufferedAmount > 65536) continue;
    try {
      c.socket.send(msg);
    } catch (err) {
      console.warn('[ws] broadcast send failed for client, removing:', err instanceof Error ? err.message : err);
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
  return id;
}

export function unregisterClient(client: ConnectedClient): void {
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
  const msg = JSON.stringify({ topic: topicPrefix, payload: data, ts: Date.now() }, bigintReplacer);
  let sent = 0;
  for (const client of _clients) {
    if (client.socket.readyState !== WebSocket.OPEN) continue;
    if ([...client.topics].some(t => topicPrefix.startsWith(t.replace('*', '')))) {
      try {
        client.socket.send(msg);
        sent++;
      } catch (err) {
        console.warn('[ws] sendToTopic failed for client, removing:', err instanceof Error ? err.message : err);
        client.socket.terminate();
        unregisterClient(client);
      }
    }
  }
  return sent;
}
