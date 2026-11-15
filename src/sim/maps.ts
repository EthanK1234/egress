// The example floor plans the user can pick from (Building JSON in public/maps/),
// and the check that turns any loaded or imported JSON into a Building.

import { DOOR, EMPTY, EXIT, OBSTACLE, WALL } from "./config";
import { findExits, type Exit } from "./flowfield";
import type { Building } from "./types";

export interface MapInfo {
  id: string;
  name: string;
  url: string;
}

export const MAPS: MapInfo[] = [
  { id: "two-rooms", name: "Two rooms", url: "/maps/two-rooms.json" },
  { id: "office", name: "Office", url: "/maps/office.json" },
  { id: "venue", name: "Venue", url: "/maps/venue.json" },
];

export const MAX_MAP_SIDE = 400; // cells; larger plans are too slow to simulate

const ROW_CHARS: Record<string, number> = { ".": EMPTY, " ": EMPTY, "#": WALL, D: DOOR, E: EXIT, X: OBSTACLE };
const EXIT_ID = /^[0-9a-z]$/; // an exit cell in "rows" can be written as its ID instead of E

interface Layout {
  width: number;
  height: number;
  cells: number[];
  idCells: Map<string, number[]>; // exit ID -> the cells written with it ("rows" only)
}

// Checks that loaded JSON is a usable Building. Throws with the reason if not.
//
// The layout is either `width`, `height` and `cells` (row by row, 0 empty, 1 wall, 2 door, 3 exit, 4 furniture),
// or `rows`: one string per row using . empty, # wall, D door, E exit, X furniture. In `rows`, an exit can be
// written with an ID of its own (a digit or a lowercase letter) in place of E.
//
// Exits are named and the entry exit is chosen by that ID, not by where the exit is:
//   "exits": { "1": "Main entrance", "2": "East stairs" }
//   "entry": "1"            (an ID, or a name from "exits")
export function parseBuilding(raw: unknown): Building {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the file is not a JSON object");
  const data = raw as Record<string, unknown>;
  const { width: w, height: h, cells, idCells } = Array.isArray(data.rows) ? fromRows(data.rows) : fromCells(data);
  if (w < 3 || h < 3) throw new Error("the map must be at least 3 by 3 cells");
  if (w > MAX_MAP_SIDE || h > MAX_MAP_SIDE) throw new Error(`the map is larger than ${MAX_MAP_SIDE} by ${MAX_MAP_SIDE} cells`);

  const labels = Array.isArray(data.labels) ? data.labels.filter(isNamedPoint) : [];
  const building: Building = { width: w, height: h, cells, labels: labels.map((l) => ({ name: l.name, x: l.x, y: l.y })), entryExitId: 0 };

  const exits = findExits(building);
  if (exits.length === 0) throw new Error("the map has no exit cells");
  if (!cells.includes(EMPTY)) throw new Error("the map has no open floor");

  // Which exit each ID in the file stands for.
  const byId = new Map<string, Exit>();
  for (const [id, cellsOfId] of idCells) {
    const found = exits.filter((e) => cellsOfId.some((c) => e.cells.includes(c)));
    if (found.length > 1) throw new Error(`exit ID "${id}" is used for ${found.length} separate exits`);
    byId.set(id, found[0]);
  }
  for (const e of exits) {
    const ids = [...byId].filter(([, exit]) => exit === e).map(([id]) => id);
    if (ids.length > 1) throw new Error(`exits "${ids[0]}" and "${ids[1]}" touch, so they are one exit; give them one ID`);
  }

  // Names: from "exits" by ID, or already tied to a cell (how a Building is saved).
  const names: NonNullable<Building["exitNames"]> = [];
  if (typeof data.exits === "object" && data.exits !== null && !Array.isArray(data.exits)) {
    for (const [id, name] of Object.entries(data.exits)) {
      const exit = byId.get(id);
      if (!exit) throw new Error(`"exits" names exit "${id}", but no exit in "rows" is written as ${id}`);
      if (typeof name !== "string" || !name.trim()) throw new Error(`the name of exit "${id}" must be text`);
      names.push({ name: name.trim(), x: exit.cells[0] % w, y: Math.floor(exit.cells[0] / w) });
    }
  }
  if (Array.isArray(data.exitNames)) {
    for (const n of data.exitNames.filter(isNamedPoint)) {
      if (exits.some((e) => e.cells.includes(n.y * w + n.x))) names.push({ name: n.name, x: n.x, y: n.y });
    }
  }
  if (names.length) building.exitNames = names;

  // The entry exit: by ID or name, or (older files) by its scan-order number.
  const { entry, entryExitId } = data;
  if (typeof entry === "string" || typeof entry === "number") {
    const wanted = String(entry).trim();
    const named = names.find((n) => n.name.toLowerCase() === wanted.toLowerCase());
    const exit = byId.get(wanted) ?? (named && exits.find((e) => e.cells.includes(named.y * w + named.x)));
    if (!exit) throw new Error(`"entry" is "${wanted}", which is not an exit ID or name in this file`);
    building.entryExitId = exit.id;
  } else if (typeof entryExitId === "number" && Number.isInteger(entryExitId) && entryExitId >= 0 && entryExitId < exits.length) {
    building.entryExitId = entryExitId;
  }
  return building;
}

function isNamedPoint(l: unknown): l is { name: string; x: number; y: number } {
  if (typeof l !== "object" || l === null) return false;
  const p = l as Record<string, unknown>;
  return typeof p.name === "string" && Number.isInteger(p.x) && Number.isInteger(p.y);
}

function fromCells(data: Record<string, unknown>): Layout {
  const { width, height, cells } = data;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('the map needs a whole-number "width" and "height", or a "rows" list');
  if (!Array.isArray(cells) || cells.length !== width * height)
    throw new Error(`"cells" should hold ${width * height} values (width × height)`);
  if (!cells.every((c) => c === EMPTY || c === WALL || c === DOOR || c === EXIT || c === OBSTACLE)) throw new Error('"cells" has a value that is not 0, 1, 2, 3 or 4');
  return { width, height, cells: cells.slice() as number[], idCells: new Map() };
}

function fromRows(rows: unknown[]): Layout {
  const first = rows[0];
  if (typeof first !== "string") throw new Error('"rows" must be a list of strings');
  const cells: number[] = [];
  const idCells = new Map<string, number[]>();
  rows.forEach((row, y) => {
    if (typeof row !== "string" || row.length !== first.length) throw new Error(`row ${y} is not the same length as row 0`);
    for (const ch of row) {
      if (EXIT_ID.test(ch)) {
        idCells.set(ch, [...(idCells.get(ch) ?? []), cells.length]);
        cells.push(EXIT);
        continue;
      }
      const cell = ROW_CHARS[ch];
      if (cell === undefined) throw new Error(`row ${y} has the character "${ch}"; use . # D E X, or a digit or lowercase letter for an exit ID`);
      cells.push(cell);
    }
  });
  return { width: first.length, height: rows.length, cells, idCells };
}
