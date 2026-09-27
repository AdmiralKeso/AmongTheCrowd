// Shared by server and client: the server enforces these, the client uses them for inputs.

export const MIN_PLAYERS = 2; // 1 police + at least 1 hider
export const MAX_PLAYERS = 10;
export const NAME_MAX_LENGTH = 16;
export const CODE_LENGTH = 4;

export const SETTINGS = {
  roundTime: { label: 'Round time (sec)', min: 60, max: 1200, default: 300 },
  npcCount: { label: 'NPCs', min: 5, max: 100, default: 30 },
  startingTokens: { label: 'Police starting tokens', min: 1, max: 50, default: 10 },
};

export function defaultSettings() {
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, rule]) => [key, rule.default]));
}
