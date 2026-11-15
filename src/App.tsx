import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import LayerPanel from "./components/LayerPanel";
import MapCanvas from "./components/MapCanvas";
import OverseerPanel from "./components/OverseerPanel";
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
import { applyEdits, remapScenario } from "./sim/edits";
import { MAPS, parseBuilding } from "./sim/maps";
import { testMap } from "./sim/testMap";
import type { Behavior, Building, OverseerProposal } from "./sim/types";

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
  // testMap is the same plan as the first entry in MAPS, so the app has a building before any file loads.
  const [mapId, setMapId] = useState(MAPS[0].id);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Building>(testMap); // the picked floor plan, unedited
  const [building, setBuilding] = useState<Building>(testMap); // the original, or the overseer's fixed version
  const mapLoadId = useRef(0);
  const [proposal, setProposal] = useState<OverseerProposal | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [before, setBefore] = useState<Recording | null>(null); // the run the edits were applied to
  const askId = useRef(0);
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
    mapLoadId.current++; // a floor plan still loading must not replace the building mid-run
    recorder.current = startRecording(building, { seed, agentCount, fireStarts, blockedExits: [] });
    setSimulatedSec(0);
    setComputing(true);
  };

  const reset = () => {
    askId.current++;
    setBuilding(original);
    setProposal(null);
    setAsking(false);
    setAskError(null);
    setBefore(null);
    recorder.current = null;
    setComputing(false);
    setRecording(null);
    playback.reset();
  };

  const preview = useMemo(() => (proposal ? applyEdits(original, proposal.edits) : null), [proposal, original]);
  const proposed = useMemo(
    () => (before || !preview ? undefined : preview.applied.flatMap((a) => a.cells)),
    [before, preview],
  );

  const ask = async () => {
    if (!recording) return;
    const id = ++askId.current;
    setAsking(true);
    setAskError(null);
    try {
      // Loaded on first use, so the Gemini SDK stays out of the startup bundle.
      const { getOverseerProposal } = await import("./ai/overseer");
      const result = await getOverseerProposal(recording.building, recording.scenario, recording.metrics, { replay });
      if (id === askId.current) setProposal(result);
    } catch (err) {
      if (id === askId.current) setAskError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === askId.current) setAsking(false);
    }
  };

  // Applies the proposal to the original building and re-runs the same scenario (same seed).
  const applyProposal = () => {
    if (!recording || !preview || preview.applied.length === 0) return;
    setBefore(recording);
    setBuilding(preview.building);
    recorder.current = startRecording(preview.building, remapScenario(recording.scenario, preview.exitIdMap));
    setRecording(null);
    playback.reset();
    setSimulatedSec(0);
    setComputing(true);
  };

  // Switches floor plan. Only offered before a run, so there is no run or proposal to clear.
  const pickMap = async (id: string) => {
    const map = MAPS.find((m) => m.id === id);
    if (!map || recording || computing) return;
    const loadId = ++mapLoadId.current;
    setMapError(null);
    try {
      const res = await fetch(map.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const loaded = parseBuilding(await res.json());
      if (loadId !== mapLoadId.current) return;
      showMap(loaded, id, null);
    } catch (err) {
      if (loadId !== mapLoadId.current) return;
      setMapError(`Could not load "${map.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Loads a floor plan from a JSON file the user picked.
  const importMap = async (file: File) => {
    if (recording || computing) return;
    const loadId = ++mapLoadId.current;
    setMapError(null);
    try {
      const loaded = parseBuilding(JSON.parse(await file.text()));
      if (loadId === mapLoadId.current) showMap(loaded, "", file.name);
    } catch (err) {
      if (loadId !== mapLoadId.current) return;
      const why = err instanceof SyntaxError ? "the file is not valid JSON" : err instanceof Error ? err.message : String(err);
      setMapError(`Could not import ${file.name}: ${why}`);
    }
  };

  const showMap = (loaded: Building, id: string, fileName: string | null) => {
    setMapId(id);
    setImportedName(fileName);
    setOriginal(loaded);
    setBuilding(loaded);
    setFireStarts([]);
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
              proposed={proposed}
              onCellClick={recording || computing ? undefined : toggleFire}
            />
            <LayerPanel layers={layers} onChange={setLayers} counts={counts} />
          </section>

          {!recording && !before && (
            <ScenarioPanel
              maps={MAPS}
              mapId={mapId}
              mapError={mapError}
              importedName={importedName}
              onMap={pickMap}
              onImport={importMap}
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
          {(recording || before) && !showResults && (
            <section className="card panel">
              <h2 className="eyebrow">Results</h2>
              <p className="hint">
                {recording ? "Shown when the run reaches the end. Use the skip button to jump there." : "Re-running with the edits applied…"}
              </p>
            </section>
          )}
          {showResults && (
            <ResultsPanel
              recording={recording}
              showBottlenecks={layers.bottlenecks}
              onShowBottlenecks={(on) => setLayers({ ...layers, bottlenecks: on })}
            />
          )}
          {showResults && (
            <OverseerPanel
              proposal={proposal}
              preview={preview}
              busy={asking}
              error={askError}
              replay={replay}
              before={before}
              after={recording}
              onReplay={setReplay}
              onAsk={ask}
              onApply={applyProposal}
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
