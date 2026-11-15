import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cellsBetween, type Tool } from "../editor/layout";
import { fitCamera, orbit, screenRay, zoom, type Camera } from "../render/camera";
import { project } from "../render/mat4";
import { EXIT_POST_HEIGHT, FLOOR_SPACING, PAWN_HEIGHT, wallHeightAt } from "../render/meshes";
import { COLOR } from "../render/palette";
import { createRenderer, typeScale, type Renderer } from "../render/renderer";
import { RING_RADIUS, type Layers } from "../render/view";
import { CELL_M } from "../sim/config";
import { exitName, findExits } from "../sim/flowfield";
import type { Recording } from "../sim/recording";
import type { Building } from "../sim/types";

interface Props {
  building: Building; // the floor being shown
  below: Building[]; // the floors under it, lowest first
  recording: Recording | null;
  fireStarts: [number, number][];
  playhead: number;
  playing: boolean;
  layers: Layers;
  rings: { x: number; y: number }[];
  tool: Tool | null; // the layout tool in hand; null when the layout can't be edited
  follow: number | null; // id of a person to ride along with, in first person
  onPaint?: (cells: [number, number][], dragging: boolean) => void;
  children?: ReactNode; // overlaid on the view (tools, hints, progress)
}

// A text tag pinned to a point on the floor being shown.
interface Label {
  key: string;
  kind: "room" | "exit" | "ring" | "tick";
  text: string;
  x: number;
  y: number;
  z: number;
}

const ORBIT_SPEED = 0.006; // radians per pixel dragged
const ZOOM_SPEED = 0.0012; // per wheel unit
const CLICK_SLOP = 4; // a press that moves less than this many pixels is a click, not a drag
const TICK_EVERY = 10; // cells between the coordinate marks along the edges
const EYE_HEIGHT = PAWN_HEIGHT * 1.15; // just above the heads, so the way ahead is visible over a crowd
const TURN_RATE = 5; // how quickly a first-person view turns to face a new heading, per second
const PICK_STEPS = 48;
const TOOL_COLOR: Record<Tool, string> = {
  fire: COLOR.fireTip,
  wall: COLOR.wallTop,
  door: COLOR.door,
  exit: COLOR.exit,
  furniture: COLOR.furnitureTop,
  erase: COLOR.trapped,
};

function buildLabels(b: Building, showNames: boolean, rings: Props["rings"], showTicks: boolean): Label[] {
  const labels: Label[] = [];
  if (showNames) {
    b.labels.forEach((l, i) => labels.push({ key: `room${i}`, kind: "room", text: l.name, x: l.x + 0.5, y: 0, z: l.y + 0.5 }));
    for (const exit of findExits(b)) {
      const xs = exit.cells.map((c) => c % b.width);
      const ys = exit.cells.map((c) => Math.floor(c / b.width));
      labels.push({
        key: `exit${exit.id}`,
        kind: "exit",
        text: exit.id === b.entryExitId ? `${exitName(b, exit)} · entry` : exitName(b, exit),
        x: (Math.min(...xs) + Math.max(...xs) + 1) / 2,
        y: EXIT_POST_HEIGHT + 0.8,
        z: (Math.min(...ys) + Math.max(...ys) + 1) / 2,
      });
    }
  }
  // Bottleneck names sit on the far edge of their ring, so they don't cover the spot itself.
  rings.forEach((r, i) =>
    labels.push({ key: `ring${i}`, kind: "ring", text: `B${i + 1}`, x: r.x + 0.5, y: 0, z: r.y + 0.5 - RING_RADIUS }),
  );
  // Coordinate marks along two edges, for the layout editor.
  if (showTicks) {
    for (let x = 0; x <= b.width; x += TICK_EVERY) labels.push({ key: `x${x}`, kind: "tick", text: `${x}`, x, y: 0, z: b.height + 1.6 });
    for (let y = 0; y <= b.height; y += TICK_EVERY) labels.push({ key: `y${y}`, kind: "tick", text: `${y}`, x: -1.6, y: 0, z: y });
  }
  return labels;
}

// Where a person is at the playhead, and which way they are heading (null if they have stopped for good).
function personPose(rec: Recording, id: number, playhead: number): { x: number; z: number; heading: [number, number] | null } {
  const n = rec.agents.length;
  const last = rec.frames - 1;
  const at = (frame: number): [number, number] => {
    const p = Math.min(Math.max(frame, 0), last);
    const f0 = Math.floor(p);
    const f1 = Math.min(f0 + 1, last);
    const t = p - f0;
    const i0 = f0 * n + id;
    const i1 = f1 * n + id;
    return [rec.x[i0] + (rec.x[i1] - rec.x[i0]) * t + 0.5, rec.y[i0] + (rec.y[i1] - rec.y[i0]) * t + 0.5];
  };
  const [x, z] = at(playhead);
  // Face where they are about to go. Someone waiting in a jam faces where they will go next.
  for (const ahead of [1.5, 4, 10, 25]) {
    const [ax, az] = at(playhead + ahead);
    const len = Math.hypot(ax - x, az - z);
    if (len > 0.3) return { x, z, heading: [(ax - x) / len, (az - z) / len] };
  }
  return { x, z, heading: null };
}

// The 3D view. It only redraws when something changed (playhead, camera, layers, size),
// so a paused or idle scene costs nothing.
export default function Viewport3D(props: Props) {
  const { building, below, recording, fireStarts, layers, rings, tool, follow, children } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const camera = useRef<Camera | null>(null);
  const fitDist = useRef(1);
  const moved = useRef(false); // the user has orbited or zoomed, so stop auto-framing
  const clock = useRef({ seconds: 0, last: 0 }); // seconds runs only during playback; it drives the flames
  const look = useRef({ id: -1, dx: 0, dz: -1 }); // which way the first-person view faces, turned smoothly
  const raf = useRef(0);
  // The press in progress: where it started, where the pointer was last, and what it is doing.
  const press = useRef<{ x0: number; y0: number; x: number; y: number; button: number; dragged: boolean; painting: boolean } | null>(null);
  const lastPainted = useRef<[number, number] | null>(null);
  const hoverRef = useRef<[number, number] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null); // the cell under the pointer, for the readout
  const [failed, setFailed] = useState(false);
  const [canReset, setCanReset] = useState(false);

  const elevation = below.length * FLOOR_SPACING;
  const editingLayout = tool !== null && tool !== "fire";
  const labels = useMemo(() => buildLabels(building, layers.labels, rings, editingLayout), [building, layers.labels, rings, editingLayout]);

  // What the next draw should show. Draws happen in animation frames, after render.
  const latest = useRef({ props, labels, elevation });
  useEffect(() => {
    latest.current = { props, labels, elevation };
  });

  const draw = () => {
    raf.current = 0;
    const canvas = canvasRef.current;
    if (!renderer.current || !camera.current || !canvas) return;
    const { props: p, labels: items, elevation: lift } = latest.current;

    const now = performance.now();
    const dt = Math.min((now - clock.current.last) / 1000, 0.1);
    clock.current.last = now;
    if (p.playing) clock.current.seconds += dt;

    // First person: sit at the person's eye height and turn smoothly towards where they are heading.
    let view = camera.current;
    if (p.follow !== null && p.recording) {
      const pose = personPose(p.recording, p.follow, p.playhead);
      const facing = look.current;
      if (pose.heading) {
        const k = facing.id === p.follow ? 1 - Math.exp(-dt * TURN_RATE) : 1;
        const dx = facing.dx + (pose.heading[0] - facing.dx) * k;
        const dz = facing.dz + (pose.heading[1] - facing.dz) * k;
        const len = Math.hypot(dx, dz);
        [facing.dx, facing.dz] = len > 1e-3 ? [dx / len, dz / len] : pose.heading;
      }
      facing.id = p.follow;
      const eye = lift + EYE_HEIGHT * typeScale(p.recording.agents[p.follow].type);
      view = { ...camera.current, fp: { x: pose.x, y: eye, z: pose.z, dx: facing.dx, dz: facing.dz } };
    }

    const toScreen = renderer.current.draw({
      playhead: p.playhead,
      clock: clock.current.seconds,
      camera: view,
      layers: p.layers,
      rings: p.rings,
      hidden: p.follow,
    });

    // Pin the text tags to their points in the scene.
    const tags = labelsRef.current?.children;
    if (!tags) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (let i = 0; i < tags.length && i < items.length; i++) {
      const tag = tags[i] as HTMLElement;
      const [x, y, , depth] = project(toScreen, items[i].x, items[i].y, items[i].z);
      if (depth <= 0) {
        tag.style.visibility = "hidden";
        continue;
      }
      tag.style.visibility = "visible";
      tag.style.transform = `translate(${((x / depth) * 0.5 + 0.5) * w}px, ${(0.5 - (y / depth) * 0.5) * h}px)`;
    }
  };

  const requestDraw = () => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  };

  const frameBuilding = (b: Building, lift: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    camera.current = fitCamera(b, canvas.width / Math.max(canvas.height, 1), lift);
    fitDist.current = camera.current.dist;
  };

  // The cell under a point of the view. Pointing at a wall picks the wall, not the floor behind it.
  const pick = (clientX: number, clientY: number): [number, number] | null => {
    const canvas = canvasRef.current;
    const cam = camera.current;
    if (!canvas || !cam) return null;
    const { props: p, elevation: lift } = latest.current;
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    const { origin, dir } = screenRay(cam, rect.width / rect.height, nx, ny);
    if (dir[1] >= 0) return null;
    // Walk down the ray from the top of the tallest wall to the floor; the first wall it enters wins.
    const t0 = (lift + EXIT_POST_HEIGHT - origin[1]) / dir[1];
    const t1 = (lift - origin[1]) / dir[1];
    for (let i = 0; i <= PICK_STEPS; i++) {
      const t = t0 + ((t1 - t0) * i) / PICK_STEPS;
      const x = Math.floor(origin[0] + dir[0] * t);
      const y = Math.floor(origin[2] + dir[2] * t);
      if (x < 0 || y < 0 || x >= p.building.width || y >= p.building.height) continue;
      const height = origin[1] + dir[1] * t - lift;
      if (i === PICK_STEPS || height <= wallHeightAt(p.building, x, y)) return [x, y];
    }
    return null;
  };

  const showCursor = (cell: [number, number] | null) => {
    const { tool: inHand } = latest.current.props;
    renderer.current?.setCursor(cell && inHand ? { x: cell[0], y: cell[1] } : null, inHand ? TOOL_COLOR[inHand] : "#ffffff");
    requestDraw();
  };

  const setHoverCell = (cell: [number, number] | null) => {
    const prev = hoverRef.current;
    if (prev?.[0] === cell?.[0] && prev?.[1] === cell?.[1]) return;
    hoverRef.current = cell;
    setHover(cell);
    showCursor(cell);
  };

  // Renderer lifetime, and keeping the canvas the size of its box.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let created: Renderer | null = null;
    try {
      created = createRenderer(canvas);
    } catch (err) {
      console.error(err);
    }
    if (!created) {
      setFailed(true);
      return;
    }
    const active = created;
    renderer.current = active;

    const observer = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap the pixel count on very dense screens
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      if (!moved.current) frameBuilding(latest.current.props.building, latest.current.elevation);
      cancelAnimationFrame(raf.current);
      draw(); // right away: resizing clears the canvas
    });
    observer.observe(wrap);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      active.dispose();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.setBuilding(building, below);
  }, [building, below]);

  useEffect(() => {
    renderer.current?.setRun(recording, fireStarts);
  }, [building, below, recording, fireStarts]);

  // The plate under the pointer depends on the tool in hand and on what is built there.
  useEffect(() => {
    showCursor(tool ? hoverRef.current : null);
  }, [tool, building]);

  // Frame the floor again when its size changes or another floor is shown,
  // unless the user has set their own angle: then just move with the floor.
  useEffect(() => {
    if (moved.current && camera.current) camera.current.ty = elevation;
    else frameBuilding(latest.current.props.building, elevation);
  }, [building.width, building.height, elevation]);

  // Any other change (playhead, layers, markers) just needs a redraw.
  useEffect(requestDraw);

  // Zoom. A native listener, because React's wheel events can't stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!camera.current || latest.current.props.follow !== null) return;
      e.preventDefault();
      zoom(camera.current, Math.exp(e.deltaY * ZOOM_SPEED), fitDist.current);
      moved.current = true;
      setCanReset(true);
      requestDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // With a building tool in hand, the left button paints and the right button orbits.
  // Otherwise dragging orbits, and a plain click with the fire tool places a fire.
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (follow !== null) return; // in first person the camera rides with the person
    e.currentTarget.setPointerCapture(e.pointerId);
    const painting = e.button === 0 && editingLayout;
    press.current = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, button: e.button, dragged: false, painting };
    if (painting) {
      const cell = pick(e.clientX, e.clientY);
      lastPainted.current = cell;
      if (cell) props.onPaint?.([cell], false);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const cell = tool !== null && follow === null ? pick(e.clientX, e.clientY) : null;
    setHoverCell(cell);
    const p = press.current;
    if (!p) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > CLICK_SLOP) p.dragged = true;
    if (p.painting) {
      const from = lastPainted.current;
      if (cell && (!from || from[0] !== cell[0] || from[1] !== cell[1])) {
        props.onPaint?.(from ? cellsBetween(from[0], from[1], cell[0], cell[1]).slice(1) : [cell], true);
        lastPainted.current = cell;
      }
    } else if (camera.current) {
      orbit(camera.current, -(e.clientX - p.x) * ORBIT_SPEED, (e.clientY - p.y) * ORBIT_SPEED);
      moved.current = true;
      setCanReset(true);
      requestDraw();
    }
    p.x = e.clientX;
    p.y = e.clientY;
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = press.current;
    press.current = null;
    lastPainted.current = null;
    if (p && !p.dragged && p.button === 0 && tool === "fire") {
      const cell = pick(e.clientX, e.clientY);
      if (cell) props.onPaint?.([cell], false);
    }
  };

  const cancelPress = () => {
    press.current = null;
    lastPainted.current = null;
  };

  const resetView = () => {
    moved.current = false;
    setCanReset(false);
    frameBuilding(building, elevation);
    requestDraw();
  };

  return (
    <div className="viewport" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={tool !== null && follow === null ? "editing" : undefined}
        aria-label="3D view of the building"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelPress}
        onPointerLeave={() => setHoverCell(null)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={tool === null && follow === null ? resetView : undefined}
      />
      <div className="tags" ref={labelsRef}>
        {labels.map((l) => (
          <span key={l.key} className={`tag tag-${l.kind}`}>
            {l.text}
          </span>
        ))}
      </div>
      {tool !== null && hover && (
        <div className="coords num">
          x {hover[0]} · y {hover[1]} · floor {below.length + 1}
          <span>
            {(hover[0] * CELL_M).toFixed(1)} m, {(hover[1] * CELL_M).toFixed(1)} m
          </span>
        </div>
      )}
      {canReset && follow === null && (
        <button className="glass viewport-reset" onMouseDown={(e) => e.preventDefault()} onClick={resetView}>
          Reset view
        </button>
      )}
      {failed && <p className="viewport-fail">This browser can't show the 3D view (WebGL2 is not available). The floor plan still works.</p>}
      {children}
    </div>
  );
}
