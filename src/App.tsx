import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import LayerPanel from "./components/LayerPanel";
import MapCanvas from "./components/MapCanvas";
import OverseerPanel from "./components/OverseerPanel";
import Readout from "./components/Readout";
import ResultsPanel from "./components/ResultsPanel";
import ScenarioPanel from "./components/ScenarioPanel";
import Transport from "./components/Transport";
import { usePlayback } from "./components/usePlayback";
import Viewport3D from "./components/Viewport3D";
import FloorPicker from "./components/FloorPicker";
import Icon from "./components/Icon";
import PeoplePanel from "./components/PeoplePanel";
import Segmented from "./components/Segmented";
import Steps, { type Step } from "./components/Steps";
import ToolBar from "./components/ToolBar";
import { MAX_FLOORS, copyFloor, paintCell, toggleFireStart, type Floor, type Tool } from "./editor/layout";
import { BEHAVIOR_NAME } from "./render/palette";
import { EVACUATED } from "./sim/recording";
import { DEFAULT_LAYERS, type Layers } from "./render/view";
import { DEFAULT_AGENT_COUNT, DEFAULT_SEED, TICK_S } from "./sim/config";
import { finishRecording, recordStep, startRecording, type Recorder, type Recording } from "./sim/recording";
import { applyEdits, remapScenario } from "./sim/edits";
import { MAPS, parseBuilding } from "./sim/maps";
import { testMap } from "./sim/testMap";
import type { Behavior, Building, OverseerProposal } from "./sim/types";

const NO_RINGS: { x: number; y: number }[] = [];
const SLICE_MS = 12; // time spent computing the run per animation frame, so the page stays responsive
// testMap is the same plan as the first entry in MAPS, so the app has a building before any file loads.
const DEFAULT_FLOOR: Floor = { building: testMap, fireStarts: [] };

type Tab = "results" | "people" | "overseer";

export default function App() {
  const [floors, setFloors] = useState<Floor[]>([DEFAULT_FLOOR]);
  const [level, setLevel] = useState(0); // index of the floor being worked on; 0 is the ground floor
  const [tool, setTool] = useState<Tool>("fire");
  const [tabChoice, setTabChoice] = useState<{ tab: Tab; run: Recording } | null>(null);
  const [selectedIn, setSelectedIn] = useState<Recording | null>(null); // the run the selected person belongs to
  const floorsRef = useRef(floors); // the latest floors even between renders: dragging a tool sends several edits per frame
  // The floor being worked on, as laid out in the editor: the picked floor plan plus any edits.
  const original = floors[level].building;
  const fireStarts = floors[level].fireStarts;
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [agentCount, setAgentCount] = useState(DEFAULT_AGENT_COUNT);
  const [layerState, setLayerState] = useState<Layers>(DEFAULT_LAYERS);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [computing, setComputing] = useState(false);
  const [simulatedSec, setSimulatedSec] = useState(0);
  const [mapId, setMapId] = useState(MAPS[0].id);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [plan, setPlan] = useState<Building>(testMap); // the floor plan as picked or imported, before any edits
  const [mapError, setMapError] = useState<string | null>(null);
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

  // The selected person belongs to one run, so a new run starts with nobody selected.
  const layers = useMemo(
    () => (selectedIn === recording ? layerState : { ...layerState, selected: null }),
    [layerState, selectedIn, recording],
  );
  const setLayers = (next: Layers) => {
    setLayerState(next);
    setSelectedIn(recording);
  };

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

  // The layout and the fire can be changed until a run exists.
  const editable = !recording && !computing && !before;

  // Replaces the floors, and keeps the building the sim runs on in step with the floor shown.
  const changeFloors = (next: Floor[], nextLevel: number) => {
    floorsRef.current = next;
    setFloors(next);
    setLevel(nextLevel);
    setBuilding(next[nextLevel].building);
  };

  // Switches to a picked or imported floor plan. A new plan starts as one floor with no fire.
  const showMap = (loaded: Building, id: string, fileName: string | null) => {
    setMapId(id);
    setImportedName(fileName);
    setPlan(loaded);
    changeFloors([{ building: loaded, fireStarts: [] }], 0);
  };

  // Applies the tool in hand to some cells of the floor shown. A fire is toggled by a click, never by a drag.
  const paint = (cells: [number, number][], dragging: boolean) => {
    if (!editable) return;
    const all = floorsRef.current;
    let floor = all[level];
    for (const [x, y] of cells) {
      if (tool !== "fire") floor = paintCell(floor, x, y, tool);
      else if (!dragging) floor = toggleFireStart(floor, x, y);
    }
    if (floor !== all[level]) changeFloors(all.map((f, i) => (i === level ? floor : f)), level);
  };

  // A click on the floor plan applies the tool in hand to that cell. With the default tool, that toggles a fire.
  const toggleFire = (x: number, y: number) => paint([[x, y]], false);

  // The new floor goes above the one shown and starts as a copy of it.
  const addFloor = () => {
    const all = floorsRef.current;
    if (all.length >= MAX_FLOORS) return;
    changeFloors([...all.slice(0, level + 1), copyFloor(all[level]), ...all.slice(level + 1)], level + 1);
  };

  const removeFloor = () => {
    const all = floorsRef.current;
    if (all.length <= 1) return;
    const next = all.filter((_, i) => i !== level);
    changeFloors(next, Math.min(level, next.length - 1));
  };

  const clearFire = () => changeFloors(floorsRef.current.map((f, i) => (i === level ? { ...f, fireStarts: [] } : f)), level);

  // Back to the picked floor plan as it was loaded: one floor, no edits.
  const resetLayout = () => {
    setTool("fire");
    changeFloors([{ building: plan, fireStarts: [] }], 0);
  };

  // Space plays or pauses (or starts the run); the arrow keys step one tick; Escape leaves the first-person view.
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
    } else if (e.code === "Escape" && layers.selected !== null) {
      setLayers({ ...layers, selected: null });
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
  const frame = recording ? Math.min(Math.floor(playback.playhead), recording.frames - 1) : 0;
  // The selected person is followed in first person until they are out of the building.
  const picked = recording && layers.selected !== null && layers.selected < recording.agents.length ? layers.selected : null;
  const follow = recording && picked !== null && recording.status[frame * recording.agents.length + picked] !== EVACUATED ? picked : null;
  const below = useMemo(() => floors.slice(0, level).map((f) => f.building), [floors, level]);
  const step: Step = before ? "prove" : showResults ? "diagnose" : recording || computing ? "simulate" : "setup";
  // The side panel shows one thing at a time. The overseer's tab opens by itself once its fixes have been applied.
  const chosenTab: Tab = tabChoice && tabChoice.run === recording ? tabChoice.tab : before ? "overseer" : "results";
  const tab: Tab = chosenTab === "overseer" && !showResults ? "results" : chosenTab;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="exit" size={20} />
          </span>
          <span className="wordmark">Egress</span>
          <span className="tagline">Fire evacuation simulator</span>
        </div>
        <Steps current={step} />
        <div className="topbar-side">
          {(recording || before) && (
            <button className="small" onClick={reset}>
              New scenario
            </button>
          )}
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
          <div className="player card">
            <Viewport3D
              building={building}
              below={below}
              recording={recording}
              fireStarts={fireStarts}
              playhead={playback.playhead}
              playing={playback.playing}
              layers={layers}
              rings={rings}
              tool={editable ? tool : null}
              follow={follow}
              onPaint={paint}
            >
              {editable && <ToolBar tool={tool} onTool={setTool} />}
              {editable && <FloorPicker count={floors.length} level={level} onSelect={(i) => changeFloors(floorsRef.current, i)} onAdd={addFloor} onRemove={removeFloor} />}
              {!editable && floors.length > 1 && (
                <p className="viewport-tag">
                  Floor {level + 1} of {floors.length}
                </p>
              )}
              {editable && tool === "fire" && fireStarts.length === 0 && (
                <p className="viewport-note">Click the floor to start a fire, then run the simulation.</p>
              )}
              {computing && <p className="viewport-note">Simulating… {simulatedSec.toFixed(0)} s</p>}
              {follow !== null && recording && (
                <div className="viewport-note follow">
                  Seeing through #{follow + 1}, a {BEHAVIOR_NAME[recording.agents[follow].behavior].toLowerCase()} {recording.agents[follow].type}
                  <button className="glass" onMouseDown={(e) => e.preventDefault()} onClick={() => setLayers({ ...layers, selected: null })}>
                    Exit view
                  </button>
                </div>
              )}
              {picked !== null && follow === null && <p className="viewport-note">#{picked + 1} is out of the building.</p>}
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
          </div>
        </section>

        <aside className="side-col" data-tab={recording ? tab : undefined}>
          <section className="card map-card">
            <header className="card-head">
              <h2 className="eyebrow">Floor plan</h2>
              <button
                className={layers.grid ? "icon-button toggle on" : "icon-button toggle"}
                aria-pressed={layers.grid}
                aria-label={layers.grid ? "Hide the grid" : "Show the grid"}
                title={layers.grid ? "Hide the grid" : "Show the grid"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setLayers({ ...layers, grid: !layers.grid })}
              >
                <Icon name="grid" size={16} />
              </button>
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
              onClearFire={clearFire}
              onResetLayout={resetLayout}
              onRun={run}
            />
          )}
          {!recording && before && (
            <section className="card panel">
              <p className="hint">Re-running the same crowd with the edits applied…</p>
            </section>
          )}
          {recording && (
            <Segmented
              label="Side panel"
              options={[
                { value: "results", label: "Results" },
                { value: "people", label: "People" },
                { value: "overseer", label: "Overseer", disabled: !showResults },
              ]}
              value={tab}
              onChange={(next: Tab) => setTabChoice({ tab: next, run: recording })}
            />
          )}
          {recording && !showResults && tab === "results" && (
            <section className="card panel">
              <p className="hint">Which exits people used and where they got stuck appear when the run ends.</p>
              <button className="small" onClick={() => playback.seek(recording.frames - 1)}>
                Skip to the end
              </button>
            </section>
          )}
          {recording && counts && tab === "people" && (
            <PeoplePanel recording={recording} frame={frame} layers={layers} onLayers={setLayers}>
              <LayerPanel layers={layers} onChange={setLayers} counts={counts} />
            </PeoplePanel>
          )}
          {showResults && tab === "results" && (
            <ResultsPanel
              recording={recording}
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
