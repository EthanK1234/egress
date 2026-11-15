import { COLOR } from "../render/palette";

interface Props {
  seed: number;
  agentCount: number;
  fireCount: number;
  busy: boolean; // the run is being computed
  simulatedSec: number; // sim time computed so far, while busy
  onSeed: (v: number) => void;
  onAgentCount: (v: number) => void;
  onClearFire: () => void;
  onRun: () => void;
}

const MAX_PEOPLE = 1000;

// The inputs for a run. Only shown before a run exists.
export default function ScenarioPanel(p: Props) {
  return (
    <section className="card panel">
      <h2 className="eyebrow">Scenario</h2>
      <div className="fields">
        <label className="field">
          People
          <input
            type="number"
            min={1}
            max={MAX_PEOPLE}
            value={p.agentCount}
            disabled={p.busy}
            onChange={(e) => p.onAgentCount(Math.max(1, Math.min(MAX_PEOPLE, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="field" title="The same seed gives the same crowd, so a run can be repeated exactly">
          Seed
          <input type="number" value={p.seed} disabled={p.busy} onChange={(e) => p.onSeed(Number(e.target.value) || 0)} />
        </label>
      </div>

      <div className="fire-row">
        <span>
          <i className="dot square" style={{ background: COLOR.fire }} />
          {p.fireCount === 0 ? "No fire placed" : p.fireCount === 1 ? "1 fire start" : `${p.fireCount} fire starts`}
        </span>
        <button className="quiet" onClick={p.onClearFire} disabled={p.busy || p.fireCount === 0}>
          Clear
        </button>
      </div>
      <p className="hint">
        {p.fireCount === 0
          ? "Click the map to place a fire start. With none, this runs as a plain evacuation drill."
          : "Click the map to add another, or click a fire start to remove it."}
      </p>

      <button className="primary wide" onClick={p.onRun} disabled={p.busy}>
        {p.busy ? `Simulating… ${p.simulatedSec.toFixed(0)} s` : "Run simulation"}
      </button>
    </section>
  );
}
