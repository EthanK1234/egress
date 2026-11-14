# Egress
Fire evacuation simulator for facility managers. The user photographs a building's evacuation map, Gemini turns it into a grid, a crowd tries to escape a fire, and an AI overseer proposes layout fixes and proves they work with a re-run.

## Pipeline
1. Import: photo -> Gemini -> grid. User fixes errors with the editor.
2. Simulate: user places fire, hits Run. Crowd evacuates, doors jam, some agents get trapped.
3. Diagnose: overseer reads results, explains the bottleneck, proposes up to 3 edits (add_exit, widen_door) drawn in green.
4. Prove: apply edits, re-run on the same seed, show before/after numbers.

## Stack
Vite, React, TypeScript, HTML Canvas 2D, @google/genai. Model from VITE_GEMINI_MODEL. Every Gemini call uses structured output (responseMimeType "application/json" + a JSON schema). No backend; demo runs locally only.

No other libraries: no Tailwind, no state library, no test framework. Plain CSS.

## Sim rules
- Grid cell = 0.5 m, tick = 0.5 s. Cells: 0 EMPTY, 1 WALL, 2 DOOR, 3 EXIT.
- Fire: each tick, spreads to each 4-neighbor non-wall cell with probability FIRE_SPREAD.
- Movement: flow field from multi-source Dijkstra over exit cells (one global field plus one per exit). Cost = 1 + DENSITY_WEIGHT * nearby agent count. Fire and walls are impassable. Recompute every 4 ticks or when fire changes.
- Max 1 agent per cell. Blocked agents wait (this creates door jams).
- Behaviors: calm 85% (blend 30% with neighbors' average heading within 3 cells; if familiarity roll fails, use the entry exit's field), panicker 10% (+30% speed, random heading noise, ignores the field 30% of ticks), freezer 5% (freezes 10-20 s when fire is within 5 cells, blocking its cell).
- 4 hardcoded agent types in config.ts (e.g. employee, visitor, elderly, child) with speed and familiarity.
- Trapped: fire reaches the agent or no path to any exit.
- All randomness goes through a seeded RNG (src/sim/rng.ts) so before/after runs are comparable.
- All tunable constants live in src/sim/config.ts.

## Types (src/sim/types.ts)
```ts
type Cell = 0 | 1 | 2 | 3;
interface Building { width: number; height: number; cells: number[]; labels: { name: string; x: number; y: number }[]; entryExitId: number }
interface Agent { id: number; type: string; behavior: "calm" | "panicker" | "freezer"; x: number; y: number; speed: number; familiarity: number; targetExit: number | "nearest"; status: "moving" | "frozen" | "evacuated" | "trapped"; frozenTicks: number }
interface Scenario { seed: number; agentCount: number; fireStarts: [number, number][]; blockedExits: number[] }
interface RunMetrics { evacTimeSec: number; evacuated: number; trapped: number; exitUsage: Record<number, number>; heatmap: number[]; bottlenecks: { x: number; y: number; peakDensity: number; ticksCongested: number }[] }
type BuildingEdit = { type: "add_exit"; x: number; y: number; width: number; reason: string } | { type: "widen_door"; x: number; y: number; by: number; reason: string };
interface OverseerProposal { diagnosis: string; edits: BuildingEdit[]; expectedImpact: string }
```

## Folders
- src/sim/: pure TypeScript, no React or DOM imports (types, config, rng, fire, flowfield, agents, sim, metrics, edits, testMap)
- src/ai/: Gemini calls (gemini.ts client, floorplan.ts, overseer.ts)
- src/components/: React UI (MapCanvas, Toolbar, panels)
- public/venue.json: backup venue map
- public/cache/: saved Gemini responses for offline demo

## Coding rules
- Keep it simple. Small files, plain functions, no premature abstraction.
- Never hardcode the API key. Read it from import.meta.env.VITE_GEMINI_API_KEY.
- Env: copy .env.example to .env and fill in values. .env is gitignored.
