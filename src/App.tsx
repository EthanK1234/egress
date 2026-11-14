import { useEffect, useState } from "react";
import MapCanvas from "./components/MapCanvas";
import StatsPanel from "./components/StatsPanel";
import Toolbar from "./components/Toolbar";
import { DEFAULT_AGENT_COUNT, DEFAULT_SEED, TICK_S, WALL } from "./sim/config";
import { getMetrics } from "./sim/metrics";
import { createSim, runToEnd, step, type SimState } from "./sim/sim";
import { testMap } from "./sim/testMap";
import type { RunMetrics } from "./sim/types";

const building = testMap;

export default function App() {
  const [fireStarts, setFireStarts] = useState<[number, number][]>([]);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [agentCount, setAgentCount] = useState(DEFAULT_AGENT_COUNT);
  const [speed, setSpeed] = useState(4);
  const [sim, setSim] = useState<SimState | null>(null);
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState(0);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);

  // Playback loop: advance the sim in real time scaled by `speed`.
  useEffect(() => {
    if (!running || !sim) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const loop = (now: number) => {
      carry += ((now - last) / 1000) * (speed / TICK_S);
      last = now;
      const ticks = Math.min(Math.floor(carry), 50);
      carry -= ticks;
      for (let i = 0; i < ticks && !sim.done; i++) step(sim);
      setFrame((f) => f + 1);
      if (sim.done) {
        setRunning(false);
        setMetrics(getMetrics(sim));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, sim, speed]);

  const startSim = () => {
    const s = createSim(building, { seed, agentCount, fireStarts, blockedExits: [] });
    setSim(s);
    return s;
  };

  const handleRun = () => {
    if (!sim) startSim();
    setRunning(true);
  };

  const handleSkip = () => {
    const s = sim ?? startSim();
    setRunning(false);
    runToEnd(s);
    setMetrics(getMetrics(s));
    setFrame((f) => f + 1);
  };

  const handleReset = () => {
    setRunning(false);
    setSim(null);
    setMetrics(null);
  };

  const toggleFire = (x: number, y: number) => {
    if (building.cells[y * building.width + x] === WALL) return;
    setFireStarts((fs) =>
      fs.some(([fx, fy]) => fx === x && fy === y) ? fs.filter(([fx, fy]) => fx !== x || fy !== y) : [...fs, [x, y]],
    );
  };

  return (
    <main className="app">
      <h1>Egress</h1>
      <Toolbar
        seed={seed}
        agentCount={agentCount}
        speed={speed}
        hasSim={!!sim}
        running={running}
        done={!!sim?.done}
        fireCount={fireStarts.length}
        onSeed={setSeed}
        onAgentCount={setAgentCount}
        onSpeed={setSpeed}
        onRun={handleRun}
        onPause={() => setRunning(false)}
        onSkip={handleSkip}
        onReset={handleReset}
        onClearFire={() => setFireStarts([])}
      />
      <div className="layout">
        <MapCanvas
          building={building}
          fireStarts={fireStarts}
          sim={sim}
          frame={frame}
          bottlenecks={metrics?.bottlenecks ?? []}
          onCellClick={sim ? undefined : toggleFire}
        />
        <StatsPanel sim={sim} metrics={metrics} />
      </div>
    </main>
  );
}
