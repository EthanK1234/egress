// The example floor plans the user can pick from (Building JSON in public/maps/),
// and the check that turns any loaded or imported JSON into a Building.

import { DOOR, EMPTY, EXIT, WALL } from "./config";
import { findExits } from "./flowfield";
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

const ROW_CHARS: Record<string, number> = { ".": EMPTY, " ": EMPTY, "#": WALL, D: DOOR, E: EXIT };

// Checks that loaded JSON is a usable Building. Throws with the reason if not.
// The layout is either `width`, `height` and `cells` (row by row, 0 empty, 1 wall, 2 door, 3 exit),
// or `rows`: one string per row using . empty, # wall, D door, E exit.
export function parseBuilding(raw: unknown): Building {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the file is not a JSON object");
  const data = raw as Record<string, unknown>;
  const { width: w, height: h, cells } = Array.isArray(data.rows) ? fromRows(data.rows) : fromCells(data);
  if (w < 3 || h < 3) throw new Error("the map must be at least 3 by 3 cells");
  if (w > MAX_MAP_SIDE || h > MAX_MAP_SIDE) throw new Error(`the map is larger than ${MAX_MAP_SIDE} by ${MAX_MAP_SIDE} cells`);

  const labels = Array.isArray(data.labels)
    ? data.labels.filter((l) => l && typeof l.name === "string" && Number.isFinite(l.x) && Number.isFinite(l.y))
    : [];
  const building: Building = { width: w, height: h, cells, labels: labels.map((l) => ({ name: l.name, x: l.x, y: l.y })), entryExitId: 0 };

  const exits = findExits(building).length;
  if (exits === 0) throw new Error("the map has no exit cells");
  if (!cells.includes(EMPTY)) throw new Error("the map has no open floor");
  const entry = data.entryExitId;
  if (typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry < exits) building.entryExitId = entry;
  return building;
}

function fromCells(data: Record<string, unknown>): { width: number; height: number; cells: number[] } {
  const { width, height, cells } = data;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('the map needs a whole-number "width" and "height", or a "rows" list');
  if (!Array.isArray(cells) || cells.length !== width * height)
    throw new Error(`"cells" should hold ${width * height} values (width × height)`);
  if (!cells.every((c) => c === EMPTY || c === WALL || c === DOOR || c === EXIT)) throw new Error('"cells" has a value that is not 0, 1, 2 or 3');
  return { width, height, cells: cells.slice() as number[] };
}

function fromRows(rows: unknown[]): { width: number; height: number; cells: number[] } {
  const first = rows[0];
  if (typeof first !== "string") throw new Error('"rows" must be a list of strings');
  const cells: number[] = [];
  rows.forEach((row, y) => {
    if (typeof row !== "string" || row.length !== first.length) throw new Error(`row ${y} is not the same length as row 0`);
    for (const ch of row) {
      const cell = ROW_CHARS[ch];
      if (cell === undefined) throw new Error(`row ${y} has the character "${ch}"; use . # D E`);
      cells.push(cell);
    }
  });
  return { width: first.length, height: rows.length, cells };
}
