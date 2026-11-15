import type { CSSProperties, ReactNode } from "react";
import { TICK_S } from "../sim/config";
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

// Playback controls for the 3D view: play/pause, a seek bar, and speed.
export default function Transport(p: Props) {
  const speedIndex = SPEEDS.indexOf(p.speed);
  const progress = p.ready && p.lastFrame > 0 ? (p.playhead / p.lastFrame) * 100 : 0;
  const playLabel = !p.ready ? "Run simulation" : p.playing ? "Pause" : p.playhead >= p.lastFrame ? "Play again" : "Play";

  return (
    <div className="transport card">
      <div className="transport-group">
        <IconButton label="Back to start" disabled={!p.ready} onClick={() => p.onSeek(0)}>
          <path d="M3 3h1.8v10H3zM13 3v10L6 8z" />
        </IconButton>
        <IconButton label={playLabel} disabled={p.busy} onClick={p.onToggle} primary>
          {p.playing ? <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" /> : <path d="M4.5 2.5v11L13.5 8z" />}
        </IconButton>
        <IconButton label="Skip to end" disabled={!p.ready} onClick={() => p.onSeek(p.lastFrame)}>
          <path d="M11.2 3H13v10h-1.8zM3 3v10l7-5z" />
        </IconButton>
      </div>

      <span className="transport-time">{seconds(p.playhead)}</span>
      <input
        className="seek"
        type="range"
        aria-label="Timeline"
        min={0}
        max={Math.max(p.lastFrame, 1)}
        step="any"
        value={p.ready ? p.playhead : 0}
        disabled={!p.ready}
        style={{ "--progress": `${progress}%` } as CSSProperties}
        onChange={(e) => p.onSeek(Number(e.target.value))}
        onPointerDown={p.onScrubStart}
        onPointerUp={p.onScrubEnd}
        onPointerCancel={p.onScrubEnd}
      />
      <span className="transport-time total">{p.ready ? seconds(p.lastFrame) : "–"}</span>

      <div className="transport-group" role="group" aria-label="Playback speed">
        <IconButton label="Slower" disabled={speedIndex <= 0} onClick={() => p.onSpeed(SPEEDS[speedIndex - 1])}>
          <path d="M3 7.1h10v1.8H3z" />
        </IconButton>
        <output className="speed" title="Playback speed (1× is real time)">
          {p.speed}×
        </output>
        <IconButton label="Faster" disabled={speedIndex >= SPEEDS.length - 1} onClick={() => p.onSpeed(SPEEDS[speedIndex + 1])}>
          <path d="M3 7.1h4.1V3h1.8v4.1H13v1.8H8.9V13H7.1V8.9H3z" />
        </IconButton>
      </div>
    </div>
  );
}

function seconds(frame: number): string {
  return `${(frame * TICK_S).toFixed(1)} s`;
}

// A mouse click doesn't move keyboard focus onto these buttons (Tab still does),
// so Space keeps meaning play/pause after one of them is clicked.
function IconButton(p: { label: string; disabled?: boolean; primary?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={p.primary ? "icon-button primary" : "icon-button"}
      aria-label={p.label}
      title={p.label}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
        {p.children}
      </svg>
    </button>
  );
}
