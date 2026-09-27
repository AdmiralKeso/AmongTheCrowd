import { createGame, gameResults, publicState, roleFor } from '../game.js';
import { LobbyError, lobbyState } from '../lobbies.js';
import { DIRECTIONS, startSimulation } from '../simulation.js';
import { onRequest } from './ack.js';

export function registerGameHandlers(io, socket, lobbies, map) {
  const playerId = socket.id;

  // The game and this player's character, if this player is still playing (not left, not arrested).
  const current = () => {
    const game = lobbies.getByPlayer(playerId)?.game;
    const player = game?.players.get(playerId);
    const character = player && game.characters.get(player.characterId);
    return character?.playerId === playerId && !character.arrested ? { game, player, character } : null;
  };

  const requireRole = (role) => {
    const found = current();
    if (!found) throw new LobbyError("You're not in the game");
    if (found.player.role !== role) throw new LobbyError(`Only the ${role === 'hider' ? 'hiders' : 'police'} can do that`);
    return found;
  };
  const requireHider = () => requireRole('hider');

  onRequest(socket, 'game:start', () => {
    const lobby = lobbies.startGame(playerId, (l) => createGame(l, map));
    const { game } = lobby;

    // Each player privately learns their role first, then everyone gets the public state.
    for (const id of lobby.players.keys()) {
      io.to(id).emit('game:role', roleFor(game, id));
    }
    io.to(game.policeId).emit('game:tokens', { tokens: game.tokens });
    io.to(lobby.code).emit('game:state', publicState(game));

    // Reveal the results, then everyone is back in the lobby.
    const finish = (reason) => {
      game.sim.stop();
      io.to(lobby.code).emit('game:ended', gameResults(game, reason));
      lobbies.finishGame(lobby);
      io.to(lobby.code).emit('lobby:state', lobbyState(lobby));
    };

    game.finish = finish;
    game.sim = startSimulation(game, map, {
      emit: (event, payload) => io.to(lobby.code).emit(event, payload),
      emitToPlayer: (id, event, payload) => io.to(id).emit(event, payload),
      onTimeUp: () => finish('time'),
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

  onRequest(socket, 'game:arrest', () => {
    const { game, character } = requireRole('police');
    const { error, wasPlayer } = game.sim.arrest(character);
    if (error) throw new LobbyError(error);
    if (!wasPlayer) io.to(playerId).emit('game:tokens', { tokens: game.tokens });

    // Every hider still in the game is arrested: the police wins right away.
    const hidersLeft = [...game.players.entries()].filter(([id, p]) => {
      const c = game.characters.get(p.characterId);
      return p.role === 'hider' && !p.arrested && c.playerId === id;
    });
    if (hidersLeft.length === 0) game.finish('arrested');
    return { wasPlayer, tokens: game.tokens };
  });
}
