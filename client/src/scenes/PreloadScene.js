import * as Phaser from 'phaser';
import { createCharacterAnimations } from '../sprites.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 150, height / 2, 0, 12, 0xffffff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 304, 16).setStrokeStyle(2, 0xffffff);
    this.load.on('progress', (value) => { bar.width = 300 * value; });

    this.load.image('city-tiles', 'assets/tilesets/city.png');
    // Same Kenney sheet, cut into 16×16 frames for characters (see src/sprites.js).
    this.load.spritesheet('kenney', 'assets/tilesets/city.png', { frameWidth: 16, frameHeight: 16 });
    this.load.tilemapTiledJSON('city', 'assets/maps/city.json');
  }

  create() {
    createCharacterAnimations(this.anims);

    // Dev shortcut: http://localhost:3000/?test=map opens the map with debug overlay.
    if (new URLSearchParams(location.search).get('test') === 'map') {
      this.scene.start('GameScene', { debug: true });
      return;
    }
    this.scene.start('MenuScene');
  }
}
