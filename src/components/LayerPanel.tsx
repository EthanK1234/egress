import { BEHAVIORS, BEHAVIOR_COLOR, BEHAVIOR_NAME, COLOR } from "../render/palette";
import type { Layers } from "../render/view";
import type { Behavior } from "../sim/types";
import Switch from "./Switch";

interface Props {
  layers: Layers;
  onChange: (layers: Layers) => void;
  counts: Record<Behavior, number> | null; // people per behavior in the current run; null before a run
}

// Filters for both views, shown under the map. The behavior columns double as the color legend.
export default function LayerPanel({ layers, onChange, counts }: Props) {
  const setBehavior = (group: "people" | "paths", behavior: Behavior, on: boolean) =>
    onChange({ ...layers, [group]: { ...layers[group], [behavior]: on } });

  return (
    <div className="layers">
      {counts && (
        <div className="layer-grid">
          <span />
          {BEHAVIORS.map((b) => (
            <span key={b} className="layer-head">
              <i className="dot" style={{ background: BEHAVIOR_COLOR[b] }} />
              {BEHAVIOR_NAME[b]}
              <span className="layer-count">{counts[b]}</span>
            </span>
          ))}

          <span className="layer-name" title="Show or hide people by how they behave">
            People
          </span>
          {BEHAVIORS.map((b) => (
            <Switch
              key={b}
              label={`Show ${BEHAVIOR_NAME[b].toLowerCase()} people`}
              color={BEHAVIOR_COLOR[b]}
              checked={layers.people[b]}
              onChange={(on) => setBehavior("people", b, on)}
            />
          ))}

          <span className="layer-name" title="Highlight where this group walked. Brighter means more traffic.">
            Paths
          </span>
          {BEHAVIORS.map((b) => (
            <Switch
              key={b}
              label={`Highlight where ${BEHAVIOR_NAME[b].toLowerCase()} people walked`}
              color={BEHAVIOR_COLOR[b]}
              checked={layers.paths[b]}
              onChange={(on) => setBehavior("paths", b, on)}
            />
          ))}
        </div>
      )}

      <ul className="legend">
        <li>
          <i className="dot square" style={{ background: COLOR.fire }} />
          Fire
        </li>
        <li>
          <i className="dot square" style={{ background: COLOR.exit }} />
          Exit
        </li>
        <li>
          <i className="dot square" style={{ background: COLOR.door }} />
          Door
        </li>
        {counts && (
          <>
            <li>
              <i className="dot" style={{ background: COLOR.frozen }} />
              Frozen
            </li>
            <li>
              <span className="cross" style={{ color: COLOR.trapped }}>
                ×
              </span>
              Trapped
            </li>
          </>
        )}
      </ul>
    </div>
  );
}
