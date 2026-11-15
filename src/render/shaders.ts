// GLSL ES 3.00 sources for the 3D view. World units are grid cells; y is up.
// "Frame" is the playhead: a fractional frame number of the recording.

import { PAWN_HEIGHT, PAWN_RADIUS } from "./meshes";
import { FIRE_FRONT_FRAMES, FIRE_SETTLE_FRAMES } from "./view";

// Flat shading: 1.0 for faces pointing up, darker for sides turned away from the light.
const SHADE = `
const vec3 LIGHT = vec3(-0.249, 0.798, 0.549);
float shade(vec3 n) {
  return min(0.55 + 0.45 * max(dot(n, LIGHT), 0.0) / LIGHT.y, 1.0);
}`;

// Shared by walls, people and flames: the vertex shader has already picked the color.
export const FLAT_FS = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 outColor;
void main() {
  outColor = vec4(vColor, 1.0);
}`;

export const WALL_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vColor;
${SHADE}
void main() {
  vColor = aColor * shade(aNormal);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

// One instance per agent. iPlace = (x, z, scale, fall); fall 0 = standing, 1 = lying down.
// A scale of 0 collapses the figure, which is how hidden agents are skipped.
export const AGENT_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 iPlace;
layout(location = 3) in vec3 iColor;
uniform mat4 uViewProj;
out vec3 vColor;
${SHADE}
vec3 tipOver(vec3 v, float c, float s) {
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}
vec3 turn(vec3 v, float c, float s) {
  return vec3(v.x * c + v.z * s, v.y, v.z * c - v.x * s);
}
void main() {
  float scale = iPlace.z;
  float angle = iPlace.w * 1.5708;
  float ca = cos(angle), sa = sin(angle);
  vec3 p = tipOver(aPos * scale, ca, sa);
  vec3 n = tipOver(aNormal, ca, sa);
  p.z -= sa * ${(PAWN_HEIGHT / 2).toFixed(3)} * scale; // a fallen figure stays centred on its cell
  p.y += sa * ${PAWN_RADIUS.toFixed(3)} * scale; // and rests on the floor
  float yaw = float(gl_InstanceID) * 2.39996; // each figure faces its own way
  float cy = cos(yaw), sy = sin(yaw);
  p = turn(p, cy, sy);
  n = turn(n, cy, sy);
  float grounded = mix(0.7, 1.0, clamp(aPos.y / ${(PAWN_HEIGHT * 0.55).toFixed(3)}, 0.0, 1.0)); // darker towards the feet
  vColor = iColor * shade(n) * grounded;
  gl_Position = uViewProj * vec4(iPlace.x + p.x, p.y, iPlace.y + p.z, 1.0);
}`;

// One instance per cell that burns during the run. iCell = (cell x, cell y, ignite frame).
// The buffer never changes: a flame stays collapsed until the playhead reaches its ignite frame.
export const FLAME_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 iCell;
uniform mat4 uViewProj;
uniform float uFrame;
uniform float uClock;
uniform vec3 uFireBase;
uniform vec3 uFireTip;
out vec3 vColor;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float h1 = hash(iCell.xy);
  float h2 = hash(iCell.yx + 17.0);
  float h3 = hash(iCell.xy * 1.7 + 3.0);
  float age = uFrame - iCell.z;
  float grow = clamp((age + 1.0) / 3.0, 0.0, 1.0);
  // Fire that has burned for a while is lower and darker, so the front stands out.
  float settled = smoothstep(${FIRE_FRONT_FRAMES.toFixed(1)}, ${(FIRE_FRONT_FRAMES + FIRE_SETTLE_FRAMES).toFixed(1)}, age);
  float flicker = 0.8 + 0.2 * sin(uClock * (6.0 + 5.0 * h1) + h2 * 6.2832);
  float tall = (1.3 + 1.5 * h3) * flicker * grow * mix(1.0, 0.5, settled);
  float wide = (0.5 + 0.15 * h1) * sqrt(grow);
  float yaw = h2 * 6.2832;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 p = vec3(aPos.x * wide, aPos.y * tall, aPos.z * wide);
  p = vec3(p.x * cy + p.z * sy, p.y, p.z * cy - p.x * sy);
  float sway = aPos.y * aPos.y * 0.35 * grow; // the tip moves, the base stays put
  p.x += sway * sin(uClock * 3.3 + h3 * 9.0);
  p.z += sway * cos(uClock * 2.6 + h1 * 7.0);
  float facet = 0.85 + 0.15 * (aNormal.x * cy + aNormal.z * sy);
  vColor = mix(uFireBase, uFireTip, aPos.y * mix(1.0, 0.5, settled)) * facet * mix(1.0, 0.8, settled);
  vec2 center = iCell.xy + 0.5 + (vec2(h1, h3) - 0.5) * 0.3;
  gl_Position = uViewProj * vec4(center.x + p.x, p.y, center.y + p.z, 1.0);
}`;

export const FLOOR_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
out vec2 vWorld;
void main() {
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos.x, 0.0, aPos.y, 1.0);
}`;

// The whole floor is one quad. Per-cell data comes from three small textures (one texel per cell):
//   uBase     cell color (floor, door, exit)
//   uState    rgb = frame each behavior first stepped on the cell, a = frame the cell caught fire
//   uTraffic  rgb = path strength per behavior
// Paths, burnt floor, the grid and the bottleneck rings are all drawn here, so none of them cost geometry.
export const FLOOR_FS = `#version 300 es
precision highp float;
in vec2 vWorld;
uniform vec2 uSize;
uniform sampler2D uBase;
uniform highp sampler2D uState;
uniform sampler2D uTraffic;
uniform float uFrame;
uniform vec3 uPathOn;
uniform vec3 uPathColor[3];
uniform float uPathAlpha;
uniform vec3 uEmber;
uniform vec3 uBackground;
uniform float uGrid;
uniform float uMargin;
uniform vec4 uRings[5]; // x, z, radius, on
out vec4 outColor;

// 1.0 on the integer grid lines of p, fading over about a pixel.
float gridLines(vec2 p, vec2 pixel) {
  vec2 d = abs(fract(p - 0.5) - 0.5) / max(pixel, vec2(1e-6));
  return 1.0 - min(min(d.x, d.y), 1.0);
}

void main() {
  vec2 pixel = fwidth(vWorld);
  float coarse = max(pixel.x, pixel.y);
  vec3 color;
  if (vWorld.x >= 0.0 && vWorld.y >= 0.0 && vWorld.x < uSize.x && vWorld.y < uSize.y) {
    ivec2 cell = ivec2(vWorld);
    color = texelFetch(uBase, cell, 0).rgb;
    vec4 state = texelFetch(uState, cell, 0);
    vec3 traffic = texelFetch(uTraffic, cell, 0).rgb;
    for (int i = 0; i < 3; i++) {
      float on = uPathOn[i] * step(state[i], uFrame) * traffic[i];
      color = mix(color, uPathColor[i], on * uPathAlpha);
    }
    float burning = clamp(uFrame - state.a + 1.0, 0.0, 1.0);
    color = mix(color, uEmber, burning);
    // Cell grid, hidden once cells get too small to tell apart.
    float fine = gridLines(vWorld, pixel) * (1.0 - smoothstep(0.25, 0.5, coarse));
    color = mix(color, vec3(1.0), fine * 0.07 * uGrid);
    for (int i = 0; i < 5; i++) {
      float d = abs(distance(vWorld, uRings[i].xy) - uRings[i].z);
      color = mix(color, vec3(1.0), uRings[i].w * (1.0 - smoothstep(0.06, 0.06 + coarse * 1.5, d)));
    }
  } else {
    // Outside the building: a faint metre grid that fades into the background.
    vec2 away = max(max(-vWorld, vWorld - uSize), vec2(0.0));
    float fade = 1.0 - smoothstep(0.0, uMargin, length(away));
    float metre = gridLines(vWorld * 0.5, pixel * 0.5) * (1.0 - smoothstep(0.5, 1.0, coarse));
    float fiveMetres = gridLines(vWorld * 0.1, pixel * 0.1);
    color = uBackground + vec3(metre * 0.03 + fiveMetres * 0.05) * fade * fade;
  }
  outColor = vec4(color, 1.0);
}`;
