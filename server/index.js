import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3000;
const root = fileURLToPath(new URL('..', import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// No bundler: serve the client as-is and expose Phaser's ESM build.
app.use(express.static(root + 'client'));
app.use('/vendor/phaser', express.static(root + 'node_modules/phaser/dist'));

io.on('connection', (socket) => {
  console.log(`connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Among The Crowd running at http://localhost:${PORT}`);
});
