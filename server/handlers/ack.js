import { LobbyError } from '../lobbies.js';

// Registers a client → server event that answers through the acknowledgement:
// { ok: true, ...handlerResult } or { ok: false, error }.
export function onRequest(socket, event, handler) {
  socket.on(event, (payload, callback) => {
    if (typeof callback !== 'function') return;
    const data = payload && typeof payload === 'object' ? payload : {};
    try {
      callback({ ok: true, ...handler(data) });
    } catch (err) {
      if (err instanceof LobbyError) {
        callback({ ok: false, error: err.message });
      } else {
        console.error(`${event} failed:`, err);
        callback({ ok: false, error: 'Something went wrong on the server' });
      }
    }
  });
}
