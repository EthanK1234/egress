// The example floor plans the user can pick from. Each is a Building saved as JSON in public/maps/.

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

// Checks that loaded JSON is a usable Building. Throws with the reason if not.
export function parseBuilding(raw: unknown): Building {
  if (typeof raw !== "object" || raw === null) throw new Error("the map is not an object");
  const { width, height, cells, labels, entryExitId } = raw as Record<string, unknown>;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 3 || (height as number) < 3)
    throw new Error("the map has no valid width and height");
  const w = width as number;
  const h = height as number;
  if (!Array.isArray(cells) || cells.length !== w * h) throw new Error(`the map should have ${w * h} cells`);
  if (!cells.every((c) => c === 0 || c === 1 || c === 2 || c === 3)) throw new Error("the map has a cell that is not 0, 1, 2 or 3");
  const named = Array.isArray(labels)
    ? labels.filter((l) => l && typeof l.name === "string" && Number.isFinite(l.x) && Number.isFinite(l.y))
    : [];
  return {
    width: w,
    height: h,
    cells: cells as number[],
    labels: named.map((l) => ({ name: l.name, x: l.x, y: l.y })),
    entryExitId: Number.isInteger(entryExitId) ? (entryExitId as number) : 0,
  };
}
