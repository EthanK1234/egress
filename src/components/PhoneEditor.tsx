import type { Tool } from "../editor/layout";
import type { MapInfo } from "../sim/maps";
import Icon from "./Icon";
import { TOOLS } from "../editor/tools";

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  maps: MapInfo[];
  mapId: string; // "" while an imported floor plan is in use
  importedName: string | null;
  onMap: (id: string) => void;
  fireCount: number;
  onClearFire: () => void;
  onResetCamera: () => void;
  onDone: () => void;
}

// The phone's full-screen editor, drawn over the 3D view: a slim top bar (back, the floor plan,
// reset camera) and a tray of tools along the bottom. Everything else is out of the way.
export default function PhoneEditor(p: Props) {
  return (
    <>
      <div className="pe-top">
        <div className="pe-side">
          <button className="pe-round" aria-label="Done editing" onClick={p.onDone}>
            <Icon name="back" size={20} />
          </button>
          <span className="pe-caption">Done</span>
        </div>

        <label className="pe-title">
          <select
            aria-label="Floor plan"
            value={p.mapId}
            onChange={(e) => {
              p.onMap(e.target.value);
              e.target.blur();
            }}
          >
            {p.importedName && <option value="">{p.importedName}</option>}
            {p.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="pe-side">
          <button className="pe-round" aria-label="Reset camera" onClick={p.onResetCamera}>
            <Icon name="focus" size={20} />
          </button>
          <span className="pe-caption">View</span>
        </div>
      </div>

      {p.fireCount > 0 && (
        <button className="pe-fires" onClick={p.onClearFire}>
          <i className="dot" />
          {p.fireCount === 1 ? "1 fire" : `${p.fireCount} fires`}
          <span>Clear</span>
        </button>
      )}

      <div className="pe-tray" role="group" aria-label="Layout tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={t.id === p.tool ? "pe-tool on" : "pe-tool"} aria-pressed={t.id === p.tool} onClick={() => p.onTool(t.id)}>
            <span className="pe-tool-icon">
              <Icon name={t.icon} size={20} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
