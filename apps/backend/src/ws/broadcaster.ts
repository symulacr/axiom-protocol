import { type WebSocket } from "ws";
import { stringifyBigIntSafe, bigIntSafe } from "@axiom/config/types/bigint";

export type BroadcastFn = (topic: string, payload: unknown) => void;

export interface ConnectedClient {
  socket: WebSocket;
  topics: Set<string>;
}

export const MAX_WS_CLIENTS = 1000;

const _clients = new Set<ConnectedClient>();

/** Broadcast a payload to all connected WebSocket clients. */
export function broadcast(topic: string, payload: unknown): void {
  const msg = stringifyBigIntSafe({ topic, payload: bigIntSafe(payload), ts: Date.now() });
  for (const c of _clients) {
    if (c.socket.readyState !== c.socket.OPEN) continue;
    if (c.socket.bufferedAmount > 65536) continue;
    try {
      c.socket.send(msg);
    } catch {
      _clients.delete(c);
    }
  }
}

/** Factory returning the shared clients set and broadcast function. */
export function createBroadcaster() {
  return { wsClients: _clients, broadcast };
}

export function registerClient(client: ConnectedClient): void {
  _clients.add(client);
}

export function unregisterClient(client: ConnectedClient): void {
  _clients.delete(client);
}

export function getClients(): Set<ConnectedClient> {
  return _clients;
}
