// Every color drawn on the 2D map, in the 3D view and on the legend swatches lives here.
//
// Color is kept for data; the UI around it is neutral gray.
// - People: blue, yellow, magenta. This set was checked for color-blind separation
//   against the floor color, so the three behaviors stay distinct without labels.
// - Red is only ever fire. Green is only ever an exit or people who got out.
// - Pale neutral is for annotations and for trapped people (it shows on floor and fire alike).

import type { Behavior } from "../sim/types";

export const BEHAVIORS: Behavior[] = ["calm", "panicker", "freezer"];

export const BEHAVIOR_NAME: Record<Behavior, string> = { calm: "Calm", panicker: "Panicker", freezer: "Freezer" };

export const BEHAVIOR_COLOR: Record<Behavior, string> = {
  calm: "#3987e5",
  panicker: "#c98500",
  freezer: "#d55181",
};

export const COLOR = {
  background: "#0b0e12",
  floor: "#161c24",
  door: "#626c7a",
  wall: "#8a95a6", // 2D map
  wallTop: "#a7b2c2", // 3D view
  wallSide: "#5d6a7e",
  exit: "#0ca30c",
  fire: "#d03b3b",
  fireTip: "#f39a3d",
  ember: "#7a1f14", // floor under the flames, and fire that has burned for a while
  frozen: "#f4a6c6",
  trapped: "#dfe5ec",
  inside: "#5f6b7b", // people still in the building, in the readout bar
};

export type RGB = [number, number, number];

// "#rrggbb" to 0..255 channels
export function rgb255(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}

// "#rrggbb" to 0..1 channels, for WebGL
export function rgb(hex: string): RGB {
  const [r, g, b] = rgb255(hex);
  return [r / 255, g / 255, b / 255];
}
