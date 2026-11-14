import { FIRE_SPREAD, WALL } from "./config";
import type { Rng } from "./rng";
import type { Building } from "./types";

// Spreads fire one tick. Mutates `fire` and returns the newly lit cell indices.
export function spreadFire(b: Building, fire: Uint8Array, rng: Rng): number[] {
  const { width: w, height: h, cells } = b;
  const lit: number[] = [];
  for (let i = 0; i < fire.length; i++) {
    if (!fire[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const neighbors = [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y < h - 1 ? i + w : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || fire[n] || cells[n] === WALL) continue;
      if (rng.next() < FIRE_SPREAD) lit.push(n);
    }
  }
  for (const n of lit) fire[n] = 1;
  return lit;
}
