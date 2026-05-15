// Top-level application shell: navbar + routing.
// Mirrors: main-window component in src/cljs/nr/main.cljs
import React, { useEffect } from "react";
import { AppRoutes } from "./routes";
import { Navbar } from "./navbar";
import { AuthForms } from "./auth";
import { GameBoard } from "./gameboard/board";
import { registerGameStateHandlers, useGameBoard } from "./gameboard/state";
import { useAppState } from "./appstate";

export function App(): React.ReactElement {
  const gameState = useGameBoard(s => s.gameState);
  const currentGame = useAppState(s => s.currentGame);

  useEffect(() => {
    registerGameStateHandlers();
  }, []);

  const gameId = gameState?.gameid ?? currentGame?.gameid ?? "";
  const showBoard = !!(gameState && gameId);

  return (
    <>
      <Navbar />
      <AuthForms />
      {showBoard ? (
        <GameBoard gameId={gameId} />
      ) : (
        <AppRoutes />
      )}
    </>
  );
}
