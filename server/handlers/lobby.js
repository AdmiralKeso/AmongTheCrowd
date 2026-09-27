import { lobbyState } from '../lobbies.js';
import { releaseCharacter } from '../simulation.js';
import { onRequest } from './ack.js';

export function registerLobbyHandlers(io, socket, lobbies) {
  const playerId = socket.id;

  const broadcast = (lobby) => {
    if (lobby.players.size > 0) io.to(lobby.code).emit('lobby:state', lobbyState(lobby));
  };

  const on = (event, handler) => onRequest(socket, event, handler);

  // Used for leaving and disconnecting. Returns the lobby that was left, or null.
  const leave = () => {
    const lobby = lobbies.leave(playerId);
    if (!lobby) return null;
    socket.leave(lobby.code);
    if (lobby.game) {
      if (lobby.players.size === 0) lobby.game.sim?.stop();
      else releaseCharacter(lobby.game, playerId);
    }
    broadcast(lobby);
    return lobby;
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
    leave();
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

  socket.on('disconnect', leave);
}
