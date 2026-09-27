import { createGame, publicState, roleFor } from '../game.js';
import { DIRECTIONS, startSimulation } from '../simulation.js';
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

    game.stopSimulation = startSimulation(game, map, (event, payload) => io.to(lobby.code).emit(event, payload));
    return {};
  });

  // Fire-and-forget (no acknowledgement): sent whenever the held direction changes.
  socket.on('game:move', (payload) => {
    const game = lobbies.getByPlayer(playerId)?.game;
    const player = game?.players.get(playerId);
    if (!player) return;
    const direction = payload?.direction;
    const character = game.characters.get(player.characterId);
    if (character.playerId !== playerId) return;
    character.input = Object.hasOwn(DIRECTIONS, direction) ? direction : null;
  });
}
