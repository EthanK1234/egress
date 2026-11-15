// Measures what each of the overseer's fixes is worth by re-running the same crowd:
// once with each fix on its own, and once with all of them together.
// The sim is deterministic for a given seed, so these numbers are exact, not estimates;
// the "all together" run gives the same result as pressing Apply.

import { TICK_S } from "../sim/config";
import { applyEdits, remapScenario } from "../sim/edits";
import { getMetrics } from "../sim/metrics";
import { createSim, step } from "../sim/sim";
import type { Building, BuildingEdit, Scenario } from "../sim/types";

export interface Outcome {
  total: number;
  evacuated: number;
  trapped: number;
  lastOutSec: number | null; // null if nobody got out
  evacuatedByTick: number[]; // people out after each tick
}

export interface Impact {
  baseline: Outcome | null;
  perEdit: Map<BuildingEdit, Outcome | null>; // each fix on its own (null if it can't be applied alone)
  all: Outcome | null; // every fix together; for a single fix, that fix's own outcome
  done: boolean; // every run has finished
}

// Runs one full simulation and returns its outcome.
export function measure(building: Building, scenario: Scenario): Outcome {
  const s = createSim(building, scenario);
  const evacuatedByTick: number[] = [];
  while (!s.done) {
    step(s);
    let out = 0;
    for (const a of s.agents) if (a.status === "evacuated") out++;
    evacuatedByTick.push(out);
  }
  const m = getMetrics(s);
  return {
    total: s.agents.length,
    evacuated: m.evacuated,
    trapped: m.trapped,
    lastOutSec: m.evacuated > 0 ? m.evacTimeSec : null,
    evacuatedByTick,
  };
}

// The runs to make for a proposal, as small jobs, so the caller can spread them over several frames.
export function impactJobs(original: Building, scenario: Scenario, edits: BuildingEdit[]): { key: BuildingEdit | "all" | "baseline"; run: () => Outcome | null }[] {
  const withEdits = (list: BuildingEdit[]) => {
    const result = applyEdits(original, list);
    if (result.applied.length === 0) return null;
    return measure(result.building, remapScenario(scenario, result.exitIdMap));
  };
  return [
    { key: "baseline", run: () => measure(original, scenario) },
    ...edits.map((edit) => ({ key: edit, run: () => withEdits([edit]) })),
    { key: "all", run: () => (edits.length > 1 ? withEdits(edits) : null) },
  ];
}

// Change in survival rate, in percentage points (+1.5 means 1.5% more of the crowd got out).
export function survivalGain(base: Outcome, other: Outcome): number {
  return base.total > 0 ? ((other.evacuated - base.evacuated) / base.total) * 100 : 0;
}

// Seconds until `count` people were out, or null if that never happened.
export function timeToEvacuate(o: Outcome, count: number): number | null {
  if (count <= 0) return null;
  const i = o.evacuatedByTick.findIndex((n) => n >= count);
  return i < 0 ? null : (i + 1) * TICK_S;
}

// How much sooner the same number of people got out (positive = faster). Compares like with like:
// the count both runs reached, so extra survivors who leave late don't make a fix look slower.
export function secondsSaved(base: Outcome, other: Outcome): number | null {
  const same = Math.min(base.evacuated, other.evacuated);
  const a = timeToEvacuate(base, same);
  const b = timeToEvacuate(other, same);
  return a === null || b === null ? null : a - b;
}
