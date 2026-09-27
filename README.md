# Among The Crowd

> 🚧 **In development.** The core game loop is playable, but expect missing features, placeholder art and breaking changes.

A real-time multiplayer hide-in-the-crowd game for the browser. One player is the **police**. Everyone else is a **hider**, disguised as one of the many NPCs walking around town. Hiders have to complete secret objectives without standing out. The police has to spot who is a real player and arrest them, without wasting tokens on innocent NPCs.

## How to play

1. One player creates a lobby and shares the 4-letter room code.
2. Everyone joins, the host picks the settings, and all players press **Ready**.
3. The host starts the game. One random player becomes the police, and the rest become hiders.

### Hiders
- You look exactly like the NPCs. Move the way they do and don't get noticed.
- You get 3 secret objectives, such as *sit on a bench*, *look into a window* or *run in circles*.
- You **win** if you complete all your objectives and haven't been arrested when the timer runs out.

### Police
- Walk up to someone, face them and press **E** to arrest them.
- Arresting an NPC costs tokens. At 0 tokens you can't arrest anymore.
- You **win** if you arrest every hider, or if no hider has completed their objectives when time runs out.

### Controls

| Key | Hider | Police |
|---|---|---|
| WASD / arrow keys | Walk | Walk |
| E | Use the spot you're on (bench, window, door, mailbox, stall) | Arrest the person you're facing |
| R | Run in circles | – |
| Mouse wheel | Zoom | Zoom |

## Getting started

**Requirements:** [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/AdmiralKeso/AmongTheCrowd.git
cd AmongTheCrowd
npm install
npm run dev
```

Open http://localhost:3000. To test multiplayer on one computer, open the game in two or more browser windows.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the server and restarts it when files change |
| `npm start` | Starts the server |

Set the `PORT` environment variable to use a port other than 3000.

**Map preview:** http://localhost:3000/?test=map opens the map without starting a game. It has a free camera and a debug overlay (press **O**) that shows collision, spawn points and objective spots.

## Status

**Working**
- Lobbies with room codes: join, ready up, kick players, host settings (round time, NPC count, police tokens)
- Random roles, with hiders mixed into an NPC crowd
- Tile-based movement for everyone, with collision and walk animations
- NPCs that wander, stop at benches, shops and windows, and do the same actions as hiders
- Hider objectives (E and R) and police arrests (E) with a token cost
- Round timer, results screen with the real players revealed, and back to the lobby

**Planned**
- Police abilities and calling in backup (spending tokens)
- Handling the police leaving mid-game
- A real police sprite and action sprites (the emoji above characters are placeholders)
- Accounts, a profile and stats (database)
- Bigger maps

## Tech stack

- **Server:** Node.js, [Express](https://expressjs.com/) and [Socket.IO](https://socket.io/). The server is authoritative: it runs the game loop, and clients only send input.
- **Client:** [Phaser 4](https://phaser.io/), loaded as plain ES modules. There is **no bundler or build step**.
- **Maps:** made in [Tiled](https://www.mapeditor.org/) and saved as JSON. The server and client read the same map file.

## Project structure

```
client/                 Browser game (served as static files)
  index.html            Entry page with the import map for Phaser and Socket.IO
  src/scenes/           Phaser scenes: Boot, Preload, Menu, Lobby, Game, UI (HUD)
  src/                  Socket connection, sprite mapping, UI helpers
  assets/maps/          Tiled maps (JSON)
  assets/tilesets/      Tileset images
  assets/vendor/        Original third-party asset packs
server/
  index.js              Express + Socket.IO entry point
  lobbies.js            Lobby management
  game.js               Game setup, roles, results
  simulation.js         Game loop: movement, NPC behaviour, actions, arrests
  maps.js               Reads Tiled maps (collision, spawns, objective spots)
  handlers/             Socket.IO event handlers
shared/                 Rules used by both server and client
AGENTS.md               Detailed design and conventions (see below)
```

## Contributing / design notes

[AGENTS.md](AGENTS.md) is the source of truth for game rules, the socket event protocol, map conventions and coding conventions. It's written for both humans and AI coding assistants. Please keep it up to date when you change behaviour.

The most important rule: **the police must never be able to tell a hider from an NPC from network data.** Hiders and NPCs share appearances, spawn randomly, move and act on the same server ticks, and are sent in identical message formats. Any new feature has to keep that true.

## Credits

- Art: [RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) by [Kenney](https://kenney.nl) (CC0)

## License

The code is released under the [MIT License](LICENSE). Third-party assets in `client/assets/vendor/` keep their own licenses (see the license file in each pack).
