import { useMemo } from "react";
import { COLOR } from "../render/palette";
import { CELL_M, CONGESTION_DENSITY, DOOR, TICK_S } from "../sim/config";
import { findExits, type Exit } from "../sim/flowfield";
import type { Recording } from "../sim/recording";
import type { Building } from "../sim/types";
import Switch from "./Switch";

interface Props {
  recording: Recording;
  showBottlenecks: boolean;
  onShowBottlenecks: (on: boolean) => void;
}

const NEAR_EXIT_M = 4;
const NEAR_DOOR_M = 3;

// The outcome of the run. Shown once playback has reached the end.
export default function ResultsPanel({ recording, showBottlenecks, onShowBottlenecks }: Props) {
  const { building, metrics } = recording;
  const exits = useMemo(() => findExits(building), [building]);
  const total = recording.agents.length;
  const share = total ? (metrics.evacuated / total) * 100 : 0;
  const usage = exits.map((e) => ({ id: e.id, count: metrics.exitUsage[e.id] ?? 0 })).sort((a, b) => b.count - a.count);
  const busiest = Math.max(1, ...usage.map((u) => u.count));

  return (
    <section className="card panel results">
      <h2 className="eyebrow">Results</h2>
      <dl className="facts">
        <div>
          <dt>Got out</dt>
          <dd>
            {metrics.evacuated} of {total} <span className="aside">{Math.round(share)}%</span>
          </dd>
        </div>
        <div>
          <dt>Trapped</dt>
          <dd>{metrics.trapped}</dd>
        </div>
        <div>
          <dt>Last person out</dt>
          <dd>{metrics.evacuated > 0 ? `${metrics.evacTimeSec.toFixed(1)} s` : "–"}</dd>
        </div>
      </dl>

      <h3 className="eyebrow">People per exit</h3>
      <div className="bars">
        {usage.map((u) => (
          <div
            key={u.id}
            className="bar-row"
            title={`Exit ${u.id}: ${u.count} people, ${Math.round((u.count / Math.max(metrics.evacuated, 1)) * 100)}% of those who got out`}
          >
            <span className="bar-name">
              Exit {u.id}
              {u.id === building.entryExitId && <span className="bar-tag">entry</span>}
            </span>
            <span className="bar-track">
              <i style={{ width: `${(u.count / busiest) * 100}%`, background: COLOR.exit }} />
            </span>
            <span className="bar-value">{u.count}</span>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h3 className="eyebrow">Bottlenecks</h3>
        {metrics.bottlenecks.length > 0 && (
          <label className="layer-toggle">
            <Switch label="Mark bottlenecks on the map and in the 3D view" checked={showBottlenecks} onChange={onShowBottlenecks} />
            Mark on map
          </label>
        )}
      </div>
      {metrics.bottlenecks.length === 0 ? (
        <p className="hint">No crowding above {CONGESTION_DENSITY} people per m².</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Where</th>
              <th className="num">Peak</th>
              <th className="num">Jammed for</th>
            </tr>
          </thead>
          <tbody>
            {metrics.bottlenecks.map((b, i) => (
              <tr key={`${b.x},${b.y}`}>
                <td className="rank">B{i + 1}</td>
                <td>{describeSpot(building, exits, b.x, b.y)}</td>
                <td className="num">{b.peakDensity.toFixed(1)} /m²</td>
                <td className="num">{(b.ticksCongested * TICK_S).toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// A cell position in words a facility manager would use.
function describeSpot(b: Building, exits: Exit[], x: number, y: number): string {
  const metres = (cell: number) => Math.hypot((cell % b.width) - x, Math.floor(cell / b.width) - y) * CELL_M;

  let exitDist = Infinity;
  let exitId = -1;
  for (const e of exits) {
    for (const cell of e.cells) {
      if (metres(cell) < exitDist) {
        exitDist = metres(cell);
        exitId = e.id;
      }
    }
  }
  if (exitDist <= NEAR_EXIT_M) return `Near exit ${exitId}`;

  let doorDist = Infinity;
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === DOOR) doorDist = Math.min(doorDist, metres(i));
  let room = "";
  let roomDist = Infinity;
  for (const l of b.labels) {
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < roomDist) {
      roomDist = d;
      room = l.name;
    }
  }
  if (doorDist <= NEAR_DOOR_M) return room ? `Doorway, ${room} side` : "At a doorway";
  return room ? `In ${room}` : `Cell ${x}, ${y}`;
}
