// Replay playback controls, timeline, annotations, and notes.
// Mirrors: src/cljs/nr/gameboard/replay.cljs
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameBoard, type GameStateData } from "./state";
import { useAppState } from "../appstate";
import { save } from "../local_storage";
import { GET, DELETE, PUT, type AjaxResponse } from "../ajax";
import { tr, trSpan, trElement } from "../translations";
import { trNonGameToast, renderMessage } from "../utils";

import { changeReplaySpeed, handleKeydown, ignoreDiff, lastLogText, populateReplayTimeline, replayForward, replayJump, replayJumpTo, replayLogBackward, replayLogForward, replayReachedEnd, replayStepBackward, replayStepForward, scrollTimeline, togglePlayPause, useReplay } from './replay_1';
import type { RemoteAnnotation, ReplayAnnotations } from './replay_1';

// ---------------------------------------------------------------------------
// Annotations / Notes
// ---------------------------------------------------------------------------

/** Fetch remote annotations. Mirrors: get-remote-annotations */
export async function getRemoteAnnotations(gameid: string): Promise<void> {
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
export function loadNotes(): void {
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
    case "credit": return renderMessage("[credit]") as React.ReactNode;
    case "advance": return "A";
    case "purge": return "\uD83D\uDEA8"; // 🚨
    case "click": return renderMessage("[click]") as React.ReactNode;
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
