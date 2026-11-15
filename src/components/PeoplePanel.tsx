import { useEffect, useRef, useState, type ReactNode } from "react";
import { BEHAVIOR_COLOR, BEHAVIOR_NAME, COLOR } from "../render/palette";
import type { Layers } from "../render/view";
import { EVACUATED, FROZEN, TRAPPED, type Recording } from "../sim/recording";

interface Props {
  recording: Recording;
  frame: number; // whole frame at the playhead
  layers: Layers;
  onLayers: (layers: Layers) => void;
  children?: ReactNode; // shown above the list (the switches for the three kinds of people)
}

const ROW = 40; // height of one person's row, in px
const EXTRA_ROWS = 4; // rows drawn beyond the visible ones, so scrolling never shows a gap

const STATUS: Record<number, { label: string; color: string }> = {
  [FROZEN]: { label: "Frozen", color: COLOR.frozen },
  [EVACUATED]: { label: "Survived", color: "var(--accent)" },
  [TRAPPED]: { label: "Trapped", color: "var(--standout)" },
};
const MOVING = { label: "Moving", color: "var(--muted-mark)" };

// Everyone in the run, one row per person. Clicking a person follows them in first person in the 3D view.
// Only the rows in view are in the page, so a crowd of a thousand costs the same as twenty.
export default function PeoplePanel({ recording, frame, layers, onLayers, children }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const n = recording.agents.length;
  const selected = layers.selected;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => setHeight(list.clientHeight));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW) - EXTRA_ROWS);
  const count = Math.min(n - first, Math.ceil(height / ROW) + EXTRA_ROWS * 2);
  const rows = Array.from({ length: Math.max(count, 0) }, (_, k) => first + k);

  return (
    <section className="card panel people">
      {children}
      <div className="people-list" ref={listRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: n * ROW }}>
          {rows.map((id) => {
            const person = recording.agents[id];
            const status = STATUS[recording.status[frame * n + id]] ?? MOVING;
            const on = id === selected;
            return (
              <button
                key={id}
                className={on ? "person on" : layers.people[person.behavior] ? "person" : "person hidden"}
                style={{ top: id * ROW }}
                aria-pressed={on}
                title={on ? "Stop following this person" : "Follow this person in first person"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onLayers({ ...layers, selected: on ? null : id })}
              >
                <span className="person-id num">#{id + 1}</span>
                <span className="person-kind">
                  <i className="dot" style={{ background: BEHAVIOR_COLOR[person.behavior] }} />
                  {BEHAVIOR_NAME[person.behavior]} {person.type}
                </span>
                <span className="person-status">
                  <i className="dot" style={{ background: status.color }} />
                  {on ? "Following" : status.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
