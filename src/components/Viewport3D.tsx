import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { fitCamera, orbit, zoom, type Camera } from "../render/camera";
import { project } from "../render/mat4";
import { WALL_HEIGHT } from "../render/meshes";
import { createRenderer, type Renderer } from "../render/renderer";
import { RING_RADIUS, type Layers } from "../render/view";
import { findExits } from "../sim/flowfield";
import type { Recording } from "../sim/recording";
import type { Building } from "../sim/types";

interface Props {
  building: Building;
  recording: Recording | null;
  fireStarts: [number, number][];
  playhead: number;
  playing: boolean;
  layers: Layers;
  rings: { x: number; y: number }[];
  children?: ReactNode; // overlaid on the view (hints, progress)
}

// A text tag pinned to a point in the scene.
interface Label {
  key: string;
  kind: "room" | "exit" | "ring";
  text: string;
  x: number;
  y: number;
  z: number;
}

const ORBIT_SPEED = 0.006; // radians per pixel dragged
const ZOOM_SPEED = 0.0012; // per wheel unit

function buildLabels(b: Building, showNames: boolean, rings: Props["rings"]): Label[] {
  const labels: Label[] = [];
  if (showNames) {
    b.labels.forEach((l, i) => labels.push({ key: `room${i}`, kind: "room", text: l.name, x: l.x + 0.5, y: 0, z: l.y + 0.5 }));
    for (const exit of findExits(b)) {
      const xs = exit.cells.map((c) => c % b.width);
      const ys = exit.cells.map((c) => Math.floor(c / b.width));
      labels.push({
        key: `exit${exit.id}`,
        kind: "exit",
        text: exit.id === b.entryExitId ? `Exit ${exit.id} · entry` : `Exit ${exit.id}`,
        x: (Math.min(...xs) + Math.max(...xs) + 1) / 2,
        y: WALL_HEIGHT + 1.4,
        z: (Math.min(...ys) + Math.max(...ys) + 1) / 2,
      });
    }
  }
  // Bottleneck names sit on the far edge of their ring, so they don't cover the spot itself.
  rings.forEach((r, i) =>
    labels.push({ key: `ring${i}`, kind: "ring", text: `B${i + 1}`, x: r.x + 0.5, y: 0, z: r.y + 0.5 - RING_RADIUS }),
  );
  return labels;
}

// The 3D view. It only redraws when something changed (playhead, camera, layers, size),
// so a paused or idle scene costs nothing.
export default function Viewport3D(props: Props) {
  const { building, recording, fireStarts, layers, rings, children } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const camera = useRef<Camera | null>(null);
  const fitDist = useRef(1);
  const moved = useRef(false); // the user has orbited or zoomed, so stop auto-framing
  const clock = useRef({ seconds: 0, last: 0 }); // runs only during playback; drives the flames
  const raf = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [movedIn, setMovedIn] = useState<Building | null>(null); // the building whose view the user changed
  const canReset = movedIn === building;

  const labels = useMemo(() => buildLabels(building, layers.labels, rings), [building, layers.labels, rings]);

  // What the next draw should show. Draws happen in animation frames, after render.
  const latest = useRef({ props, labels });
  useEffect(() => {
    latest.current = { props, labels };
  });

  const draw = () => {
    raf.current = 0;
    const canvas = canvasRef.current;
    if (!renderer.current || !camera.current || !canvas) return;
    const { props: p, labels: items } = latest.current;

    const now = performance.now();
    if (p.playing) clock.current.seconds += Math.min((now - clock.current.last) / 1000, 0.1);
    clock.current.last = now;

    const viewProj = renderer.current.draw({
      playhead: p.playhead,
      clock: clock.current.seconds,
      camera: camera.current,
      layers: p.layers,
      rings: p.rings,
    });

    // Pin the text tags to their points in the scene.
    const tags = labelsRef.current?.children;
    if (!tags) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (let i = 0; i < tags.length && i < items.length; i++) {
      const tag = tags[i] as HTMLElement;
      const [x, y, , depth] = project(viewProj, items[i].x, items[i].y, items[i].z);
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

  const frameBuilding = (b: Building) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    camera.current = fitCamera(b, canvas.width / Math.max(canvas.height, 1));
    fitDist.current = camera.current.dist;
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
      if (!moved.current) frameBuilding(latest.current.props.building);
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
    renderer.current?.setBuilding(building);
    moved.current = false;
    frameBuilding(building);
  }, [building]);

  useEffect(() => {
    renderer.current?.setRun(recording, fireStarts);
  }, [building, recording, fireStarts]);

  // Any other change (playhead, layers, markers) just needs a redraw.
  useEffect(requestDraw);

  // Zoom. A native listener, because React's wheel events can't stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!camera.current) return;
      e.preventDefault();
      zoom(camera.current, Math.exp(e.deltaY * ZOOM_SPEED), fitDist.current);
      moved.current = true;
      setMovedIn(latest.current.props.building);
      requestDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !camera.current) return;
    orbit(camera.current, -(e.clientX - drag.current.x) * ORBIT_SPEED, (e.clientY - drag.current.y) * ORBIT_SPEED);
    drag.current = { x: e.clientX, y: e.clientY };
    moved.current = true;
    setMovedIn(building);
    requestDraw();
  };

  const endDrag = () => {
    drag.current = null;
  };

  const resetView = () => {
    moved.current = false;
    setMovedIn(null);
    frameBuilding(building);
    requestDraw();
  };

  return (
    <div className="viewport" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        aria-label="3D view of the building"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetView}
      />
      <div className="tags" ref={labelsRef}>
        {labels.map((l) => (
          <span key={l.key} className={`tag tag-${l.kind}`}>
            {l.text}
          </span>
        ))}
      </div>
      <div className="viewport-corner">
        <span className="eyebrow">3D view</span>
        <span className="viewport-help">Drag to orbit · scroll to zoom</span>
      </div>
      {canReset && (
        <button className="small viewport-reset" onClick={resetView}>
          Reset view
        </button>
      )}
      {failed && <p className="viewport-note">This browser can't show the 3D view (WebGL2 is not available). The floor map still works.</p>}
      {children}
    </div>
  );
}
