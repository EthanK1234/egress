// Path highlights: where each behavior walked, prepared once per recording and shared by both views.
//
// A person is about as wide as a cell, and diagonal steps skip the cells beside them, so raw
// per-cell visits look like scattered dots. Each visit is spread over the 3x3 block around it
// instead, which turns a route into a continuous band.

import { WALL, isFurniture } from "../sim/config";
import type { Recording } from "../sim/recording";
import type { Behavior } from "../sim/types";
import { BEHAVIORS } from "./palette";

export interface PathLayer {
  strength: Float32Array; // per cell, 0..1: how strongly to tint it
  since: Float32Array; // per cell: frame from which the tint shows (Infinity = never)
}

export const PATH_ALPHA = 0.7; // tint of the busiest cells
const FAINTEST = 0.18; // a single pass is still visible
const BUSY = 2; // passes per cell at which the tint is about two thirds of full

const cache = new WeakMap<Recording, Record<Behavior, PathLayer>>();

export function pathLayers(rec: Recording): Record<Behavior, PathLayer> {
  let layers = cache.get(rec);
  if (!layers) {
    layers = Object.fromEntries(BEHAVIORS.map((b) => [b, buildLayer(rec, b)])) as Record<Behavior, PathLayer>;
    cache.set(rec, layers);
  }
  return layers;
}

function buildLayer(rec: Recording, behavior: Behavior): PathLayer {
  const { width: w, height: h, cells } = rec.building;
  const visits = rec.visits[behavior];
  const firstVisit = rec.firstVisit[behavior];
  const strength = new Float32Array(w * h);
  const since = new Float32Array(w * h).fill(Infinity);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] === WALL || isFurniture(cells[i])) continue;
      let passes = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
          const j = ny * w + nx;
          if (visits[j] === 0) continue;
          // Weights 4 (the cell itself), 2 (beside it), 1 (diagonal), out of 16.
          passes += (visits[j] * (nx === x ? 2 : 1) * (ny === y ? 2 : 1)) / 16;
          since[i] = Math.min(since[i], firstVisit[j]);
        }
      }
      if (passes > 0) strength[i] = FAINTEST + (1 - FAINTEST) * (1 - Math.exp(-passes / BUSY));
    }
  }
  return { strength, since };
}
