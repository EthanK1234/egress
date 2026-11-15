// View options shared by the 2D map and the 3D view.

import type { Behavior } from "../sim/types";

export interface Layers {
  people: Record<Behavior, boolean>; // show agents with this behavior
  paths: Record<Behavior, boolean>; // highlight the cells this behavior walked through
  grid: boolean;
  labels: boolean; // room and exit names
  bottlenecks: boolean; // rings on the jam spots once results are shown
  selected: number | null; // id of the person picked out: ringed on the map, followed in the 3D view
}

export const DEFAULT_LAYERS: Layers = {
  people: { calm: true, panicker: true, freezer: true },
  paths: { calm: false, panicker: false, freezer: false },
  grid: true,
  labels: true,
  bottlenecks: true,
  selected: null,
};

export const RING_RADIUS = 2; // bottleneck marker radius, in cells

// Fire looks different as it ages: a bright front, then a steady burn, then lower and darker.
export const FIRE_FRONT_FRAMES = 8; // how long a newly lit cell counts as the front
export const FIRE_SETTLE_FRAMES = 50; // how long after that until it has fully settled
