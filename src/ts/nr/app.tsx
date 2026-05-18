// Top-level application shell: navbar + routing.
// Mirrors: main-window component in src/cljs/nr/main.cljs
import React, { useEffect } from "react";
import { AppRoutes } from "./routes";
import { Navbar } from "./navbar";
import { AuthForms, AuthMenu } from "./auth";
import { GameBoard } from "./gameboard/board";
import { registerGameStateHandlers, useGameBoard } from "./gameboard/state";
import { useAppState } from "./appstate";
import { StatusBar } from "./status_bar";

export function App(): React.ReactElement {
  const gameState = useGameBoard(s => s.gameState);
  const currentGame = useAppState(s => s.currentGame);

  useEffect(() => {
    registerGameStateHandlers();
  }, []);

  const gameId = gameState?.gameid ?? currentGame?.gameid ?? "";
  const showBoard = !!(gameState && gameId);

  // Mirrors main-window in main.cljs:
  //   topnav { #left-menu navbar | #right-menu auth-menu | #status status }
  //   #auth-forms auth-forms
  //   pages (router-driven view; GameBoard takes over while a game is active)
  return (
    <>
      <nav className="topnav blue-shade">
        <div id="left-menu"><Navbar /></div>
        <div id="right-menu"><AuthMenu /></div>
        <div id="status"><StatusBar /></div>
      </nav>
      <div id="auth-forms"><AuthForms /></div>
      {showBoard ? (
        <GameBoard gameId={gameId} />
      ) : (
        <AppRoutes />
      )}
    </>
  );
}
