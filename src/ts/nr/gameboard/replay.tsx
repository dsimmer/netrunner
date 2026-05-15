// Replay playback controls, timeline, annotations, and notes.
// Mirrors: src/cljs/nr/gameboard/replay.cljs
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameBoard, type GameStateData } from "./state";
import { useAppState } from "../appstate";
import { save } from "../local_storage";
import { GET, DELETE, PUT, type AjaxResponse } from "../ajax";
import { tr, trSpan, trElement } from "../translations";
import { trNonGameToast, renderMessage } from "../utils";

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
function replayReachedEnd(): boolean {
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
function ignoreDiff(): boolean {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return false;
  const log = gs.gameState.log as Array<{ text: string }> | undefined;
  const text = log?.[log.length - 1]?.text;
  return text === "typing" || (text && text.includes("joined the game"));
}

/** Get the last log entry text */
function lastLogText(): string | undefined {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return undefined;
  const log = gs.gameState.log as Array<{ text: string }> | undefined;
  return log?.[log.length - 1]?.text;
}

// ---------------------------------------------------------------------------
// Replay navigation
// ---------------------------------------------------------------------------

/** Scroll the timeline to center on the active step */
function scrollTimeline(): void {
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
function populateReplayTimeline(initState: Record<string, unknown>): void {
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
function replayJump(n: number): void {
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
function replayJumpTo(params: { n?: number; d?: number; bug?: number }): void {
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

function handleKeydown(e: KeyboardEvent): void {
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

// ---------------------------------------------------------------------------
// Annotations / Notes
// ---------------------------------------------------------------------------

/** Fetch remote annotations. Mirrors: get-remote-annotations */
async function getRemoteAnnotations(gameid: string): Promise<void> {
  try {
    const response: AjaxResponse = await GET(`/profile/history/annotations/${gameid}`);
    if (response.status === 200) {
      const annotations = (response.json as Record<string, unknown>[]) ?? [];
      const appState = useAppState.getState();
      const currentUser = appState.user?.username as string | undefined;
      const gs = useGameBoard.getState();
      const corpUser = ((gs.gameState?.corp as Record<string, unknown> | undefined)?.user as Record<string, string> | undefined)?.username;
      const runnerUser = ((gs.gameState?.runner as Record<string, unknown> | undefined)?.user as Record<string, string> | undefined)?.username;

      const enriched = annotations.map((anno: Record<string, unknown>) => ({
        ...anno,
        deletable:
          currentUser === (anno.username as string) ||
          currentUser === corpUser ||
          currentUser === runnerUser,
      }));

      useReplay.getState().setStatus((prev) => ({
        ...prev,
        remoteAnnotations: enriched as RemoteAnnotation[],
      }));
    }
  } catch {
    // GET may fail on timeout; log but don't crash
    console.warn("Failed to fetch remote annotations");
    trNonGameToast(["log_remote-annotations-fail", "Could not get remote annotations."], "error", {
      "time-out": 3,
      "close-button": true,
    });
  }
}

/** Load remote annotation set by index. Mirrors: load-remote-annotations */
export function loadRemoteAnnotations(pos: number): void {
  const replayStore = useReplay.getState();
  const anno = replayStore.status.remoteAnnotations[pos];
  if (anno) {
    replayStore.setStatus((prev) => ({
      ...prev,
      annotations: anno as unknown as ReplayAnnotations,
    }));
  }
}

/** Delete remote annotation by index. Mirrors: delete-remote-annotations */
async function deleteRemoteAnnotations(pos: number): Promise<void> {
  const replayStore = useReplay.getState();
  const anno = replayStore.status.remoteAnnotations[pos];
  if (!anno) return;

  try {
    const gs = useGameBoard.getState();
    const gameid = gs.gameState?.gameid as string | undefined;
    const response: AjaxResponse = await DELETE(
      `/profile/history/annotations/delete/${gameid}?date=${anno.date}`
    );
    if (response.status === 200 && gameid) {
      getRemoteAnnotations(gameid);
    }
  } catch {
    console.warn("Failed to delete remote annotation");
  }
}

/** Publish local annotations. Mirrors: publish-annotations */
async function publishAnnotations(): Promise<void> {
  try {
    const replayStore = useReplay.getState();
    const gs = useGameBoard.getState();
    const gameid = gs.gameState?.gameid as string | undefined;
    const annotations = {
      ...replayStore.status.annotations,
      date: new Date().getTime(),
    };
    const response: AjaxResponse = await PUT(
      `/profile/history/annotations/publish/${gameid}`,
      annotations,
      "json"
    );
    if (response.status === 200 && gameid) {
      getRemoteAnnotations(gameid);
    }
  } catch {
    console.warn("Failed to publish annotations");
  }
}

/** Load annotations from a file. Mirrors: load-annotations-file */
function loadAnnotationsFile(): void {
  const replayStore = useReplay.getState();
  const file = replayStore.status.annotationsFile;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev: ProgressEvent<FileReader>) => {
    try {
      const raw = ev.target?.result as string;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const turnsData = parsed.turns as Record<string, Record<string, Record<string, unknown>>> | undefined;
      const annotations: ReplayAnnotations = {
        turns: {
          corp: turnsData?.corp ?? {},
          runner: turnsData?.runner ?? {},
        },
        clicks: parsed.clicks as Record<string, { notes?: string; type?: string }> ?? {},
      };
      replayStore.setStatus((prev) => ({ ...prev, annotations }));
    } catch (err) {
      console.warn("Failed to parse annotations file:", err);
    }
  };
  reader.readAsText(file);
}

/** Save annotations to a file. Mirrors: save-annotations-file */
function saveAnnotationsFile(): void {
  const replayStore = useReplay.getState();
  const annotations = replayStore.status.annotations;
  const blob = new Blob([JSON.stringify(annotations)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", "Annotations.json");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Load notes into textareas. Mirrors: load-notes */
function loadNotes(): void {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return;

  const replayStore = useReplay.getState();
  const side = gs.gameState["active-player"] as string;
  const turn = String(gs.gameState.turn);
  const click = String(replayStore.status.n);

  const turnNotesElem = document.getElementById("notes-turn") as HTMLTextAreaElement | null;
  const clickNotesElem = document.getElementById("notes-click") as HTMLTextAreaElement | null;

  if (turnNotesElem) {
    const sideData = replayStore.status.annotations.turns[side as "corp" | "runner"];
    turnNotesElem.value = sideData?.[turn]?.notes ?? "";
  }
  if (clickNotesElem) {
    clickNotesElem.value = replayStore.status.annotations.clicks[click]?.notes ?? "";
  }

  const clickType = replayStore.status.annotations.clicks[click]?.type;
  replayStore.setStatus((prev) => ({
    ...prev,
    selectedNoteType: clickType ?? "none",
  }));
}

/** Update annotations from textareas. Mirrors: update-notes */
function updateNotes(): void {
  const gs = useGameBoard.getState();
  if (!gs.gameState) return;

  const replayStore = useReplay.getState();
  const side = gs.gameState["active-player"] as "corp" | "runner";
  const turn = String(gs.gameState.turn);
  const click = String(replayStore.status.n);

  const turnNotesElem = document.getElementById("notes-turn") as HTMLTextAreaElement | null;
  const clickNotesElem = document.getElementById("notes-click") as HTMLTextAreaElement | null;

  const turnNotes = turnNotesElem?.value ?? "";
  const clickNotes = clickNotesElem?.value ?? "";
  const selectedNoteType = replayStore.status.selectedNoteType;

  // Update turn annotations
  const currentTurns = replayStore.status.annotations.turns[side];
  if (!turnNotes.trim()) {
    const newTurns = { ...currentTurns };
    delete newTurns[turn];
    replayStore.setStatus((prev) => ({
      ...prev,
      annotations: {
        ...prev.annotations,
        turns: { ...prev.annotations.turns, [side]: newTurns },
      },
    }));
  } else {
    replayStore.setStatus((prev) => ({
      ...prev,
      annotations: {
        ...prev.annotations,
        turns: {
          ...prev.annotations.turns,
          [side]: { ...currentTurns, [turn]: { notes: turnNotes } },
        },
      },
    }));
  }

  // Update click annotations
  if (!clickNotes.trim() && selectedNoteType === "none") {
    const newClicks = { ...replayStore.status.annotations.clicks };
    delete newClicks[click];
    replayStore.setStatus((prev) => ({
      ...prev,
      annotations: { ...prev.annotations, clicks: newClicks },
    }));
  } else {
    replayStore.setStatus((prev) => ({
      ...prev,
      annotations: {
        ...prev.annotations,
        clicks: {
          ...prev.annotations.clicks,
          [click]: { notes: clickNotes, type: selectedNoteType },
        },
      },
    }));
  }
}

// ---------------------------------------------------------------------------
// Generate replay share link
// Mirrors: generate-replay-link
// ---------------------------------------------------------------------------
function generateReplayLink(origin: string): string {
  const replayStore = useReplay.getState();
  const { timeline, status } = replayStore;
  const n = status.n;
  const stepDiffs = timeline[n]?.diffs ?? [];
  const d = stepDiffs.length - status.diffs.length;
  const gs = useGameBoard.getState();
  const gameid = gs.gameState?.gameid ?? "";
  return `${origin}/replay/${gameid}?n=${n}&d=${d}`;
}

// ---------------------------------------------------------------------------
// Initialize replay
// Mirrors: init-replay
// ---------------------------------------------------------------------------
export function initReplay(initState: Record<string, unknown>): void {
  save("gameid", "local-replay");
  // Update appstate gameid for main.ts
  useAppState.setState((prev) => ({ ...prev }));

  populateReplayTimeline(initState);

  const jumpTo = initState["replay-jump-to"] as { n?: number; d?: number; bug?: number } | undefined;
  if (jumpTo) {
    replayJumpTo(jumpTo);
  } else {
    replayJump(0);
  }
}

// ---------------------------------------------------------------------------
// Set replay side
// Mirrors: set-replay-side
// ---------------------------------------------------------------------------
export function setReplaySide(side: "corp" | "runner" | "spectator"): void {
  const gs = useGameBoard.getState();
  gs.setReplaySide(side);
  // Update game-state side
  if (gs.gameState) {
    gs.setGameState({ ...gs.gameState, side } as GameStateData);
  }
}

// ---------------------------------------------------------------------------
// React Components
// ---------------------------------------------------------------------------

/** Step label icon/rendering based on step type */
function stepLabelContent(stepType: string): React.ReactNode {
  switch (stepType) {
    case "start-of-game": return "\u21E0"; // ↠
    case "start-of-turn-corp": return "C";
    case "start-of-turn-runner": return "R";
    case "end-of-game": return "\uD83C\uDF89"; // 🎉
    case "undo-click": return "\u2BCC"; // ⮌
    case "undo-turn": return "\u2BE0"; // ⮰
    case "run": return "\uD83C\uDFC3"; // 🏃
    case "install": return "\u25BC"; // ▼
    case "draw": return <div className="symbol" />;
    case "credit": return renderMessage("[credit]");
    case "advance": return "A";
    case "purge": return "\uD83D\uDEA8"; // 🚨
    case "click": return renderMessage("[click]");
    default: return "?";
  }
}

/** Replay panel with timeline and controls. Mirrors: replay-panel */
export function ReplayPanel(): React.ReactElement {
  const { timeline, status } = useReplay((s) => ({ timeline: s.timeline, status: s.status }));
  const gameState = useGameBoard((s) => s.gameState);
  const [showLink, setShowLink] = useState(false);

  // Autoplay loop
  useEffect(() => {
    let running = true;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      while (running) {
        // Wait for autoplay
        while (running && !useReplay.getState().status.autoplay) {
          await new Promise((r) => { timer = setTimeout(r, 100); });
        }
        if (!running) break;

        // Skip ignored diffs
        while (running && ignoreDiff() && !replayReachedEnd()) {
          replayForward();
        }
        if (!running) break;

        replayForward();

        // Longer pause on turn end
        const logText = lastLogText();
        const pauseTime = logText?.includes("ending their turn")
          ? 2 * useReplay.getState().status.speed
          : useReplay.getState().status.speed;

        await new Promise((r) => { timer = setTimeout(r, pauseTime); });
      }
    };

    loop();

    return () => {
      running = false;
      clearTimeout(timer);
    };
  }, []);

  // Scroll timeline on update
  useEffect(() => {
    scrollTimeline();
  }, [status.n, status.diffs.length]);

  // Keyboard listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);
  const gameid = gameState?.gameid;
  const replayShared = (gameState as Record<string, unknown> | null)?.replay_shared as boolean | undefined;

  return (
    <div className="replay panel blue-shade">
      <div id="timeline">
        {timeline.map((step, n) => {
          const isActive = n === status.n;
          const annotation = status.annotations.clicks[String(n)];
          const stepLabelClasses: string[] = [
            isActive ? "active-step-label" : "",
            step.type === "start-of-turn-corp" ? "annotated-before" : "",
            step.type,
            annotation ? "annotated-after" : "",
            annotation ? "notes-icon" : "",
            annotation ? (annotation.type ?? "") : "",
          ].filter(Boolean);

          return (
            <div
              key={`step-${n}`}
              className={`step ${(step.state as Record<string, unknown>)["active-player"] ?? ""} ${isActive ? "active-step" : ""} ${step.type}`}
            >
              <div
                className={stepLabelClasses.join(" ")}
                onClick={() => replayJump(n)}
                data-turn={step.turn}
                title={capitalize(step.type.replace(/-/g, " ").slice(1))}
              >
                {stepLabelContent(step.type)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="controls">
        <button
          className="small"
          type="button"
          onClick={() => changeReplaySpeed(-200)}
          title="Decrease Playback speed (-)"
        >
          -
        </button>
        <button
          className="small"
          type="button"
          onClick={() => changeReplaySpeed(200)}
          title="Increase Playback speed (+)"
        >
          +
        </button>
        <button
          className="small"
          type="button"
          onClick={() => replayStepBackward()}
          title="Rewind one click (Ctrl + &larr; )"
        >
          {"\u23EE\uFE7E"} {/* ⏮︎ */}
        </button>
        <button
          className="small"
          type="button"
          onClick={() => replayLogBackward()}
          title="Rewind one log entry (&larr;)"
        >
          {"\u23EA\uFE7E"} {/* ⏪︎ */}
        </button>
        <button
          className="small"
          type="button"
          onClick={() => togglePlayPause()}
          title={status.autoplay ? "Pause (Space)" : "Play (Space)"}
        >
          {status.autoplay ? "\u23F8 " : "\u25B6 "}
        </button>
        <button
          className="small"
          type="button"
          onClick={() => replayLogForward()}
          title="Forward to next log entry (&rarr;)"
        >
          {"\u23E9\uFE7E"} {/* ⏩︎ */}
        </button>
        <button
          className="small"
          type="button"
          onClick={() => replayStepForward()}
          title="Forward one click (Ctrl + &rarr; )"
        >
          {"\u23ED\uFE7E"} {/* ⏭︎ */}
        </button>
      </div>

      {gameid !== "local-replay" && replayShared && (
        <div className="sharing">
          <input
            style={showLink ? { display: "inline" } : { display: "none" }}
            type="text"
            readOnly
            value={generateReplayLink(window.location.origin)}
          />
          <button onClick={() => setShowLink((v) => !v)}>
            {trSpan(["replay_share-timestamp", "Share timestamp"])}
          </button>
        </div>
      )}
    </div>
  );
}

/** Capitalize first character. Mirrors clojure.string/capitalize (partial) */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Notes annotation type buttons helper */
function createNoteButtons(types: string[]): React.ReactElement[] {
  const selectedType = useReplay((s) => s.status.selectedNoteType);

  return types.map((icon) => (
    <div
      key={`notes-icon-${icon}`}
      className={`notes-icon ${icon} ${selectedType === icon ? "selected" : ""}`}
      title={capitalize(icon.replace(/-/g, " ").slice(1))}
      onClick={() => {
        useReplay.getState().setStatus((prev) => ({ ...prev, selectedNoteType: icon }));
        updateNotes();
      }}
    />
  ));
}

/** Notes pane for annotations. Mirrors: notes-pane */
export function NotesPane(): React.ReactElement {
  return (
    <div className="notes">
      <div className="turn">
        <textarea
          id="notes-turn"
          placeholder={tr(["annotations_turn-placeholder", "Notes for this turn"])}
          data-i18n-key="annotations_turn-placeholder"
          onChange={updateNotes}
        />
      </div>
      <div className="notes-icons">
        {createNoteButtons(["none"])}
        <div className="notes-separator" />
        {createNoteButtons(["blunder", "mistake", "inaccuracy", "good", "brilliant"])}
        <div className="notes-separator" />
        {createNoteButtons(["a", "b", "c", "d"])}
      </div>
      <div className="click">
        <textarea
          id="notes-click"
          placeholder={tr(["annotations_click-placeholder", "Notes for this click"])}
          data-i18n-key="annotations_click-placeholder"
          onChange={updateNotes}
        />
      </div>
    </div>
  );
}

/** Shared annotations pane (remote + file operations). Mirrors: notes-shared-pane */
export function NotesSharedPane(): React.ReactElement {
  const gameState = useGameBoard((s) => s.gameState);
  const remoteAnnotations = useReplay((s) => s.status.remoteAnnotations);
  const gameid = gameState?.gameid;

  return (
    <div className="notes-shared">
      {gameid !== "local-replay" && (
        <>
          <div className="remote-annotations">
            <h4>
              {trSpan(["annotations_available-annotations", "Available annotations"])}{" "}
              <button
                className="small"
                type="button"
                onClick={() => gameid && getRemoteAnnotations(gameid)}
              >
                {"\u27F3"}
              </button>
            </h4>
            {remoteAnnotations.length === 0 ? (
              trSpan(["annotations_no-published-annotations", "No published annotations."])
            ) : (
              <ul>
                {remoteAnnotations.map((anno, n) => (
                  <li key={`annotation-${n}`}>
                    <a onClick={() => loadRemoteAnnotations(n)}>{anno.username}</a>
                    {" - "}
                    {new Date(anno.date).toLocaleDateString()}
                    {anno.deletable && (
                      <button
                        className="small"
                        type="button"
                        onClick={() => deleteRemoteAnnotations(n)}
                      >
                        X
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="button-row">
              <button type="button" onClick={publishAnnotations}>
                {trSpan(["annotations_publish", "Publish"])}
              </button>
            </div>
            <hr />
          </div>
        </>
      )}
      {trElement("h4", ["annotations_import-local", "Import local annotation file"])}
      <input
        type="file"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) {
            useReplay.getState().setStatus((prev) => ({ ...prev, annotationsFile: file }));
          }
        }}
      />
      <div className="button-row">
        <button type="button" onClick={loadAnnotationsFile}>
          {trSpan(["annotations_load-local", "Load"])}
        </button>
        <button type="button" onClick={saveAnnotationsFile}>
          {trSpan(["annotations_save-local", "Save"])}
        </button>
        <button
          type="button"
          onClick={() =>
            useReplay.getState().setStatus((prev) => ({
              ...prev,
              annotations: { turns: { corp: {}, runner: {} }, clicks: {} },
            }))
          }
        >
          {trSpan(["annotations_clear", "Clear"])}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible alias for imports
// ---------------------------------------------------------------------------
export const ReplayControls = ReplayPanel;

export default ReplayPanel;
