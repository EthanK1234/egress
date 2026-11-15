import { BEHAVIORS, BEHAVIOR_COLOR, BEHAVIOR_NAME } from "../render/palette";
import type { Layers } from "../render/view";
import type { Behavior } from "../sim/types";
import Icon from "./Icon";

interface Props {
  layers: Layers;
  onChange: (layers: Layers) => void;
  counts: Record<Behavior, number>; // people per behavior in the current run
}

// One row per kind of person, with two switches each: show them, and highlight where they walked.
// It also works as the color legend for both views.
export default function LayerPanel({ layers, onChange, counts }: Props) {
  const toggle = (group: "people" | "paths", behavior: Behavior) =>
    onChange({ ...layers, [group]: { ...layers[group], [behavior]: !layers[group][behavior] } });

  return (
    <div className="groups">
      <div className="group caps">
        <span>Type</span>
        <span>Show</span>
        <span>Path</span>
      </div>
      {BEHAVIORS.map((b) => {
        const name = BEHAVIOR_NAME[b].toLowerCase();
        return (
          <div className="group" key={b}>
            <span className="group-name">
              <i className="dot" style={{ background: BEHAVIOR_COLOR[b] }} />
              {BEHAVIOR_NAME[b]}
              <span className="group-count num">{counts[b]}</span>
            </span>
            <IconToggle
              on={layers.people[b]}
              icon={layers.people[b] ? "eye" : "eyeOff"}
              label={layers.people[b] ? `Hide ${name} people` : `Show ${name} people`}
              onClick={() => toggle("people", b)}
            />
            <IconToggle
              on={layers.paths[b]}
              icon="path"
              label={layers.paths[b] ? `Stop highlighting where ${name} people walked` : `Highlight where ${name} people walked`}
              onClick={() => toggle("paths", b)}
            />
          </div>
        );
      })}
    </div>
  );
}

// A mouse click doesn't move keyboard focus onto it (Tab still does), so Space keeps meaning play/pause.
function IconToggle(p: { on: boolean; icon: "eye" | "eyeOff" | "path"; label: string; onClick: () => void }) {
  return (
    <button
      className={p.on ? "icon-button toggle on" : "icon-button toggle"}
      aria-pressed={p.on}
      aria-label={p.label}
      title={p.label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      <Icon name={p.icon} size={16} />
    </button>
  );
}
