// Layout edits proposed by the overseer, plus the text views of a building it reads.

import { DOOR, EXIT, OBSTACLE, WALL } from "./config";
import { findExits } from "./flowfield";
import type { Building, BuildingEdit, Scenario } from "./types";

export const MAX_EXIT_WIDTH = 4;
export const MAX_WIDEN_BY = 3;
export const DOOR_SEARCH_RADIUS = 3;

export interface ExitInfo {
  id: number;
  cells: number[];
  center: { x: number; y: number };
}

export interface EditResult {
  building: Building;
  applied: { edit: BuildingEdit; cells: number[] }[]; // cells = indices the edit changed
  rejected: { edit: BuildingEdit; why: string }[];
  // Old exit id -> new exit id. Adding an exit can shift the scan-order numbering.
  exitIdMap: Record<number, number>;
}

// Exits as numbered by the sim (findExits), with the centre of each.
export function getExits(b: Building): ExitInfo[] {
  return findExits(b).map((e) => {
    let sx = 0;
    let sy = 0;
    for (const c of e.cells) {
      sx += c % b.width;
      sy += Math.floor(c / b.width);
    }
    return { id: e.id, cells: e.cells, center: { x: sx / e.cells.length, y: sy / e.cells.length } };
  });
}

// One character per cell, one line per row: # wall, . empty, D door, X furniture, F fire start,
// and the exit id for exit cells (0-9, then a-z for ids 10 and up).
export function toAsciiMap(b: Building, scenario: Scenario): string {
  const { width: w, height: h, cells } = b;
  const chars: string[] = new Array(w * h);
  for (let i = 0; i < chars.length; i++) chars[i] = cells[i] === WALL ? "#" : cells[i] === DOOR ? "D" : cells[i] === OBSTACLE ? "X" : ".";
  for (const e of findExits(b)) for (const c of e.cells) chars[c] = e.id.toString(36).slice(-1);
  for (const [x, y] of scenario.fireStarts) if (x >= 0 && y >= 0 && x < w && y < h) chars[y * w + x] = "F";
  const rows: string[] = [];
  for (let y = 0; y < h; y++) rows.push(chars.slice(y * w, (y + 1) * w).join(""));
  return rows.join("\n");
}

// Applies edits in order to a copy of the building. Edits that can't be applied are rejected.
export function applyEdits(building: Building, edits: BuildingEdit[]): EditResult {
  const b: Building = { ...building, cells: building.cells.slice(), labels: building.labels.map((l) => ({ ...l })) };
  const applied: EditResult["applied"] = [];
  const rejected: EditResult["rejected"] = [];

  for (const edit of edits) {
    const result = edit.type === "add_exit" ? addExit(b, edit) : edit.type === "widen_door" ? widenDoor(b, edit) : "unknown edit type";
    if (typeof result === "string") rejected.push({ edit, why: result });
    else applied.push({ edit, cells: result });
  }

  // Keep exit ids pointing at the same physical exits.
  const after = findExits(b);
  const exitIdMap: Record<number, number> = {};
  for (const old of findExits(building)) {
    const match = after.find((e) => e.cells.includes(old.cells[0]));
    if (match) exitIdMap[old.id] = match.id;
  }
  b.entryExitId = exitIdMap[building.entryExitId] ?? building.entryExitId;

  return { building: b, applied, rejected, exitIdMap };
}

// Carries a scenario's blocked exits over to the edited building's exit numbering.
export function remapScenario(scenario: Scenario, exitIdMap: Record<number, number>): Scenario {
  return { ...scenario, blockedExits: scenario.blockedExits.map((id) => exitIdMap[id] ?? id) };
}

// Returns the changed cell indices, or the reason the edit was rejected. Mutates `b` (a copy).
function addExit(b: Building, edit: Extract<BuildingEdit, { type: "add_exit" }>): number[] | string {
  const { width: w, height: h } = b;
  if (!isCoord(edit.x, edit.y) || !Number.isFinite(edit.width)) return "x, y and width must be numbers";
  const want = clamp(Math.floor(edit.width), 1, MAX_EXIT_WIDTH);

  // Nearest border wall cell that opens onto the floor
  let start = -1;
  let best = Infinity;
  for (let i = 0; i < b.cells.length; i++) {
    if (!canBeExit(b, i)) continue;
    const d = (i % w - edit.x) ** 2 + (Math.floor(i / w) - edit.y) ** 2;
    if (d < best) {
      best = d;
      start = i;
    }
  }
  if (start < 0) return "no outer wall cell that opens onto the floor";

  const sy = Math.floor(start / w);
  const step = sy === 0 || sy === h - 1 ? 1 : w; // run along the top/bottom row, or down a side column
  const changed = grow(b, start, step, want, (i) => canBeExit(b, i));
  for (const c of changed) b.cells[c] = EXIT;
  return changed;
}

function widenDoor(b: Building, edit: Extract<BuildingEdit, { type: "widen_door" }>): number[] | string {
  const { width: w, height: h, cells } = b;
  if (!isCoord(edit.x, edit.y) || !Number.isFinite(edit.by)) return "x, y and by must be numbers";
  const want = clamp(Math.floor(edit.by), 1, MAX_WIDEN_BY);

  let door = -1;
  let best = Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== DOOR) continue;
    const dx = Math.abs((i % w) - edit.x);
    const dy = Math.abs(Math.floor(i / w) - edit.y);
    if (Math.max(dx, dy) > DOOR_SEARCH_RADIUS) continue;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      door = i;
    }
  }
  if (door < 0) return `no door within ${DOOR_SEARCH_RADIUS} cells of (${edit.x}, ${edit.y})`;

  // The wall line runs along the axis where the door's neighbours are wall or door.
  const x = door % w;
  const y = Math.floor(door / w);
  const solid = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < w && cy < h && (cells[cy * w + cx] === WALL || cells[cy * w + cx] === DOOR);
  const alongX = solid(x - 1, y) || solid(x + 1, y);
  const alongY = solid(x, y - 1) || solid(x, y + 1);
  if (!alongX && !alongY) return "door is not set in a wall";
  // In a corner both are true: follow the axis whose other side is open.
  const horizontal = alongX && alongY ? !solid(x, y - 1) || !solid(x, y + 1) : alongX;
  const step = horizontal ? 1 : w;

  // Extend from the ends of the existing door run
  const isDoor = (i: number) => cells[i] === DOOR;
  const run = grow(b, door, step, Infinity, isDoor);
  const lo = Math.min(...run);
  const hi = Math.max(...run);
  const canWiden = (i: number) => cells[i] === WALL && !onBorder(b, i);
  const changed: number[] = [];
  let a = lo - step;
  let z = hi + step;
  let openA = sameLine(b, lo, a, step) && canWiden(a);
  let openZ = sameLine(b, hi, z, step) && canWiden(z);
  while (changed.length < want && (openA || openZ)) {
    if (openA) {
      changed.push(a);
      openA = sameLine(b, a, a - step, step) && canWiden(a - step);
      a -= step;
    }
    if (changed.length < want && openZ) {
      changed.push(z);
      openZ = sameLine(b, z, z + step, step) && canWiden(z + step);
      z += step;
    }
  }
  if (changed.length === 0) return "no wall next to the door to convert";
  for (const c of changed) cells[c] = DOOR;
  return changed;
}

// Contiguous cells along a line through `start` that pass `ok`, growing both ways, up to `max`.
function grow(b: Building, start: number, step: number, max: number, test: (i: number) => boolean): number[] {
  const out = [start];
  let a = start;
  let z = start;
  let openA = true;
  let openZ = true;
  while (out.length < max && (openA || openZ)) {
    if (openA) {
      if (sameLine(b, a, a - step, step) && test(a - step)) out.push((a -= step));
      else openA = false;
    }
    if (out.length < max && openZ) {
      if (sameLine(b, z, z + step, step) && test(z + step)) out.push((z += step));
      else openZ = false;
    }
  }
  return out;
}

// True if `to` is on the grid and on the same row (step 1) or column (step = width) as `from`.
function sameLine(b: Building, from: number, to: number, step: number): boolean {
  if (to < 0 || to >= b.cells.length) return false;
  return step !== 1 || Math.floor(from / b.width) === Math.floor(to / b.width);
}

function onBorder(b: Building, i: number): boolean {
  const x = i % b.width;
  const y = Math.floor(i / b.width);
  return x === 0 || y === 0 || x === b.width - 1 || y === b.height - 1;
}

// A border wall cell (not a corner) whose inward neighbour is walkable.
function canBeExit(b: Building, i: number): boolean {
  const { width: w, height: h, cells } = b;
  if (cells[i] !== WALL) return false;
  const x = i % w;
  const y = Math.floor(i / w);
  const onX = x === 0 || x === w - 1;
  const onY = y === 0 || y === h - 1;
  if (onX === onY) return false; // interior or corner
  const inward = onY ? (y === 0 ? i + w : i - w) : x === 0 ? i + 1 : i - 1;
  return cells[inward] !== WALL && cells[inward] !== OBSTACLE;
}

function isCoord(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
