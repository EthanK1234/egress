export type Cell = 0 | 1 | 2 | 3 | 4;

export interface Building {
  width: number;
  height: number;
  cells: number[];
  labels: { name: string; x: number; y: number }[];
  entryExitId: number;
  // Names given to exits. Each is tied to one cell of its exit, so it survives exits being renumbered.
  exitNames?: { name: string; x: number; y: number }[];
}

export interface Agent {
  id: number;
  type: string;
  behavior: "calm" | "panicker" | "freezer";
  x: number;
  y: number;
  speed: number;
  familiarity: number;
  targetExit: number | "nearest";
  status: "moving" | "frozen" | "evacuated" | "trapped";
  frozenTicks: number;
}

export type Behavior = Agent["behavior"];

export interface Scenario {
  seed: number;
  agentCount: number;
  fireStarts: [number, number][];
  blockedExits: number[];
}

export interface RunMetrics {
  evacTimeSec: number;
  evacuated: number;
  trapped: number;
  exitUsage: Record<number, number>;
  heatmap: number[];
  bottlenecks: { x: number; y: number; peakDensity: number; ticksCongested: number }[];
}

export type BuildingEdit =
  | { type: "add_exit"; x: number; y: number; width: number; reason: string }
  | { type: "widen_door"; x: number; y: number; by: number; reason: string };

export interface OverseerProposal {
  diagnosis: string;
  edits: BuildingEdit[];
  expectedImpact: string;
}
