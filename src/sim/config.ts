// All tunable simulation constants live here.

export const CELL_M = 0.5; // metres per grid cell
export const TICK_S = 0.5; // seconds per tick
export const MAX_TICKS = 1200; // 10 minutes; agents still inside after this count as trapped

// Cell values
export const EMPTY = 0;
export const WALL = 1;
export const DOOR = 2;
export const EXIT = 3;

// Fire
export const FIRE_SPREAD = 0.06; // chance per tick to spread to each 4-neighbour non-wall cell
export const SPAWN_FIRE_CLEARANCE = 3; // agents never spawn within this many cells of a fire start

// Flow field
export const DENSITY_WEIGHT = 0.5; // extra cost per agent in the 3x3 block around a cell
export const FIELD_RECOMPUTE_TICKS = 4;

// Movement
export const MAX_STEP_BUDGET = 2; // cells of movement an agent can bank while waiting

// Behaviours
export const BEHAVIOR_MIX = { calm: 0.85, panicker: 0.1, freezer: 0.05 };
export const HERD_BLEND = 0.3; // calm agents blend this much of their neighbours' heading
export const HERD_RADIUS = 3;
export const PANIC_SPEED_MULT = 1.3;
export const PANIC_NOISE = 0.6; // magnitude of random heading noise added to the field direction
export const PANIC_IGNORE_FIELD = 0.3; // chance per tick a panicker ignores the field
export const FREEZE_FIRE_RADIUS = 5;
export const FREEZE_MIN_S = 10;
export const FREEZE_MAX_S = 20;

// Agent types. speed in m/s; familiarity = chance they know the nearest exit
// (otherwise they head back to the entry exit).
export const AGENT_TYPES = [
  { type: "employee", share: 0.5, speed: 1.3, familiarity: 0.9 },
  { type: "visitor", share: 0.3, speed: 1.2, familiarity: 0.3 },
  { type: "elderly", share: 0.1, speed: 0.8, familiarity: 0.5 },
  { type: "child", share: 0.1, speed: 1.0, familiarity: 0.4 },
];

// Metrics
export const CONGESTION_DENSITY = 2.0; // persons per m² in a 3x3 block that counts as congested
export const MAX_BOTTLENECKS = 5;
export const BOTTLENECK_SPACING = 4; // min cells between reported bottlenecks

// UI defaults
export const DEFAULT_SEED = 42;
export const DEFAULT_AGENT_COUNT = 200;
