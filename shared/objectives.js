// Objective types. A hider's objective is a type ("sit on a bench"), done at any spot of that type.
// Spot types are placed in the map's `objectives` layer; the character stands on the spot and presses E.
// `circles` can be done anywhere with R.
// NPCs do these same actions, so doing one isn't proof of being a player.
export const OBJECTIVE_TYPES = {
  bench: { action: 'sit', facing: 'down', text: 'Sit on a bench' },
  window: { action: 'look', facing: 'up', text: 'Look into a window' },
  door: { action: 'knock', facing: 'up', text: 'Knock on a door' },
  mailbox: { action: 'post', facing: 'up', text: 'Post a letter' },
  stall: { action: 'buy', facing: 'up', text: 'Buy something at a stall' },
  circles: { action: 'circles', text: 'Run in circles' },
};

export const CIRCLES = 'circles';
