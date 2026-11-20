// Neon Bay — every tuning number and colour in one place.
// The world is a 2400x2400 city: a street grid, a beach and sea on the east edge,
// four districts (Marina, Old Town, Docks, Uptown). The renderer scales the canvas
// to the window; no rule here depends on the screen size.

export const WORLD = { size: 2400, beachX: 2080, waterX: 2240 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Road centre lines (world units) and the road width. */
export const ROADS = {
  vertical: [150, 450, 750, 1050, 1350, 1650, 1950],
  horizontal: [150, 450, 750, 1050, 1350, 1650, 1950],
  width: 64,
  sidewalk: 14,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 235,
  runSpeed: 330,
  maxHealth: 100,
  punchRange: 34,
  punchDamage: 18,
  punchCooldown: 0.38,
  pistolDamage: 34,
  pistolRange: 460,
  pistolCooldown: 0.22,
  pistolAmmoStart: 24,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 340,
  brake: 520,
  reverseAccel: 200,
  maxSpeed: 520,
  maxReverse: 160,
  turn: 2.6,
  grip: 6.5,
  maxHealth: 100,
};

export const TRAFFIC = { count: 16, speed: 150, speedJitter: 45 };
export const PEDS = { count: 42, speed: 55, speedJitter: 30 };

export const WANTED = {
  decayDelay: 9, // seconds unseen before heat starts falling
  decayRate: 0.35, // heat per second while unseen
  bustTime: 2.2, // seconds a cop must stand on you to bust you
  fineFraction: 0.15, // of cash, lost on busted/wasted
  copCarSpeed: 430,
  copFootSpeed: 250,
};

export const CLOCK = {
  startHour: 17.2, // golden hour: warm low sun over the bay
  hoursPerSecond: 1 / 75, // a full day takes 30 real minutes
};

export const COLORS = {
  grass: '#5d8a4a',
  grassDry: '#7d9b52',
  sand: '#e3c98f',
  water: '#1d6f8e',
  waterDeep: '#155a78',
  asphalt: '#33373d',
  asphaltEdge: '#26292e',
  lane: '#d8c95a',
  sidewalk: '#8a8d90',
  buildingRoof: ['#7a5a4e', '#5e6b7a', '#8a7a5a', '#6b5a72', '#4e6b5e', '#96684f'],
  buildingEdge: '#00000055',
  neon: ['#ff2e88', '#22e0ff', '#ffd23e', '#7cff4f', '#ff7a1a'],
};

export const DISTRICTS = [
  { name: 'MARINA', x: 1500, y: 0, w: 580, h: 750, tint: '#2e6f8e' },
  { name: 'UPTOWN', x: 0, y: 0, w: 1450, h: 750, tint: '#8e6f2e' },
  { name: 'OLD TOWN', x: 0, y: 1500, w: 1450, h: 900, tint: '#6e3e2e' },
  { name: 'DOCKS', x: 1500, y: 1500, w: 580, h: 900, tint: '#3e4e5e' },
];

/** Car paint jobs: name + body colour + roof colour. */
export const PAINTS = [
  { name: 'Sunset', body: '#c94f2e', roof: '#a83a20' },
  { name: 'Teal', body: '#2e8a8a', roof: '#1f6b6b' },
  { name: 'Mustard', body: '#d8a92e', roof: '#b8891f' },
  { name: 'Plum', body: '#7a4e8a', roof: '#5e3a6b' },
  { name: 'Lime', body: '#7ab82e', roof: '#5e8f1f' },
  { name: 'Navy', body: '#2e4e8a', roof: '#1f3a6b' },
  { name: 'Bone', body: '#d8d2c2', roof: '#b8b2a2' },
  { name: 'Cherry', body: '#a81e3a', roof: '#8a1830' },
  { name: 'Police', body: '#1e2a3a', roof: '#e8e8e8' },
];
