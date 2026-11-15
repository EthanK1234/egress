// WebGL2 renderer for the 3D view. No 3D library: four small shader programs and a handful of draw calls.
//
// Kept light on the GPU on purpose:
// - floor, paths, grid, burnt cells and bottleneck rings are one quad, shaded from tiny per-cell textures
// - walls and furniture are one static mesh with hidden faces removed; the floors underneath are a second one
// - people and flames are instanced (one draw call each)
// - flames and textures are uploaded once per run; the shaders animate them from the playhead
// - the only per-frame upload is the people buffer (7 floats per person)
// Nothing here runs on a timer: the owner calls draw() only when something changed.

import { DOOR, EXIT } from "../sim/config";
import { EVACUATED, FROZEN, TRAPPED, type Recording } from "../sim/recording";
import type { Behavior, Building } from "../sim/types";
import { viewBasis, viewProjection, type Camera } from "./camera";
import { translated, type Mat4 } from "./mat4";
import { FLOOR_SPACING, cursorPlate, flameMesh, groundMargin, groundQuads, pawnMesh, pushFurniture, pushWalls, topAt } from "./meshes";
import { BEHAVIORS, BEHAVIOR_COLOR, COLOR, rgb, rgb255, type RGB } from "./palette";
import { PATH_ALPHA, pathLayers } from "./paths";
import { AGENT_VS, FLAME_VS, FLAT_FS, FLOOR_FS, FLOOR_VS, SKY_FS, SKY_VS, WALL_VS } from "./shaders";
import { RING_RADIUS, type Layers } from "./view";

export interface Frame3D {
  playhead: number; // fractional frame of the recording
  clock: number; // seconds; drives the flame flicker
  camera: Camera;
  layers: Layers;
  rings: { x: number; y: number }[]; // bottleneck markers (at most 5 are drawn)
  hidden: number | null; // id of a person not to draw: the one whose eyes the camera is in
}

export interface Renderer {
  // The floor to show, standing on the floors under it (lowest first).
  setBuilding(b: Building, below: Building[]): void;
  // With a recording, shows that run. Without one, shows the fire starts as steady flames.
  setRun(rec: Recording | null, fireStarts: [number, number][]): void;
  // The layout editor's cursor: a colored plate on one cell, or null for none.
  setCursor(cell: { x: number; y: number } | null, color: string): void;
  // Draws one frame and returns the matrix that maps the shown floor to the screen.
  draw(f: Frame3D): Mat4;
  dispose(): void;
}

const NEVER = 1e9; // "this never happens" for frame numbers stored in a texture
const SETUP_FRAME = 3; // playhead used when there is no recording: fire starts (lit at frame 0) are fully grown
const MAX_RINGS = 5;
const WALL_FLOATS = 9; // position, normal, color
const AGENT_FLOATS = 7; // x, z, scale, fall, r, g, b
const TYPE_SCALE: Record<string, number> = { child: 0.7, elderly: 0.9 }; // others are 1
const NEAR_FADE_START = 0.8; // in first person, people closer than this (in cells) are not drawn
const NEAR_FADE_END = 2; // and they are full size from this distance

// How tall a person of this type is drawn, relative to an adult.
export function typeScale(type: string): number {
  return TYPE_SCALE[type] ?? 1;
}

// Returns null if the browser has no WebGL2. Throws if a shader fails to build.
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!context) return null;
  const gl = context;

  const skyProg = link(gl, SKY_VS, SKY_FS);
  const floorProg = link(gl, FLOOR_VS, FLOOR_FS);
  const wallProg = link(gl, WALL_VS, FLAT_FS);
  const agentProg = link(gl, AGENT_VS, FLAT_FS);
  const flameProg = link(gl, FLAME_VS, FLAT_FS);
  const uniform = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
  const skyU = {
    forward: uniform(skyProg, "uForward"),
    right: uniform(skyProg, "uRight"),
    up: uniform(skyProg, "uUp"),
    tan: uniform(skyProg, "uTan"),
  };
  gl.useProgram(skyProg);
  gl.uniform3fv(uniform(skyProg, "uHorizon"), rgb(COLOR.skyHorizon));
  gl.uniform3fv(uniform(skyProg, "uZenith"), rgb(COLOR.sky));
  gl.uniform3fv(uniform(skyProg, "uNadir"), rgb(COLOR.background));
  const skyVao = gl.createVertexArray(); // no attributes: the shader makes the triangle from the vertex number
  const floorU = {
    viewProj: uniform(floorProg, "uViewProj"),
    size: uniform(floorProg, "uSize"),
    frame: uniform(floorProg, "uFrame"),
    pathOn: uniform(floorProg, "uPathOn"),
    grid: uniform(floorProg, "uGrid"),
    plain: uniform(floorProg, "uPlain"),
    margin: uniform(floorProg, "uMargin"),
    rings: uniform(floorProg, "uRings"),
  };
  const wallViewProj = uniform(wallProg, "uViewProj");
  const agentViewProj = uniform(agentProg, "uViewProj");
  const flameU = {
    viewProj: uniform(flameProg, "uViewProj"),
    frame: uniform(flameProg, "uFrame"),
    clock: uniform(flameProg, "uClock"),
  };

  // Uniforms that never change
  gl.useProgram(floorProg);
  gl.uniform1i(uniform(floorProg, "uBase"), 0);
  gl.uniform1i(uniform(floorProg, "uState"), 1);
  gl.uniform1i(uniform(floorProg, "uTraffic"), 2);
  gl.uniform3fv(uniform(floorProg, "uPathColor"), BEHAVIORS.flatMap((b) => rgb(BEHAVIOR_COLOR[b])));
  gl.uniform1f(uniform(floorProg, "uPathAlpha"), PATH_ALPHA);
  gl.uniform3fv(uniform(floorProg, "uEmber"), rgb(COLOR.ember));
  gl.uniform3fv(uniform(floorProg, "uBackground"), rgb(COLOR.background));
  gl.uniform3fv(uniform(floorProg, "uSlab"), rgb(COLOR.slab));
  gl.useProgram(flameProg);
  gl.uniform3fv(uniform(flameProg, "uFireBase"), rgb(COLOR.fire));
  gl.uniform3fv(uniform(flameProg, "uFireTip"), rgb(COLOR.fireTip));

  // Buffers and vertex layouts
  const groundBuf = gl.createBuffer();
  const wallBuf = gl.createBuffer();
  const lowerBuf = gl.createBuffer();
  const cursorBuf = gl.createBuffer();
  const pawnBuf = gl.createBuffer();
  const flameBuf = gl.createBuffer();
  const agentInstBuf = gl.createBuffer();
  const flameInstBuf = gl.createBuffer();

  const pawn = pawnMesh();
  const flame = flameMesh();
  gl.bindBuffer(gl.ARRAY_BUFFER, pawnBuf);
  gl.bufferData(gl.ARRAY_BUFFER, pawn, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, flameBuf);
  gl.bufferData(gl.ARRAY_BUFFER, flame, gl.STATIC_DRAW);

  // Points attribute `loc` at `size` floats of the bound buffer. Sizes and offsets are in floats.
  const attrib = (loc: number, size: number, stride: number, offset: number, perInstance = false) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
    if (perInstance) gl.vertexAttribDivisor(loc, 1);
  };

  const floorVao = gl.createVertexArray();
  gl.bindVertexArray(floorVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf);
  attrib(0, 2, 2, 0);

  // Walls, the storeys underneath and the editor cursor share one layout.
  const wallLayout = (buffer: WebGLBuffer) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    attrib(0, 3, WALL_FLOATS, 0);
    attrib(1, 3, WALL_FLOATS, 3);
    attrib(2, 3, WALL_FLOATS, 6);
    return vao;
  };
  const wallVao = wallLayout(wallBuf);
  const lowerVao = wallLayout(lowerBuf);
  const cursorVao = wallLayout(cursorBuf);

  const agentVao = gl.createVertexArray();
  gl.bindVertexArray(agentVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pawnBuf);
  attrib(0, 3, 6, 0);
  attrib(1, 3, 6, 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, agentInstBuf);
  attrib(2, 4, AGENT_FLOATS, 0, true);
  attrib(3, 3, AGENT_FLOATS, 4, true);

  const flameVao = gl.createVertexArray();
  gl.bindVertexArray(flameVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, flameBuf);
  attrib(0, 3, 6, 0);
  attrib(1, 3, 6, 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, flameInstBuf);
  attrib(2, 3, 3, 0, true);
  gl.bindVertexArray(null);

  // One texel per cell. Each texture stays bound to its own unit.
  const makeTexture = (unit: number) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const baseTex = makeTexture(0);
  const stateTex = makeTexture(1);
  const trafficTex = makeTexture(2);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(...rgb(COLOR.background), 1);

  let building: Building | null = null;
  let rec: Recording | null = null;
  let elevation = 0; // height of the floor being shown
  let wallVertices = 0;
  let lowerVertices = 0;
  let cursorVertices = 0;
  let flameCount = 0;
  let agentData = new Float32Array(0);
  const rings = new Float32Array(MAX_RINGS * 4);

  const behaviorRgb = Object.fromEntries(BEHAVIORS.map((b) => [b, rgb(BEHAVIOR_COLOR[b])])) as Record<Behavior, RGB>;
  const frozenRgb = rgb(COLOR.frozen);
  const trappedRgb = rgb(COLOR.trapped);

  function setBuilding(b: Building, below: Building[]): void {
    building = b;
    elevation = below.length * FLOOR_SPACING;
    gl.bindBuffer(gl.ARRAY_BUFFER, groundBuf);
    gl.bufferData(gl.ARRAY_BUFFER, groundQuads(b), gl.STATIC_DRAW);

    // The shown floor's walls are built at height 0 and lifted when drawn.
    const walls: number[] = [];
    pushWalls(walls, b, 0, false);
    pushFurniture(walls, b, 0);
    wallVertices = walls.length / WALL_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, wallBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(walls), gl.STATIC_DRAW);

    const storeys: number[] = [];
    below.forEach((floor, i) => pushWalls(storeys, floor, i * FLOOR_SPACING, true));
    lowerVertices = storeys.length / WALL_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, lowerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(storeys), gl.STATIC_DRAW);

    const colors = [COLOR.floor, COLOR.floor, COLOR.door, COLOR.exit].map(rgb255); // walls sit on plain floor
    const base = new Uint8Array(b.cells.length * 4);
    for (let i = 0; i < b.cells.length; i++) {
      const cell = b.cells[i];
      base.set(colors[cell === DOOR || cell === EXIT ? cell : 0], i * 4);
      base[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, b.width, b.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, base);

    gl.useProgram(floorProg);
    gl.uniform2f(floorU.size, b.width, b.height);
    gl.uniform1f(floorU.margin, groundMargin(b));
  }

  function setRun(run: Recording | null, fireStarts: [number, number][]): void {
    const b = building;
    if (!b) return;
    rec = run;
    const n = b.cells.length;
    const finite = (v: number) => (v === Infinity ? NEVER : v);

    // Per-cell textures: from which frame each behavior's path shows on the cell and when it
    // caught fire, plus how strong each path is there.
    const state = new Float32Array(n * 4).fill(NEVER);
    const traffic = new Uint8Array(n * 4);
    const flames: number[] = [];
    if (run) {
      const paths = pathLayers(run);
      for (let i = 0; i < n; i++) {
        BEHAVIORS.forEach((behavior, k) => {
          state[i * 4 + k] = finite(paths[behavior].since[i]);
          traffic[i * 4 + k] = Math.round(paths[behavior].strength[i] * 255);
        });
        const ignite = run.igniteFrame[i];
        state[i * 4 + 3] = finite(ignite);
        if (ignite !== Infinity) flames.push(i % b.width, Math.floor(i / b.width), ignite);
      }
    } else {
      for (const [x, y] of fireStarts) {
        state[(y * b.width + x) * 4 + 3] = 0;
        flames.push(x, y, 0);
      }
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, b.width, b.height, 0, gl.RGBA, gl.FLOAT, state);
    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, b.width, b.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, traffic);

    flameCount = flames.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, flameInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flames), gl.STATIC_DRAW);

    agentData = new Float32Array((run ? run.agents.length : 0) * AGENT_FLOATS);
    gl.bindBuffer(gl.ARRAY_BUFFER, agentInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, agentData.byteLength, gl.DYNAMIC_DRAW);
  }

  function setCursor(cell: { x: number; y: number } | null, color: string): void {
    if (!cell || !building) {
      cursorVertices = 0;
      return;
    }
    const plate = cursorPlate(cell.x, cell.y, topAt(building, cell.x, cell.y), rgb(color));
    cursorVertices = plate.length / WALL_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, cursorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, plate, gl.DYNAMIC_DRAW);
  }

  // Fills agentData for the playhead: positions glide between the two nearest frames.
  function fillAgents(run: Recording, f: Frame3D): void {
    const n = run.agents.length;
    const p = Math.min(Math.max(f.playhead, 0), run.frames - 1);
    const f0 = Math.floor(p);
    const f1 = Math.min(f0 + 1, run.frames - 1);
    const t = p - f0;
    const eye = f.camera.fp;
    for (let a = 0; a < n; a++) {
      const o = a * AGENT_FLOATS;
      const i0 = f0 * n + a;
      const i1 = f1 * n + a;
      const now = run.status[i0];
      const next = run.status[i1];
      const { behavior, type } = run.agents[a];
      if (now === EVACUATED || a === f.hidden || !f.layers.people[behavior]) {
        agentData[o + 2] = 0;
        continue;
      }
      agentData[o] = run.x[i0] + (run.x[i1] - run.x[i0]) * t + 0.5;
      agentData[o + 1] = run.y[i0] + (run.y[i1] - run.y[i0]) * t + 0.5;
      // People shrink away as they step through an exit, and tip over as they get trapped.
      agentData[o + 2] = typeScale(type) * (next === EVACUATED ? 1 - t : 1);
      if (eye) {
        const near = Math.hypot(agentData[o] - eye.x, agentData[o + 1] - eye.z);
        agentData[o + 2] *= Math.min(Math.max((near - NEAR_FADE_START) / (NEAR_FADE_END - NEAR_FADE_START), 0), 1);
      }
      const fall = now === TRAPPED ? 1 : next === TRAPPED ? t : 0;
      agentData[o + 3] = fall;
      const color = now === FROZEN ? frozenRgb : behaviorRgb[behavior];
      for (let k = 0; k < 3; k++) agentData[o + 4 + k] = color[k] + (trappedRgb[k] - color[k]) * fall;
    }
  }

  function draw(f: Frame3D): Mat4 {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = canvas.width / Math.max(canvas.height, 1);
    const viewProj = viewProjection(f.camera, aspect);

    // The sky goes behind everything, so it is drawn first and leaves the depth buffer alone.
    const basis = viewBasis(f.camera, aspect);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProg);
    gl.uniform3fv(skyU.forward, basis.forward);
    gl.uniform3fv(skyU.right, basis.right);
    gl.uniform3fv(skyU.up, basis.up);
    gl.uniform2f(skyU.tan, basis.tanX, basis.tanY);
    gl.bindVertexArray(skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);

    // Everything on the shown floor is drawn `elevation` above the ground.
    const lifted = elevation > 0 ? translated(viewProj, 0, elevation, 0) : viewProj;
    if (!building) return lifted;
    const frame = rec ? f.playhead : SETUP_FRAME;

    rings.fill(0);
    f.rings.slice(0, MAX_RINGS).forEach((r, i) => rings.set([r.x + 0.5, r.y + 0.5, RING_RADIUS, 1], i * 4));
    gl.useProgram(floorProg);
    gl.uniform1f(floorU.frame, frame);
    gl.uniform3f(floorU.pathOn, +f.layers.paths.calm, +f.layers.paths.panicker, +f.layers.paths.freezer);
    gl.uniform1f(floorU.grid, +f.layers.grid);
    gl.uniform4fv(floorU.rings, rings);
    gl.bindVertexArray(floorVao);
    // The ground. If the shown floor is upstairs, the ground inside the building is a plain slab
    // and the floor itself is drawn again, lifted, on top of the storeys.
    gl.uniformMatrix4fv(floorU.viewProj, false, viewProj);
    gl.uniform1f(floorU.plain, elevation > 0 ? 1 : 0);
    // The grid outside the building is see-through over the sky, so the ground is blended.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    if (elevation > 0) {
      gl.uniformMatrix4fv(floorU.viewProj, false, lifted);
      gl.uniform1f(floorU.plain, 0);
      gl.drawArrays(gl.TRIANGLES, 6, 6);
    }

    gl.useProgram(wallProg);
    if (lowerVertices) {
      gl.uniformMatrix4fv(wallViewProj, false, viewProj);
      gl.bindVertexArray(lowerVao);
      gl.drawArrays(gl.TRIANGLES, 0, lowerVertices);
    }
    gl.uniformMatrix4fv(wallViewProj, false, lifted);
    gl.bindVertexArray(wallVao);
    gl.drawArrays(gl.TRIANGLES, 0, wallVertices);
    if (cursorVertices) {
      gl.bindVertexArray(cursorVao);
      gl.drawArrays(gl.TRIANGLES, 0, cursorVertices);
    }

    if (rec && rec.agents.length) {
      fillAgents(rec, f);
      gl.bindBuffer(gl.ARRAY_BUFFER, agentInstBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, agentData);
      gl.useProgram(agentProg);
      gl.uniformMatrix4fv(agentViewProj, false, lifted);
      gl.bindVertexArray(agentVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, pawn.length / 6, rec.agents.length);
    }

    if (flameCount) {
      gl.useProgram(flameProg);
      gl.uniformMatrix4fv(flameU.viewProj, false, lifted);
      gl.uniform1f(flameU.frame, frame);
      gl.uniform1f(flameU.clock, f.clock);
      gl.bindVertexArray(flameVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, flame.length / 6, flameCount);
    }
    gl.bindVertexArray(null);
    return lifted;
  }

  function dispose(): void {
    for (const p of [skyProg, floorProg, wallProg, agentProg, flameProg]) gl.deleteProgram(p);
    for (const b of [groundBuf, wallBuf, lowerBuf, cursorBuf, pawnBuf, flameBuf, agentInstBuf, flameInstBuf]) gl.deleteBuffer(b);
    for (const v of [skyVao, floorVao, wallVao, lowerVao, cursorVao, agentVao, flameVao]) gl.deleteVertexArray(v);
    for (const t of [baseTex, stateTex, trafficTex]) gl.deleteTexture(t);
  }

  return { setBuilding, setRun, setCursor, draw, dispose };
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader program failed to link: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
