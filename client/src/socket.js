import { io } from 'socket.io-client';

// Single shared connection for all scenes.
export const socket = io();
