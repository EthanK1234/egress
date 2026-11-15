// The overseer: reads a finished run, explains the bottleneck and proposes layout edits.

import { DOOR } from "../sim/config";
import { getExits, toAsciiMap } from "../sim/edits";
import type { Building, BuildingEdit, OverseerProposal, RunMetrics, Scenario } from "../sim/types";
import { generateJson } from "./gemini";

const MAX_EDITS = 3;
const MAX_AMOUNT = 4;
const MAX_WIDEN_BY = 3; // applyEdits never widens a door by more than this
const DOOR_RADIUS = 5; // doors this close to a bottleneck are offered for widening
const CACHE_URL = "/cache/overseer.json";

// Flat edit shape for Gemini: `amount` is the width of a new exit or the cells a door grows by.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["add_exit", "widen_door"] },
          x: { type: "integer" },
          y: { type: "integer" },
          amount: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["type", "x", "y", "amount", "reason"],
      },
    },
    expectedImpact: { type: "string" },
  },
  required: ["diagnosis", "edits", "expectedImpact"],
};

export async function getOverseerProposal(
  building: Building,
  scenario: Scenario,
  metrics: RunMetrics,
  opts?: { replay?: boolean },
): Promise<OverseerProposal> {
  if (opts?.replay) return loadCached();

  const prompt = buildPrompt(building, scenario, metrics);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const proposal = parseProposal(await generateJson(prompt, RESPONSE_SCHEMA));
      console.log("OVERSEER_CACHE", JSON.stringify(proposal));
      return proposal;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Overseer failed after 2 attempts: ${message(lastError)}`);
}

async function loadCached(): Promise<OverseerProposal> {
  try {
    const res = await fetch(CACHE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseProposal(await res.json());
  } catch (err) {
    throw new Error(`Could not load the saved overseer proposal from ${CACHE_URL}: ${message(err)}`);
  }
}

export function buildPrompt(building: Building, scenario: Scenario, metrics: RunMetrics): string {
  const { width: w, height: h, cells } = building;
  const total = metrics.evacuated + metrics.trapped;

  const exits = getExits(building).map((e) => {
    const notes = [
      e.id === building.entryExitId ? "main entrance" : "",
      scenario.blockedExits.includes(e.id) ? "BLOCKED in this scenario" : "",
    ].filter(Boolean);
    const at = `(${Math.round(e.center.x)}, ${Math.round(e.center.y)})`;
    return `- Exit ${e.id} at ${at}, ${e.cells.length} cells wide, used by ${metrics.exitUsage[e.id] ?? 0} people${notes.length ? ` [${notes.join(", ")}]` : ""}`;
  });

  const bottlenecks = metrics.bottlenecks.map((b, i) => {
    const doors: string[] = [];
    for (let y = Math.max(0, b.y - DOOR_RADIUS); y <= Math.min(h - 1, b.y + DOOR_RADIUS); y++)
      for (let x = Math.max(0, b.x - DOOR_RADIUS); x <= Math.min(w - 1, b.x + DOOR_RADIUS); x++)
        if (cells[y * w + x] === DOOR) doors.push(`(${x}, ${y})`);
    return [
      `- Bottleneck ${i + 1} at (${b.x}, ${b.y}): peak density ${b.peakDensity} people/m2, congested for ${b.ticksCongested} ticks`,
      `  Door cells within ${DOOR_RADIUS} cells: ${doors.length ? doors.join(" ") : "none"}`,
    ].join("\n");
  });

  const fires = scenario.fireStarts.map(([x, y]) => `(${x}, ${y})`).join(" ") || "none";

  return `You are a fire safety engineer advising a facility manager. A crowd evacuation of their building was just simulated with a fire. Explain what went wrong and propose small changes to the layout that would get people out faster. Your changes will be applied and the simulation re-run on the same crowd to prove whether they work.

MAP
The floor is a grid of ${w} columns by ${h} rows. Each cell is 0.5 m. One tick is 0.5 s.
Coordinates are (x, y): x is the column counted from 0 at the left, y is the row counted from 0 at the top.
Legend: # wall, . open floor, D door, F fire start, a digit is an exit cell showing that exit's id (ids above 9 use letters a-z).

${toAsciiMap(building, scenario)}

FIRE STARTS
${fires}

EXITS
${exits.length ? exits.join("\n") : "none"}

RESULT
- ${metrics.evacuated} of ${total} people evacuated, ${metrics.trapped} trapped
- Last person out after ${metrics.evacTimeSec} s

BOTTLENECKS (worst first)
${bottlenecks.length ? bottlenecks.join("\n") : "none recorded"}

RULES
- Propose at most ${MAX_EDITS} edits. Fewer is fine. Each edit is either add_exit or widen_door.
- widen_door: x and y must be one of the door cells listed under a bottleneck above. amount is how many cells wider to make it (1 to ${MAX_WIDEN_BY}).
- add_exit: x and y must be a wall cell on the outer wall of the building, near a bottleneck. amount is the exit's width in cells (1 to ${MAX_AMOUNT}).
- Every reason must name the specific bottleneck or exit it relieves, for example "Bottleneck 1" or "Exit 0".
- diagnosis: at most 3 sentences, in plain language a facility manager understands. No jargon and no grid coordinates.
- expectedImpact: describe the improvement you expect in words only. Do not give numbers, times or percentages: the re-run will measure the real result.`;
}

// Checks the reply by hand and converts the flat edits to BuildingEdit. Throws if the shape is wrong.
function parseProposal(raw: unknown): OverseerProposal {
  if (typeof raw !== "object" || raw === null) throw new Error("reply is not an object");
  const { diagnosis, edits, expectedImpact } = raw as Record<string, unknown>;
  if (typeof diagnosis !== "string" || !diagnosis.trim()) throw new Error("reply has no diagnosis");
  if (typeof expectedImpact !== "string") throw new Error("reply has no expectedImpact");
  if (!Array.isArray(edits)) throw new Error("reply has no edits list");

  const out: BuildingEdit[] = [];
  for (const item of edits) {
    if (out.length >= MAX_EDITS) break;
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;
    const x = Number(e.x);
    const y = Number(e.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // Replayed proposals are already BuildingEdits, so accept width/by as well as amount.
    const given = Number(e.amount ?? e.width ?? e.by);
    const amount = Math.max(1, Math.min(MAX_AMOUNT, Number.isFinite(given) ? Math.round(given) : 1));
    const reason = typeof e.reason === "string" ? e.reason : "";
    if (e.type === "add_exit") out.push({ type: "add_exit", x: Math.round(x), y: Math.round(y), width: amount, reason });
    else if (e.type === "widen_door")
      out.push({ type: "widen_door", x: Math.round(x), y: Math.round(y), by: Math.min(amount, MAX_WIDEN_BY), reason });
    // any other type is dropped
  }
  return { diagnosis: diagnosis.trim(), edits: out, expectedImpact: expectedImpact.trim() };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
