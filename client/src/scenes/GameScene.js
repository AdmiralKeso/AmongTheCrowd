import * as Phaser from 'phaser';
import { characterFrame } from '../sprites.js';

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const VISIBLE_TILES_WIDE = 24; // default zoom shows about this many tiles across, whatever the window size
const TILE_SIZE = 16;

// Whole-number zoom (keeps pixels sharp) that shows at most VISIBLE_TILES_WIDE tiles across.
function defaultZoom(screenWidth) {
  return Phaser.Math.Clamp(Math.ceil(screenWidth / (VISIBLE_TILES_WIDE * TILE_SIZE)), 2, ZOOM_MAX);
}
const PAN_SPEED = 400; // screen pixels per second

// Depths: tile layers below characters, `above` over everything on the map.
// Characters use CHARACTER_DEPTH + y so lower ones are drawn in front.
export const CHARACTER_DEPTH = 100;
const LAYER_DEPTHS = { ground: 0, decoration: 1, walls: 2, details: 3, above: 100000 };
const MARKER_COLORS = { police: 0x3a6ee8, objective: 0x3ae86b, npcPoint: 0xe83a9c };

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  // data.role / data.state / data.tokens: from game:role, game:state, game:tokens (real game)
  // data.debug: show spawns, objectives, NPC points and collision (used by the ?test=map preview)
  init(data) {
    this.role = data?.role ?? null;
    this.state = data?.state ?? null;
    this.tokens = data?.tokens ?? null;
    this.debug = data?.debug ?? false;
  }

  create() {
    const map = this.make.tilemap({ key: 'city' });
    const tileset = map.addTilesetImage('city', 'city-tiles');
    this.map = map;

    this.layers = {};
    for (const [name, depth] of Object.entries(LAYER_DEPTHS)) {
      this.layers[name] = map.createLayer(name, tileset, 0, 0).setDepth(depth);
    }
    this.layers.walls.setCollisionByProperty({ collides: true });

    const camera = this.cameras.main;
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    camera.setZoom(defaultZoom(this.scale.width));
    camera.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    const onResize = (size) => camera.setZoom(defaultZoom(size.width));
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT');
    this.input.on('wheel', (pointer, objects, dx, dy) => {
      camera.setZoom(Phaser.Math.Clamp(camera.zoom + (dy > 0 ? -1 : 1), ZOOM_MIN, ZOOM_MAX)); // whole numbers only
    });

    if (this.state) this.createCharacters();
    if (this.role) this.scene.launch('UIScene', { role: this.role, tokens: this.tokens, endsAt: this.state.endsAt });
    this.events.once('shutdown', () => this.scene.stop('UIScene'));

    if (this.debug) this.createDebugOverlay(map);
  }

  createCharacters() {
    this.characters = new Map(); // characterId -> sprite
    for (const { characterId, appearanceId, x, y } of this.state.characters) {
      const sprite = this.add.sprite(x, y, 'kenney', characterFrame(appearanceId, 'down'))
        .setDepth(CHARACTER_DEPTH + y);
      this.characters.set(characterId, sprite);
    }

    // Only this client knows which character is theirs; mark it locally.
    const mine = this.characters.get(this.role?.characterId);
    if (mine) {
      const arrow = this.add.triangle(mine.x, mine.y - 12, 0, 0, 6, 0, 3, 4, 0xffe066)
        .setDepth(LAYER_DEPTHS.above + 1);
      this.tweens.add({ targets: arrow, y: arrow.y - 2, duration: 400, yoyo: true, repeat: -1 });
      this.cameras.main.centerOn(mine.x, mine.y);
    }
  }

  update(time, delta) {
    // Camera panning until player movement (game:move) exists.
    const { W, A, S, D, UP, LEFT, DOWN, RIGHT } = this.keys;
    const camera = this.cameras.main;
    const step = (PAN_SPEED * delta) / 1000 / camera.zoom;
    if (A.isDown || LEFT.isDown) camera.scrollX -= step;
    if (D.isDown || RIGHT.isDown) camera.scrollX += step;
    if (W.isDown || UP.isDown) camera.scrollY -= step;
    if (S.isDown || DOWN.isDown) camera.scrollY += step;
  }

  createDebugOverlay(map) {
    const overlay = this.add.container().setDepth(LAYER_DEPTHS.above + 1);

    const collision = this.add.graphics().setAlpha(0.6);
    this.layers.walls.renderDebug(collision, { tileColor: null, collidingTileColor: new Phaser.Display.Color(255, 60, 60, 110) });
    overlay.add(collision);

    const marker = (x, y, color, label) => {
      overlay.add(this.add.circle(x, y, 3, color).setStrokeStyle(1, 0x000000));
      overlay.add(this.add.text(x + 4, y - 4, label, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', resolution: 4 })
        .setShadow(1, 1, '#000000', 0, false, true));
    };

    for (const obj of map.getObjectLayer('spawns').objects) {
      marker(obj.x, obj.y, MARKER_COLORS[obj.type] ?? 0xffffff, obj.type);
    }
    for (const obj of map.getObjectLayer('objectives').objects) {
      overlay.add(this.add.rectangle(obj.x, obj.y, obj.width, obj.height).setOrigin(0).setStrokeStyle(1, MARKER_COLORS.objective));
      marker(obj.x + obj.width / 2, obj.y + obj.height / 2, MARKER_COLORS.objective, obj.name);
    }
    for (const obj of map.getObjectLayer('npcPoints').objects) {
      overlay.add(this.add.circle(obj.x, obj.y, 2, MARKER_COLORS.npcPoint));
    }

    // Help text in plain HTML so camera zoom doesn't scale it.
    const help = document.createElement('div');
    help.className = 'debug-help';
    help.innerHTML = `
      <b>Map test</b><br>
      WASD / arrows: move camera<br>
      Mouse wheel: zoom<br>
      O: toggle overlay<br>
      <span style="color:#3a6ee8">●</span> police spawn
      <span style="color:#3ae86b">■</span> objective
      <span style="color:#e83a9c">●</span> NPC point
      <span style="color:#ff5050">■</span> collision<br>
      Hiders and NPCs spawn on random non-road tiles.
    `;
    document.getElementById('game').appendChild(help);
    this.events.once('shutdown', () => help.remove());

    this.input.keyboard.on('keydown-O', () => overlay.setVisible(!overlay.visible));
  }
}
