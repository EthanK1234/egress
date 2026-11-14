import { useEffect, useRef, type MouseEvent } from "react";
import type { SimState } from "../sim/sim";
import type { Building, RunMetrics } from "../sim/types";

const CELL_PX = 12;
const COLORS = ["#ffffff", "#3a3a3a", "#8b5a2b", "#2e9e4f"]; // empty, wall, door, exit
const AGENT_COLORS = { calm: "#2563eb", panicker: "#f59e0b", freezer: "#9333ea" };

interface Props {
  building: Building;
  fireStarts: [number, number][];
  sim: SimState | null;
  frame: number; // bump to redraw while the sim runs
  bottlenecks: RunMetrics["bottlenecks"];
  onCellClick?: (x: number, y: number) => void;
}

export default function MapCanvas({ building, fireStarts, sim, frame, bottlenecks, onCellClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { width, height, cells, labels } = building;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        ctx.fillStyle = sim?.fire[i] ? "#ef4444" : (COLORS[cells[i]] ?? COLORS[0]);
        ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
    }

    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const l of labels) ctx.fillText(l.name, (l.x + 0.5) * CELL_PX, (l.y + 0.5) * CELL_PX);

    // Fire starts (shown before the run starts)
    if (!sim) {
      for (const [x, y] of fireStarts) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc((x + 0.5) * CELL_PX, (y + 0.5) * CELL_PX, CELL_PX * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (sim) {
      for (const a of sim.agents) {
        if (a.status === "evacuated") continue;
        const cx = (a.x + 0.5) * CELL_PX;
        const cy = (a.y + 0.5) * CELL_PX;
        if (a.status === "trapped") {
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 4);
          ctx.lineTo(cx + 4, cy + 4);
          ctx.moveTo(cx + 4, cy - 4);
          ctx.lineTo(cx - 4, cy + 4);
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = a.status === "frozen" ? "#4c1d95" : AGENT_COLORS[a.behavior];
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_PX * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of bottlenecks) {
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((b.x + 0.5) * CELL_PX, (b.y + 0.5) * CELL_PX, CELL_PX * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [building, fireStarts, sim, frame, bottlenecks]);

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = e.currentTarget.width / rect.width;
    const x = Math.floor(((e.clientX - rect.left) * scale) / CELL_PX);
    const y = Math.floor(((e.clientY - rect.top) * scale) / CELL_PX);
    if (x >= 0 && y >= 0 && x < building.width && y < building.height) onCellClick(x, y);
  };

  return (
    <canvas
      ref={ref}
      className={onCellClick ? "map-canvas clickable" : "map-canvas"}
      width={building.width * CELL_PX}
      height={building.height * CELL_PX}
      onClick={handleClick}
    />
  );
}
