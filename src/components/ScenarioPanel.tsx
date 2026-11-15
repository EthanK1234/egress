import type { ReactNode } from "react";
import { COLOR } from "../render/palette";
import Icon from "./Icon";

interface Props {
  mapError: string | null; // why the last picked or imported map could not be loaded
  importedName: string | null; // file name of the imported floor plan, while it is the one in use
  seed: number;
  agentCount: number;
  fireCount: number;
  busy: boolean; // the run is being computed
  simulatedSec: number; // sim time computed so far, while busy
  onImport: (file: File) => void;
  onSeed: (v: number) => void;
  onAgentCount: (v: number) => void;
  onClearFire: () => void;
  onResetLayout: () => void;
  onRun: () => void;
  children?: ReactNode; // the floor plan picker, shown first
}

const MAX_PEOPLE = 1000;
const PEOPLE_STEP = 25;

// The inputs for a run. Only shown before a run exists.
export default function ScenarioPanel(p: Props) {
  const clamp = (v: number) => Math.max(1, Math.min(MAX_PEOPLE, v));
  // The buttons move to the next multiple of the step; typing sets any number.
  const stepPeople = (direction: 1 | -1) => p.onAgentCount(clamp(Math.round((p.agentCount + direction * PEOPLE_STEP) / PEOPLE_STEP) * PEOPLE_STEP));

  return (
    <section className="card panel scenario">
      <h2 className="eyebrow">Set up</h2>

      {p.children}

      <div className="field">
        <span className="field-label">{p.importedName ? `Using ${p.importedName}` : "Your own floor plan"}</span>
        <label className={p.busy ? "file-button disabled" : "file-button"}>
          Import JSON
          <input
            type="file"
            accept=".json,application/json"
            disabled={p.busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) p.onImport(file);
              e.target.value = ""; // so the same file can be picked again after fixing it
            }}
          />
        </label>
      </div>
      {p.mapError && <p className="hint">{p.mapError}</p>}

      <div className="field">
        <span className="field-label">People</span>
        <div className="stepper">
          <button className="icon-button" aria-label="Fewer people" disabled={p.busy || p.agentCount <= 1} onClick={() => stepPeople(-1)}>
            <Icon name="minus" size={16} />
          </button>
          <input
            type="number"
            aria-label="People"
            min={1}
            max={MAX_PEOPLE}
            value={p.agentCount}
            disabled={p.busy}
            onChange={(e) => p.onAgentCount(clamp(Number(e.target.value) || 1))}
          />
          <button className="icon-button" aria-label="More people" disabled={p.busy || p.agentCount >= MAX_PEOPLE} onClick={() => stepPeople(1)}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          <i className="dot square" style={{ background: COLOR.fire }} />
          {p.fireCount === 0 ? "No fire yet" : p.fireCount === 1 ? "1 fire start" : `${p.fireCount} fire starts`}
        </span>
        <button className="quiet" onClick={p.onClearFire} disabled={p.busy || p.fireCount === 0}>
          Clear
        </button>
      </div>

      <button className="primary wide" onClick={p.onRun} disabled={p.busy}>
        {p.busy ? `Simulating… ${p.simulatedSec.toFixed(0)} s` : "Run simulation"}
      </button>

      <div className="advanced">
        <h3 className="eyebrow">Advanced</h3>
        <div className="field" title="The same seed gives the same crowd, so a run can be repeated exactly">
          <label className="field-label" htmlFor="seed">
            Crowd seed
          </label>
          <input id="seed" type="number" value={p.seed} disabled={p.busy} onChange={(e) => p.onSeed(Number(e.target.value) || 0)} />
        </div>
        <div className="field">
          <span className="field-label">Layout</span>
          <button className="small" disabled={p.busy} onClick={p.onResetLayout}>
            Reset to default
          </button>
        </div>
      </div>
    </section>
  );
}
