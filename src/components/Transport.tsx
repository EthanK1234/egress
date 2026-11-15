import type { CSSProperties } from "react";
import { TICK_S } from "../sim/config";
import Icon from "./Icon";
import Segmented from "./Segmented";
import { SPEEDS } from "./usePlayback";

interface Props {
  ready: boolean; // there is a recording to play
  busy: boolean; // a run is being computed
  playing: boolean;
  playhead: number;
  lastFrame: number;
  speed: number;
  onToggle: () => void; // play or pause; before a run exists, this starts one
  onSeek: (frame: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onSpeed: (speed: number) => void;
}

const SPEED_OPTIONS = SPEEDS.map((s) => ({ value: s, label: `${s}×` }));

// Playback controls under the 3D view: play/pause, a timeline to drag, and speed.
export default function Transport(p: Props) {
  const atEnd = p.ready && p.playhead >= p.lastFrame;
  const progress = p.ready && p.lastFrame > 0 ? p.playhead / p.lastFrame : 0;
  const playLabel = !p.ready ? "Run simulation" : p.playing ? "Pause" : atEnd ? "Play again" : "Play";

  return (
    <div className="transport">
      {/* A mouse click doesn't move keyboard focus onto these buttons, so Space keeps meaning play/pause. */}
      <button
        className="icon-button large"
        aria-label={playLabel}
        title={playLabel}
        disabled={p.busy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={p.onToggle}
      >
        <Icon name={p.playing ? "pause" : atEnd ? "replay" : "play"} size={22} />
      </button>

      {/* The fill and the knob move with a transform only, so playback never repaints the bar. */}
      <div className="timeline" style={{ "--p": progress } as CSSProperties}>
        <div className="timeline-groove">
          <div className="timeline-fill" />
        </div>
        <input
          className="timeline-input"
          type="range"
          aria-label="Timeline"
          min={0}
          max={Math.max(p.lastFrame, 1)}
          step="any"
          value={p.ready ? p.playhead : 0}
          disabled={!p.ready}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          onPointerDown={p.onScrubStart}
          onPointerUp={p.onScrubEnd}
          onPointerCancel={p.onScrubEnd}
        />
        <div className="timeline-rail">
          <div className="timeline-knob" />
        </div>
      </div>

      <span className="transport-time num" title="Time since the alarm">
        {seconds(p.ready ? p.playhead : 0)}
      </span>

      <Segmented label="Playback speed" options={SPEED_OPTIONS} value={p.speed} onChange={p.onSpeed} />

      <button
        className="icon-button"
        aria-label="Skip to the end"
        title="Skip to the end"
        disabled={!p.ready || atEnd}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => p.onSeek(p.lastFrame)}
      >
        <Icon name="skip" />
      </button>
    </div>
  );
}

function seconds(frame: number): string {
  return `${(frame * TICK_S).toFixed(1)} s`;
}
