import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BEHAVIORS, BEHAVIOR_COLOR, COLOR, rgb255 } from "../render/palette";
import { PATH_ALPHA, pathLayers } from "../render/paths";
import { FIRE_FRONT_FRAMES, FIRE_SETTLE_FRAMES, RING_RADIUS, type Layers } from "../render/view";
import { findExits } from "../sim/flowfield";
import { EVACUATED, FROZEN, TRAPPED, type Recording } from "../sim/recording";
import type { Building } from "../sim/types";

interface Props {
  building: Building;
  recording: Recording | null;
  fireStarts: [number, number][];
  playhead: number;
  layers: Layers;
  rings: { x: number; y: number }[];
  proposed?: number[]; // cell indices the overseer's edits would change, drawn in green
  onCellClick?: (x: number, y: number) => void; // set while fire starts can be edited
}

const CELL_RGB = [COLOR.floor, COLOR.wall, COLOR.door, COLOR.exit].map(rgb255); // indexed by cell value
const PATH_RGB = BEHAVIORS.map((b) => rgb255(BEHAVIOR_COLOR[b]));
const FIRE_RGB = rgb255(COLOR.fire);
const FIRE_FRONT_RGB = rgb255(COLOR.fireTip);
const FIRE_OLD_RGB = rgb255(COLOR.ember);
const FIRE_OLD_MIX = 0.45; // how far settled fire darkens
const FONT = "Kazesawa, 'Segoe UI', sans-serif";
const TAU = Math.PI * 2;

// One color channel (0..2) of a cell that has burned for `age` frames:
// a bright front, then a steady red, then darker once the fire has settled.
function fireChannel(age: number, channel: number): number {
  const steady = Math.min(Math.max(age / FIRE_FRONT_FRAMES, 0), 1);
  const settled = Math.min(Math.max((age - FIRE_FRONT_FRAMES) / FIRE_SETTLE_FRAMES, 0), 1) * FIRE_OLD_MIX;
  const lit = FIRE_FRONT_RGB[channel] + (FIRE_RGB[channel] - FIRE_FRONT_RGB[channel]) * steady;
  return lit + (FIRE_OLD_RGB[channel] - lit) * settled;
}

// The top-down map. Draws the same recording as the 3D view, at the same playhead.
export default function MapCanvas({ building, recording, fireStarts, playhead, layers, rings, proposed, onCellClick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellLayer = useRef<{ canvas: HTMLCanvasElement; image: ImageData } | null>(null);
  const [width, setWidth] = useState(0); // CSS pixels
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [fontReady, setFontReady] = useState(false);

  const exits = useMemo(() => findExits(building), [building]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setWidth(wrap.clientWidth));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Canvas text falls back to another font until the web font has loaded, so redraw when it has.
  useEffect(() => {
    let alive = true;
    document.fonts.load(`12px ${FONT}`).then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width === 0) return;
    const { width: w, height: h, cells } = building;
    const rec = recording;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = width / w; // CSS pixels per cell
    const height = cell * h;
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const frame = rec ? Math.min(Math.max(playhead, 0), rec.frames - 1) : 0;

    // 1. Cells, paths and fire: one pixel per cell, scaled up without smoothing.
    let layer = cellLayer.current;
    if (!layer || layer.image.width !== w || layer.image.height !== h) {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      layer = cellLayer.current = { canvas: off, image: new ImageData(w, h) };
    }
    const pixels = new Uint32Array(layer.image.data.buffer);
    const startCells = rec ? null : new Set(fireStarts.map(([x, y]) => y * w + x));
    const paths = rec ? pathLayers(rec) : null;
    for (let i = 0; i < cells.length; i++) {
      let [r, g, b] = CELL_RGB[cells[i]] ?? CELL_RGB[0];
      let ignite = Infinity;
      if (rec && paths) {
        for (let k = 0; k < BEHAVIORS.length; k++) {
          const behavior = BEHAVIORS[k];
          if (!layers.paths[behavior] || paths[behavior].since[i] > frame) continue;
          const a = paths[behavior].strength[i] * PATH_ALPHA;
          r += (PATH_RGB[k][0] - r) * a;
          g += (PATH_RGB[k][1] - g) * a;
          b += (PATH_RGB[k][2] - b) * a;
        }
        ignite = rec.igniteFrame[i];
      } else if (startCells?.has(i)) {
        ignite = -FIRE_FRONT_FRAMES;
      }
      const burning = Math.min(Math.max(frame - ignite + 1, 0), 1);
      if (burning > 0) {
        const age = frame - ignite;
        r += (fireChannel(age, 0) - r) * burning;
        g += (fireChannel(age, 1) - g) * burning;
        b += (fireChannel(age, 2) - b) * burning;
      }
      pixels[i] = (255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r);
    }
    layer.canvas.getContext("2d")?.putImageData(layer.image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer.canvas, 0, 0, width, height);

    // 2. Grid, when cells are big enough for it to help.
    if (layers.grid && cell >= 4) {
      ctx.beginPath();
      for (let x = 1; x < w; x++) {
        const px = Math.round(x * cell) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let y = 1; y < h; y++) {
        const py = Math.round(y * cell) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. Room and exit names.
    if (layers.labels) {
      ctx.font = `400 11px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(182, 192, 204, 0.6)";
      for (const l of building.labels) ctx.fillText(l.name.toUpperCase(), (l.x + 0.5) * cell, (l.y + 0.5) * cell);
      ctx.fillStyle = "rgba(237, 241, 245, 0.9)";
      for (const exit of exits) {
        const xs = exit.cells.map((c) => c % w);
        const ys = exit.cells.map((c) => Math.floor(c / w));
        const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
        // Put the name just inside the building, next to the exit.
        const dx = cx < 1.5 ? 1 : cx > w - 1.5 ? -1 : 0;
        const dy = dx !== 0 ? 0 : cy > h - 1.5 ? -1 : 1;
        ctx.textAlign = dx > 0 ? "left" : dx < 0 ? "right" : "center";
        ctx.fillText(`Exit ${exit.id}`, (cx + dx * 1.6) * cell, (cy + dy * 2) * cell);
      }
    }

    // 4. Markers: proposed edits, fire starts while editing, bottlenecks once the run is done.
    ctx.lineWidth = 1.5;
    if (proposed?.length) {
      ctx.fillStyle = COLOR.exit;
      ctx.strokeStyle = "#ffffff";
      for (const i of proposed) {
        const px = (i % w) * cell;
        const py = Math.floor(i / w) * cell;
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
    }
    if (!rec) {
      ctx.strokeStyle = COLOR.fireTip;
      for (const [x, y] of fireStarts) {
        ctx.beginPath();
        ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, Math.max(cell * 1.6, 6), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = "left";
    rings.forEach((ring, i) => {
      const radius = RING_RADIUS * cell;
      const cx = (ring.x + 0.5) * cell;
      const cy = (ring.y + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.stroke();
      // The name sits at the ring's upper right, or upper left when that would run off the map.
      const side = cx + radius + 16 > width ? -1 : 1;
      ctx.textAlign = side > 0 ? "left" : "right";
      ctx.fillText(`B${i + 1}`, cx + side * (radius * 0.75 + 2), Math.max(cy - radius * 0.75 - 4, 7));
    });

    // 5. People: one filled path per color, positions gliding between the two nearest frames.
    if (rec) {
      const n = rec.agents.length;
      const f0 = Math.floor(frame);
      const f1 = Math.min(f0 + 1, rec.frames - 1);
      const t = frame - f0;
      const radius = Math.max(cell * 0.42, 1.6);
      const at = (a: number): [number, number] => {
        const i0 = f0 * n + a;
        const i1 = f1 * n + a;
        return [(rec.x[i0] + (rec.x[i1] - rec.x[i0]) * t + 0.5) * cell, (rec.y[i0] + (rec.y[i1] - rec.y[i0]) * t + 0.5) * cell];
      };
      for (const group of [...BEHAVIORS, "frozen"] as const) {
        ctx.beginPath();
        for (let a = 0; a < n; a++) {
          const status = rec.status[f0 * n + a];
          const { behavior } = rec.agents[a];
          if (status === EVACUATED || status === TRAPPED || !layers.people[behavior]) continue;
          if ((status === FROZEN ? "frozen" : behavior) !== group) continue;
          const [x, y] = at(a);
          const r = rec.status[f1 * n + a] === EVACUATED ? radius * (1 - t) : radius; // shrinks away through the exit
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fillStyle = group === "frozen" ? COLOR.frozen : BEHAVIOR_COLOR[group];
        ctx.fill();
      }
      // Trapped people are crosses.
      const arm = Math.max(cell * 0.45, 2.5);
      ctx.beginPath();
      for (let a = 0; a < n; a++) {
        if (rec.status[f0 * n + a] !== TRAPPED || !layers.people[rec.agents[a].behavior]) continue;
        const [x, y] = at(a);
        ctx.moveTo(x - arm, y - arm);
        ctx.lineTo(x + arm, y + arm);
        ctx.moveTo(x + arm, y - arm);
        ctx.lineTo(x - arm, y + arm);
      }
      ctx.strokeStyle = COLOR.trapped;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // The person picked out in the list gets a ring.
      const picked = layers.selected;
      if (picked !== null && picked < n && rec.status[f0 * n + picked] !== EVACUATED) {
        const [x, y] = at(picked);
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, TAU);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 6. The cell under the pointer, while the layout can be edited.
    if (onCellClick && hover) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(hover[0] * cell) + 0.5, Math.round(hover[1] * cell) + 0.5, Math.round(cell), Math.round(cell));
    }
  }, [building, recording, fireStarts, playhead, layers, rings, proposed, exits, width, hover, fontReady, onCellClick]);

  const cellAt = (e: MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * building.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * building.height);
    return x >= 0 && y >= 0 && x < building.width && y < building.height ? [x, y] : null;
  };

  const handleMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    const next = cellAt(e);
    setHover((prev) => (prev?.[0] === next?.[0] && prev?.[1] === next?.[1] ? prev : next));
  };

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const target = cellAt(e);
    if (target && onCellClick) onCellClick(target[0], target[1]);
  };

  return (
    <div className="map" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={onCellClick ? "map-canvas editable" : "map-canvas"}
        style={{ aspectRatio: `${building.width} / ${building.height}` }}
        aria-label="Top-down map of the building"
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}
