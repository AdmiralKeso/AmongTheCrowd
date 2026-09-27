import { io } from 'socket.io-client';

// Single shared connection for all scenes.
export const socket = io();

// Sends a client → server event and resolves with the server's { ok, ... } answer.
export async function request(event, payload = {}) {
  try {
    return await socket.timeout(5000).emitWithAck(event, payload);
  } catch {
    return { ok: false, error: 'The server did not respond' };
  }
}
