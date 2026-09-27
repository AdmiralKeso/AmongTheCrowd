import { readFileSync } from 'node:fs';

const MAPS_DIR = new URL('../client/assets/maps/', import.meta.url);

// Reads a Tiled JSON map (the same file the client renders) into what the server needs.
export function loadMap(name) {
  const json = JSON.parse(readFileSync(new URL(`${name}.json`, MAPS_DIR), 'utf8'));
  const { width, height, tilewidth: tileSize } = json;

  // gid -> { propertyName: value }
  const tileProps = new Map();
  for (const tileset of json.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      const props = Object.fromEntries((tile.properties ?? []).map((p) => [p.name, p.value]));
      tileProps.set(tileset.firstgid + tile.id, props);
    }
  }
  const hasProp = (gid, prop) => tileProps.get(gid)?.[prop] === true;

  const findLayer = (layerName) => json.layers.find((l) => l.name === layerName);
  const tileData = (layerName) => {
    const data = findLayer(layerName)?.data;
    if (!Array.isArray(data)) {
      throw new Error(`Map "${name}": tile layer "${layerName}" is missing or not saved as CSV/array`);
    }
    return data;
  };
  const objects = (layerName) => findLayer(layerName)?.objects ?? [];

  const walls = tileData('walls');
  const ground = tileData('ground');
  const blocked = walls.map((gid) => hasProp(gid, 'collides'));

  // Where hiders and NPCs can start: any walkable tile that isn't road.
  const crowdSpawns = [];
  for (let i = 0; i < width * height; i++) {
    if (blocked[i] || hasProp(ground[i], 'road')) continue;
    crowdSpawns.push({ x: (i % width) * tileSize + tileSize / 2, y: Math.floor(i / width) * tileSize + tileSize / 2 });
  }

  const policeSpawns = objects('spawns').filter((o) => o.type === 'police').map(({ x, y }) => ({ x, y }));
  if (policeSpawns.length === 0) throw new Error(`Map "${name}": needs at least one police spawn`);

  return {
    name,
    width,
    height,
    tileSize,
    blocked,
    crowdSpawns,
    policeSpawns,
    objectives: objects('objectives').map((o) => ({ objectiveId: o.name, type: o.type, x: o.x, y: o.y, width: o.width, height: o.height })),
    npcPoints: objects('npcPoints').map(({ type, x, y }) => ({ type, x, y })),
  };
}
