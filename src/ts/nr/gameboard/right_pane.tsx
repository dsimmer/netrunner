// Right pane tabbed content area: game log, annotations, timing diagrams, settings.
// Mirrors: src/cljs/nr/gameboard/right_pane.cljs
import React, { useRef, useEffect, useState, type ReactElement } from "react";
import { useAppState } from "../appstate";
import { save } from "../local_storage";
import { trSpan } from "../translations";
import { useGameBoard } from "./state";
import { RunTimingPane, TurnTimingPane } from "./diagrams";
import { zoomChannelPut } from "./card_preview";
import GameLog from "./log";
import SettingsPane from "./settings";
import { NotesPane, NotesSharedPane } from "./replay";

// jQuery is available globally via window.$ (loaded by the page)
// Minimal type supporting the subset of jQuery used in this module (selector, css chaining, resizable).
interface JQueryObj {
  css(prop: string, val: string | number): JQueryObj;
  resizable(opts: object): JQueryObj;
}
declare const $: (selector: string | HTMLElement | null) => JQueryObj;

// ---------------------------------------------------------------------------
// TabConfig  —  shape matching each entry in availableTabs / loadedTabs
// ---------------------------------------------------------------------------
interface TabConfig {
  Component: React.ComponentType<unknown>;
  label: [string, string];
}

// All tab components imported from their modules:
//   GameLog        ← log.tsx
//   NotesPane      ← replay.tsx (replay_2.tsx)
//   NotesSharedPane← replay.tsx (replay_2.tsx)
//   RunTimingPane  ← diagrams.tsx
//   TurnTimingPane ← diagrams.tsx
//   SettingsPane   ← settings.tsx

// ---------------------------------------------------------------------------
// available-tabs  (mirrors CLJS `available-tabs`)
// ---------------------------------------------------------------------------

const availableTabs: Record<string, TabConfig> = {
  log: {
    Component: GameLog,
    label: ["log_game-log", "Game Log"],
  },
  notes: {
    Component: NotesPane,
    label: ["log_annotating", "Annotating"],
  },
  "notes-shared": {
    Component: NotesSharedPane,
    label: ["log_shared", "Shared Annotations"],
  },
  "run-timing": {
    Component: RunTimingPane,
    label: ["log_run-timing", "Run Timing"],
  },
  "turn-timing": {
    Component: TurnTimingPane,
    label: ["log_turn-timing", "Turn Timing"],
  },
  settings: {
    Component: SettingsPane,
    label: ["log_settings", "Settings"],
  },
};

// ---------------------------------------------------------------------------
// loaded-tabs  (mirrors CLJS `loaded-tabs` atom)
// Module-level mutable map — mutated by loadTab / unloadTab / clearTabs.
// ---------------------------------------------------------------------------

const loadedTabs: Record<string, TabConfig> = {};

function loadTab(tab: string): void {
  const entry = availableTabs[tab] ?? {
    Component: function ErrorTab(): ReactElement {
      return React.createElement("div", { className: "error" }, "This should not happen");
    },
    label: ["log_unknown", "???"] as [string, string],
  };
  loadedTabs[tab] = entry;
}

function unloadTab(tab: string): void {
  delete loadedTabs[tab];
}

function clearTabs(): void {
  // eslint-disable-next-line no-restricted-syntax,guard-for-in
  for (const key in loadedTabs) {
    delete loadedTabs[key];
  }
}

// ---------------------------------------------------------------------------
// Card-zoom resize helpers  (mirrors CLJS `resize-card-zoom`, `pane-resize`,
//   `pane-start-resize`, `pane-stop-resize`)
// ---------------------------------------------------------------------------

// Zoom requests are sent through the shared zoom channel from card_preview.ts.
// Mirrors CLJS `zoom-channel` (a core.async chan).

/* istanbul ignore next -- jQuery DOM helpers; not unit-testable */
function resizeCardZoom(): void {
  const options = useAppState.getState().options;
  const width = options["log-width"] as number;
  const top = options["log-top"] as number;
  const maxCardWidth = width - 5;
  const maxCardHeight = top - 10;
  const cardRatio = 418 / 300;

  const $cardZoom = $(".card-zoom");
  if (maxCardHeight / maxCardWidth > cardRatio) {
    $cardZoom
      .css("width", maxCardWidth)
      .css("height", Math.floor(maxCardWidth * cardRatio));
  } else {
    $cardZoom
      .css("width", Math.floor(maxCardHeight / cardRatio))
      .css("height", maxCardHeight);
  }

  $(".right-pane").css("width", width);
  $(".content-pane")
    .css("left", 0)
    .css("top", top)
    .css("height", "auto")
    .css("width", width);
}

/* istanbul ignore next */
function paneResize(_event: UIEvent, ui: { size?: { width?: number }; position?: { top?: number } }): void {
  const width = ui.size?.width ?? 0;
  const top = ui.position?.top ?? 0;

  useAppState.getState().setOptions({ "log-width": width });
  useAppState.getState().setOptions({ "log-top": top });
  save("log-width", width);
  save("log-top", top);
  resizeCardZoom();
}

/* istanbul ignore next */
function paneStartResize(): void {
  // Display a zoomed card so the user can visualize the resize result.
  // Uses card_preview zoom-channel (core.async chan in CLJS).
  const card = useGameBoard.getState().gameState?.runner?.identity;
  if (card) {
    zoomChannelPut(card);
  }
}

/* istanbul ignore next */
function paneStopResize(): void {
  zoomChannelPut(false);
}

// ---------------------------------------------------------------------------
// TabSelector  (mirrors CLJS `tab-selector`)
// ---------------------------------------------------------------------------

function TabSelector({
  selectedTab,
  onSelect,
}: {
  selectedTab: string | null;
  onSelect: (tab: string) => void;
}): ReactElement {
  return (
    <div className="panel panel-top blue-shade selector">
      {Object.entries(loadedTabs).map(([tab, { label }]) => (
        <a
          key={tab}
          onClick={() => onSelect(tab)}
          className={selectedTab === tab ? "active" : ""}
        >
          {trSpan(label as [string, string])}
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentPane  (mirrors CLJS `content-pane` — called as a function that
//   returns a React component class, accepting tab keys as arguments)
// ---------------------------------------------------------------------------

function makeContentPane(tabs: string[]): () => ReactElement {
  clearTabs();
  for (const tab of tabs) {
    loadTab(tab);
  }

  return (): ReactElement => {
    const [selectedTab, setSelectedTab] = useState<string | null>(tabs[0] ?? null);
    const paneRef = useRef<HTMLDivElement | null>(null);
    const initializedRef = useRef(false);

    useEffect(() => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const $el = $(paneRef.current);
      // jQuery resizable plugin must be loaded (jquery-ui)
      $el.resizable({
        handles: "w, n, nw",
        resize: paneResize as unknown as (event: UIEvent, ui: unknown) => void,
        start: paneStartResize as unknown as (event: UIEvent, _ui: unknown) => void,
        stop: paneStopResize as unknown as (event: UIEvent, _ui: unknown) => void,
      });
      resizeCardZoom();

      // jQuery resizable doesn't have a clean teardown; suppress lint warning.
      // eslint-disable-next-line consistent-return
      return () => {
        // No cleanup available for jQuery resizable.
      };
    }, []);

    const currentConfig = selectedTab != null ? loadedTabs[selectedTab] : undefined;
    const Component = currentConfig?.Component;

    return (
      <div
        className="content-pane"
        ref={paneRef}
      >
        <TabSelector selectedTab={selectedTab} onSelect={setSelectedTab} />
        <div className="panel blue-shade panel-bottom content">
          {Component ? <Component /> : "nothing here"}
        </div>
      </div>
    );
  };
}

export {
  availableTabs,
  loadedTabs,
  loadTab,
  unloadTab,
  clearTabs,
  resizeCardZoom,
  makeContentPane,
};

export default makeContentPane;
