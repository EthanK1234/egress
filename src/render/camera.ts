// Cameras for the 3D view.
// - Orbit: circles a point on the floor being shown and always looks at it.
// - First person: sits at a person's eye height and looks where they are heading.

import type { Building } from "../sim/types";
import { cross, lookAt, multiply, normalize, perspective, project, type Mat4, type Vec3 } from "./mat4";
import { WALL_HEIGHT } from "./meshes";

export interface Camera {
  yaw: number; // radians around the vertical axis; 0 looks north from the south side
  pitch: number; // radians above the floor; PI/2 would be straight down
  dist: number; // cells from the target
  tx: number; // target: a point on the floor being shown
  ty: number;
  tz: number;
  reach: number; // rough size of the scene, used for the far clipping plane
  // When set, the view is first person instead: eye position and the flat direction it faces.
  fp?: { x: number; y: number; z: number; dx: number; dz: number };
}

const FOV = (35 * Math.PI) / 180;
const FP_FOV = (72 * Math.PI) / 180;
const FP_TILT = 0.24; // how far a first-person view looks down, so the floor ahead is in frame
const DEFAULT_YAW = -0.38;
const DEFAULT_PITCH = 0.92;
const MIN_PITCH = 0.1; // low enough to look out to the horizon and the sky
const MAX_PITCH = 1.5;
const FILL = 0.9; // share of the view the building takes up in the overview

function orbitEye(c: Camera): Vec3 {
  const flat = Math.cos(c.pitch) * c.dist;
  return [c.tx + Math.sin(c.yaw) * flat, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * flat];
}

export function viewProjection(c: Camera, aspect: number): Mat4 {
  if (c.fp) {
    const { x, y, z, dx, dz } = c.fp;
    const view = lookAt([x, y, z], [x + dx, y - FP_TILT, z + dz], [0, 1, 0]);
    return multiply(perspective(FP_FOV, aspect, 0.05, c.reach * 3), view);
  }
  const view = lookAt(orbitEye(c), [c.tx, c.ty, c.tz], [0, 1, 0]);
  return multiply(perspective(FOV, aspect, Math.max(c.dist * 0.05, 0.5), c.dist + c.reach * 3), view);
}

// The directions a view looks along, for working out which way each pixel points (the sky).
// tanX and tanY are the half-widths of the view at distance 1.
export function viewBasis(c: Camera, aspect: number): { forward: Vec3; right: Vec3; up: Vec3; tanX: number; tanY: number } {
  const eye = orbitEye(c);
  const forward = normalize(c.fp ? [c.fp.dx, -FP_TILT, c.fp.dz] : [c.tx - eye[0], c.ty - eye[1], c.tz - eye[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const tan = Math.tan((c.fp ? FP_FOV : FOV) / 2);
  return { forward, right, up: cross(right, forward), tanX: tan * aspect, tanY: tan };
}

// The overview: the whole floor, centred, seen from above and a little to one side.
// `elevation` is the height of the floor being shown.
export function fitCamera(b: Building, aspect: number, elevation: number): Camera {
  const reach = Math.hypot(b.width, b.height) + elevation;
  const c: Camera = {
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    dist: reach * 1.5,
    tx: b.width / 2,
    ty: elevation,
    tz: b.height / 2,
    reach,
  };
  const tanHalf = Math.tan(FOV / 2);
  // Project the floor's corners, then nudge the target and distance until they sit inside the view.
  for (let pass = 0; pass < 8; pass++) {
    const m = viewProjection(c, aspect);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [0, b.width]) {
      for (const y of [elevation, elevation + WALL_HEIGHT]) {
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

const MIN_ZOOM = 0.06; // closest zoom, as a share of the overview distance
const MAX_ZOOM = 2.5;

// `fitDist` is the overview distance; zoom stays within a sensible range of it.
// With a `focus` point, the camera closes in on that point rather than on the middle of the view:
// the point stays under the pointer while everything else scales around it.
export function zoom(c: Camera, factor: number, fitDist: number, focus?: Vec3 | null): void {
  const next = Math.min(fitDist * MAX_ZOOM, Math.max(fitDist * MIN_ZOOM, c.dist * factor));
  const f = next / c.dist;
  if (focus) {
    c.tx += (focus[0] - c.tx) * (1 - f);
    c.tz += (focus[2] - c.tz) * (1 - f);
  }
  c.dist = next;
}

// Moves the point the camera circles, keeping it within `bounds` (x0, z0, x1, z1) so the view can't be lost.
export function pan(c: Camera, dx: number, dz: number, bounds: [number, number, number, number]): void {
  c.tx = Math.min(bounds[2], Math.max(bounds[0], c.tx + dx));
  c.tz = Math.min(bounds[3], Math.max(bounds[1], c.tz + dz));
}

// The point on the floor being shown under a point of the view, or null if that part of the view
// looks at the sky (or so far off that it isn't useful).
export function floorPoint(c: Camera, aspect: number, nx: number, ny: number): Vec3 | null {
  const { origin, dir } = screenRay(c, aspect, nx, ny);
  if (dir[1] > -0.02) return null;
  const t = (c.ty - origin[1]) / dir[1];
  if (t > c.dist + c.reach * 2) return null;
  return [origin[0] + dir[0] * t, c.ty, origin[2] + dir[2] * t];
}

// The ray under a point of the view, for the orbit camera.
// (nx, ny) run from -1 to 1 across the view, with +y up.
export function screenRay(c: Camera, aspect: number, nx: number, ny: number): { origin: Vec3; dir: Vec3 } {
  const origin = orbitEye(c);
  const forward = normalize([c.tx - origin[0], c.ty - origin[1], c.tz - origin[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const t = Math.tan(FOV / 2);
  const sx = nx * t * aspect;
  const sy = ny * t;
  return {
    origin,
    dir: normalize([
      forward[0] + right[0] * sx + up[0] * sy,
      forward[1] + right[1] * sx + up[1] * sy,
      forward[2] + right[2] * sx + up[2] * sy,
    ]),
  };
}
