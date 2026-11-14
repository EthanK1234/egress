import type { Building, Cell } from "./types";

const W = 60;
const H = 40;
const EMPTY: Cell = 0;
const WALL: Cell = 1;
const DOOR: Cell = 2;
const EXIT: Cell = 3;

function build(): Building {
  const cells: number[] = new Array(W * H).fill(EMPTY);
  const set = (x: number, y: number, c: Cell) => {
    cells[y * W + x] = c;
  };

  // Outer walls
  for (let x = 0; x < W; x++) {
    set(x, 0, WALL);
    set(x, H - 1, WALL);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, WALL);
    set(W - 1, y, WALL);
  }

  // Interior wall splitting the building into two rooms, with a 1-cell door
  const divider = 30;
  for (let y = 1; y < H - 1; y++) set(divider, y, WALL);
  set(divider, 20, DOOR);

  // Exits on the outer wall: exit 0 (entry) on the left room's bottom wall,
  // exit 1 on the right room's right wall. Each is 2 cells wide.
  set(14, H - 1, EXIT);
  set(15, H - 1, EXIT);
  set(W - 1, 10, EXIT);
  set(W - 1, 11, EXIT);

  return {
    width: W,
    height: H,
    cells,
    labels: [
      { name: "Lobby", x: 15, y: 20 },
      { name: "Hall", x: 45, y: 20 },
    ],
    entryExitId: 0,
  };
}

export const testMap: Building = build();
