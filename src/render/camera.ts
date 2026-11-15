// Orbit camera for the 3D view. It circles a point on the floor and always looks at it.

import type { Building } from "../sim/types";
import { lookAt, multiply, perspective, project, type Mat4 } from "./mat4";
import { WALL_HEIGHT } from "./meshes";

export interface Camera {
  yaw: number; // radians around the vertical axis; 0 looks north from the south side
  pitch: number; // radians above the floor; PI/2 would be straight down
  dist: number; // cells from the target
  tx: number; // target on the floor
  tz: number;
  reach: number; // rough size of the scene, used for the far clipping plane
}

const FOV = (35 * Math.PI) / 180;
const DEFAULT_YAW = -0.38;
const DEFAULT_PITCH = 0.92;
const MIN_PITCH = 0.3;
const MAX_PITCH = 1.5;
const FILL = 0.9; // share of the view the building takes up in the overview

export function viewProjection(c: Camera, aspect: number): Mat4 {
  const flat = Math.cos(c.pitch) * c.dist;
  const eye: [number, number, number] = [c.tx + Math.sin(c.yaw) * flat, Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * flat];
  const view = lookAt(eye, [c.tx, 0, c.tz], [0, 1, 0]);
  return multiply(perspective(FOV, aspect, Math.max(c.dist * 0.05, 0.5), c.dist + c.reach * 3), view);
}

// The overview: the whole building, centred, seen from above and a little to one side.
export function fitCamera(b: Building, aspect: number): Camera {
  const reach = Math.hypot(b.width, b.height);
  const c: Camera = { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: reach * 1.5, tx: b.width / 2, tz: b.height / 2, reach };
  const tanHalf = Math.tan(FOV / 2);
  // Project the building's corners, then nudge the target and distance until they sit inside the view.
  for (let pass = 0; pass < 8; pass++) {
    const m = viewProjection(c, aspect);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [0, b.width]) {
      for (const y of [0, WALL_HEIGHT]) {
        for (const z of [0, b.height]) {
          const [px, py, , pw] = project(m, x, y, z);
          x0 = Math.min(x0, px / pw);
          x1 = Math.max(x1, px / pw);
          y0 = Math.min(y0, py / pw);
          y1 = Math.max(y1, py / pw);
        }
      }
    }
    const right = ((x0 + x1) / 2) * c.dist * tanHalf * aspect;
    const forward = (((y0 + y1) / 2) * c.dist * tanHalf) / Math.sin(c.pitch);
    c.tx += Math.cos(c.yaw) * right - Math.sin(c.yaw) * forward;
    c.tz += -Math.sin(c.yaw) * right - Math.cos(c.yaw) * forward;
    c.dist *= Math.max(x1 - x0, y1 - y0) / 2 / FILL;
  }
  return c;
}

export function orbit(c: Camera, dYaw: number, dPitch: number): void {
  c.yaw += dYaw;
  c.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, c.pitch + dPitch));
}

// `fitDist` is the overview distance; zoom stays within a sensible range of it.
export function zoom(c: Camera, factor: number, fitDist: number): void {
  c.dist = Math.min(fitDist * 2.5, Math.max(fitDist * 0.25, c.dist * factor));
}
