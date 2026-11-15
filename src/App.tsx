import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import LayerPanel from "./components/LayerPanel";
import MapCanvas from "./components/MapCanvas";
import Readout from "./components/Readout";
import ResultsPanel from "./components/ResultsPanel";
import ScenarioPanel from "./components/ScenarioPanel";
import Switch from "./components/Switch";
import Transport from "./components/Transport";
import { usePlayback } from "./components/usePlayback";
import Viewport3D from "./components/Viewport3D";
import { DEFAULT_LAYERS, type Layers } from "./render/view";
import { DEFAULT_AGENT_COUNT, DEFAULT_SEED, TICK_S, WALL } from "./sim/config";
import { finishRecording, recordStep, startRecording, type Recorder, type Recording } from "./sim/recording";
import { testMap } from "./sim/testMap";
import type { Behavior } from "./sim/types";

const building = testMap;
const NO_RINGS: { x: number; y: number }[] = [];
const SLICE_MS = 12; // time spent computing the run per animation frame, so the page stays responsive

export default function App() {
  const [fireStarts, setFireStarts] = useState<[number, number][]>([]);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [agentCount, setAgentCount] = useState(DEFAULT_AGENT_COUNT);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [computing, setComputing] = useState(false);
  const [simulatedSec, setSimulatedSec] = useState(0);
  const recorder = useRef<Recorder | null>(null);
  const playback = usePlayback(recording?.frames ?? 0);

  const showRun = useEffectEvent((rec: Recording) => {
    setRecording(rec);
    setComputing(false);
    playback.start();
  });

  // The whole run is computed up front (it takes well under a second), a slice per animation frame.
  // Playback then just reads the recording, which is what makes pause, seek and speed possible.
  useEffect(() => {
    const r = recorder.current;
    if (!computing || !r) return;
    let raf = 0;
    const slice = () => {
      const started = performance.now();
      while (!r.sim.done && performance.now() - started < SLICE_MS) recordStep(r);
      if (r.sim.done) {
        showRun(finishRecording(r));
      } else {
        setSimulatedSec(r.sim.tick * TICK_S);
        raf = requestAnimationFrame(slice);
      }
    };
    raf = requestAnimationFrame(slice);
    return () => cancelAnimationFrame(raf);
  }, [computing]);

  const run = () => {
    if (recording || computing) return;
    recorder.current = startRecording(building, { seed, agentCount, fireStarts, blockedExits: [] });
    setSimulatedSec(0);
    setComputing(true);
  };

  const reset = () => {
    recorder.current = null;
    setComputing(false);
    setRecording(null);
    playback.reset();
  };

  const toggleFire = (x: number, y: number) => {
    if (building.cells[y * building.width + x] === WALL) return;
    setFireStarts((fs) =>
      fs.some(([fx, fy]) => fx === x && fy === y) ? fs.filter(([fx, fy]) => fx !== x || fy !== y) : [...fs, [x, y]],
    );
  };

  // Space plays or pauses (or starts the run); the arrow keys step one tick.
  // A focused control keeps its own keys, except that Space still works from the seek bar.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const control = e.target instanceof Element ? e.target.closest("input, button, select, textarea") : null;
    if (control && !(e.code === "Space" && control.matches("input[type=range]"))) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (recording) playback.toggle();
      else run();
    } else if (recording && e.code === "ArrowRight") {
      playback.stepBy(1);
    } else if (recording && e.code === "ArrowLeft") {
      playback.stepBy(-1);
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const counts = useMemo(() => {
    if (!recording) return null;
    const c: Record<Behavior, number> = { calm: 0, panicker: 0, freezer: 0 };
    for (const a of recording.agents) c[a.behavior]++;
    return c;
  }, [recording]);

  // Results belong to the end of the run: they appear once playback has got there.
  const showResults = recording !== null && playback.finished;
  const rings = showResults && layers.bottlenecks ? recording.metrics.bottlenecks : NO_RINGS;
  const atEnd = recording !== null && playback.playhead >= recording.frames - 1;
  const status = computing ? "Simulating" : !recording ? "Setup" : playback.playing ? "Playing" : atEnd ? "Run complete" : "Paused";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="wordmark">Egress</span>
          <span className="tagline">Fire evacuation simulator</span>
        </div>
        <div className="topbar-side">
          {recording && (
            <>
              <span className="run-summary">
                {recording.agents.length} people · {plural(recording.scenario.fireStarts.length, "fire start")} · seed{" "}
                {recording.scenario.seed}
              </span>
              <button className="small" onClick={reset}>
                New scenario
              </button>
            </>
          )}
          <div className="status">
            <i className={playback.playing || computing ? "status-light on" : "status-light"} />
            {status}
          </div>
        </div>
      </header>

      <main className="stage">
        <section className="main-col">
          <Readout
            building={building}
            recording={recording}
            playhead={playback.playhead}
            agentCount={agentCount}
            fireCount={fireStarts.length}
          />
          <Viewport3D
            building={building}
            recording={recording}
            fireStarts={fireStarts}
            playhead={playback.playhead}
            playing={playback.playing}
            layers={layers}
            rings={rings}
          >
            {!recording && !computing && (
              <p className="viewport-note">
                {fireStarts.length === 0 ? "Click the floor map to place a fire start, then run the simulation." : "Ready. Press play to run the simulation."}
              </p>
            )}
            {computing && <p className="viewport-note">Simulating… {simulatedSec.toFixed(0)} s</p>}
          </Viewport3D>
          <Transport
            ready={recording !== null}
            busy={computing}
            playing={playback.playing}
            playhead={playback.playhead}
            lastFrame={recording ? recording.frames - 1 : 0}
            speed={playback.speed}
            onToggle={recording ? playback.toggle : run}
            onSeek={playback.seek}
            onScrubStart={playback.scrubStart}
            onScrubEnd={playback.scrubEnd}
            onSpeed={playback.setSpeed}
          />
        </section>

        <aside className="side-col">
          <section className="card">
            <header className="card-head">
              <h2 className="eyebrow">Floor map</h2>
              <div className="card-tools">
                <label className="layer-toggle">
                  <Switch label="Show the grid" checked={layers.grid} onChange={(on) => setLayers({ ...layers, grid: on })} />
                  Grid
                </label>
                <label className="layer-toggle">
                  <Switch label="Show room and exit names" checked={layers.labels} onChange={(on) => setLayers({ ...layers, labels: on })} />
                  Names
                </label>
              </div>
            </header>
            <MapCanvas
              building={building}
              recording={recording}
              fireStarts={fireStarts}
              playhead={playback.playhead}
              layers={layers}
              rings={rings}
              onCellClick={recording || computing ? undefined : toggleFire}
            />
            <LayerPanel layers={layers} onChange={setLayers} counts={counts} />
          </section>

          {!recording && (
            <ScenarioPanel
              seed={seed}
              agentCount={agentCount}
              fireCount={fireStarts.length}
              busy={computing}
              simulatedSec={simulatedSec}
              onSeed={setSeed}
              onAgentCount={setAgentCount}
              onClearFire={() => setFireStarts([])}
              onRun={run}
            />
          )}
          {recording && !showResults && (
            <section className="card panel">
              <h2 className="eyebrow">Results</h2>
              <p className="hint">Shown when the run reaches the end. Use the skip button to jump there.</p>
            </section>
          )}
          {showResults && (
            <ResultsPanel
              recording={recording}
              showBottlenecks={layers.bottlenecks}
              onShowBottlenecks={(on) => setLayers({ ...layers, bottlenecks: on })}
            />
          )}
        </aside>
      </main>
    </div>
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
