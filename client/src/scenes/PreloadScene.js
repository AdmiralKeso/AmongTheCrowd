import * as Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 150, height / 2, 0, 12, 0xffffff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 304, 16).setStrokeStyle(2, 0xffffff);
    this.load.on('progress', (value) => { bar.width = 300 * value; });

    // Load all sprites, tilesets and maps here, e.g.:
    // this.load.spritesheet('civilian1', 'assets/sprites/civilian1.png', { frameWidth: 16, frameHeight: 16 });
    // this.load.image('city-tiles', 'assets/tilesets/city.png');
    // this.load.tilemapTiledJSON('city', 'assets/maps/city.json');
  }

  create() {
    // Create animations here with this.anims.create(...)
    this.scene.start('MenuScene');
  }
}
