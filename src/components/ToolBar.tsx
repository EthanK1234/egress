import type { Tool } from "../editor/layout";
import { TOOLS } from "../editor/tools";
import Icon from "./Icon";


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
