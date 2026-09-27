import { createGame, publicState, roleFor } from '../game.js';
import { onRequest } from './ack.js';

export function registerGameHandlers(io, socket, lobbies, map) {
  const playerId = socket.id;

  onRequest(socket, 'game:start', () => {
    const lobby = lobbies.startGame(playerId, (l) => createGame(l, map));
    const { game } = lobby;

    // Each player privately learns their role first, then everyone gets the public state.
    for (const id of lobby.players.keys()) {
      io.to(id).emit('game:role', roleFor(game, id));
    }
    io.to(game.policeId).emit('game:tokens', { tokens: game.tokens });
    io.to(lobby.code).emit('game:state', publicState(game));
    return {};
  });
}
