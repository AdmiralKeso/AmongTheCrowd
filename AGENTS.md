# Among The Crowd

## Overview
Real-time multiplayer hide-in-the-crowd game (one police vs. hiders disguised as NPCs). Node + Express backend, Socket.IO for live game state, Phaser 4 client.

## Commands
- `npm run dev` — start server with auto-restart on file changes (http://localhost:3000)
- `npm start` — start server
- Tests: not set up yet

## Architecture
- `server/index.js` — Express app + Socket.IO server; serves `client/` and `shared/` as static files
- `server/lobbies.js` — in-memory `LobbyManager` (lobby logic, validation); throws `LobbyError` with player-facing messages
- `server/handlers/` — Socket.IO event handlers, one file per namespace (e.g. `lobby.js`)
- `shared/` — code used by both server and client (e.g. `lobbyRules.js`: player limits, settings min/max/defaults). Client imports it as `/shared/...`
- `client/` — Phaser frontend (`client/src/scenes/`, `client/assets/`)
- **No bundler (no Vite/webpack).** The client is plain ES modules loaded directly by the browser
  - An import map in `client/index.html` maps `phaser` → `/vendor/phaser/phaser.esm.js` (served from `node_modules/phaser/dist`) and `socket.io-client` → `/socket.io/socket.io.esm.min.js` (served by Socket.IO)
  - Import with `import * as Phaser from 'phaser'` and `import { io } from 'socket.io-client'`
  - Relative imports must include the `.js` extension
  - Use `client/src/socket.js` for the one shared socket connection; don't call `io()` elsewhere. Use its `request(event, payload)` for client → server events (returns `{ ok, ... }`)
  - Menus and forms are HTML panels on top of the canvas (Phaser DOM elements, `addCenteredPanel` in `client/src/ui.js`, styles in `client/ui.css`). Always `escapeHtml` player-provided text
- `"type": "module"`: server code also uses `import`, not `require`

## Game objectives
Hide-in-the-crowd game. One player is the **Police**; all other players are **Hiders** who look exactly like the server-controlled **NPCs** in the crowd. There is no murder or killing.

> Items marked (TBD) are not decided yet. Ask the developer before implementing them.

### Roles
| Role | Count | Objective | Wins when |
|---|---|---|---|
| Police | 1 player | Spot which characters are real players and arrest them | All hiders are arrested |
| Hider | all other players | Blend in with NPCs and complete their secret objectives | All objectives are done, or the round timer runs out (TBD) |
| NPC | server-controlled | Wander, idle and interact like a crowd, so hiders are hard to spot | – |

### Objectives (hiders)
- Each hider gets their own secret objectives, e.g. go to a location or interact with an object (TBD: exact list)
- Doing an objective can look "unnatural", which is the risk hiders take
- NPCs also do these actions sometimes, so doing them isn't automatic proof

### Game flow
1. **Lobby**: host sets settings, players ready up
2. **Role reveal**: each player privately sees their role and, for hiders, their objectives (`game:role`)
3. **Play**: hiders move among NPCs and complete objectives; the police watches and arrests
4. **End**: when a win condition is met; `game:ended` reveals which characters were players

### Rules
- Arresting an NPC costs the police tokens (see Police tokens)
- An arrested character is removed from the map, whether it's a hider or an NPC
- An arrested hider is out of the game: they can't move, interact or complete objectives anymore (TBD: spectate?)
- Round time, NPC count and starting tokens are lobby settings
- The server checks win conditions after every arrest and completed objective

### Police tokens
- The police's starting tokens are a lobby setting (`startingTokens`, set by the host)
- Arresting an NPC by mistake costs tokens (TBD: how many)
- Tokens are spent on abilities and calling in backup (TBD: list of abilities, backup and their costs)
- The server tracks tokens; the client only displays them
- TBD: can tokens be earned (e.g. by arresting a hider)? What happens at 0 tokens?

### Hidden-info rules (critical)
- The police client must never be able to tell a hider from an NPC through network data
- Send **characters** (`characterId`), never `playerId`, for anything on the map; the server alone keeps the character → player mapping
- NPCs and hiders use the same sprites, movement speed and message format
- In-game chat must not reveal which character a player controls (TBD: chat only in lobby and after the game?)

## Sprites & rendering
- Rendering: **Phaser 4** (npm `phaser`). Use Phaser's built-in loader, animations, camera and tilemaps; don't hand-roll canvas drawing
- Phaser only renders and handles input. Game logic lives on the server; the client never uses Phaser physics to decide outcomes
- Game config: `pixelArt: true` (sharp pixels), scale by whole numbers

### Scenes (`client/src/scenes/`)
| Scene | Purpose |
|---|---|
| `BootScene` | Loads the loading-bar assets |
| `PreloadScene` | Loads all sprites, tilesets and maps with a loading bar; creates animations with `this.anims.create` |
| `MenuScene` | Main menu: create lobby, join lobby, settings, profile |
| `LobbyScene` | Room code, player list, ready state, host settings |
| `GameScene` | Map, characters, camera, input |
| `UIScene` | HUD on top of `GameScene` (timer, objectives, police tokens) |

### Sprites
- Sprite sheets live in `client/assets/sprites/`; load with `this.load.spritesheet(key, url, { frameWidth, frameHeight })`
- Animation keys use `appearanceId-action`, e.g. `civilian3-walk`, `civilian3-idle`
- Load everything in `PreloadScene`; never load assets mid-game
- The server never sends image data, only `appearanceId` per character; the client maps it to a sprite sheet key
- Animation state (idle/walk/interact) is decided by the client from movement, so it looks the same for NPCs and hiders
- Hiders and NPCs draw from the **same** pool of appearances, so a sprite never gives away a player
- The police has its own sprite
- Movement from the server (`character:moved`) is smoothed with interpolation (tweens), not snapped
- Characters are drawn top-down with 4 directions: animations per direction, e.g. `civilian3-walk-down`, `civilian3-walk-left`
- Art: **Kenney "RPG Urban Pack"** (https://kenney.nl/assets/rpg-urban-pack), 16×16 pixel art, CC0 (free, no attribution required)
- Tile and sprite size: **16×16**; the camera zooms by whole numbers (e.g. 3×) to keep pixels sharp
- Keep Kenney's original files in `client/assets/vendor/kenney-rpg-urban/` and copy what's used into `sprites/` and `tilesets/`

### Map
- Top-down view, made in **Tiled** and exported as JSON
- Files: `client/assets/maps/<map>.json` + tilesets in `client/assets/tilesets/`; load with `this.load.tilemapTiledJSON` and `this.load.image`
- Embed tilesets in the map (Tiled: "Embed tileset"); Phaser can't load external `.tsx` files
- Tile layers (bottom to top): `ground`, `decoration`, `walls`, `above` (drawn over characters, e.g. treetops, roofs)
- Collision: tiles with the custom property `collides: true` on the `walls` layer
- Object layers:
  - `spawns`: spawn points (`type`: `police`, `hider`, `npc`)
  - `objectives`: interactable objects (`objectId`, `type`)
  - `npcPoints`: places NPCs wander to (benches, shops, ...)
- The server loads the same map JSON for collision, spawns and objective positions, so client and server always agree
- Characters are depth-sorted by their y position, so lower characters are drawn in front

## Conventions
- Server is authoritative; clients never decide game outcomes
- Socket event names use `namespace:action` (lowercase, see Socket events below). Don't invent new events without adding them here.
- Never send hidden info (e.g. which characters are players) to clients that shouldn't see it

## Socket events
Client → server requests use Socket.IO acknowledgements: `callback({ ok: true, ... })` or `callback({ ok: false, error })`.

### Client → server
| Event | Payload | Notes |
|---|---|---|
| `lobby:create` | `{ name }` | Host creates lobby; ack returns `{ lobby }` (same shape as `lobby:state`) |
| `lobby:join` | `{ code, name }` | Join by room code (case-insensitive); ack returns `{ lobby }` |
| `lobby:leave` | – | |
| `lobby:kick` | `{ playerId }` | Host only |
| `lobby:settings` | `{ ...settings }` | Host only; validated against `shared/lobbyRules.js`; resets everyone's ready state |
| `lobby:ready` | `{ ready }` | |
| `game:start` | – | Host only, all players ready |
| `game:move` | `{ x, y }` | Canvas position; server validates |
| `game:interact` | `{ objectId }` | Hider does an objective action; server validates range |
| `game:arrest` | `{ characterId }` | Police only |
| `game:ability` | `{ abilityId, targetId? }` | Police only; server checks and deducts tokens |
| `chat:send` | `{ text }` | |

### Server → client
| Event | Payload | Sent to |
|---|---|---|
| `lobby:state` | `{ code, hostId, players: [{ id, name, ready }], settings }` | Everyone in lobby |
| `lobby:kicked` | – | **Only the kicked player** |
| `game:role` | `{ role, characterId?, objectives? }` | **Only that player** |
| `game:state` | `{ characters: [{ characterId, appearanceId, x, y }], timeLeft, ... }` (no player mapping) | Everyone in game |
| `game:phase` | `{ phase, endsAt }` | Everyone in game |
| `character:moved` | `{ characterId, x, y }` | Everyone in game (NPCs and hiders alike) |
| `game:objective` | `{ objectiveId, done }` | **Only that hider** |
| `game:arrested` | `{ characterId, wasPlayer }` | Everyone in game |
| `game:tokens` | `{ tokens }` | **Only the police** |
| `game:ended` | `{ winner, reveal }` | Everyone in game |
| `chat:message` | `{ playerId, text }` | Allowed recipients |

## Current focus
- Main menu (Create a lobby, Join a lobby, Settings, Profile (Create account, login))
- [x] Lobby + room codes (create/join, ready, kick, host settings, host hand-over)
- [ ] `game:start` (button exists, server handler not built yet)
- Sprite integration for canvas
- Setting up socket connections