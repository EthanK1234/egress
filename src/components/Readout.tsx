import type { ReactNode } from "react";
import { COLOR } from "../render/palette";
import { CELL_M } from "../sim/config";
import { findExits } from "../sim/flowfield";
import type { Recording } from "../sim/recording";
import type { Building } from "../sim/types";

interface Props {
  building: Building;
  recording: Recording | null;
  playhead: number;
  agentCount: number;
  fireCount: number;
}

// The row of numbers above the 3D view.
// During a run it leads with the two that matter most, how many people survived and the
// survival rate, set apart in their own wells. Before a run it describes the scenario.
export default function Readout({ building, recording, playhead, agentCount, fireCount }: Props) {
  if (!recording) {
    return (
      <div className="readout card">
        <Stat label="People" value={agentCount} />
        <Stat label="Fire starts" value={fireCount} mark={<i className="dot square" style={{ background: COLOR.fire }} />} />
        <Stat label="Exits" value={findExits(building).length} mark={<i className="dot square" style={{ background: COLOR.exit }} />} />
        <Stat label="Floor size" value={`${building.width * CELL_M} × ${building.height * CELL_M}`} note="m" />
      </div>
    );
  }

  const last = recording.frames - 1;
  const frame = Math.min(Math.floor(playhead), last);
  const total = recording.agents.length;
  const survived = recording.evacuated[frame];
  const trapped = recording.trapped[frame];
  const frozen = recording.frozen[frame];
  const inside = total - survived - trapped;
  const exact = total > 0 ? (survived / total) * 100 : 0;
  const rate = Number.isInteger(exact) ? exact : exact.toFixed(1); // one decimal, so it matches the overseer's figures
  const live = playhead < last; // the run is still going, so these are running totals
  const parts = [
    { name: "survived", count: survived, color: "var(--accent)" },
    { name: "still inside", count: inside, color: "var(--muted-mark)" },
    { name: "trapped", count: trapped, color: "var(--standout)" },
  ];

  return (
    <div className="readout card">
      <Stat hero label="Survived" value={survived} note={`of ${total}${live ? " so far" : ""}`} />
      <Stat hero label="Survival rate" value={`${rate}%`} note={live ? "so far" : undefined} />
      <Stat
        label="Still inside"
        value={inside}
        note={frozen > 0 ? `${frozen} frozen` : undefined}
        mark={<i className="dot" style={{ background: "var(--muted-mark)" }} />}
      />
      <Stat label="Trapped" value={trapped} mark={<i className="dot" style={{ background: "var(--standout)" }} />} />
      <div className="split" role="img" aria-label={parts.map((part) => `${part.count} ${part.name}`).join(", ")}>
        {parts.map((part) => part.count > 0 && <i key={part.name} style={{ flexGrow: part.count, background: part.color }} />)}
      </div>
    </div>
  );
}

function Stat(p: { label: string; value: string | number; note?: string; mark?: ReactNode; hero?: boolean }) {
  return (
    <div className={p.hero ? "stat hero" : "stat"}>
      <div className="caps stat-label">
        {p.mark}
        {p.label}
      </div>
      <div className="stat-value num">
        {p.value}
        {p.note && <small>{p.note}</small>}
      </div>
    </div>
  );
}
