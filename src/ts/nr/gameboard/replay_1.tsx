// Replay playback controls, timeline, annotations, and notes.
// Mirrors: src/cljs/nr/gameboard/replay.cljs
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameBoard, type GameStateData } from "./state";
import { useAppState } from "../appstate";
import { save } from "../local_storage";
import { GET, DELETE, PUT, type AjaxResponse } from "../ajax";
import { tr, trSpan, trElement } from "../translations";
import { trNonGameToast, renderMessage } from "../utils";

import { getRemoteAnnotations, loadNotes } from './replay_2';


// ---------------------------------------------------------------------------
// JSON Patch (differ library equivalent)
// Mirrors: differ.core/patch
// Implements RFC 6902 JSON Patch operations
// ---------------------------------------------------------------------------

interface JsonPatchOp {
  op: string;
  path: string;
  value?: unknown;
  from?: string;
}

function parseJsonPointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) return [];
  return path.slice(1).split("/").map((segment) =>
    segment.replace(/~1/g, "/").replace(/~0/g, "~")
  );
}

function getIn(obj: unknown, segments: string[]): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

function setIn(obj: Record<string, unknown>, segments: string[], value: unknown): void {
  if (segments.length === 0) return;
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      if (!current[idx]) current[idx] = {} as Record<string, unknown>;
      current = current[idx] as Record<string, unknown>;
    } else {
      if (!current[seg] || typeof current[seg] !== "object") {
        current[seg] = {} as Record<string, unknown>;
      }
      current = current[seg] as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const idx = parseInt(last, 10);
    current[idx] = value;
  } else {
    current[last] = value;
  }
}

function removeIn(obj: Record<string, unknown>, segments: string[]): void {
  if (segments.length === 0) return;
  let current: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      current = current[idx] as Record<string, unknown>;
    } else {
      current = (current as Record<string, unknown>)[seg] as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) {
    const idx = parseInt(last, 10);
    current.splice(idx, 1);
  } else {
    delete (current as Record<string, unknown>)[last];
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Apply a JSON Patch (RFC 6902) to a state object.
 * Mirrors: (differ/patch state patch)
 */
export function jsonPatch(state: Record<string, unknown>, patch: JsonPatchOp[]): Record<string, unknown> {
  let result = deepClone(state);
  for (const op of patch) {
    const segments = parseJsonPointer(op.path);

    switch (op.op) {
      case "add":
        if (Array.isArray(result) && segments.length === 1) {
          const idx = segments[0] === "-" ? result.length : parseInt(segments[0], 10);
          result.splice(idx, 0, op.value);
        } else {
          setIn(result, segments, op.value);
        }
        break;

      case "remove":
        if (Array.isArray(result) && segments.length === 1) {
          const idx = parseInt(segments[0], 10);
          result.splice(idx, 1);
        } else {
          removeIn(result, segments);
        }
        break;

      case "replace":
        setIn(result, segments, op.value);
        break;

      case "move": {
        const fromSegments = parseJsonPointer(op.from!);
        const value = getIn(result, fromSegments);
        removeIn(result, fromSegments);
        setIn(result, segments, value);
        break;
      }

      case "copy": {
        const fromSegments = parseJsonPointer(op.from!);
        const value = getIn(result, fromSegments);
        setIn(result, segments, deepClone(value));
        break;
      }

      case "test":
        // Test operations are silently ignored in replay
        break;

      default:
        console.warn("Unknown patch operation:", op.op);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Replay types
// ---------------------------------------------------------------------------

export interface ReplayTimelineStep {
  type: string;
  turn?: number;
  state: Record<string, unknown>;
  diffs?: JsonPatchOp[];
}

export interface ReplayAnnotations {
  turns: {
    corp: Record<string, { notes?: string }>;
    runner: Record<string, { notes?: string }>;
  };
  clicks: Record<string, { notes?: string; type?: string }>;
}

export interface RemoteAnnotation {
  username: string;
  date: number;
  deletable?: boolean;
  [key: string]: unknown;
}

export interface ReplayStatus {
  autoplay: boolean;
  speed: number;
  n: number;
  diffs: JsonPatchOp[];
  annotations: ReplayAnnotations;
  remoteAnnotations: RemoteAnnotation[];
  selectedNoteType: string;
  annotationsFile?: File;
}

// ---------------------------------------------------------------------------
// Replay state management (Zustand store)
// Mirrors: replay-timeline, replay-status atoms
// ---------------------------------------------------------------------------

interface ReplayStore {
  timeline: ReplayTimelineStep[];
  status: ReplayStatus;
  showReplayLink: boolean;

  setTimeline: (timeline: ReplayTimelineStep[]) => void;
  updateTimeline: (updater: (prev: ReplayTimelineStep[]) => ReplayTimelineStep[]) => void;
  setStatus: (updater: (prev: ReplayStatus) => ReplayStatus) => void;
  setShowReplayLink: (v: boolean) => void;
  reset: () => void;
}

import { create } from "zustand";

const defaultAnnotations: ReplayAnnotations = {
  turns: { corp: {}, runner: {} },
  clicks: {},
};

const defaultStatus: ReplayStatus = {
  autoplay: false,
  speed: 1600,
  n: 0,
  diffs: [],
  annotations: defaultAnnotations,
  remoteAnnotations: [],
  selectedNoteType: "none",
};

export const useReplay = create<ReplayStore>((set) => ({
  timeline: [],
  status: { ...defaultStatus },
  showReplayLink: false,

  setTimeline: (timeline) => set({ timeline }),
  updateTimeline: (updater) => set((s) => ({ timeline: updater(s.timeline) })),
  setStatus: (updater) => set((s) => ({ status: updater(s.status) })),
  setShowReplayLink: (v) => set({ showReplayLink: v }),
  reset: () => set({ timeline: [], status: { ...defaultStatus }, showReplayLink: false }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prepare state for replay display */
function replayPrepareState(
  state: Record<string, unknown>,
  replaySide: "corp" | "runner" | "spectator"
): Record<string, unknown> {
  const gs = useGameBoard.getState();
  return {
    ...state,
    side: replaySide,
    replay: true,
    options: {
      ...((state as Record<string, unknown>).options as Record<string, unknown> | undefined) ?? {},
      spectatorhands: true,
    },
  };
}

/** Apply a single patch to the game state */
function replayApplyPatch(patch: JsonPatchOp): void {
  const gs = useGameBoard.getState();
  const replaySide = gs.replaySide;
  const currentState = gs.gameState as Record<string, unknown> | null;
  if (!currentState) return;

  const prepared = replayPrepareState(jsonPatch(currentState, [patch]), replaySide);
  gs.setGameState(prepared as GameStateData);
}

/** Check if replay has reached the end */
export function replayReachedEnd(): boolean {
  const { timeline, status } = useReplay.getState();
  return status.diffs.length === 0 && status.n + 1 >= timeline.length;
}

/** Check if replay has reached the start */
function replayReachedStart(): boolean {
  const { timeline, status } = useReplay.getState();
  const n = status.n;
  const stepDiffs = timeline[n]?.diffs ?? [];
  const d = stepDiffs.length - status.diffs.length;
  return n === 0 && d === 0;
}

/** Check if current diff should be ignored (typing / joined) */
export function ignoreDiff(): boolean {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return false;
  const log = gs.gameState.log as Array<{ text: string }> | undefined;
  const text = log?.[log.length - 1]?.text;
  return text === "typing" || (text && text.includes("joined the game"));
}

/** Get the last log entry text */
export function lastLogText(): string | undefined {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return undefined;
  const log = gs.gameState.log as Array<{ text: string }> | undefined;
  return log?.[log.length - 1]?.text;
}

// ---------------------------------------------------------------------------
// Replay navigation
// ---------------------------------------------------------------------------

/** Scroll the timeline to center on the active step */
export function scrollTimeline(): void {
  const timeline = document.getElementById("timeline");
  if (!timeline) return;

  const activeSteps = document.getElementsByClassName("active-step");
  const newStep = activeSteps[0] as HTMLElement | undefined;
  if (!newStep) return;

  const stepRect = newStep.getBoundingClientRect();
  const timelineRect = timeline.getBoundingClientRect();

  const newStepLeft = stepRect.left + stepRect.width / 2;
  const mid = timelineRect.left + timelineRect.width / 2;
  const diff = mid - newStepLeft;

  timeline.scrollLeft -= diff;
}

/**
 * Populate the replay timeline from initial state + diffs.
 * Mirrors: populate-replay-timeline
 */
export function populateReplayTimeline(initState: Record<string, unknown>): void {
  const gs = useGameBoard.getState();
  const replaySide = gs.replaySide;
  const state = replayPrepareState(
    { ...initState, replay_diffs: undefined } as Record<string, unknown>,
    replaySide
  );
  const diffs = (initState.replay_diffs as JsonPatchOp[]) ?? [];

  const replayStore = useReplay.getState();
  replayStore.setTimeline([{ type: "start-of-game", state }]);
  replayStore.setStatus((prev) => ({
    ...prev,
    annotations: { turns: { corp: {}, runner: {} }, clicks: {} },
    remoteAnnotations: [],
  }));

  // Fetch remote annotations for non-local replays
  const gameid = state.gameid as string | undefined;
  if (gameid && gameid !== "local-replay") {
    getRemoteAnnotations(gameid);
  }

  // Process diffs into timeline steps
  let oldState = { ...state } as Record<string, unknown>;
  let interDiffs: JsonPatchOp[] = [];
  const timeline: ReplayTimelineStep[] = [];

  for (const diff of diffs) {
    const newState = jsonPatch(oldState, [diff]) as Record<string, unknown>;
    interDiffs = [...interDiffs, diff];

    const oldSide = (oldState["active-player"] as string) ?? "";
    const newSide = (newState["active-player"] as string) ?? "";
    const oldSideObj = oldSide ? (oldState as Record<string, unknown>)[oldSide] as Record<string, unknown> : {};
    const newSideObj = newSide ? (newState as Record<string, unknown>)[newSide] as Record<string, unknown> : {};
    const oldClick = oldSideObj?.click;
    const newClick = newSideObj?.click;

    const oldLog = oldState.log as Array<{ text: string }> | undefined;
    const newLog = newState.log as Array<{ text: string }> | undefined;
    const diffLogEntries = (newLog?.length ?? 0) - (oldLog?.length ?? 0);
    const newLogs = (newLog?.slice(-diffLogEntries) ?? []).map((e) => e.text).join("\n");

    let newStepType: string | undefined;

    if (oldClick !== newClick) {
      // Check for "Game reset to start of turn" toast
      const corpToast = (newState.corp as Record<string, unknown> | undefined)?.toast as Array<{ msg: string }> | undefined;
      if (corpToast?.some((t) => t.msg === "Game reset to start of turn")) {
        newStepType = "undo-turn";
      } else if (oldSide !== newSide && newSide === "corp") {
        newStepType = "start-of-turn-corp";
      } else if (oldSide !== newSide && newSide === "runner") {
        newStepType = "start-of-turn-runner";
      } else if (newState.run) {
        newStepType = "run";
      } else if (/spends \[Click\] to install/.test(newLogs)) {
        newStepType = "install";
      } else if (/spends \[Click\] and pays \d+ \[Credits\] to install/.test(newLogs)) {
        newStepType = "install";
      } else if (/spends \[Click\] to use Corp Basic Action Card to draw 1 card/.test(newLogs)) {
        newStepType = "draw";
      } else if (/spends \[Click\] to use Runner Basic Action Card to draw 1 card/.test(newLogs)) {
        newStepType = "draw";
      } else if (/spends \[Click\] to use Corp Basic Action Card to gain 1 \[Credits\]/.test(newLogs)) {
        newStepType = "credit";
      } else if (/spends \[Click\] to use Runner Basic Action Card to gain 1 \[Credits\]/.test(newLogs)) {
        newStepType = "credit";
      } else if (/spends \[Click\] and pays 1 \[Credits\] to use Corp Basic Action Card to advance/.test(newLogs)) {
        newStepType = "advance";
      } else if (/spends \[Click\]\[Click\]\[Click\] to use Corp Basic Action Card to purge all virus counters/.test(newLogs)) {
        newStepType = "purge";
      } else if (/uses a command: \/undo-click/.test(newLogs)) {
        newStepType = "undo-click";
      } else {
        newStepType = "click";
      }
    }

    if (newStepType) {
      // Add accumulated diffs to last timeline step
      if (timeline.length > 0) {
        timeline[timeline.length - 1] = { ...timeline[timeline.length - 1], diffs: interDiffs };
      }
      // Create new timeline step
      timeline.push({
        type: newStepType,
        turn: newState.turn as number | undefined,
        state: { ...newState },
      });
      interDiffs = [];
    }

    // If a run starts during diffs, change the last step type to :run
    if (newState.run && timeline.length > 0) {
      timeline[timeline.length - 1] = { ...timeline[timeline.length - 1], type: "run" };
    }

    oldState = newState;
  }

  // Finalize last step
  if (timeline.length > 0) {
    timeline[timeline.length - 1] = { ...timeline[timeline.length - 1], diffs: interDiffs };
  }
  timeline.push({ type: "end-of-game", state: { ...oldState } });

  useReplay.getState().setTimeline(timeline);
}

/**
 * Jump to timeline index n.
 * Mirrors: replay-jump
 */
export function replayJump(n: number): void {
  const replayStore = useReplay.getState();
  const timeline = replayStore.timeline;
  const gs = useGameBoard.getState();

  if (n < 0) {
    // Mirrors: (swap! app-state assoc :start-shown false)
    // No direct equivalent in TS appstate; skip for now
    replayJump(0);
    return;
  }

  if (n < timeline.length) {
    const step = timeline[n];
    const prepared = replayPrepareState(
      { ...step.state },
      gs.replaySide
    );
    gs.setGameState(prepared as GameStateData);
    replayStore.setStatus((prev) => ({
      ...prev,
      n,
      diffs: step.diffs ?? [],
    }));
    loadNotes();
  }
}

/**
 * Forward one diff step.
 * Mirrors: replay-forward
 */
export function replayForward(): void {
  const replayStore = useReplay.getState();
  const { status } = replayStore;
  const { timeline } = replayStore;

  if (status.diffs.length === 0) {
    // Move to next timeline step
    if (status.n + 1 < timeline.length) {
      replayJump(status.n + 1);
      // If the next step also has no diffs, keep advancing
      const newStatus = useReplay.getState().status;
      if (newStatus.diffs.length === 0 && !replayReachedEnd()) {
        replayForward();
      }
    }
  } else {
    // Apply first diff
    replayApplyPatch(status.diffs[0]);
    const remaining = status.diffs.slice(1);
    if (remaining.length === 0) {
      replayJump(status.n + 1);
    } else {
      replayStore.setStatus((prev) => ({ ...prev, diffs: remaining }));
    }
  }
}

/** Jump to next /bug command. Mirrors: replay-jump-to-next-bug */
function replayJumpToNextBug(): void {
  replayForward();
  const logText = lastLogText();
  while (logText && !logText.endsWith("uses a command: /bug") && !replayReachedEnd()) {
    replayForward();
  }
}

/**
 * Jump to a specific point in the replay.
 * Mirrors: replay-jump-to
 */
export function replayJumpTo(params: { n?: number; d?: number; bug?: number }): void {
  const { n, d, bug } = params;
  if (bug != null && bug >= 0) {
    replayJump(0);
    for (let i = 0; i <= bug; i++) {
      replayJumpToNextBug();
    }
  } else {
    replayJump(n ?? 0);
    for (let i = 0; i < (d ?? 0); i++) {
      replayForward();
    }
  }
}

/**
 * Forward until log changes (or end).
 * Mirrors: replay-log-forward
 */
export function replayLogForward(): void {
  const gs = useGameBoard.getState();
  const prevLog = gs.gameState?.log;
  while (
    (gs.gameState?.log === prevLog || lastLogText() === "typing") &&
    !replayReachedEnd()
  ) {
    replayForward();
  }
}

/**
 * Step forward one timeline entry.
 * Mirrors: replay-step-forward
 */
export function replayStepForward(): void {
  const replayStore = useReplay.getState();
  replayJump(replayStore.status.n + 1);
}

/**
 * Step backward one timeline entry.
 * Mirrors: replay-step-backward
 */
export function replayStepBackward(): void {
  const replayStore = useReplay.getState();
  replayJump(replayStore.status.n - 1);
}

/**
 * Backward one diff step.
 * Mirrors: replay-backward
 */
export function replayBackward(): void {
  const replayStore = useReplay.getState();
  const { timeline, status } = replayStore;
  const n = status.n;
  const stepDiffs = timeline[n]?.diffs ?? [];
  const d = stepDiffs.length - status.diffs.length;

  if (d === 0) {
    if (n > 0) {
      replayJumpTo({ n: n - 1, d: 0 });
    }
  } else {
    replayJumpTo({ n, d: d - 1 });
  }
}

/**
 * Backward until log changes (or start).
 * Mirrors: replay-log-backward
 */
export function replayLogBackward(): void {
  const gs = useGameBoard.getState();
  const prevLog = gs.gameState?.log;
  while (
    (gs.gameState?.log === prevLog || lastLogText() === "typing") &&
    !replayReachedStart()
  ) {
    replayBackward();
  }
}

// ---------------------------------------------------------------------------
// Playback controls
// ---------------------------------------------------------------------------

/** Toggle play/pause. Mirrors: toggle-play-pause */
export function togglePlayPause(): void {
  useReplay.getState().setStatus((prev) => ({
    ...prev,
    autoplay: !prev.autoplay,
  }));
}

/** Change replay speed. Mirrors: change-replay-speed */
export function changeReplaySpeed(v: number): void {
  useReplay.getState().setStatus((prev) => ({
    ...prev,
    speed: Math.min(10000, Math.max(100, prev.speed - v)),
  }));
}

// ---------------------------------------------------------------------------
// Keyboard handling
// ---------------------------------------------------------------------------

export function handleKeydown(e: KeyboardEvent): void {
  const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
  if (activeEl?.tagName === "TEXTAREA") return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlayPause();
      break;
    case "+":
      changeReplaySpeed(200);
      break;
    case "-":
      changeReplaySpeed(-200);
      break;
    case "ArrowLeft":
      e.preventDefault();
      if (e.ctrlKey) replayStepBackward();
      else if (e.shiftKey) replayBackward();
      else replayLogBackward();
      break;
    case "ArrowRight":
      e.preventDefault();
      if (e.ctrlKey) replayStepForward();
      else if (e.shiftKey) replayForward();
      else replayLogForward();
      break;
  }
}
