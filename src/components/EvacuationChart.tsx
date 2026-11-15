import { useMemo, useState, type PointerEvent } from "react";
import { TICK_S } from "../sim/config";
import type { Recording } from "../sim/recording";

interface Props {
  recording: Recording;
  playhead: number; // fractional frame
}

// Chart area, in SVG units. The SVG scales to the card's width.
const W = 340;
const H = 150;
const PAD = { left: 30, right: 8, top: 10, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const SERIES = [
  { key: "survived", label: "Survived", color: "var(--accent)" },
  { key: "inside", label: "Still inside", color: "var(--muted-mark)" },
  { key: "trapped", label: "Trapped", color: "var(--standout)" },
] as const;
type Key = (typeof SERIES)[number]["key"];

// Frame to x, and head count to y, in SVG units.
const toX = (frame: number, lastFrame: number) => PAD.left + (frame / lastFrame) * PLOT_W;
const toY = (count: number, total: number) => PAD.top + PLOT_H - (count / Math.max(total, 1)) * PLOT_H;

// People over time: how many have got out, are still inside and are trapped.
// The lines for the whole run are built once; playback only moves a clip and a marker,
// so the chart fills in as the run plays without redrawing the lines.
export default function EvacuationChart({ recording, playhead }: Props) {
  const [hover, setHover] = useState<number | null>(null); // frame under the pointer
  const total = recording.agents.length;
  const last = Math.max(recording.frames - 1, 1);
  const frame = Math.min(Math.max(Math.floor(playhead), 0), last);
  const x = (f: number) => toX(f, last);
  const y = (count: number) => toY(count, total);

  const valuesAt = (f: number): Record<Key, number> => {
    const survived = recording.evacuated[f];
    const trapped = recording.trapped[f];
    return { survived, trapped, inside: total - survived - trapped };
  };

  const paths = useMemo(() => {
    const out = {} as Record<Key, string>;
    for (const s of SERIES) {
      let d = "";
      for (let f = 0; f <= last; f++) {
        const survived = recording.evacuated[f];
        const trapped = recording.trapped[f];
        const v = s.key === "survived" ? survived : s.key === "trapped" ? trapped : total - survived - trapped;
        d += `${f === 0 ? "M" : "L"}${toX(f, last).toFixed(1)},${toY(v, total).toFixed(1)}`;
      }
      out[s.key] = d;
    }
    return out;
  }, [recording, last, total]);

  const shown = hover ?? frame;
  const values = valuesAt(shown);
  const clipId = `reveal-${recording.frames}-${total}`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const f = Math.round(((sx - PAD.left) / PLOT_W) * last);
    setHover(f >= 0 && f <= frame ? f : null); // only the part that has played can be read
  };

  return (
    <section className="card panel chart-card">
      <div className="chart-head">
        <h3 className="eyebrow">People over time</h3>
        <span className="chart-time num">{(shown * TICK_S).toFixed(1)} s</span>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`People over time. At ${(shown * TICK_S).toFixed(0)} seconds: ${values.survived} survived, ${values.inside} still inside, ${values.trapped} trapped.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={x(Math.min(playhead, last)) + 1} height={H} />
          </clipPath>
        </defs>

        {/* Gridlines at 0, half and all of the crowd */}
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(total * t)} y2={y(total * t)} />
            <text className="chart-tick" x={PAD.left - 6} y={y(total * t) + 3.5} textAnchor="end">
              {Math.round(total * t)}
            </text>
          </g>
        ))}
        <text className="chart-tick" x={PAD.left} y={H - 6}>
          0 s
        </text>
        <text className="chart-tick" x={W - PAD.right} y={H - 6} textAnchor="end">
          {(last * TICK_S).toFixed(0)} s
        </text>

        <g clipPath={`url(#${clipId})`}>
          {SERIES.map((s) => (
            <path key={s.key} d={paths[s.key]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>

        <line className="chart-now" x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + PLOT_H} />
        {SERIES.map((s) => (
          <circle key={s.key} cx={x(shown)} cy={y(values[s.key])} r={4} fill={s.color} strokeWidth={2} style={{ stroke: "var(--surface)" }} />
        ))}
      </svg>

      <ul className="chart-legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <i className="dot" style={{ background: s.color }} />
            {s.label}
            <span className="num">{values[s.key]}</span>
          </li>
        ))}
        <li>
          <i className="dot" style={{ background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--text-3)" }} />
          Frozen
          <span className="num">{recording.frozen[shown]}</span>
        </li>
      </ul>
    </section>
  );
}
