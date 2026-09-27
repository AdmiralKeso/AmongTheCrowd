import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { LobbyManager } from './lobbies.js';
import { registerLobbyHandlers } from './handlers/lobby.js';
import { registerGameHandlers } from './handlers/game.js';
import { loadMap } from './maps.js';

const PORT = process.env.PORT || 3000;
const root = fileURLToPath(new URL('..', import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// No bundler: serve the client as-is and expose Phaser's ESM build.
app.use(express.static(root + 'client'));
app.use('/vendor/phaser', express.static(root + 'node_modules/phaser/dist'));
app.use('/shared', express.static(root + 'shared'));

const lobbies = new LobbyManager();
const map = loadMap('city');

io.on('connection', (socket) => {
  console.log(`connected: ${socket.id}`);
  registerLobbyHandlers(io, socket, lobbies);
  registerGameHandlers(io, socket, lobbies, map);

  socket.on('disconnect', () => {
    console.log(`disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Among The Crowd running at http://localhost:${PORT}`);
});
