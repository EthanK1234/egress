import {
  AGENT_TYPES, BEHAVIOR_MIX, CELL_M, EMPTY, EXIT, FREEZE_FIRE_RADIUS, FREEZE_MAX_S, FREEZE_MIN_S,
  HERD_BLEND, HERD_RADIUS, MAX_STEP_BUDGET, PANIC_IGNORE_FIELD, PANIC_NOISE, PANIC_SPEED_MULT,
  SPAWN_FIRE_CLEARANCE, TICK_S,
} from "./config";
import { canStep, DIRS } from "./flowfield";
import { shuffle, type Rng } from "./rng";
import type { SimState } from "./sim";
import type { Agent, Building, Scenario } from "./types";

export function spawnAgents(b: Building, scenario: Scenario, rng: Rng): Agent[] {
  const { width: w, cells } = b;
  const spots: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY) continue;
    const x = i % w;
    const y = (i - x) / w;
    const nearFire = scenario.fireStarts.some(
      ([fx, fy]) => Math.max(Math.abs(fx - x), Math.abs(fy - y)) <= SPAWN_FIRE_CLEARANCE,
    );
    if (!nearFire) spots.push(i);
  }
  shuffle(spots, rng);

  const count = Math.min(scenario.agentCount, spots.length);
  const agents: Agent[] = [];
  for (let id = 0; id < count; id++) {
    const t = pickType(rng);
    const r = rng.next();
    const behavior = r < BEHAVIOR_MIX.calm ? "calm" : r < BEHAVIOR_MIX.calm + BEHAVIOR_MIX.panicker ? "panicker" : "freezer";
    const knowsWay = rng.next() < t.familiarity;
    agents.push({
      id,
      type: t.type,
      behavior,
      x: spots[id] % w,
      y: Math.floor(spots[id] / w),
      speed: behavior === "panicker" ? t.speed * PANIC_SPEED_MULT : t.speed,
      familiarity: t.familiarity,
      targetExit: behavior === "calm" && !knowsWay ? b.entryExitId : "nearest",
      status: "moving",
      frozenTicks: 0,
    });
  }
  return agents;
}

function pickType(rng: Rng) {
  let r = rng.next();
  for (const t of AGENT_TYPES) {
    if (r < t.share) return t;
    r -= t.share;
  }
  return AGENT_TYPES[AGENT_TYPES.length - 1];
}

export function updateAgent(s: SimState, a: Agent): void {
  const i = a.id;

  if (a.status === "frozen") {
    a.frozenTicks--;
    if (a.frozenTicks <= 0) a.status = "moving";
    return;
  }
  if (a.behavior === "freezer" && !s.frozeOnce[i] && fireNear(s, a.x, a.y, FREEZE_FIRE_RADIUS)) {
    s.frozeOnce[i] = 1;
    a.status = "frozen";
    a.frozenTicks = s.rng.int(FREEZE_MIN_S / TICK_S, FREEZE_MAX_S / TICK_S);
    return;
  }

  s.budget[i] = Math.min(s.budget[i] + (a.speed * TICK_S) / CELL_M, MAX_STEP_BUDGET);
  while (a.status === "moving" && s.budget[i] >= 1) {
    const field = fieldFor(s, a);
    if (!field) {
      a.status = "trapped";
      return;
    }
    const move = chooseMove(s, a, field);
    if (!move) {
      s.budget[i] = Math.min(s.budget[i], 1); // waiting: don't bank more than one step
      return;
    }
    const [dx, dy, len] = move;
    if (s.budget[i] < len) return;
    s.budget[i] -= len;
    moveTo(s, a, a.x + dx, a.y + dy);
    s.hx[i] = dx / len;
    s.hy[i] = dy / len;
  }
}

// The agent's target field, falling back to the global one if the target is unreachable.
// Returns null when no exit can be reached.
function fieldFor(s: SimState, a: Agent): Float32Array | null {
  const cur = a.y * s.building.width + a.x;
  if (a.targetExit !== "nearest") {
    const f = s.exitFields[a.targetExit];
    if (f && Number.isFinite(f[cur])) return f;
    a.targetExit = "nearest";
  }
  return Number.isFinite(s.globalField[cur]) ? s.globalField : null;
}

function chooseMove(s: SimState, a: Agent, field: Float32Array): [number, number, number] | null {
  const { width: w, height: h } = s.building;
  const { rng } = s;
  const d0 = field[a.y * w + a.x];
  let vx = 0;
  let vy = 0;
  let ignoreField = false;

  if (a.behavior === "panicker" && rng.next() < PANIC_IGNORE_FIELD) {
    ignoreField = true;
    const ang = rng.next() * Math.PI * 2;
    vx = Math.cos(ang);
    vy = Math.sin(ang);
  } else {
    // Gradient: direction to the lowest-cost reachable neighbour
    let best = Infinity;
    for (const [dx, dy, len] of DIRS) {
      if (!canStep(w, h, s.blocked, a.x, a.y, dx, dy)) continue;
      const d = field[(a.y + dy) * w + (a.x + dx)];
      if (d < best) {
        best = d;
        vx = dx / len;
        vy = dy / len;
      }
    }
    if (a.behavior === "calm") {
      const [ax, ay] = herdHeading(s, a);
      vx = (1 - HERD_BLEND) * vx + HERD_BLEND * ax;
      vy = (1 - HERD_BLEND) * vy + HERD_BLEND * ay;
    } else if (a.behavior === "panicker") {
      const ang = rng.next() * Math.PI * 2;
      vx += PANIC_NOISE * Math.cos(ang);
      vy += PANIC_NOISE * Math.sin(ang);
    }
  }

  // Pick the free neighbour that best matches the desired heading.
  // Following the field, only moves that get closer to the exit count.
  let pick: [number, number, number] | null = null;
  let bestScore = -Infinity;
  for (const dir of DIRS) {
    const [dx, dy, len] = dir;
    if (!canStep(w, h, s.blocked, a.x, a.y, dx, dy)) continue;
    const n = (a.y + dy) * w + (a.x + dx);
    if (s.occ[n]) continue;
    if (!ignoreField && !(field[n] < d0)) continue;
    const score = (dx * vx + dy * vy) / len;
    if (score > bestScore) {
      bestScore = score;
      pick = dir;
    }
  }
  return pick;
}

// Average heading of moving agents within HERD_RADIUS (unit vector, or 0,0).
function herdHeading(s: SimState, a: Agent): [number, number] {
  const { width: w, height: h } = s.building;
  let sx = 0;
  let sy = 0;
  for (let y = Math.max(0, a.y - HERD_RADIUS); y <= Math.min(h - 1, a.y + HERD_RADIUS); y++) {
    for (let x = Math.max(0, a.x - HERD_RADIUS); x <= Math.min(w - 1, a.x + HERD_RADIUS); x++) {
      const o = s.occ[y * w + x];
      if (!o || o - 1 === a.id) continue;
      sx += s.hx[o - 1];
      sy += s.hy[o - 1];
    }
  }
  const len = Math.hypot(sx, sy);
  return len > 0 ? [sx / len, sy / len] : [0, 0];
}

function fireNear(s: SimState, cx: number, cy: number, r: number): boolean {
  const { width: w, height: h } = s.building;
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
      if (s.fire[y * w + x] && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  return false;
}

function moveTo(s: SimState, a: Agent, nx: number, ny: number): void {
  const w = s.building.width;
  s.occ[a.y * w + a.x] = 0;
  a.x = nx;
  a.y = ny;
  const n = ny * w + nx;
  if (s.building.cells[n] === EXIT) {
    a.status = "evacuated";
    const exit = s.exits.find((e) => e.cells.includes(n));
    if (exit) s.exitUsage[exit.id]++;
    s.lastEvacTick = s.tick + 1;
  } else {
    s.occ[n] = a.id + 1;
  }
}
