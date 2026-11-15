import { BOTTLENECK_SPACING, CELL_M, CONGESTION_DENSITY, MAX_BOTTLENECKS, OBSTACLE, TICK_S, WALL } from "./config";
import type { SimState } from "./sim";
import type { Agent, RunMetrics } from "./types";

const BLOCK_AREA_M2 = 9 * CELL_M * CELL_M; // 3x3 cells

// Called whenever an agent steps onto a cell (its spawn cell counts).
// `tick` is the tick at which the agent is standing there.
export function recordVisit(s: SimState, a: Agent, cell: number, tick: number): void {
  s.visits[a.behavior][cell]++;
  const first = s.firstVisit[a.behavior];
  if (tick < first[cell]) first[cell] = tick;
}

// Called once per tick, after agents move.
export function recordTick(s: SimState): void {
  const { cells } = s.building;
  for (let i = 0; i < cells.length; i++) {
    if (s.occ[i]) s.heatmap[i]++;
    if (cells[i] === WALL || cells[i] === OBSTACLE) continue;
    const perM2 = s.density[i] / BLOCK_AREA_M2;
    if (perM2 > s.peakDensity[i]) s.peakDensity[i] = perM2;
    if (perM2 >= CONGESTION_DENSITY) s.ticksCongested[i]++;
  }
}

export function getMetrics(s: SimState): RunMetrics {
  const w = s.building.width;
  return {
    evacTimeSec: s.lastEvacTick * TICK_S,
    evacuated: s.agents.filter((a) => a.status === "evacuated").length,
    trapped: s.agents.filter((a) => a.status === "trapped").length,
    exitUsage: { ...s.exitUsage },
    heatmap: Array.from(s.heatmap),
    bottlenecks: findBottlenecks(s, w),
  };
}

// Most-congested cells, at least BOTTLENECK_SPACING apart.
function findBottlenecks(s: SimState, w: number): RunMetrics["bottlenecks"] {
  const candidates: number[] = [];
  for (let i = 0; i < s.ticksCongested.length; i++) if (s.ticksCongested[i] > 0) candidates.push(i);
  candidates.sort((a, b) => s.ticksCongested[b] - s.ticksCongested[a] || s.peakDensity[b] - s.peakDensity[a]);

  const out: RunMetrics["bottlenecks"] = [];
  for (const i of candidates) {
    const x = i % w;
    const y = (i - x) / w;
    const tooClose = out.some((b) => Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) < BOTTLENECK_SPACING);
    if (tooClose) continue;
    out.push({
      x,
      y,
      peakDensity: Math.round(s.peakDensity[i] * 100) / 100,
      ticksCongested: s.ticksCongested[i],
    });
    if (out.length >= MAX_BOTTLENECKS) break;
  }
  return out;
}
