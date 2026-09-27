import * as Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Assets needed to draw the loading screen go here.
  }

  create() {
    this.scene.start('PreloadScene');
  }
}
