import * as Phaser from 'phaser';
import { request, socket } from '../socket.js';
import { characterFrame, flipForDirection, walkAnimationKey } from '../sprites.js';
import { WRONG_ARREST_COST } from '/shared/gameRules.js';

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
// Shown above a character during a spot action (placeholder until there are action sprites).
const ACTION_EMOTES = { sit: '💤', look: '👀', knock: '✊', post: '✉️', buy: '🛒' };
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
    for (const { characterId, appearanceId, x, y, direction } of this.state.characters) {
      const sprite = this.add.sprite(x, y, 'kenney', characterFrame(appearanceId, direction))
        .setFlipX(flipForDirection(direction))
        .setDepth(CHARACTER_DEPTH + y);
      sprite.appearanceId = appearanceId;
      this.characters.set(characterId, sprite);
    }

    const listeners = {
      'character:moved': (move) => this.moveCharacter(move),
      'character:action': (action) => this.showAction(action),
      'game:arrested': (arrest) => this.removeArrested(arrest),
      'game:ended': (ended) => this.endGame(ended),
      'lobby:state': (lobby) => { this.lobby = lobby; }, // sent right after game:ended, for "Back to lobby"
    };
    for (const [event, fn] of Object.entries(listeners)) socket.on(event, fn);
    this.events.once('shutdown', () => {
      for (const [event, fn] of Object.entries(listeners)) socket.off(event, fn);
    });

    // Only this client knows which character is theirs; mark it locally and follow it.
    this.mine = this.characters.get(this.role?.characterId);
    if (this.mine) {
      this.arrow = this.add.triangle(0, 0, 0, 0, 6, 0, 3, 4, 0xffe066).setDepth(LAYER_DEPTHS.above + 1);
      this.cameras.main.startFollow(this.mine, true);
      this.setupMovementInput();
      if (this.role.role === 'hider') this.setupObjectiveInput();
      if (this.role.role === 'police') this.setupArrestInput();
    }
  }

  // E: do the action of the spot you're on. R: run in circles.
  setupObjectiveInput() {
    const send = async (event) => {
      const res = await request(event);
      if (!res.ok && this.sys.isActive()) this.scene.get('UIScene').showMessage(res.error);
    };
    this.input.keyboard.on('keydown-E', () => send('game:interact'));
    this.input.keyboard.on('keydown-R', () => send('game:circles'));
  }

  // Police E: arrest whoever you're facing.
  setupArrestInput() {
    this.input.keyboard.on('keydown-E', async () => {
      const res = await request('game:arrest');
      if (!this.sys.isActive()) return;
      const ui = this.scene.get('UIScene');
      if (!res.ok) ui.showMessage(res.error);
      else if (res.wasPlayer) ui.showMessage('You caught a hider!');
      else ui.showMessage(`That was an NPC! -${WRONG_ARREST_COST} tokens`);
    });
  }

  // game:arrested — the character is taken off the map. If it's yours, you're out and can look around.
  removeArrested({ characterId }) {
    const sprite = this.characters.get(characterId);
    if (!sprite) return;
    this.characters.delete(characterId);
    sprite.moveTween?.stop();
    sprite.idleTimer?.remove();
    const siren = this.add.text(sprite.x, sprite.y - 10, '🚨', { fontSize: '8px', resolution: 8 })
      .setOrigin(0.5, 1).setDepth(LAYER_DEPTHS.above + 1);
    this.tweens.add({
      targets: [sprite, siren],
      alpha: 0,
      delay: 600,
      duration: 400,
      onComplete: () => { sprite.destroy(); siren.destroy(); },
    });

    if (characterId === this.role?.characterId) {
      this.spectating = true;
      this.arrow?.destroy();
      this.arrow = null;
      this.cameras.main.stopFollow();
      this.scene.get('UIScene').showMessage("You've been arrested! You're out. Use WASD to look around.");
    }
  }

  // game:ended — label the players' characters on the map and show the results.
  endGame(ended) {
    for (const r of ended.results) {
      const sprite = this.characters.get(r.characterId);
      if (!sprite) continue;
      const color = r.role === 'police' ? '#6fa0ff' : '#ffd966';
      this.add.text(sprite.x, sprite.y - 10, r.name, {
        fontFamily: 'monospace', fontSize: '8px', color, resolution: 8,
        backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1).setDepth(LAYER_DEPTHS.above + 2);
    }
    this.scene.get('UIScene').showResults(ended, () => {
      if (this.lobby) this.scene.start('LobbyScene', { lobby: this.lobby });
    });
  }

  // character:action — someone (NPC or player) does a spot action: face that way and show an emote.
  showAction({ characterId, action, direction, duration }) {
    const sprite = this.characters.get(characterId);
    if (!sprite) return;
    sprite.idleTimer?.remove();
    sprite.anims.stop();
    sprite.setFlipX(flipForDirection(direction));
    sprite.setFrame(characterFrame(sprite.appearanceId, direction));

    const emote = this.add.text(sprite.x, sprite.y - 12, ACTION_EMOTES[action] ?? '…', {
      fontFamily: 'sans-serif', fontSize: '8px', color: '#ffffff', resolution: 8,
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 1, y: 0 },
    }).setOrigin(0.5, 1).setDepth(LAYER_DEPTHS.above + 1);
    this.time.delayedCall(duration, () => emote.destroy());
  }

  // Held direction keys, most recent last. The server gets the current one whenever it changes.
  setupMovementInput() {
    const keyDirections = {
      W: 'up', UP: 'up', S: 'down', DOWN: 'down', A: 'left', LEFT: 'left', D: 'right', RIGHT: 'right',
    };
    const held = []; // key names, most recently pressed last
    let sent = null;

    const sendIfChanged = () => {
      const direction = keyDirections[held.at(-1)] ?? null;
      if (direction === sent) return;
      sent = direction;
      socket.emit('game:move', { direction });
    };

    for (const keyName of Object.keys(keyDirections)) {
      const key = this.keys[keyName];
      key.on('down', () => {
        if (!held.includes(keyName)) held.push(keyName); // ignore key auto-repeat
        sendIfChanged();
      });
      key.on('up', () => {
        const i = held.indexOf(keyName);
        if (i !== -1) held.splice(i, 1);
        sendIfChanged();
      });
    }

    // Don't keep walking when the window loses focus with a key held down.
    const release = () => { held.length = 0; sendIfChanged(); };
    this.game.events.on('blur', release);
    this.events.once('shutdown', () => this.game.events.off('blur', release));
  }

  // character:moved — the same for NPCs and players. duration 0 means turning on the spot.
  moveCharacter({ characterId, x, y, direction, duration }) {
    const sprite = this.characters.get(characterId);
    if (!sprite) return;

    sprite.setFlipX(flipForDirection(direction));
    sprite.idleTimer?.remove();

    if (duration === 0) {
      sprite.anims.stop();
      sprite.setFrame(characterFrame(sprite.appearanceId, direction));
      return;
    }

    sprite.play(walkAnimationKey(sprite.appearanceId, direction), true);
    sprite.moveTween?.stop();
    if (Phaser.Math.Distance.Between(sprite.x, sprite.y, x, y) > TILE_SIZE * 2) {
      sprite.setPosition(x, y); // too far behind (e.g. tab was in the background): snap
    }
    sprite.moveTween = this.tweens.add({
      targets: sprite,
      x,
      y,
      duration,
      onUpdate: () => sprite.setDepth(CHARACTER_DEPTH + sprite.y),
      onComplete: () => {
        // Stop the walk animation unless the next step arrives right away.
        sprite.idleTimer = this.time.delayedCall(80, () => {
          sprite.anims.stop();
          sprite.setFrame(characterFrame(sprite.appearanceId, direction));
        });
      },
    });
  }

  update(time, delta) {
    if (this.arrow) {
      this.arrow.setPosition(this.mine.x, this.mine.y - 12 + Math.sin(time / 150));
    }

    // Free camera in the ?test=map preview and when you've been arrested; otherwise the keys walk your character.
    if (!this.debug && !this.spectating) return;
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
