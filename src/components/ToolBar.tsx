import type { Tool } from "../editor/layout";
import Icon, { type IconName } from "./Icon";

const TOOLS: { id: Tool; label: string; icon: IconName; hint: string }[] = [
  { id: "fire", label: "Fire", icon: "flame", hint: "Click a cell to start a fire there, or to put one out" },
  { id: "wall", label: "Wall", icon: "wall", hint: "Drag to build walls" },
  { id: "door", label: "Door", icon: "door", hint: "Drag to place doors" },
  { id: "exit", label: "Exit", icon: "exit", hint: "Drag to place exits. On an upper floor, an exit is a stairwell door" },
  { id: "erase", label: "Erase", icon: "erase", hint: "Drag to clear cells back to open floor" },
];

// The layout tools, shown on the 3D view while the layout can be edited.
export default function ToolBar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <div className="toolbar" role="group" aria-label="Layout tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={t.id === tool ? "glass on" : "glass"}
          aria-pressed={t.id === tool}
          title={t.hint}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTool(t.id)}
        >
          <Icon name={t.icon} size={16} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
