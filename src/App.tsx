import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import LayerPanel from "./components/LayerPanel";
import MapCanvas from "./components/MapCanvas";
import OverseerPanel from "./components/OverseerPanel";
import Readout from "./components/Readout";
import ResultsPanel from "./components/ResultsPanel";
import ScenarioPanel from "./components/ScenarioPanel";
import Transport from "./components/Transport";
import { usePlayback } from "./components/usePlayback";
import Viewport3D from "./components/Viewport3D";
import Icon from "./components/Icon";
import PlanPicker from "./components/PlanPicker";
import EvacuationChart from "./components/EvacuationChart";
import PeoplePanel from "./components/PeoplePanel";
import PhoneEditor from "./components/PhoneEditor";
import PhoneNav, { type PhoneTab } from "./components/PhoneNav";
import Segmented from "./components/Segmented";
import Steps, { type Step } from "./components/Steps";
import ToolBar from "./components/ToolBar";
import { usePhone } from "./components/usePhone";
import { paintCell, toggleFireStart, type Floor, type Tool } from "./editor/layout";
import { BEHAVIOR_NAME } from "./render/palette";
import { EVACUATED } from "./sim/recording";
import { DEFAULT_LAYERS, type Layers } from "./render/view";
import { DEFAULT_AGENT_COUNT, DEFAULT_SEED, TICK_S } from "./sim/config";
import { finishRecording, recordStep, startRecording, type Recorder, type Recording } from "./sim/recording";
import { applyEdits, remapScenario } from "./sim/edits";
import { impactJobs, type Impact } from "./editor/impact";
import { MAPS, parseBuilding } from "./sim/maps";
import { testMap } from "./sim/testMap";
import type { Behavior, Building, OverseerProposal } from "./sim/types";

const NO_RINGS: { x: number; y: number }[] = [];

// Fire starts saved alongside a floor plan by Export. Anything malformed is ignored.
function readFireStarts(raw: unknown): [number, number][] {
  const list = (raw as { fireStarts?: unknown })?.fireStarts;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is [number, number] => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]));
}
const SLICE_MS = 12; // time spent computing the run per animation frame, so the page stays responsive
// testMap is the same plan as the first entry in MAPS, so the app has a building before any file loads.
const DEFAULT_FLOOR: Floor = { building: testMap, fireStarts: [] };

const STEP_NAME: Record<Step, string> = { setup: "Set up", simulate: "Simulate", diagnose: "Diagnose", prove: "Prove" };
const STEP_NUMBER: Record<Step, number> = { setup: 1, simulate: 2, diagnose: 3, prove: 4 };

type Tab = "results" | "people";

export default function App() {
  const [floor, setFloor] = useState<Floor>(DEFAULT_FLOOR); // the layout as edited, and its fire starts
  const [tool, setTool] = useState<Tool>("fire");
  const [tabChoice, setTabChoice] = useState<{ tab: Tab; run: Recording } | null>(null);
  const [selectedIn, setSelectedIn] = useState<Recording | null>(null); // the run the selected person belongs to
  const floorRef = useRef(floor); // the latest layout even between renders: dragging a tool sends several edits per frame
  // The building being worked on, as laid out in the editor: the picked floor plan plus any edits.
  const original = floor.building;
  const fireStarts = floor.fireStarts;
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
  const sideScroll = useRef<HTMLDivElement>(null); // the part of the side column under the floor plan and tabs
  const playback = usePlayback(recording?.frames ?? 0);

  // Phone layout
  const phone = usePhone();
  const [phoneEdit, setPhoneEdit] = useState(false); // the full-screen editor is open
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("sim");
  const resetCamera = useRef<(() => void) | null>(null);
  const phoneScroll = useRef<HTMLDivElement>(null);

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

  // On touch screens, the page itself never zooms: pinches belong to the 3D view (Safari ignores the
  // viewport tag's no-zoom setting, so its gesture events are stopped here).
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);

  const run = () => {
    if (recording || computing) return;
    mapLoadId.current++; // a floor plan still loading must not replace the building mid-run
    recorder.current = startRecording(building, { seed, agentCount, fireStarts, blockedExits: [] });
    setSimulatedSec(0);
    setComputing(true);
    setPhoneEdit(false);
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

  // Each fix measured by re-running the same crowd, alone and all together. The scenario is the run
  // the overseer looked at (the first run, once fixes have been applied). One run per frame,
  // so the page never stalls; the results are kept for that proposal.
  const [impactState, setImpactState] = useState<{ proposal: OverseerProposal; impact: Impact } | null>(null);
  const impact = impactState && impactState.proposal === proposal ? impactState.impact : null;
  const measuredScenario = (before ?? recording)?.scenario ?? null;
  useEffect(() => {
    if (!proposal || !preview || !measuredScenario || preview.applied.length === 0) return;
    const edits = preview.applied.map((a) => a.edit);
    const jobs = impactJobs(original, measuredScenario, edits);
    const result: Impact = { baseline: null, perEdit: new Map(), all: null, done: false };
    let i = 0;
    let timer = 0;
    const next = () => {
      const job = jobs[i++];
      const outcome = job.run();
      if (job.key === "baseline") result.baseline = outcome;
      else if (job.key === "all") result.all = outcome ?? (edits.length === 1 ? result.perEdit.get(edits[0]) ?? null : null);
      else result.perEdit.set(job.key, outcome);
      result.done = i >= jobs.length;
      setImpactState({ proposal, impact: { ...result, perEdit: new Map(result.perEdit) } });
      if (!result.done) timer = window.setTimeout(next, 0);
    };
    timer = window.setTimeout(next, 0);
    return () => window.clearTimeout(timer);
  }, [proposal, preview, original, measuredScenario]);
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

  // Replaces the layout, and keeps the building the sim runs on in step with it.
  const changeFloor = (next: Floor) => {
    floorRef.current = next;
    setFloor(next);
    setBuilding(next.building);
  };

  // Switches to a picked or imported floor plan.
  const showMap = (loaded: Building, id: string, fileName: string | null, fires: [number, number][] = []) => {
    setMapId(id);
    setImportedName(fileName);
    setPlan(loaded);
    changeFloor({ building: loaded, fireStarts: fires });
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

  // Loads a floor plan from a JSON file the user picked. Files saved by older versions held a list
  // of floors; the first one is used.
  const importMap = async (file: File) => {
    if (recording || computing) return;
    const loadId = ++mapLoadId.current;
    setMapError(null);
    try {
      const data = JSON.parse(await file.text());
      const raw: unknown = Array.isArray(data?.floors) && data.floors.length > 0 ? data.floors[0] : data;
      const loaded = parseBuilding(raw);
      if (loadId === mapLoadId.current) showMap(loaded, "", file.name, readFireStarts(raw));
    } catch (err) {
      if (loadId !== mapLoadId.current) return;
      const why = err instanceof SyntaxError ? "the file is not valid JSON" : err instanceof Error ? err.message : String(err);
      setMapError(`Could not import ${file.name}: ${why}`);
    }
  };

  // The layout and the fire can be changed until a run exists.
  const editable = !recording && !computing && !before;

  // Saves the layout and its fire starts as a JSON file that Import can read back, in the same format
  // as the example maps. After the overseer's fixes have been applied, the fixed layout is saved.
  const exportLayout = () => {
    const saved = before ? { building, fireStarts: recording?.scenario.fireStarts ?? fireStarts } : floorRef.current;
    const data = { ...saved.building, fireStarts: saved.fireStarts };
    const name = (importedName?.replace(/\.json$/i, "") || MAPS.find((m) => m.id === mapId)?.name || "floor-plan").replace(/\s+/g, "-").toLowerCase();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}${before ? "-fixed" : ""}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking right away can cancel the download
  };

  // Applies the tool in hand to some cells. A fire is toggled by a click or tap, never by a drag.
  const paint = (cells: [number, number][], dragging: boolean) => {
    if (!editable) return;
    let next = floorRef.current;
    for (const [x, y] of cells) {
      if (tool !== "fire") next = paintCell(next, x, y, tool);
      else if (!dragging) next = toggleFireStart(next, x, y);
    }
    if (next !== floorRef.current) changeFloor(next);
  };

  // A click on the floor plan applies the tool in hand to that cell. With the default tool, that toggles a fire.
  const toggleFire = (x: number, y: number) => paint([[x, y]], false);

  const clearFire = () => changeFloor({ ...floorRef.current, fireStarts: [] });

  // Back to the picked floor plan as it was loaded, with no edits.
  const resetLayout = () => {
    setTool("fire");
    changeFloor({ building: plan, fireStarts: [] });
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
  const step: Step = before ? "prove" : showResults ? "diagnose" : recording || computing ? "simulate" : "setup";
  // The right-hand panel shows one thing at a time: results or people.
  const tab: Tab = tabChoice && tabChoice.run === recording ? tabChoice.tab : "results";
  const editorOpen = phone && phoneEdit && editable; // the phone's full-screen editor

  // ---- The pieces both layouts are built from ----

  const importButton = (label: boolean) => (
    <label
      className={editable ? "file-button" : "file-button disabled"}
      title={editable ? "Load a floor plan from a JSON file" : "Floor plans can only be changed during set up"}
      aria-label="Import a floor plan"
    >
      <Icon name="upload" size={16} />
      {label && "Import"}
      <input
        type="file"
        accept=".json,application/json"
        disabled={!editable}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMap(file);
          e.target.value = ""; // so the same file can be picked again after fixing it
        }}
      />
    </label>
  );

  const followNote = follow !== null && recording && (
    <div className="viewport-note follow">
      Seeing through #{follow + 1}, a {BEHAVIOR_NAME[recording.agents[follow].behavior].toLowerCase()} {recording.agents[follow].type}
      <button className="glass" onMouseDown={(e) => e.preventDefault()} onClick={() => setLayers({ ...layers, selected: null })}>
        Exit view
      </button>
    </div>
  );

  const transport = (
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
  );

  const readout = (
    <Readout building={building} recording={recording} playhead={playback.playhead} agentCount={agentCount} fireCount={fireStarts.length} />
  );

  const overseer = showResults ? (
    <OverseerPanel
      proposal={proposal}
      preview={preview}
      impact={impact}
      busy={asking}
      error={askError}
      replay={replay}
      before={before}
      after={recording}
      onReplay={setReplay}
      onAsk={ask}
      onApply={applyProposal}
    />
  ) : (
    <section className="card panel overseer-intro">
      <h2 className="eyebrow">Overseer</h2>
      <p className="hint">
        {before
          ? "Re-running the same crowd with the fixes in place. The before and after comparison appears here when the run ends."
          : recording
            ? "When the run ends, the overseer reads the results here, explains where people got stuck and proposes up to three layout fixes."
            : "Run a simulation first. When it ends, the overseer reads the results here and proposes layout fixes."}
      </p>
      <ol className="overseer-steps">
        <li className={showResults || before ? "done" : ""}>Explains the bottleneck</li>
        <li className={before ? "done" : ""}>Proposes up to 3 fixes</li>
        <li>Proves them with a re-run on the same crowd</li>
      </ol>
    </section>
  );

  const mapCard = (
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
        onCellClick={recording || computing || phone ? undefined : toggleFire}
      />
    </section>
  );

  const scenario = (
    <ScenarioPanel
      mapError={mapError}
      importedName={importedName}
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
    >
      <PlanPicker maps={MAPS} mapId={mapId} importedName={importedName} onMap={pickMap} disabled={computing} />
    </ScenarioPanel>
  );

  const rerunning = (
    <section className="card panel">
      <p className="hint">Re-running the same crowd with the edits applied…</p>
    </section>
  );

  const people = recording && counts && (
    <PeoplePanel recording={recording} frame={frame} layers={layers} onLayers={setLayers}>
      <LayerPanel layers={layers} onChange={setLayers} counts={counts} />
    </PeoplePanel>
  );

  const viewport = (children: ReactNode, opts: { tool: Tool | null; showHelp?: boolean }) => (
    <Viewport3D
      building={building}
      recording={recording}
      fireStarts={fireStarts}
      playhead={playback.playhead}
      playing={playback.playing}
      layers={layers}
      rings={rings}
      tool={opts.tool}
      follow={follow}
      resetRef={resetCamera}
      showHelp={opts.showHelp}
      onPaint={paint}
    >
      {children}
    </Viewport3D>
  );

  // ---- Phone ----

  if (phone) {
    const goTab = (next: PhoneTab) => {
      setPhoneTab(next);
      phoneScroll.current?.scrollTo({ top: 0 });
    };
    // On the phone, picking someone to follow takes you to the 3D view to see through their eyes.
    const phonePeople = recording && counts && (
      <PeoplePanel
        recording={recording}
        frame={frame}
        layers={layers}
        onLayers={(next) => {
          setLayers(next);
          if (next.selected !== null && next.selected !== layers.selected) phoneScroll.current?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <LayerPanel layers={layers} onChange={setLayers} counts={counts} />
      </PeoplePanel>
    );
    const hint = (text: string, action?: { label: string; onClick: () => void }) => (
      <section className="card panel">
        <p className="hint">{text}</p>
        {action && (
          <button className="small" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </section>
    );
    return (
      <div className={editorOpen ? "phone editing" : "phone"}>


        {/* Everything scrolls together, header included. The 3D view is a box in it, on the Simulate tab;
            other tabs hide it (it stays loaded, so the camera and run carry on). In the editor it fills the screen. */}
        <main className="p-content" ref={phoneScroll}>
          {!editorOpen && (
            <header className="p-header">
              <span className="p-logo">
                <Icon name="exit" size={22} />
              </span>
              <div className="p-title">
                <b>Egress</b>
                <small>
                  Step {STEP_NUMBER[step]} of 4 · {STEP_NAME[step]}
                </small>
              </div>
              <div className="p-actions">
                {importButton(false)}
                <button className="p-round" aria-label="Export the floor plan" onClick={exportLayout}>
                  <Icon name="download" size={18} />
                </button>
              </div>
            </header>
          )}
          <section className={editorOpen || phoneTab === "sim" ? "p-stage" : "p-stage off"}>
            {viewport(
              editorOpen ? (
                <PhoneEditor
                  tool={tool}
                  onTool={setTool}
                  maps={MAPS}
                  mapId={mapId}
                  importedName={importedName}
                  onMap={pickMap}
                  fireCount={fireStarts.length}
                  onClearFire={clearFire}
                  onResetCamera={() => resetCamera.current?.()}
                  onDone={() => setPhoneEdit(false)}
                />
              ) : (
                <>
                  {computing && <p className="viewport-note">Simulating… {simulatedSec.toFixed(0)} s</p>}
                  {followNote}
                  {picked !== null && follow === null && <p className="viewport-note">#{picked + 1} is out of the building.</p>}
                </>
              ),
              { tool: editorOpen ? tool : null, showHelp: editorOpen },
            )}
          </section>
          {!editorOpen && (
            <>
              {phoneTab === "sim" && (
                <>
                  <div className="p-transport">{transport}</div>
                  {readout}
                  {(recording || before) && (
                    <button className="p-edit-cta" onClick={reset}>
                      <span className="p-edit-icon">
                        <Icon name="replay" size={18} />
                      </span>
                      <span>
                        <b>New scenario</b>
                        <small>Back to set up, keeping this floor plan</small>
                      </span>
                    </button>
                  )}
                  {editable && (
                    <button className="p-edit-cta" onClick={() => setPhoneEdit(true)}>
                      <span className="p-edit-icon">
                        <Icon name="pencil" size={18} />
                      </span>
                      <span>
                        <b>Open the editor</b>
                        <small>Place fire, walls, doors and exits</small>
                      </span>
                    </button>
                  )}
                  {!recording && !before && scenario}
                  {!recording && before && rerunning}
                  {phonePeople}
                </>
              )}
              {phoneTab === "results" && (
                <>
                  {mapCard}
                  {recording && <div className="p-transport">{transport}</div>}
                  {recording && <EvacuationChart recording={recording} playhead={playback.playhead} />}
                  {showResults
                    ? <ResultsPanel recording={recording} />
                    : recording
                      ? hint("Which exits people used and where they got stuck appear when the run ends.", { label: "Skip to the end", onClick: () => playback.seek(recording.frames - 1) })
                      : hint("Run a simulation to see where people went and where they got stuck.")}
                </>
              )}
              {phoneTab === "overseer" && overseer}
            </>
          )}
        </main>
        {!editorOpen && <PhoneNav tab={phoneTab} onTab={goTab} />}

        <div className="rotate-hint" aria-hidden="true">
          <Icon name="rotate" size={36} />
          Turn your phone upright
        </div>
      </div>
    );
  }

  // ---- Desktop and tablet ----

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
          {importButton(true)}
          <button className="small" title="Save the floor plan as a JSON file" onClick={exportLayout}>
            <Icon name="download" size={16} />
            Export
          </button>
          {(recording || before) && (
            <button className="small" onClick={reset}>
              New scenario
            </button>
          )}
        </div>
      </header>

      <main className="stage">
        {/* Left: the overseer, which reads the finished run and proposes fixes. */}
        <aside className="over-col">{overseer}</aside>

        <section className="main-col">
          <div className="player card">
            {viewport(
              <>
                {editable && <ToolBar tool={tool} onTool={setTool} />}
                {editable && tool === "fire" && fireStarts.length === 0 && (
                  <p className="viewport-note">Click the floor to start a fire, then run the simulation.</p>
                )}
                {computing && <p className="viewport-note">Simulating… {simulatedSec.toFixed(0)} s</p>}
                {followNote}
                {picked !== null && follow === null && <p className="viewport-note">#{picked + 1} is out of the building.</p>}
              </>,
              { tool: editable ? tool : null },
            )}
            {transport}
          </div>
          {readout}
        </section>

        <aside className="side-col" data-tab={recording ? tab : undefined}>
          {mapCard}

          {recording && (
            <Segmented
              label="Side panel"
              options={[
                { value: "results", label: "Results" },
                { value: "people", label: "People" },
              ]}
              value={tab}
              onChange={(next: Tab) => {
                setTabChoice({ tab: next, run: recording });
                sideScroll.current?.scrollTo({ top: 0 }); // each tab starts at its top
              }}
            />
          )}

          {/* Only this part scrolls: the floor plan and the tabs above it stay in place. */}
          <div className="side-scroll" ref={sideScroll}>
            {!recording && !before && scenario}
            {!recording && before && rerunning}
            {recording && tab === "results" && <EvacuationChart recording={recording} playhead={playback.playhead} />}
            {tab === "people" && people}
            {showResults && tab === "results" && <ResultsPanel recording={recording} />}
          </div>
        </aside>
      </main>
    </div>
  );
}
