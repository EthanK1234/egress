// Low-poly geometry for the 3D view, built in code. Units are grid cells; y is up.
// Every triangle is flat-shaded: its three vertices share one normal.

import { CHAIR, EXIT, TABLE, WALL } from "../sim/config";
import type { Building } from "../sim/types";
import { COLOR, rgb, type RGB } from "./palette";

export const WALL_HEIGHT = 3.4;
export const TABLE_HEIGHT = 1.5; // 0.75 m
export const CHAIR_HEIGHT = 2.1; // top of the backrest
export const EXIT_POST_HEIGHT = 4.1; // the wall cells either side of an exit stand a little taller
export const FLOOR_SPACING = 4; // height from one floor to the next
export const PAWN_HEIGHT = 2.2;
export const PAWN_RADIUS = 0.43; // at the feet

type V3 = [number, number, number];

// Appends one triangle as position + normal (+ color) per vertex.
// It is wound to face away from `inside`, so back faces can be culled.
function pushTri(out: number[], a: V3, b: V3, c: V3, inside: V3, color?: RGB): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  if (nx * (a[0] - inside[0]) + ny * (a[1] - inside[1]) + nz * (a[2] - inside[2]) < 0) {
    [b, c] = [c, b];
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  for (const p of [a, b, c]) {
    out.push(p[0], p[1], p[2], nx, ny, nz);
    if (color) out.push(color[0], color[1], color[2]);
  }
}

function pushQuad(out: number[], a: V3, b: V3, c: V3, d: V3, inside: V3, color?: RGB): void {
  pushTri(out, a, b, c, inside, color);
  pushTri(out, a, c, d, inside, color);
}

// Points on a horizontal circle.
function ring(sides: number, radius: number, y: number, twist = 0): V3[] {
  const points: V3[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + twist;
    points.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
  }
  return points;
}

// A person: a tapered six-sided body with an eight-faced head. 26 triangles.
// Layout: position (3), normal (3).
export function pawnMesh(): Float32Array {
  const out: number[] = [];
  const sides = 6;
  const shoulderY = 1.46;
  const bodyCenter: V3 = [0, 0.7, 0];
  const feet = ring(sides, PAWN_RADIUS, 0);
  const shoulders = ring(sides, 0.19, shoulderY);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushQuad(out, feet[i], feet[j], shoulders[j], shoulders[i], bodyCenter);
    pushTri(out, shoulders[i], shoulders[j], [0, shoulderY, 0], bodyCenter);
  }
  const headRadius = 0.34;
  const headCenter: V3 = [0, PAWN_HEIGHT - headRadius, 0];
  const equator = ring(4, headRadius, headCenter[1]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    pushTri(out, equator[i], equator[j], [0, PAWN_HEIGHT, 0], headCenter);
    pushTri(out, equator[i], equator[j], [0, PAWN_HEIGHT - 2 * headRadius, 0], headCenter);
  }
  return new Float32Array(out);
}

// A flame: a five-sided teardrop, one unit tall. The shader stretches and sways it. 15 triangles.
// Layout: position (3), normal (3).
export function flameMesh(): Float32Array {
  const out: number[] = [];
  const sides = 5;
  const inside: V3 = [0, 0.3, 0];
  const base = ring(sides, 0.6, 0);
  const belly = ring(sides, 1, 0.3, Math.PI / sides);
  const tip: V3 = [0, 1, 0];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushTri(out, base[i], base[j], belly[i], inside);
    pushTri(out, base[j], belly[j], belly[i], inside);
    pushTri(out, belly[i], belly[j], tip, inside);
  }
  return new Float32Array(out);
}

// Height of the wall drawn on a cell: 0 where there is no wall.
export function wallHeightAt(b: Building, x: number, y: number): number {
  const cellAt = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= b.width || cy >= b.height ? -1 : b.cells[cy * b.width + cx]);
  if (cellAt(x, y) !== WALL) return 0;
  const byExit = cellAt(x - 1, y) === EXIT || cellAt(x + 1, y) === EXIT || cellAt(x, y - 1) === EXIT || cellAt(x, y + 1) === EXIT;
  return byExit ? EXIT_POST_HEIGHT : WALL_HEIGHT;
}

// Height of whatever stands on a cell (wall, table or chair), for placing the editor cursor on top of it.
export function topAt(b: Building, x: number, y: number): number {
  const cell = x < 0 || y < 0 || x >= b.width || y >= b.height ? -1 : b.cells[y * b.width + x];
  return cell === TABLE ? TABLE_HEIGHT : cell === CHAIR ? CHAIR_HEIGHT : wallHeightAt(b, x, y);
}

// Appends all walls of one floor. Faces between two wall cells are never seen, so they are left out.
// `base` is the height the floor stands at. A floor under the one being shown is drawn as a storey:
// plain dark walls that reach up to the floor above, so the stack reads as one building.
// Layout: position (3), normal (3), color (3).
export function pushWalls(out: number[], b: Building, base: number, asStorey: boolean): void {
  const { width: w, height: h } = b;
  const top = rgb(asStorey ? COLOR.storey : COLOR.wallTop);
  const side = rgb(asStorey ? COLOR.storey : COLOR.wallSide);
  const postTop = rgb(COLOR.exit);
  const postSide = postTop.map((c) => c * 0.6) as RGB;
  // A storey stops just short of the floor above, so the two never share a surface.
  const heightAt = (x: number, y: number) => {
    const height = wallHeightAt(b, x, y);
    return asStorey && height > 0 ? FLOOR_SPACING - 0.05 : height;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const height = heightAt(x, y);
      if (height === 0) continue;
      const isPost = !asStorey && height > WALL_HEIGHT;
      const y1 = base + height;
      const inside: V3 = [x + 0.5, base + height / 2, y + 0.5];
      pushQuad(out, [x, y1, y], [x + 1, y1, y], [x + 1, y1, y + 1], [x, y1, y + 1], inside, isPost ? postTop : top);

      // Each side shows only the part that rises above its neighbour.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const low = heightAt(x + dx, y + dy);
        if (low >= height) continue;
        const y0 = base + low;
        const color = isPost ? postSide : side;
        if (dx !== 0) {
          const fx = dx > 0 ? x + 1 : x;
          pushQuad(out, [fx, y0, y], [fx, y0, y + 1], [fx, y1, y + 1], [fx, y1, y], inside, color);
        } else {
          const fz = dy > 0 ? y + 1 : y;
          pushQuad(out, [x, y0, fz], [x + 1, y0, fz], [x + 1, y1, fz], [x, y1, fz], inside, color);
        }
      }
    }
  }
}

const ALL_FACES = { top: true, bottom: true, west: true, east: true, north: true, south: true };

// A box with a lighter top than sides. `faces` picks which of the six to build, so hidden ones can be left out.
function pushBox(
  out: number[],
  [x0, y0, z0]: V3,
  [x1, y1, z1]: V3,
  top: RGB,
  side: RGB,
  faces = ALL_FACES,
): void {
  const inside: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  if (faces.top) pushQuad(out, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], inside, top);
  if (faces.bottom) pushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], inside, side);
  if (faces.west) pushQuad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], inside, side);
  if (faces.east) pushQuad(out, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], inside, side);
  if (faces.north) pushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], inside, side);
  if (faces.south) pushQuad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], inside, side);
}

const LEG_FACES = { top: false, bottom: false, west: true, east: true, north: true, south: true };
const TABLE_TOP = 0.14; // thickness of a tabletop
const TABLE_LEG = 0.14;
const SEAT_HEIGHT = 0.9; // 0.45 m
const SEAT_INSET = 0.14; // a chair is narrower than its cell
const CHAIR_BACK = 0.24; // thickness of the backrest

// Appends the tables and chairs of one floor.
// Table cells that touch share one tabletop, with a leg under each outer corner.
// A chair is an L seen from the side: a seat and a backrest. It faces the nearest table within
// two cells, with its back away from it; with no table near, it faces the top of the map.
// Layout: position (3), normal (3), color (3).
export function pushFurniture(out: number[], b: Building, base: number): void {
  const { width: w, height: h } = b;
  const cellAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : b.cells[y * w + x]);
  const top = rgb(COLOR.furnitureTop);
  const side = rgb(COLOR.furnitureSide);

  // The direction a chair on this cell faces.
  const facing = (x: number, y: number): readonly [number, number] => {
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
    for (const reach of [1, 2]) {
      const dir = dirs.find(([dx, dy]) => cellAt(x + dx * reach, y + dy * reach) === TABLE);
      if (dir) return dir;
    }
    return dirs[0];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = cellAt(x, y);
      if (cell === TABLE) {
        const isTable = (dx: number, dy: number) => cellAt(x + dx, y + dy) === TABLE;
        pushBox(out, [x, base + TABLE_HEIGHT - TABLE_TOP, y], [x + 1, base + TABLE_HEIGHT, y + 1], top, side, {
          top: true,
          bottom: true,
          west: !isTable(-1, 0),
          east: !isTable(1, 0),
          north: !isTable(0, -1),
          south: !isTable(0, 1),
        });
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          if (isTable(dx, 0) || isTable(0, dy)) continue; // not an outer corner
          const lx = dx < 0 ? x + 0.08 : x + 0.92 - TABLE_LEG;
          const lz = dy < 0 ? y + 0.08 : y + 0.92 - TABLE_LEG;
          pushBox(out, [lx, base, lz], [lx + TABLE_LEG, base + TABLE_HEIGHT - TABLE_TOP, lz + TABLE_LEG], side, side, LEG_FACES);
        }
      } else if (cell === CHAIR) {
        // A solid L: a seat block on the floor with a thick backrest on the side away from the table.
        const x0 = x + SEAT_INSET;
        const x1 = x + 1 - SEAT_INSET;
        const z0 = y + SEAT_INSET;
        const z1 = y + 1 - SEAT_INSET;
        const seat = base + SEAT_HEIGHT;
        const [fx, fy] = facing(x, y);
        pushBox(out, [x0, base, z0], [x1, seat, z1], top, side, { ...ALL_FACES, bottom: false });
        const back = { ...ALL_FACES, bottom: false };
        const backTop = base + CHAIR_HEIGHT;
        if (fy < 0) pushBox(out, [x0, seat, z1 - CHAIR_BACK], [x1, backTop, z1], top, side, back);
        else if (fy > 0) pushBox(out, [x0, seat, z0], [x1, backTop, z0 + CHAIR_BACK], top, side, back);
        else if (fx < 0) pushBox(out, [x1 - CHAIR_BACK, seat, z0], [x1, backTop, z1], top, side, back);
        else pushBox(out, [x0, seat, z0], [x0 + CHAIR_BACK, backTop, z1], top, side, back);
      }
    }
  }
}

// A flat square just above a cell (or above the wall on it): the cursor of the layout editor.
// Layout: position (3), normal (3), color (3).
export function cursorPlate(x: number, y: number, height: number, color: RGB): Float32Array {
  const out: number[] = [];
  const top = height + 0.06;
  pushQuad(out, [x, top, y], [x + 1, top, y], [x + 1, top, y + 1], [x, top, y + 1], [x + 0.5, top - 1, y + 0.5], color);
  return new Float32Array(out);
}

// How far the ground plane reaches past the building, in cells.
export function groundMargin(b: Building): number {
  return Math.max(b.width, b.height) * 0.8;
}

// Two quads facing up: the ground under and around the building, then only the footprint of the
// building (used for a floor that is drawn above ground level). Layout: x, z.
export function groundQuads(b: Building): Float32Array {
  const m = groundMargin(b);
  const quad = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x0, z1, x1, z1, x0, z0, x1, z1, x1, z0];
  return new Float32Array([...quad(-m, -m, b.width + m, b.height + m), ...quad(0, 0, b.width, b.height)]);
}
