import { randomInt } from 'node:crypto';
import { CODE_LENGTH, MAX_PLAYERS, MIN_PLAYERS, NAME_MAX_LENGTH, SETTINGS, defaultSettings } from '../shared/lobbyRules.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0

// Errors with a message that is safe to show to the player.
export class LobbyError extends Error {}

// In-memory lobby store. Lobbies disappear when the server restarts.
export class LobbyManager {
  #lobbies = new Map(); // code -> lobby
  #playerLobby = new Map(); // playerId -> code

  create(playerId, name) {
    this.#assertNotInLobby(playerId);
    const lobby = {
      code: this.#newCode(),
      hostId: playerId,
      players: new Map(), // playerId -> { id, name, ready }
      settings: defaultSettings(),
      game: null, // set by startGame; holds hidden info, never send it as-is
    };
    this.#lobbies.set(lobby.code, lobby);
    this.#addPlayer(lobby, playerId, name);
    return lobby;
  }

  join(playerId, code, name) {
    this.#assertNotInLobby(playerId);
    const lobby = this.#lobbies.get(String(code ?? '').trim().toUpperCase());
    if (!lobby) throw new LobbyError('Lobby not found');
    if (lobby.game) throw new LobbyError('This game has already started');
    if (lobby.players.size >= MAX_PLAYERS) throw new LobbyError('Lobby is full');
    this.#addPlayer(lobby, playerId, name);
    return lobby;
  }

  // Returns the lobby the player left (with no players if it was removed), or null.
  leave(playerId) {
    const lobby = this.getByPlayer(playerId);
    if (!lobby) return null;

    lobby.players.delete(playerId);
    this.#playerLobby.delete(playerId);

    if (lobby.players.size === 0) {
      this.#lobbies.delete(lobby.code);
    } else if (lobby.hostId === playerId) {
      lobby.hostId = lobby.players.keys().next().value; // longest-present player becomes host
    }
    return lobby;
  }

  kick(hostId, targetId) {
    const lobby = this.#requireHost(hostId);
    this.#assertNotInGame(lobby);
    if (targetId === hostId) throw new LobbyError("You can't kick yourself");
    if (!lobby.players.has(targetId)) throw new LobbyError('Player is not in this lobby');
    this.leave(targetId);
    return lobby;
  }

  setReady(playerId, ready) {
    const lobby = this.#require(playerId);
    this.#assertNotInGame(lobby);
    lobby.players.get(playerId).ready = ready === true;
    return lobby;
  }

  updateSettings(hostId, changes) {
    const lobby = this.#requireHost(hostId);
    this.#assertNotInGame(lobby);
    for (const [key, value] of Object.entries(changes)) {
      if (!Object.hasOwn(SETTINGS, key)) throw new LobbyError(`Unknown setting: ${key}`);
      const rule = SETTINGS[key];
      if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
        throw new LobbyError(`${rule.label} must be between ${rule.min} and ${rule.max}`);
      }
    }
    Object.assign(lobby.settings, changes);
    // Everyone must confirm again after the rules change.
    for (const player of lobby.players.values()) player.ready = false;
    return lobby;
  }

  // createGame(lobby) builds the game state (see server/game.js).
  startGame(hostId, createGame) {
    const lobby = this.#requireHost(hostId);
    this.#assertNotInGame(lobby);
    const players = [...lobby.players.values()];
    if (players.length < MIN_PLAYERS) throw new LobbyError(`You need at least ${MIN_PLAYERS} players`);
    if (!players.every((p) => p.ready)) throw new LobbyError('Not everyone is ready');
    lobby.game = createGame(lobby);
    return lobby;
  }

  getByPlayer(playerId) {
    const code = this.#playerLobby.get(playerId);
    return code ? this.#lobbies.get(code) : null;
  }

  #addPlayer(lobby, playerId, rawName) {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) throw new LobbyError('Enter a name');
    if (name.length > NAME_MAX_LENGTH) throw new LobbyError(`Name can be at most ${NAME_MAX_LENGTH} characters`);
    for (const player of lobby.players.values()) {
      if (player.name.toLowerCase() === name.toLowerCase()) throw new LobbyError('That name is already taken in this lobby');
    }
    lobby.players.set(playerId, { id: playerId, name, ready: false });
    this.#playerLobby.set(playerId, lobby.code);
  }

  #assertNotInLobby(playerId) {
    if (this.#playerLobby.has(playerId)) throw new LobbyError('You are already in a lobby');
  }

  #assertNotInGame(lobby) {
    if (lobby.game) throw new LobbyError('The game has already started');
  }

  #require(playerId) {
    const lobby = this.getByPlayer(playerId);
    if (!lobby) throw new LobbyError('You are not in a lobby');
    return lobby;
  }

  #requireHost(playerId) {
    const lobby = this.#require(playerId);
    if (lobby.hostId !== playerId) throw new LobbyError('Only the host can do that');
    return lobby;
  }

  #newCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (this.#lobbies.has(code));
    return code;
  }
}

// What clients receive in `lobby:state`.
export function lobbyState(lobby) {
  return {
    code: lobby.code,
    hostId: lobby.hostId,
    players: [...lobby.players.values()].map(({ id, name, ready }) => ({ id, name, ready })),
    settings: { ...lobby.settings },
  };
}
