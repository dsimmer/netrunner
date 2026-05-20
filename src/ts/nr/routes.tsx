// Client-side routing configuration.
// Mirrors: src/cljs/nr/routes.cljs (Reitit frontend routes)
import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Lazy-load page components to match shadow-cljs code splitting behaviour
const Landing = lazy(() => import("./landing"));
const Chat = lazy(() => import("./chat"));
const CardBrowser = lazy(() => import("./cardbrowser"));
const DeckBuilder = lazy(() => import("./deckbuilder"));
const Play = lazy(() => import("./play"));
const Help = lazy(() => import("./help"));
const Account = lazy(() => import("./account"));
const Stats = lazy(() => import("./stats"));
const About = lazy(() => import("./about"));
const Tournament = lazy(() => import("./tournament"));
const Admin = lazy(() => import("./admin"));
const Users = lazy(() => import("./users").then((m) => ({ default: m.Users })));
const Prizes = lazy(() => import("./prizes"));
const Replay = lazy(() => import("./replay_game"));

// Mirrors: routes defined in routes.cljs
//
// CLJS uses reitit with `lobby-or-game` for /play, /replay/:rid, and
// /bug-report/:rid.  lobby-or-game checks app-state [:current-game :started]
// and renders gameboard or game-lobby accordingly.
//
// In the TS version the same switching is handled by App.tsx (which renders
// GameBoard when a game is active, otherwise falls through to AppRoutes).
// /replay/:rid and /bug-report/:rid both use ReplayPage, which loads the
// replay data and starts the game; once the game is live App.tsx switches
// to GameBoard.
export function AppRoutes(): React.ReactElement {
  return (
    <Suspense fallback={<div className="loading" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/cards" element={<CardBrowser />} />
        <Route path="/deckbuilder" element={<DeckBuilder />} />
        <Route path="/play" element={<Play />} />
        <Route path="/replay/:rid" element={<Replay />} />
        <Route path="/bug-report/:rid" element={<Replay />} />
        <Route path="/help" element={<Help />} />
        <Route path="/account" element={<Account />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/about" element={<About />} />
        <Route path="/tournament" element={<Tournament />} />
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/users" element={<Users />} />
        <Route path="/landing" element={<Landing />} />
        {/* Fallback to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
