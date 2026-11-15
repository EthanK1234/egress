import { COLOR } from "../render/palette";
import type { EditResult } from "../sim/edits";
import type { BuildingEdit, OverseerProposal, RunMetrics } from "../sim/types";
import Switch from "./Switch";

interface Props {
  proposal: OverseerProposal | null;
  preview: EditResult | null; // the proposal's edits applied to the original building
  busy: boolean; // waiting for the overseer
  error: string | null;
  replay: boolean;
  before: RunMetrics | null; // set once the edits have been applied and re-run
  after: RunMetrics; // the run being shown
  onReplay: (on: boolean) => void;
  onAsk: () => void;
  onApply: () => void;
}

// The overseer: explains the bottleneck, proposes edits, and proves them with a re-run.
export default function OverseerPanel(p: Props) {
  const { proposal, preview, before } = p;
  const rejected = new Map(preview?.rejected.map((r) => [r.edit, r.why]));
  const usable = preview?.applied.length ?? 0;

  return (
    <section className="card panel overseer">
      <h2 className="eyebrow">Overseer</h2>

      {!proposal && (
        <>
          <p className="hint">Ask for a diagnosis of this run and up to 3 layout fixes. Applying them re-runs the same crowd.</p>
          <label className="layer-toggle">
            <Switch label="Use the saved proposal instead of calling Gemini" checked={p.replay} onChange={p.onReplay} />
            Use saved proposal
          </label>
          {p.error && <p className="error">{p.error}</p>}
          <button className="primary wide" onClick={p.onAsk} disabled={p.busy}>
            {p.busy ? "Thinking…" : "Ask the overseer"}
          </button>
        </>
      )}

      {proposal && (
        <>
          <p className="diagnosis">{proposal.diagnosis}</p>

          <h3 className="eyebrow">{before ? "Edits applied" : "Proposed edits"}</h3>
          {proposal.edits.length === 0 ? (
            <p className="hint">The overseer has no layout changes to suggest.</p>
          ) : (
            <ol className="edits">
              {proposal.edits.map((edit, i) => (
                <li key={i} className={rejected.has(edit) ? "edit rejected" : "edit"}>
                  <i className="dot square" style={{ background: COLOR.exit }} />
                  <div>
                    <strong>{describeEdit(edit)}</strong>
                    <span className="reason">{edit.reason}</span>
                    {rejected.has(edit) && <span className="why">Can't apply: {rejected.get(edit)}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="hint">{proposal.expectedImpact}</p>

          {!before && (
            <button className="primary wide" onClick={p.onApply} disabled={usable === 0}>
              {usable === 0 ? "Nothing to apply" : `Apply ${usable === 1 ? "edit" : `${usable} edits`} and re-run`}
            </button>
          )}
        </>
      )}

      {before && (
        <>
          <h3 className="eyebrow">Before and after</h3>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th className="num">Before</th>
                <th className="num">After</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Got out</td>
                <td className="num">{before.evacuated}</td>
                <td className="num">{p.after.evacuated}</td>
              </tr>
              <tr>
                <td>Trapped</td>
                <td className="num">{before.trapped}</td>
                <td className="num">{p.after.trapped}</td>
              </tr>
              <tr>
                <td>Last person out</td>
                <td className="num">{seconds(before)}</td>
                <td className="num">{seconds(p.after)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function seconds(m: RunMetrics): string {
  return m.evacuated > 0 ? `${m.evacTimeSec.toFixed(1)} s` : "–";
}

function describeEdit(e: BuildingEdit): string {
  return e.type === "add_exit"
    ? `Add an exit, ${e.width} ${e.width === 1 ? "cell" : "cells"} wide, near (${e.x}, ${e.y})`
    : `Widen the door at (${e.x}, ${e.y}) by ${e.by} ${e.by === 1 ? "cell" : "cells"}`;
}
