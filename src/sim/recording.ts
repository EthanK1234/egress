// Records a whole run frame by frame, so playback can pause, seek and change speed
// without touching the sim. Frame f is the state after f ticks; frame 0 is the start.

import { MAX_TICKS } from "./config";
import { getMetrics } from "./metrics";
import { createSim, step, type SimState } from "./sim";
import type { Agent, Behavior, Building, RunMetrics, Scenario } from "./types";

// Agent status codes stored per frame
export const MOVING = 0;
export const FROZEN = 1;
export const EVACUATED = 2;
export const TRAPPED = 3;
const STATUS_CODE: Record<Agent["status"], number> = { moving: MOVING, frozen: FROZEN, evacuated: EVACUATED, trapped: TRAPPED };

export interface Recording {
  building: Building;
  scenario: Scenario;
  agents: { type: string; behavior: Behavior }[];
  frames: number;
  // Per frame, per agent: index = frame * agents.length + agent id
  x: Uint16Array;
  y: Uint16Array;
  status: Uint8Array;
  // Per frame totals
  evacuated: Uint16Array;
  trapped: Uint16Array;
  frozen: Uint16Array;
  burning: Uint32Array; // cells on fire
  // Per cell
  igniteFrame: Float32Array; // frame the cell caught fire (Infinity = never)
  firstVisit: Record<Behavior, Float32Array>; // frame a behavior first stepped on the cell (Infinity = never)
  visits: Record<Behavior, Uint16Array>; // times a behavior stepped on the cell
  metrics: RunMetrics;
}

export interface Recorder {
  sim: SimState;
  rec: Recording;
}

export function startRecording(building: Building, scenario: Scenario): Recorder {
  const sim = createSim(building, scenario);
  const perFrame = MAX_TICKS + 1;
  const n = sim.agents.length;
  const r: Recorder = {
    sim,
    rec: {
      building,
      scenario,
      agents: sim.agents.map((a) => ({ type: a.type, behavior: a.behavior })),
      frames: 0,
      x: new Uint16Array(perFrame * n),
      y: new Uint16Array(perFrame * n),
      status: new Uint8Array(perFrame * n),
      evacuated: new Uint16Array(perFrame),
      trapped: new Uint16Array(perFrame),
      frozen: new Uint16Array(perFrame),
      burning: new Uint32Array(perFrame),
      igniteFrame: new Float32Array(building.cells.length).fill(Infinity),
      firstVisit: sim.firstVisit,
      visits: sim.visits,
      metrics: getMetrics(sim),
    },
  };
  capture(r);
  return r;
}

// Advances the sim one tick and stores the new frame.
export function recordStep(r: Recorder): void {
  if (r.sim.done) return;
  step(r.sim);
  capture(r);
}

// Call once the sim is done: trims the buffers and adds the final metrics.
export function finishRecording(r: Recorder): Recording {
  const { rec } = r;
  const n = rec.agents.length;
  return {
    ...rec,
    x: rec.x.slice(0, rec.frames * n),
    y: rec.y.slice(0, rec.frames * n),
    status: rec.status.slice(0, rec.frames * n),
    evacuated: rec.evacuated.slice(0, rec.frames),
    trapped: rec.trapped.slice(0, rec.frames),
    frozen: rec.frozen.slice(0, rec.frames),
    burning: rec.burning.slice(0, rec.frames),
    metrics: getMetrics(r.sim),
  };
}

function capture(r: Recorder): void {
  const { sim, rec } = r;
  const f = sim.tick;
  const n = sim.agents.length;
  let evacuated = 0;
  let trapped = 0;
  let frozen = 0;
  for (let a = 0; a < n; a++) {
    const agent = sim.agents[a];
    const code = STATUS_CODE[agent.status];
    rec.x[f * n + a] = agent.x;
    rec.y[f * n + a] = agent.y;
    rec.status[f * n + a] = code;
    if (code === EVACUATED) evacuated++;
    else if (code === TRAPPED) trapped++;
    else if (code === FROZEN) frozen++;
  }
  rec.evacuated[f] = evacuated;
  rec.trapped[f] = trapped;
  rec.frozen[f] = frozen;
  let burning = 0;
  for (let i = 0; i < sim.fire.length; i++) {
    if (!sim.fire[i]) continue;
    burning++;
    if (rec.igniteFrame[i] === Infinity) rec.igniteFrame[i] = f;
  }
  rec.burning[f] = burning;
  rec.frames = f + 1;
}
