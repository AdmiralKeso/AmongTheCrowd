import { randomInt } from 'node:crypto';
import { CIRCLES, OBJECTIVE_TYPES } from '../shared/objectives.js';

// Everyone moves on the tile grid at the same speed, and every step and action starts on a tick,
// so a player looks exactly like an NPC (in timing and in network messages).
export const TICK_MS = 50;
export const STEP_TICKS = 5; // 250 ms per tile
export const ACTION_TICKS = 60; // 3 s standing still for a spot action (sit, look, ...)
const CIRCLE_LAPS = 2;

export const DIRECTIONS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

// Square laps of 2×2 tiles, tried in this order until one fits.
const CIRCLE_ROUTES = [
  ['right', 'down', 'left', 'up'],
  ['left', 'down', 'right', 'up'],
  ['right', 'up', 'left', 'down'],
  ['left', 'up', 'right', 'down'],
];

// NPC behaviour (in ticks unless noted)
const IDLE_MIN = 20; // 1 s
const IDLE_MAX = 120; // 6 s
const LOOK_AROUND_CHANCE = 60; // 1 in N ticks while idle
const RUN_CIRCLES_CHANCE = 600; // 1 in N ticks while idle
const DO_SPOT_ACTION_PERCENT = 70; // after arriving on an objective spot
const GIVE_UP_WHEN_BLOCKED = 20; // 1 s stuck behind someone -> give up
const WANDER_RADIUS = 8; // tiles, for destinations that aren't NPC points

// Starts the game loop.
//   emit(event, payload): send to everyone in the game
//   emitToPlayer(playerId, event, payload): send to one player
// Returns { stop, interact, runCircles }.
export function startSimulation(game, map, { emit, emitToPlayer }) {
  const tileIndex = (tx, ty) => ty * map.width + tx;
  const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  const walkable = (tx, ty) => inBounds(tx, ty) && !map.blocked[tileIndex(tx, ty)];
  const toTile = (px) => Math.floor(px / map.tileSize);

  const occupied = new Map(); // tileIndex -> characterId (a character reserves the tile it's on or moving to)
  for (const c of game.characters.values()) {
    occupied.set(tileIndex(c.tx, c.ty), c.id);
    if (!c.playerId) c.ai = newAi();
  }

  const emitMove = (c, duration) => {
    emit('character:moved', { characterId: c.id, x: c.x, y: c.y, direction: c.direction, duration });
  };

  const turn = (c, direction) => {
    if (c.direction === direction) return;
    c.direction = direction;
    emitMove(c, 0);
  };

  // Moves one tile if possible, otherwise just turns to face that way.
  const tryStep = (c, direction) => {
    const [dx, dy] = DIRECTIONS[direction];
    const nx = c.tx + dx;
    const ny = c.ty + dy;
    if (!walkable(nx, ny) || occupied.has(tileIndex(nx, ny))) {
      turn(c, direction);
      return false;
    }
    occupied.delete(tileIndex(c.tx, c.ty));
    occupied.set(tileIndex(nx, ny), c.id);
    c.tx = nx;
    c.ty = ny;
    c.x = nx * map.tileSize + map.tileSize / 2;
    c.y = ny * map.tileSize + map.tileSize / 2;
    c.direction = direction;
    c.stepTicksLeft = STEP_TICKS;
    emitMove(c, STEP_TICKS * TICK_MS);
    return true;
  };

  // --- Activities (objective actions), the same for players and NPCs ---

  const circleRoute = (c) => {
    const fits = (route) => {
      let { tx, ty } = c;
      return route.every((d) => {
        tx += DIRECTIONS[d][0];
        ty += DIRECTIONS[d][1];
        return walkable(tx, ty);
      });
    };
    const route = CIRCLE_ROUTES.find(fits);
    return route ? Array(CIRCLE_LAPS).fill(route).flat() : null;
  };

  const startSpotAction = (c, spot) => {
    const { action, facing } = OBJECTIVE_TYPES[spot.type];
    c.direction = facing;
    c.activity = spot.type;
    c.actionTicksLeft = ACTION_TICKS;
    emit('character:action', { characterId: c.id, action, direction: facing, duration: ACTION_TICKS * TICK_MS });
  };

  const startCircles = (c) => {
    const steps = circleRoute(c);
    if (!steps) return;
    c.activity = CIRCLES;
    c.script = { steps, blockedTicks: 0 };
  };

  const finishActivity = (c) => {
    const type = c.activity;
    c.activity = null;
    if (!c.playerId) return;
    const objective = game.players.get(c.playerId)?.objectives?.find((o) => o.type === type && !o.done);
    if (!objective) return; // allowed: hiders may do any action to blend in
    objective.done = true;
    emitToPlayer(c.playerId, 'game:objective', { objectiveId: objective.objectiveId, done: true });
  };

  const runScript = (c) => {
    const script = c.script;
    if (script.steps.length === 0) {
      c.script = null;
      finishActivity(c);
    } else if (tryStep(c, script.steps[0])) {
      script.steps.shift();
      script.blockedTicks = 0;
    } else if (++script.blockedTicks > GIVE_UP_WHEN_BLOCKED) {
      c.script = null;
      c.activity = null; // interrupted: doesn't count
    }
  };

  const isBusy = (c) => c.queued || c.actionTicksLeft > 0 || c.script;

  // --- NPC behaviour ---

  // Breadth-first search on the tile grid (ignores other characters). Returns tiles to walk, excluding the start.
  const findPath = (fromX, fromY, toX, toY) => {
    const start = tileIndex(fromX, fromY);
    const goal = tileIndex(toX, toY);
    const cameFrom = new Map([[start, -1]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (current === goal) break;
      const cx = current % map.width;
      const cy = Math.floor(current / map.width);
      for (const [dx, dy] of Object.values(DIRECTIONS)) {
        const nx = cx + dx;
        const ny = cy + dy;
        const next = tileIndex(nx, ny);
        if (walkable(nx, ny) && !cameFrom.has(next)) {
          cameFrom.set(next, current);
          queue.push(next);
        }
      }
    }
    if (!cameFrom.has(goal)) return [];
    const path = [];
    for (let at = goal; at !== start; at = cameFrom.get(at)) {
      path.push({ tx: at % map.width, ty: Math.floor(at / map.width) });
    }
    return path.reverse();
  };

  const pickDestination = (c) => {
    if (map.npcPoints.length > 0 && randomInt(3) > 0) {
      const p = map.npcPoints[randomInt(map.npcPoints.length)];
      return { tx: toTile(p.x), ty: toTile(p.y) };
    }
    const tx = c.tx + randomInt(-WANDER_RADIUS, WANDER_RADIUS + 1);
    const ty = c.ty + randomInt(-WANDER_RADIUS, WANDER_RADIUS + 1);
    return walkable(tx, ty) ? { tx, ty } : null;
  };

  const updateAi = (c) => {
    const { ai } = c;

    if (ai.path.length === 0) {
      if (ai.arrived) {
        ai.arrived = false;
        const spot = map.objectiveAt(c.tx, c.ty);
        if (spot && randomInt(100) < DO_SPOT_ACTION_PERCENT) {
          startSpotAction(c, spot);
          return;
        }
      }
      if (ai.idleTicks > 0) {
        ai.idleTicks--;
        if (randomInt(RUN_CIRCLES_CHANCE) === 0) {
          startCircles(c);
        } else if (randomInt(LOOK_AROUND_CHANCE) === 0) {
          const directions = Object.keys(DIRECTIONS);
          turn(c, directions[randomInt(directions.length)]);
        }
        return;
      }
      const destination = pickDestination(c);
      ai.path = destination ? findPath(c.tx, c.ty, destination.tx, destination.ty) : [];
      ai.idleTicks = randomInt(IDLE_MIN, IDLE_MAX + 1); // rest after arriving
      if (ai.path.length === 0) return;
    }

    const next = ai.path[0];
    const direction = Object.keys(DIRECTIONS).find((d) => {
      const [dx, dy] = DIRECTIONS[d];
      return c.tx + dx === next.tx && c.ty + dy === next.ty;
    });

    if (direction && tryStep(c, direction)) {
      ai.path.shift();
      ai.blockedTicks = 0;
      if (ai.path.length === 0) ai.arrived = true;
    } else if (++ai.blockedTicks > GIVE_UP_WHEN_BLOCKED || !direction) {
      ai.path = [];
      ai.blockedTicks = 0;
    }
  };

  // --- Game loop ---

  const tick = () => {
    for (const c of game.characters.values()) {
      if (c.stepTicksLeft > 0 && --c.stepTicksLeft > 0) continue; // still walking
      if (c.actionTicksLeft > 0) {
        if (--c.actionTicksLeft === 0) finishActivity(c);
        continue;
      }
      if (c.script) {
        runScript(c);
        continue;
      }
      if (c.queued) {
        // Player activities start here, on a tick, like NPC ones.
        const queued = c.queued;
        c.queued = null;
        if (queued === CIRCLES) {
          startCircles(c);
        } else {
          const spot = map.objectiveAt(c.tx, c.ty);
          if (spot) startSpotAction(c, spot);
        }
        continue;
      }
      if (c.playerId) {
        if (c.input) tryStep(c, c.input);
      } else {
        updateAi(c);
      }
    }
  };

  // setInterval drifts (on Windows 50 ms often becomes ~62 ms), which would make steps slower than
  // the duration clients animate. Schedule each tick against the clock instead.
  let nextTickAt = performance.now() + TICK_MS;
  let timer;
  const loop = () => {
    tick();
    nextTickAt += TICK_MS;
    timer = setTimeout(loop, Math.max(0, nextTickAt - performance.now()));
  };
  timer = setTimeout(loop, TICK_MS);

  return {
    stop: () => clearTimeout(timer),

    // E: do the action of the spot the character is on (or is stepping onto).
    // Returns an error message for the player, or null.
    interact(c) {
      if (isBusy(c)) return "You're already doing something";
      if (!map.objectiveAt(c.tx, c.ty)) return 'There is nothing to do here';
      c.queued = 'spot';
      return null;
    },

    // R: run in circles right here.
    runCircles(c) {
      if (isBusy(c)) return "You're already doing something";
      if (!circleRoute(c)) return 'Not enough room to run in circles here';
      c.queued = CIRCLES;
      return null;
    },
  };
}

function newAi() {
  return { path: [], idleTicks: randomInt(IDLE_MAX), blockedTicks: 0, arrived: false };
}

// A player left mid-game: their character keeps going as an NPC, so it doesn't freeze and stand out.
export function releaseCharacter(game, playerId) {
  const player = game.players.get(playerId);
  if (!player) return;
  const c = game.characters.get(player.characterId);
  c.playerId = null;
  c.input = null;
  c.queued = null;
  c.ai = newAi();
}
