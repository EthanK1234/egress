import { useMemo } from "react";
import { CELL_M, CONGESTION_DENSITY, DOOR, TICK_S } from "../sim/config";
import { findExits, type Exit } from "../sim/flowfield";
import type { Recording } from "../sim/recording";
import type { Building } from "../sim/types";

interface Props {
  recording: Recording;
}

const NEAR_EXIT_M = 4;
const NEAR_DOOR_M = 3;

// The detail behind the outcome, shown once playback has reached the end:
// which exits people used and where they got stuck. Time comes last; it matters least.
export default function ResultsPanel({ recording }: Props) {
  const { building, metrics } = recording;
  const exits = useMemo(() => findExits(building), [building]);
  const usage = exits.map((e) => ({ id: e.id, count: metrics.exitUsage[e.id] ?? 0 })).sort((a, b) => b.count - a.count);
  const busiest = Math.max(1, ...usage.map((u) => u.count));

  return (
    <section className="card panel results">
      <h3 className="eyebrow">People per exit</h3>
      <div className="bars">
        {usage.map((u) => (
          <div
            key={u.id}
            className="bar-row"
            title={`Exit ${u.id}: ${u.count} people, ${Math.round((u.count / Math.max(metrics.evacuated, 1)) * 100)}% of those who survived`}
          >
            <span className="bar-name">
              Exit {u.id}
              {u.id === building.entryExitId && <span className="bar-tag">entry</span>}
            </span>
            <span className="bar-track">
              <i style={{ width: `${(u.count / busiest) * 100}%` }} />
            </span>
            <span className="bar-value num">{u.count}</span>
          </div>
        ))}
      </div>

      <h3 className="eyebrow">Bottlenecks</h3>
      {metrics.bottlenecks.length === 0 ? (
        <p className="hint">No crowding above {CONGESTION_DENSITY} people per m².</p>
      ) : (
        <ol className="jams">
          {metrics.bottlenecks.map((b, i) => (
            <li key={`${b.x},${b.y}`} title={`Peak ${b.peakDensity.toFixed(1)} people per m²`}>
              <span className="jam-tag">B{i + 1}</span>
              <span className="jam-where">{describeSpot(building, exits, b.x, b.y)}</span>
              <span className="jam-time num">jammed {(b.ticksCongested * TICK_S).toFixed(0)} s</span>
            </li>
          ))}
        </ol>
      )}

      {metrics.evacuated > 0 && <p className="results-foot">Last person out after {metrics.evacTimeSec.toFixed(1)} s</p>}
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
