import { LobbyError, lobbyState } from '../lobbies.js';

export function registerLobbyHandlers(io, socket, lobbies) {
  const playerId = socket.id;

  const broadcast = (lobby) => {
    if (lobby.players.size > 0) io.to(lobby.code).emit('lobby:state', lobbyState(lobby));
  };

  // Every client → server event answers through the acknowledgement: { ok: true, ... } or { ok: false, error }.
  const on = (event, handler) => {
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
  };

  on('lobby:create', ({ name }) => {
    const lobby = lobbies.create(playerId, name);
    socket.join(lobby.code);
    return { lobby: lobbyState(lobby) };
  });

  on('lobby:join', ({ code, name }) => {
    const lobby = lobbies.join(playerId, code, name);
    socket.join(lobby.code);
    broadcast(lobby);
    return { lobby: lobbyState(lobby) };
  });

  on('lobby:leave', () => {
    const lobby = lobbies.leave(playerId);
    if (lobby) {
      socket.leave(lobby.code);
      broadcast(lobby);
    }
    return {};
  });

  on('lobby:kick', ({ playerId: targetId }) => {
    const lobby = lobbies.kick(playerId, targetId);
    const target = io.sockets.sockets.get(targetId);
    if (target) {
      target.leave(lobby.code);
      target.emit('lobby:kicked');
    }
    broadcast(lobby);
    return {};
  });

  on('lobby:ready', ({ ready }) => {
    broadcast(lobbies.setReady(playerId, ready));
    return {};
  });

  on('lobby:settings', (changes) => {
    broadcast(lobbies.updateSettings(playerId, changes));
    return {};
  });

  socket.on('disconnect', () => {
    const lobby = lobbies.leave(playerId);
    if (lobby) broadcast(lobby);
  });
}
