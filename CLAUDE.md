# Egress
Fire evacuation simulator for facility managers. The user photographs a building's evacuation map, Gemini turns it into a grid, a crowd tries to escape a fire, and an AI overseer proposes layout fixes and proves they work with a re-run.

## Pipeline
1. Import: photo -> Gemini -> grid. User fixes errors with the editor.
2. Simulate: user places fire, hits Run. Crowd evacuates, doors jam, some agents get trapped.
3. Diagnose: overseer reads results, explains the bottleneck, proposes up to 3 edits (add_exit, widen_door) drawn in green.
4. Prove: apply edits, re-run on the same seed, show before/after numbers.

## Stack
Vite, React, TypeScript, HTML Canvas 2D (floor map), raw WebGL2 (3D view), @google/genai. Model from VITE_GEMINI_MODEL. Every Gemini call uses structured output (responseMimeType "application/json" + a JSON schema). No backend; demo runs locally only.

No other libraries: no Tailwind, no state library, no test framework, no 3D library. Plain CSS.

## Playback and views
- A run is computed up front into a Recording (src/sim/recording.ts): every agent's position and status per tick, when each cell caught fire, and which cells each behavior walked on. Computing is sliced across animation frames so the page stays responsive.
- Playback only reads the Recording. The playhead is a fractional frame; play/pause, seek and speed never touch the sim.
- The 3D view (main) and the 2D floor map (side) both draw from (recording, playhead, layers), so they always agree. Fire starts are placed on the 2D map.
- Layers: show/hide people per behavior, path highlights per behavior, grid. One person can be selected (People tab) and followed in first person.
- Layout editor (before a run): tools on the 3D view paint walls, doors, exits and fire; the cursor's cell is shown as coordinates. A layout is a stack of floors (src/editor/layout.ts). Floors are simulated one at a time; an exit on an upper floor stands for a stairwell door.
- The numbers above the 3D view lead with Survived and Survival rate. Time is deliberately the least prominent.
- Results appear once playback reaches the end of the run.
- The 3D view draws only when something changed. Flames and paths are uploaded once per run and animated in the shaders from the playhead; walls are one static mesh; people and flames are instanced.
- Look: neumorphic (soft light surface, dark inset "screens" for the 3D view and floor plan). All of it is tokens in src/styles/tokens.css; src/index.css only imports src/styles/ and holds feature CSS appended below.
- Font: Figtree, self-hosted Latin subset in public/fonts/.

## Sim rules
- Grid cell = 0.5 m, tick = 0.5 s. Cells: 0 EMPTY, 1 WALL, 2 DOOR, 3 EXIT.
- Fire: each tick, spreads to each 4-neighbor non-wall cell with probability FIRE_SPREAD.
- Movement: flow field from multi-source Dijkstra over exit cells (one global field plus one per exit). Cost = 1 + DENSITY_WEIGHT * nearby agent count. Fire and walls are impassable. Recompute every 4 ticks or when fire changes.
- Max 1 agent per cell. Blocked agents wait (this creates door jams).
- Behaviors: calm 85% (blend 30% with neighbors' average heading within 3 cells; if familiarity roll fails, use the entry exit's field), panicker 10% (+30% speed, random heading noise, ignores the field 30% of ticks), freezer 5% (freezes 10-20 s when fire is within 5 cells, blocking its cell).
- 4 hardcoded agent types in config.ts (e.g. employee, visitor, elderly, child) with speed and familiarity.
- Trapped: fire reaches the agent or no path to any exit.
- All randomness goes through a seeded RNG (src/sim/rng.ts) so before/after runs are comparable.
- The sim counts, per behavior and per cell, how often the cell was stepped on and when it was first stepped on (visits, firstVisit). These feed the path highlights and do not affect the sim.
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
- src/sim/: pure TypeScript, no React or DOM imports (types, config, rng, fire, flowfield, agents, sim, metrics, recording, edits, maps, testMap)
- src/render/: drawing code shared by both views, no React (palette, view, paths, mat4, camera, meshes, shaders, renderer)
- src/editor/: layout editing, no React (layout)
- src/styles/: the design system (tokens, base, layout, panels)
- src/ai/: Gemini calls (gemini.ts client, floorplan.ts, overseer.ts)
- src/components/: React UI (Viewport3D, MapCanvas, Transport, Readout, LayerPanel, PeoplePanel, ScenarioPanel, ResultsPanel, OverseerPanel, ToolBar, FloorPicker, Steps, Segmented, Switch, Icon, usePlayback)
- public/fonts/: Figtree font file and licence
- public/maps/: example floor plans as Building JSON (two-rooms, office, venue), listed in src/sim/maps.ts
- public/cache/: saved Gemini responses for offline demo

## Coding rules
- Keep it simple. Small files, plain functions, no premature abstraction.
- Colors drawn on the map, in the 3D view or on legend swatches come from src/render/palette.ts. The UI itself stays neutral gray: color is for data.
- Never hardcode the API key. Read it from import.meta.env.VITE_GEMINI_API_KEY.
- Env: copy .env.example to .env and fill in values. .env is gitignored.
