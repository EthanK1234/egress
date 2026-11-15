import { secondsSaved, survivalGain, type Impact } from "../editor/impact";
import { TICK_S } from "../sim/config";
import type { EditResult } from "../sim/edits";
import type { Recording } from "../sim/recording";
import type { BuildingEdit, OverseerProposal } from "../sim/types";
import Switch from "./Switch";

interface Props {
  proposal: OverseerProposal | null;
  preview: EditResult | null; // the proposal's edits applied to the original building
  impact: Impact | null; // each fix measured by re-running the same crowd
  busy: boolean; // waiting for the overseer
  error: string | null;
  replay: boolean;
  before: Recording | null; // the original run, set once the edits have been applied and re-run
  after: Recording; // the run being shown
  onReplay: (on: boolean) => void;
  onAsk: () => void;
  onApply: () => void;
}

// The overseer: Gemini explains the bottleneck and proposes fixes; the numbers come from
// re-running the same crowd with each fix, so every figure here is measured, not guessed.
export default function OverseerPanel(p: Props) {
  const { proposal, preview, impact, before } = p;
  const rejected = new Map(preview?.rejected.map((r) => [r.edit, r.why]));
  const usable = preview?.applied.length ?? 0;
  const was = before?.metrics;
  const now = p.after.metrics;
  // Last person out is not a like-for-like time when the head counts differ: someone who was
  // trapped before and now walks out late makes it longer. So also time the same number of people.
  const same = was ? Math.min(was.evacuated, now.evacuated) : 0;
  const base = impact?.baseline ?? null;
  const total = base?.total ?? p.after.agents.length;

  return (
    <section className="card panel overseer">
      <h2 className="eyebrow">Overseer</h2>

      {!proposal && (
        <>
          <p className="hint">Ask for a diagnosis of this run and up to 3 layout fixes. Each fix is then tested on the same crowd.</p>
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
          <p className="ov-headline">{firstSentence(proposal.diagnosis)}</p>

          {/* The headline number: what all the fixes together do. */}
          {usable > 0 && (
            <div className="ov-total">
              {base && impact?.all ? (
                <>
                  <div className="ov-total-main">
                    <span className="ov-big num">{signed(survivalGain(base, impact.all), "%")}</span>
                    <span className="ov-big-label">survival {before ? "after the fixes" : `with ${usable === 1 ? "this fix" : `all ${usable} fixes`}`}</span>
                  </div>
                  <dl className="ov-facts">
                    <Fact label="Survival rate" from={pct(base.evacuated, total)} to={pct(impact.all.evacuated, total)} />
                    <Fact label="Trapped" from={`${base.trapped}`} to={`${impact.all.trapped}`} />
                    <Fact label={`First ${Math.min(base.evacuated, impact.all.evacuated)} out`} value={faster(secondsSaved(base, impact.all))} />
                  </dl>
                </>
              ) : (
                <p className="hint">Testing the fixes on the same crowd…</p>
              )}
            </div>
          )}

          <h3 className="eyebrow">{before ? "Fixes applied" : "Proposed fixes"}</h3>
          {proposal.edits.length === 0 ? (
            <p className="hint">No layout changes to suggest.</p>
          ) : (
            <ol className="ov-fixes">
              {proposal.edits.map((edit, i) => {
                const own = impact?.perEdit.get(edit);
                return (
                  <li key={i} className={rejected.has(edit) ? "ov-fix rejected" : "ov-fix"}>
                    <span className="ov-fix-n">{i + 1}</span>
                    <div className="ov-fix-body">
                      <strong>{describeEdit(edit)}</strong>
                      {rejected.has(edit) ? (
                        <span className="ov-fix-why">Can't apply: {rejected.get(edit)}</span>
                      ) : (
                        <span className="ov-chips">
                          {base && own ? (
                            <>
                              <Chip value={survivalGain(base, own)} unit="%" label="survival" />
                              <TimeChip seconds={secondsSaved(base, own)} />
                            </>
                          ) : (
                            <span className="ov-chip pending">{impact?.done ? "no effect alone" : "testing…"}</span>
                          )}
                        </span>
                      )}
                      {edit.reason && (
                        <span className="ov-fix-why" title={edit.reason}>
                          {edit.reason}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {overlaps(impact, preview) && (
            <p className="hint">The fixes overlap, so their separate gains don't simply add up. The total above is all of them together.</p>
          )}

          {!before && (
            <button className="primary wide" onClick={p.onApply} disabled={usable === 0}>
              {usable === 0 ? "Nothing to apply" : `Apply ${usable === 1 ? "fix" : `${usable} fixes`} and re-run`}
            </button>
          )}

          <details className="ov-notes">
            <summary>Overseer's full notes</summary>
            <p>{proposal.diagnosis}</p>
            {proposal.expectedImpact && <p>{proposal.expectedImpact}</p>}
          </details>
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

// Time chip: how much sooner (or later) the same number of people got out.
function TimeChip({ seconds: s }: { seconds: number | null }) {
  if (s === null) return null;
  if (Math.abs(s) < 0.25) return <span className="ov-chip flat">same speed</span>;
  return (
    <span className={s > 0 ? "ov-chip up" : "ov-chip down"}>
      <b className="num">{Math.abs(s).toFixed(1)} s</b> {s > 0 ? "sooner" : "later"}
    </span>
  );
}

// A measured change: steel blue when it helps, tangerine when it hurts, grey when it does nothing.
function Chip({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  if (value === null) return null;
  const tone = Math.abs(value) < 0.05 ? "flat" : value > 0 ? "up" : "down";
  return (
    <span className={`ov-chip ${tone}`}>
      <b className="num">{tone === "flat" ? `±0${unit}` : signed(value, unit)}</b> {label}
    </span>
  );
}

function Fact(p: { label: string; from?: string; to?: string; value?: string }) {
  return (
    <div>
      <dt>{p.label}</dt>
      <dd className="num">
        {p.value ?? (
          <>
            {p.from} <span className="ov-arrow">→</span> <b>{p.to}</b>
          </>
        )}
      </dd>
    </div>
  );
}

// +1.5%, −4 s. Whole numbers once the value is 10 or more.
function signed(v: number, unit: string): string {
  const abs = Math.abs(v);
  const text = abs >= 10 || Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1);
  return `${v < 0 ? "−" : "+"}${text}${unit}`;
}

function pct(n: number, total: number): string {
  const v = total > 0 ? (n / total) * 100 : 0;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

function faster(s: number | null): string {
  if (s === null) return "–";
  if (Math.abs(s) < 0.25) return "same time";
  return s > 0 ? `${s.toFixed(1)} s sooner` : `${(-s).toFixed(1)} s later`;
}

// True when the fixes measured one at a time add up to noticeably more (or less) than all of them together.
function overlaps(impact: Impact | null, preview: EditResult | null): boolean {
  if (!impact?.done || !impact.baseline || !impact.all || !preview || preview.applied.length < 2) return false;
  const base = impact.baseline;
  let sum = 0;
  for (const { edit } of preview.applied) {
    const own = impact.perEdit.get(edit);
    if (own) sum += survivalGain(base, own);
  }
  return Math.abs(sum - survivalGain(base, impact.all)) >= 1;
}

function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  return match ? match[0] : text;
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

// Short enough for one line in the panel.
function describeEdit(e: BuildingEdit): string {
  return e.type === "add_exit"
    ? `New exit at ${e.x}, ${e.y} · ${e.width} ${e.width === 1 ? "cell" : "cells"} wide`
    : `Widen door at ${e.x}, ${e.y} · +${e.by} ${e.by === 1 ? "cell" : "cells"}`;
}
