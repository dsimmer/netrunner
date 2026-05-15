// Top-level application entry point and helpers.
// Mirrors: src/cljs/nr/main.cljs
import { createRoot } from "react-dom/client";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app";
import { useAppState } from "./appstate";
import { lobbyUpdatesPause, lobbyUpdatesContinue, initWS } from "./ws";

// ─── Mirrors: get-server-data in main.cljs ──────────────────────────
// Reads data attributes from the <div id="server-originated-data"> element
// embedded in the HTML template.
export function getServerData(tag: string): string | null {
  const el = document.getElementById("server-originated-data");
  return el ? el.getAttribute(`data-${tag}`) : null;
}

// ─── Mirrors: pages component in main.cljs ──────────────────────────
// Visibility-change listener to pause/resume lobby updates when the tab
// is hidden or shown (equivalent to the CLJS r/with-let +
// component-did-mount / component-will-unmount lifecycle).
export function setupVisibilityListener(): () => void {
  const handler = () => {
    if (document.visibilityState === "visible") {
      lobbyUpdatesContinue();
    } else {
      lobbyUpdatesPause();
    }
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

// ─── Mirrors: mount in main.cljs ────────────────────────────────────
// Renders the React tree into #main-content.
export function mount(): () => void {
  const container = document.getElementById("main-content");
  if (!container) {
    console.error("main: #main-content not found");
    return () => {};
  }
  const root = createRoot(container);
  root.render(
    React.createElement(BrowserRouter, null,
      React.createElement(App)
    )
  );
  return setupVisibilityListener();
}

// ─── Mirrors: init! in main.cljs ────────────────────────────────────
// Initialises routes, starts the websocket router, reads server data,
// and mounts the application.
export function init(): void {
  // Read server-originated data (mirrors component-did-mount in CLJS pages)
  const ver = getServerData("version");
  const rid = getServerData("replay-id");

  // Store app version (mirrors (swap! app-state assoc :app-version ver))
  if (ver) {
    window.__appVersion__ = ver;
  }

  // If there is a replay-id, store it and navigate to /play
  // (mirrors (when rid (navigate "/play")))
  if (rid) {
    window.__replayId__ = rid;
    window.history.pushState({}, "", "/play");
  }

  // Start the websocket router (mirrors start-router!)
  initWS();

  // Mount the React application (mirrors mount)
  mount();
}

// ─── Type declarations for custom window properties ─────────────────
declare global {
  interface Window {
    __appVersion__?: string;
    __replayId__?: string;
  }
}
