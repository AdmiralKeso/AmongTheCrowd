import * as Phaser from 'phaser';
import { socket } from '../socket.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 3, 'Among The Crowd', {
      fontFamily: 'monospace',
      fontSize: '48px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const status = this.add.text(width / 2, height / 3 + 60, 'Connecting...', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    const showStatus = () => {
      status.setText(socket.connected ? 'Connected' : 'Disconnected');
    };
    showStatus();
    socket.on('connect', showStatus);
    socket.on('disconnect', showStatus);
    this.events.once('shutdown', () => {
      socket.off('connect', showStatus);
      socket.off('disconnect', showStatus);
    });
  }
}
