// The layout being edited: a stack of floors, each a Building plus its fire starts.
// Pure functions; every edit returns a new Floor and leaves the old one untouched.
//
// Floors are simulated one at a time (the sim knows nothing about stairs). An exit on an
// upper floor stands for a stairwell door: people who reach it count as having left that floor.

import { DOOR, EMPTY, EXIT, WALL } from "../sim/config";
import { findExits } from "../sim/flowfield";
import type { Building } from "../sim/types";

export type Tool = "fire" | "wall" | "door" | "exit" | "erase";

export interface Floor {
  building: Building;
  fireStarts: [number, number][];
}

export const MAX_FLOORS = 6;

const TOOL_CELL: Record<Exclude<Tool, "fire">, number> = { wall: WALL, door: DOOR, exit: EXIT, erase: EMPTY };

// Sets one cell to what the tool paints. Returns the same floor if nothing would change.
export function paintCell(floor: Floor, x: number, y: number, tool: Exclude<Tool, "fire">): Floor {
  const b = floor.building;
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return floor;
  const i = y * b.width + x;
  const value = TOOL_CELL[tool];
  if (b.cells[i] === value) return floor;

  const cells = b.cells.slice();
  cells[i] = value;
  const building: Building = { ...b, cells };
  // Exits are numbered in scan order, so adding or removing one can leave the entry exit's id dangling.
  if (building.entryExitId >= findExits(building).length) building.entryExitId = 0;
  // A fire can't start inside a wall.
  const fireStarts = value === WALL ? floor.fireStarts.filter(([fx, fy]) => fx !== x || fy !== y) : floor.fireStarts;
  return { building, fireStarts };
}

// Adds a fire start on a cell, or removes the one already there. Walls can't burn.
export function toggleFireStart(floor: Floor, x: number, y: number): Floor {
  const b = floor.building;
  if (x < 0 || y < 0 || x >= b.width || y >= b.height || b.cells[y * b.width + x] === WALL) return floor;
  const has = floor.fireStarts.some(([fx, fy]) => fx === x && fy === y);
  return {
    building: b,
    fireStarts: has ? floor.fireStarts.filter(([fx, fy]) => fx !== x || fy !== y) : [...floor.fireStarts, [x, y]],
  };
}

// A new floor with the same layout as `floor` and no fire.
export function copyFloor(floor: Floor): Floor {
  const b = floor.building;
  return { building: { ...b, cells: b.cells.slice(), labels: b.labels.map((l) => ({ ...l })) }, fireStarts: [] };
}

// The cells on a straight line between two cells, both ends included (for painting while dragging).
export function cellsBetween(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    cells.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)]);
  }
  return cells;
}
