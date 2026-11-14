interface Props {
  seed: number;
  agentCount: number;
  speed: number;
  hasSim: boolean;
  running: boolean;
  done: boolean;
  fireCount: number;
  onSeed: (v: number) => void;
  onAgentCount: (v: number) => void;
  onSpeed: (v: number) => void;
  onRun: () => void;
  onPause: () => void;
  onSkip: () => void;
  onReset: () => void;
  onClearFire: () => void;
}

const SPEEDS = [1, 4, 10, 30];

export default function Toolbar(p: Props) {
  const editing = !p.hasSim;
  return (
    <div className="toolbar">
      <label>
        Seed
        <input type="number" value={p.seed} disabled={!editing} onChange={(e) => p.onSeed(Number(e.target.value) || 0)} />
      </label>
      <label>
        Agents
        <input
          type="number"
          min={1}
          max={1000}
          value={p.agentCount}
          disabled={!editing}
          onChange={(e) => p.onAgentCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
        />
      </label>
      <label>
        Speed
        <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </label>

      {p.running ? (
        <button onClick={p.onPause}>Pause</button>
      ) : (
        <button className="primary" onClick={p.onRun} disabled={p.done}>
          {p.hasSim ? "Resume" : "Run"}
        </button>
      )}
      <button onClick={p.onSkip} disabled={p.done}>
        Skip to end
      </button>
      <button onClick={p.onReset} disabled={!p.hasSim}>
        Reset
      </button>
      <button onClick={p.onClearFire} disabled={!editing || p.fireCount === 0}>
        Clear fire
      </button>
    </div>
  );
}
