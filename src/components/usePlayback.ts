import { useEffect, useRef, useState } from "react";
import { TICK_S } from "../sim/config";

export const SPEEDS = [1, 2, 4, 8];
const DEFAULT_SPEED = 4;

export interface Playback {
  playhead: number; // fractional frame of the recording
  playing: boolean;
  speed: number; // 1 = real time
  finished: boolean; // the playhead has reached the last frame at least once
  start(): void; // play from the first frame
  toggle(): void; // play or pause; at the end, play again from the start
  seek(frame: number): void;
  stepBy(frames: number): void; // pause and move by whole frames
  setSpeed(speed: number): void;
  scrubStart(): void; // hold playback while the seek bar is dragged
  scrubEnd(): void;
  reset(): void;
}

// Moves a playhead across a recording of `frames` frames in real time.
export function usePlayback(frames: number): Playback {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [finished, setFinished] = useState(false);
  const head = useRef(0); // same as `playhead`, readable from the animation loop
  const resumeAfterScrub = useRef(false);
  const last = Math.max(frames - 1, 0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.1); // a hidden tab must not cause a jump
      prev = now;
      const next = Math.min(head.current + (dt * speed) / TICK_S, last);
      head.current = next;
      setPlayhead(next);
      if (next >= last) {
        setPlaying(false);
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last]);

  const seek = (frame: number) => {
    const next = Math.min(Math.max(frame, 0), last);
    head.current = next;
    setPlayhead(next);
    if (next >= last) {
      setPlaying(false);
      setFinished(true);
    }
  };

  return {
    playhead,
    playing,
    speed,
    finished,
    start: () => {
      head.current = 0;
      setPlayhead(0);
      setFinished(false);
      setPlaying(true);
    },
    toggle: () => {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (head.current >= last) {
        head.current = 0;
        setPlayhead(0);
      }
      setPlaying(true);
    },
    seek,
    stepBy: (delta) => {
      setPlaying(false);
      seek(Math.round(head.current) + delta);
    },
    setSpeed,
    scrubStart: () => {
      resumeAfterScrub.current = playing;
      setPlaying(false);
    },
    scrubEnd: () => {
      if (resumeAfterScrub.current && head.current < last) setPlaying(true);
      resumeAfterScrub.current = false;
    },
    reset: () => {
      head.current = 0;
      setPlayhead(0);
      setPlaying(false);
      setFinished(false);
    },
  };
}
