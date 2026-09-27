import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene } from './scenes/MenuScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  pixelArt: true,
  backgroundColor: '#1d1d1d',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene, PreloadScene, MenuScene],
});
