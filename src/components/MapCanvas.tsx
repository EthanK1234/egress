import { useEffect, useRef } from "react";
import type { Building } from "../sim/types";

const CELL_PX = 12;
const COLORS = ["#ffffff", "#3a3a3a", "#8b5a2b", "#2e9e4f"]; // empty, wall, door, exit

export default function MapCanvas({ building }: { building: Building }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { width, height, cells, labels } = building;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.fillStyle = COLORS[cells[y * width + x]] ?? COLORS[0];
        ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
    }
    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const l of labels) ctx.fillText(l.name, (l.x + 0.5) * CELL_PX, (l.y + 0.5) * CELL_PX);
  }, [building]);

  return (
    <canvas
      ref={ref}
      className="map-canvas"
      width={building.width * CELL_PX}
      height={building.height * CELL_PX}
    />
  );
}
