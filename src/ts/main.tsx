// Entry point for the TypeScript+React frontend.
// Mirrors: src/cljs/nr/main.cljs
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./nr/app";
import { initWS } from "./nr/ws";
import { loadInitialData } from "./nr/appstate";

export function mount() {
  const root = document.getElementById("root");
  if (!root) throw new Error("No #root element found");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

export function init() {
  // Initialize WebSocket connection (mirrors start-router! in ws.cljs)
  initWS();

  // Load initial app data (language, cards version, etc.)
  loadInitialData();

  mount();
}
