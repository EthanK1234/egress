import { COLOR } from "../render/palette";
import { TICK_S } from "../sim/config";
import type { EditResult } from "../sim/edits";
import type { Recording } from "../sim/recording";
import type { BuildingEdit, OverseerProposal } from "../sim/types";
import Switch from "./Switch";

interface Props {
  proposal: OverseerProposal | null;
  preview: EditResult | null; // the proposal's edits applied to the original building
  busy: boolean; // waiting for the overseer
  error: string | null;
  replay: boolean;
  before: Recording | null; // the original run, set once the edits have been applied and re-run
  after: Recording; // the run being shown
  onReplay: (on: boolean) => void;
  onAsk: () => void;
  onApply: () => void;
}

// The overseer: explains the bottleneck, proposes edits, and proves them with a re-run.
export default function OverseerPanel(p: Props) {
  const { proposal, preview, before } = p;
  const rejected = new Map(preview?.rejected.map((r) => [r.edit, r.why]));
  const usable = preview?.applied.length ?? 0;
  const was = before?.metrics;
  const now = p.after.metrics;
  // Last person out is not a like-for-like time when the head counts differ: someone who was
  // trapped before and now walks out late makes it longer. So also time the same number of people.
  const same = was ? Math.min(was.evacuated, now.evacuated) : 0;

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

      {before && was && (
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
                <td className="num">{was.evacuated}</td>
                <td className="num">{now.evacuated}</td>
              </tr>
              <tr>
                <td>Trapped</td>
                <td className="num">{was.trapped}</td>
                <td className="num">{now.trapped}</td>
              </tr>
              <tr title="How long each run took to get this many people out">
                <td>First {same} out</td>
                <td className="num">{seconds(timeToEvacuate(before, same))}</td>
                <td className="num">{seconds(timeToEvacuate(p.after, same))}</td>
              </tr>
              <tr>
                <td>Last person out</td>
                <td className="num">{seconds(was.evacuated > 0 ? was.evacTimeSec : null)}</td>
                <td className="num">{seconds(now.evacuated > 0 ? now.evacTimeSec : null)}</td>
              </tr>
            </tbody>
          </table>
          {now.evacuated > was.evacuated && now.evacTimeSec > was.evacTimeSec && (
            <p className="hint">
              The last person left later because {now.evacuated - was.evacuated} more{" "}
              {now.evacuated - was.evacuated === 1 ? "person" : "people"} got out, and they were the slowest to reach an exit.
              Compare the time for the first {same}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function seconds(s: number | null): string {
  return s === null ? "–" : `${s.toFixed(1)} s`;
}

// Seconds until `count` people had got out, or null if that never happened.
function timeToEvacuate(rec: Recording, count: number): number | null {
  if (count <= 0) return null;
  for (let f = 0; f < rec.frames; f++) if (rec.evacuated[f] >= count) return f * TICK_S;
  return null;
}

function describeEdit(e: BuildingEdit): string {
  return e.type === "add_exit"
    ? `Add an exit, ${e.width} ${e.width === 1 ? "cell" : "cells"} wide, near (${e.x}, ${e.y})`
    : `Widen the door at (${e.x}, ${e.y}) by ${e.by} ${e.by === 1 ? "cell" : "cells"}`;
}
