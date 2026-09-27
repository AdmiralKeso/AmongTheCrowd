// Maps appearance ids (shared/appearances.js) to frames in the Kenney sheet (`kenney` spritesheet key).
// Each character has 3 rows (idle + 2 walk frames) and one column per direction.

const SHEET_COLUMNS = 27;
const DIRECTION_COLUMNS = { left: 23, down: 24, up: 25, right: 23 }; // right = left frames flipped

const APPEARANCE_ROWS = {
  civilian1: 0,
  civilian2: 3,
  police: 6, // placeholder until there's a real police sprite
  civilian3: 9,
  civilian4: 12,
  civilian5: 15,
};

export function characterFrame(appearanceId, direction = 'down', step = 0) {
  const row = APPEARANCE_ROWS[appearanceId] ?? 0;
  return (row + step) * SHEET_COLUMNS + DIRECTION_COLUMNS[direction];
}

export const flipForDirection = (direction) => direction === 'right';

export const walkAnimationKey = (appearanceId, direction) => `${appearanceId}-walk-${direction}`;

// Called once in PreloadScene. Walk cycle: step, idle, other step, idle.
export function createCharacterAnimations(anims) {
  for (const appearanceId of Object.keys(APPEARANCE_ROWS)) {
    for (const direction of Object.keys(DIRECTION_COLUMNS)) {
      anims.create({
        key: walkAnimationKey(appearanceId, direction),
        frames: [1, 0, 2, 0].map((step) => ({ key: 'kenney', frame: characterFrame(appearanceId, direction, step) })),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}
