import type { ReactNode } from "react";
import { COLOR } from "../render/palette";
import { CELL_M, TICK_S } from "../sim/config";
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
// Before a run it describes the scenario; during a run it shows the state at the playhead.
export default function Readout({ building, recording, playhead, agentCount, fireCount }: Props) {
  if (!recording) {
    return (
      <div className="readout card">
        <div className="tiles">
          <Tile label="Floor" value={`${building.width * CELL_M} × ${building.height * CELL_M} m`} />
          <Tile label="Exits" value={findExits(building).length} mark={<Dot color={COLOR.exit} />} />
          <Tile label="People" value={agentCount} />
          <Tile label="Fire starts" value={fireCount} mark={<Dot color={COLOR.fire} />} />
        </div>
      </div>
    );
  }

  const frame = Math.min(Math.floor(playhead), recording.frames - 1);
  const total = recording.agents.length;
  const evacuated = recording.evacuated[frame];
  const trapped = recording.trapped[frame];
  const frozen = recording.frozen[frame];
  const inside = total - evacuated - trapped;
  const burningM2 = recording.burning[frame] * CELL_M * CELL_M;
  const parts = [
    { name: "evacuated", count: evacuated, color: COLOR.exit },
    { name: "still inside", count: inside, color: COLOR.inside },
    { name: "trapped", count: trapped, color: COLOR.trapped },
  ];

  return (
    <div className="readout card">
      <div className="tiles">
        <Tile label="Time" value={`${(playhead * TICK_S).toFixed(1)} s`} />
        <Tile
          label="Evacuated"
          value={evacuated}
          note={`${Math.round((evacuated / Math.max(total, 1)) * 100)}%`}
          mark={<Dot color={COLOR.exit} />}
        />
        <Tile label="Still inside" value={inside} note={frozen > 0 ? `${frozen} frozen` : undefined} mark={<Dot color={COLOR.inside} />} />
        <Tile label="Trapped" value={trapped} mark={<Dot color={COLOR.trapped} />} />
        <Tile label="Burning" value={`${Math.round(burningM2)} m²`} mark={<Dot color={COLOR.fire} />} />
      </div>
      <div className="split" role="img" aria-label={parts.map((part) => `${part.count} ${part.name}`).join(", ")}>
        {parts.map((part) => part.count > 0 && <i key={part.name} style={{ flexGrow: part.count, background: part.color }} />)}
      </div>
    </div>
  );
}

function Tile({ label, value, note, mark }: { label: string; value: string | number; note?: string; mark?: ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">
        {mark}
        {label}
      </div>
      <div className="tile-value">
        {value}
        {note && <span className="tile-note">{note}</span>}
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <i className="dot" style={{ background: color }} />;
}
