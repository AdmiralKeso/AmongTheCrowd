import { randomBytes, randomInt } from 'node:crypto';
import { CROWD_APPEARANCES, POLICE_APPEARANCE } from '../shared/appearances.js';
import { LobbyError } from './lobbies.js';

export const OBJECTIVES_PER_HIDER = 3; // TBD: final number

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Creates a new game for the lobby's players. The returned object holds hidden info
// (character -> player mapping, roles) and must never be sent to clients as-is.
export function createGame(lobby, map) {
  const { npcCount, roundTime, startingTokens } = lobby.settings;
  const [policeId, ...hiderIds] = shuffle([...lobby.players.keys()]);

  const crowdSize = hiderIds.length + npcCount;
  if (map.crowdSpawns.length < crowdSize) throw new LobbyError('The map is too small for this many NPCs');

  const characters = new Map(); // characterId -> { id, kind, playerId, appearanceId, x, y }
  const players = new Map(); // playerId -> { role, characterId, objectives? }

  const addCharacter = (kind, playerId, appearanceId, { x, y }) => {
    let id;
    do { id = randomBytes(4).toString('hex'); } while (characters.has(id)); // random ids: order reveals nothing
    characters.set(id, { id, kind, playerId, appearanceId, x, y });
    return id;
  };

  const policeSpawn = map.policeSpawns[randomInt(map.policeSpawns.length)];
  players.set(policeId, { role: 'police', characterId: addCharacter('police', policeId, POLICE_APPEARANCE, policeSpawn) });

  // Hiders and NPCs are mixed before they get positions and appearances from the same pools,
  // so nothing about where or how a character starts gives away a player.
  const spawns = shuffle(map.crowdSpawns);
  const crowd = shuffle([...hiderIds, ...Array(npcCount).fill(null)]);
  crowd.forEach((playerId, i) => {
    const appearanceId = CROWD_APPEARANCES[randomInt(CROWD_APPEARANCES.length)];
    const characterId = addCharacter(playerId ? 'hider' : 'npc', playerId, appearanceId, spawns[i]);
    if (playerId) {
      const objectives = shuffle(map.objectives).slice(0, OBJECTIVES_PER_HIDER)
        .map(({ objectiveId, type }) => ({ objectiveId, type, done: false }));
      players.set(playerId, { role: 'hider', characterId, objectives });
    }
  });

  return {
    phase: 'playing',
    endsAt: Date.now() + roundTime * 1000,
    policeId,
    tokens: startingTokens,
    characters,
    players,
  };
}

// `game:state` — safe for everyone: no player ids, no kinds.
export function publicState(game) {
  return {
    phase: game.phase,
    endsAt: game.endsAt,
    characters: [...game.characters.values()].map(({ id, appearanceId, x, y }) => ({ characterId: id, appearanceId, x, y })),
  };
}

// `game:role` — only for that player.
export function roleFor(game, playerId) {
  const { role, characterId, objectives } = game.players.get(playerId);
  return role === 'hider' ? { role, characterId, objectives } : { role, characterId };
}
