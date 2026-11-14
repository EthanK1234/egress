import { TICK_S } from "../sim/config";
import type { SimState } from "../sim/sim";
import type { RunMetrics } from "../sim/types";

interface Props {
  sim: SimState | null;
  metrics: RunMetrics | null;
}

export default function StatsPanel({ sim, metrics }: Props) {
  if (!sim) {
    return (
      <div className="panel">
        <h2>Setup</h2>
        <p>Click empty cells on the map to place or remove fire starts, then press Run.</p>
        <Legend />
      </div>
    );
  }

  const count = (status: string) => sim.agents.filter((a) => a.status === status).length;
  return (
    <div className="panel">
      <h2>{sim.done ? "Results" : "Running"}</h2>
      <table>
        <tbody>
          <Row label="Time" value={`${(sim.tick * TICK_S).toFixed(1)} s`} />
          <Row label="Evacuated" value={count("evacuated")} />
          <Row label="Trapped" value={count("trapped")} />
          <Row label="Still inside" value={count("moving") + count("frozen")} />
          <Row label="Frozen now" value={count("frozen")} />
        </tbody>
      </table>

      {metrics && (
        <>
          <h3>Evacuation time</h3>
          <p>{metrics.evacTimeSec.toFixed(1)} s until the last agent got out</p>
          <h3>Exit usage</h3>
          <table>
            <tbody>
              {Object.entries(metrics.exitUsage).map(([id, n]) => (
                <Row key={id} label={`Exit ${id}${Number(id) === sim.building.entryExitId ? " (entry)" : ""}`} value={n} />
              ))}
            </tbody>
          </table>
          <h3>Bottlenecks</h3>
          {metrics.bottlenecks.length === 0 ? (
            <p>None</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Cell</th>
                  <th>Peak /m²</th>
                  <th>Congested</th>
                </tr>
              </thead>
              <tbody>
                {metrics.bottlenecks.map((b) => (
                  <tr key={`${b.x},${b.y}`}>
                    <td>
                      ({b.x}, {b.y})
                    </td>
                    <td>{b.peakDensity}</td>
                    <td>{(b.ticksCongested * TICK_S).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <Legend />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{value}</td>
    </tr>
  );
}

function Legend() {
  return (
    <ul className="legend">
      <li><span style={{ background: "#2563eb" }} /> Calm</li>
      <li><span style={{ background: "#f59e0b" }} /> Panicker</li>
      <li><span style={{ background: "#9333ea" }} /> Freezer</li>
      <li><span style={{ background: "#4c1d95" }} /> Frozen</li>
      <li><span style={{ background: "#ef4444" }} /> Fire</li>
      <li><span className="x">×</span> Trapped</li>
      <li><span className="ring" /> Bottleneck</li>
    </ul>
  );
}
