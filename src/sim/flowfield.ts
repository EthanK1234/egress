import { DENSITY_WEIGHT, EXIT } from "./config";
import type { Building } from "./types";

export interface Exit {
  id: number;
  cells: number[];
}

// 8-way moves: [dx, dy, length]
export const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Exit ids are 4-connected groups of exit cells, numbered in scan order.
export function findExits(b: Building): Exit[] {
  const { width: w, height: h, cells } = b;
  const seen = new Uint8Array(cells.length);
  const exits: Exit[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EXIT || seen[i]) continue;
    const group: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      const x = c % w;
      const y = (c - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (cells[n] === EXIT && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    exits.push({ id: exits.length, cells: group.sort((a, b) => a - b) });
  }
  return exits;
}

// What to call an exit: the name it was given, or "Exit" and its number.
export function exitName(b: Building, exit: Exit): string {
  const named = b.exitNames?.find((n) => exit.cells.includes(n.y * b.width + n.x));
  return named ? named.name : `Exit ${exit.id}`;
}

// True if a move from (x, y) by (dx, dy) is allowed. Diagonals can't cut corners.
export function canStep(w: number, h: number, blocked: Uint8Array, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
  if (blocked[ny * w + nx]) return false;
  if (dx && dy && (blocked[y * w + nx] || blocked[ny * w + x])) return false;
  return true;
}

// Multi-source Dijkstra from `sources`. Returns distance per cell (Infinity = unreachable).
// Entering a cell costs stepLength * (1 + DENSITY_WEIGHT * density).
export function computeField(w: number, h: number, blocked: Uint8Array, sources: number[], density: Float32Array): Float32Array {
  const dist = new Float32Array(w * h).fill(Infinity);
  const heap = new MinHeap();
  for (const s of sources) {
    if (blocked[s]) continue;
    dist[s] = 0;
    heap.push(0, s);
  }
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    const x = u % w;
    const y = (u - x) / w;
    for (const [dx, dy, len] of DIRS) {
      if (!canStep(w, h, blocked, x, y, dx, dy)) continue;
      const v = (y + dy) * w + (x + dx);
      const nd = d + len * (1 + DENSITY_WEIGHT * density[v]);
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push(dist[v], v); // push the float32-rounded value so the stale check below matches
      }
    }
  }
  return dist;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0], vals[0]];
    const lastK = keys.pop()!;
    const lastV = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastK) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = lastK;
      vals[i] = lastV;
    }
    return top;
  }
}
