import { createGame, publicState, roleFor } from '../game.js';
import { LobbyError } from '../lobbies.js';
import { DIRECTIONS, startSimulation } from '../simulation.js';
import { onRequest } from './ack.js';

export function registerGameHandlers(io, socket, lobbies, map) {
  const playerId = socket.id;

  // The game and this player's character, if this player is still controlling one.
  const current = () => {
    const game = lobbies.getByPlayer(playerId)?.game;
    const player = game?.players.get(playerId);
    const character = player && game.characters.get(player.characterId);
    return character?.playerId === playerId ? { game, player, character } : null;
  };

  const requireHider = () => {
    const found = current();
    if (!found) throw new LobbyError("You're not in a game");
    if (found.player.role !== 'hider') throw new LobbyError('Only hiders can do that');
    return found;
  };

  onRequest(socket, 'game:start', () => {
    const lobby = lobbies.startGame(playerId, (l) => createGame(l, map));
    const { game } = lobby;

    // Each player privately learns their role first, then everyone gets the public state.
    for (const id of lobby.players.keys()) {
      io.to(id).emit('game:role', roleFor(game, id));
    }
    io.to(game.policeId).emit('game:tokens', { tokens: game.tokens });
    io.to(lobby.code).emit('game:state', publicState(game));

    game.sim = startSimulation(game, map, {
      emit: (event, payload) => io.to(lobby.code).emit(event, payload),
      emitToPlayer: (id, event, payload) => io.to(id).emit(event, payload),
    });
    return {};
  });

  // Fire-and-forget (no acknowledgement): sent whenever the held direction changes.
  socket.on('game:move', (payload) => {
    const found = current();
    if (!found) return;
    const direction = payload?.direction;
    found.character.input = Object.hasOwn(DIRECTIONS, direction) ? direction : null;
  });

  onRequest(socket, 'game:interact', () => {
    const { game, character } = requireHider();
    const error = game.sim.interact(character);
    if (error) throw new LobbyError(error);
    return {};
  });

  onRequest(socket, 'game:circles', () => {
    const { game, character } = requireHider();
    const error = game.sim.runCircles(character);
    if (error) throw new LobbyError(error);
    return {};
  });
}
