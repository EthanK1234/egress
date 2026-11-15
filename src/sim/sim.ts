import { spawnAgents, updateAgent } from "./agents";
import { EXIT, FIELD_RECOMPUTE_TICKS, MAX_TICKS, WALL } from "./config";
import { spreadFire } from "./fire";
import { computeField, findExits, type Exit } from "./flowfield";
import { recordTick, recordVisit } from "./metrics";
import { createRng, shuffle, type Rng } from "./rng";
import type { Agent, Behavior, Building, Scenario } from "./types";

const FIRE_SEED_SALT = 0x9e3779b9; // gives the fire its own random stream from the same seed

export interface SimState {
  building: Building;
  scenario: Scenario;
  rng: Rng; // agents
  fireRng: Rng; // fire only, so the fire spreads identically however the crowd moves
  tick: number;
  done: boolean;
  agents: Agent[];
  exits: Exit[];
  fire: Uint8Array; // 1 = burning
  blocked: Uint8Array; // 1 = impassable (wall, blocked exit, fire)
  occ: Int32Array; // agent id + 1, or 0
  density: Float32Array; // agents in the 3x3 block around each cell
  globalField: Float32Array;
  exitFields: Record<number, Float32Array>;
  fieldsDirty: boolean;
  // Per-agent extras, indexed by agent id
  budget: Float32Array; // banked movement in cells
  hx: Float32Array; // last heading
  hy: Float32Array;
  frozeOnce: Uint8Array;
  // Metric accumulators
  heatmap: Float32Array;
  peakDensity: Float32Array;
  ticksCongested: Int32Array;
  exitUsage: Record<number, number>;
  lastEvacTick: number;
  // Paths per behavior, per cell
  visits: Record<Behavior, Uint16Array>; // times the cell was stepped on
  firstVisit: Record<Behavior, Float32Array>; // tick of the first step (Infinity = never)
}

export function createSim(building: Building, scenario: Scenario): SimState {
  const n = building.width * building.height;
  const rng = createRng(scenario.seed);
  const exits = findExits(building);

  const fire = new Uint8Array(n);
  for (const [x, y] of scenario.fireStarts) {
    const i = y * building.width + x;
    if (building.cells[i] !== WALL) fire[i] = 1;
  }

  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = building.cells[i] === WALL || fire[i] ? 1 : 0;
  for (const e of exits) if (scenario.blockedExits.includes(e.id)) for (const c of e.cells) blocked[c] = 1;

  const agents = spawnAgents(building, scenario, rng);
  const occ = new Int32Array(n);
  for (const a of agents) occ[a.y * building.width + a.x] = a.id + 1;

  const exitUsage: Record<number, number> = {};
  for (const e of exits) exitUsage[e.id] = 0;

  const s: SimState = {
    building, scenario, rng, fireRng: createRng(scenario.seed ^ FIRE_SEED_SALT), tick: 0, done: false, agents, exits,
    fire, blocked, occ,
    density: new Float32Array(n),
    globalField: new Float32Array(n),
    exitFields: {},
    fieldsDirty: true,
    budget: new Float32Array(agents.length),
    hx: new Float32Array(agents.length),
    hy: new Float32Array(agents.length),
    frozeOnce: new Uint8Array(agents.length),
    heatmap: new Float32Array(n),
    peakDensity: new Float32Array(n),
    ticksCongested: new Int32Array(n),
    exitUsage,
    lastEvacTick: 0,
    visits: { calm: new Uint16Array(n), panicker: new Uint16Array(n), freezer: new Uint16Array(n) },
    firstVisit: {
      calm: new Float32Array(n).fill(Infinity),
      panicker: new Float32Array(n).fill(Infinity),
      freezer: new Float32Array(n).fill(Infinity),
    },
  };
  for (const a of agents) recordVisit(s, a, a.y * building.width + a.x, 0);
  return s;
}

export function step(s: SimState): void {
  if (s.done) return;
  const w = s.building.width;

  if (s.tick > 0) {
    const lit = spreadFire(s.building, s.fire, s.fireRng);
    for (const i of lit) s.blocked[i] = 1;
    if (lit.length) s.fieldsDirty = true;
  }

  for (const a of s.agents) {
    if (!isActive(a)) continue;
    const i = a.y * w + a.x;
    if (s.fire[i]) {
      a.status = "trapped";
      s.occ[i] = 0;
    }
  }

  computeDensity(s);
  if (s.fieldsDirty || s.tick % FIELD_RECOMPUTE_TICKS === 0) recomputeFields(s);

  const order = shuffle(s.agents.filter(isActive), s.rng);
  for (const a of order) if (isActive(a)) updateAgent(s, a);

  recordTick(s);
  s.tick++;

  const remaining = s.agents.filter(isActive);
  if (remaining.length === 0 || s.tick >= MAX_TICKS) {
    for (const a of remaining) a.status = "trapped";
    s.done = true;
  }
}

export function runToEnd(s: SimState): void {
  while (!s.done) step(s);
}

export function isActive(a: Agent): boolean {
  return a.status === "moving" || a.status === "frozen";
}

function computeDensity(s: SimState): void {
  const { width: w, height: h } = s.building;
  const { occ, density } = s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) if (occ[yy * w + xx]) c++;
      density[y * w + x] = c;
    }
  }
}

function recomputeFields(s: SimState): void {
  const { width: w, height: h, cells } = s.building;
  const open = s.exits.filter((e) => !s.scenario.blockedExits.includes(e.id));
  const allSources = open.flatMap((e) => e.cells).filter((c) => cells[c] === EXIT);
  s.globalField = computeField(w, h, s.blocked, allSources, s.density);
  s.exitFields = {};
  for (const e of open) s.exitFields[e.id] = computeField(w, h, s.blocked, e.cells, s.density);
  s.fieldsDirty = false;
}
