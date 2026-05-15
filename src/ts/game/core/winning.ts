// Win condition clearing.
// Mirrors: src/clj/game/core/winning.clj

import type { GameState } from "./state.js";
import { CORP_SIDE, RUNNER_SIDE } from "./state.js";
import { systemMsg, systemSay } from "./say.js";
import { otherSide } from "../../jinteki/utils.js";
import { anyEffects, sumEffects } from "./effects.js";

/**
 * Records a win reason for statistics.
 * Mirrors: (win state side reason)
 */
export function win(state: GameState, side: string, reason: string): boolean {
  if (state.winner) return false;

  const started = state.stats?.time?.started;
  const now = new Date();
  const duration = started
    ? Math.floor((now.getTime() - started.getTime()) / 60000)
    : 0;

  systemMsg(state, side, "wins the game");

  if (started) {
    state.stats.time.ended = now;
    state.stats.time.elapsed = duration;
  }

  const other = otherSide(side);
  const sideData = state[side as "corp" | "runner"];
  const otherData = other ? state[other as "corp" | "runner"] : undefined;

  state.winner = side;
  state.loser = other ?? undefined;
  state.winnerUser = (sideData?.user?.username as string) ?? undefined;
  state.loserUser = (otherData?.user?.username as string) ?? undefined;
  state.reason = reason;
  state.winReason = reason;
  state.endTime = now;
  state.winnerDeckId = sideData?.deckId;
  state.loserDeckId = otherData?.deckId;

  return true;
}

/**
 * Records a tie reason for statistics.
 * Mirrors: (tie state reason)
 */
export function tie(state: GameState, reason: string): boolean {
  if (state.winner) return false;

  const started = state.stats?.time?.started;
  const now = new Date();
  const duration = started
    ? Math.floor((now.getTime() - started.getTime()) / 60000)
    : 0;

  systemSay(state, "", "The game is a tie!");

  if (started) {
    state.stats.time.ended = now;
    state.stats.time.elapsed = duration;
  }

  state.reason = reason;
  state.endTime = now;

  return true;
}

/**
 * Records a win via decking the corp.
 * Mirrors: (win-decked state)
 */
export function winDecked(state: GameState): void {
  systemMsg(state, CORP_SIDE, "is decked");
  win(state, RUNNER_SIDE, "Decked");
}

/**
 * Records a win via dealing damage to the runner.
 * Mirrors: (flatline state)
 */
export function flatline(state: GameState): void {
  if (state.winner) return;
  state.winnerDeclared = true;
  systemMsg(state, RUNNER_SIDE, "is flatlined");
  win(state, CORP_SIDE, "Flatline");
}

/**
 * Trigger game concede by specified side.
 * Mirrors: (concede state side)
 */
export function concede(state: GameState, side: string): void {
  systemMsg(state, side, "concedes");
  const winner = side === CORP_SIDE ? RUNNER_SIDE : CORP_SIDE;
  win(state, winner, "Concede");
}

/**
 * Clears the current win condition. Requires both sides to have issued the command.
 * Mirrors: (clear-win state side)
 */
export function clearWin(state: GameState, side: string): void {
  const sideKey = `${side}:clearWin` as keyof GameState;
  (state as any)[sideKey] = true;

  const runnerClear = (state as any)[`${RUNNER_SIDE}:clearWin`];
  const corpClear = (state as any)[`${CORP_SIDE}:clearWin`];

  if (runnerClear && corpClear) {
    systemMsg(state, side, "cleared the win condition");
    delete (state as any)[`${RUNNER_SIDE}:clearWin`];
    delete (state as any)[`${CORP_SIDE}:clearWin`];
    delete state.winner;
    delete state.loser;
    delete state.winnerUser;
    delete state.loserUser;
    delete state.reason;
    delete state.winnerDeckId;
    delete state.loserDeckId;
    delete state.endTime;
    delete state.winnerDeclared;
  }
}

/**
 * Returns the number of agenda points required to win for the given side.
 * Mirrors: (agenda-points-required-to-win state side)
 */
export function agendaPointsRequiredToWin(state: GameState, side: string): number {
  const sideData = state[side as "corp" | "runner"];
  return (sideData?.agendaPointReq ?? 0) + sumEffects(state, side, "agenda-point-req", null, []);
}

/**
 * Checks whether the given side has won by agenda points.
 * Mirrors: (side-win state side)
 */
export function sideWin(state: GameState, side: string): boolean {
  const sideData = state[side as "corp" | "runner"];
  return agendaPointsRequiredToWin(state, side) <= (sideData?.agendaPoint ?? 0);
}

/**
 * Checks for a win by agenda points and records the result.
 * Mirrors: (check-win-by-agenda state)
 */
export function checkWinByAgenda(state: GameState): void {
  const corpWin = sideWin(state, CORP_SIDE);
  const blockedCorp = anyEffects(state, CORP_SIDE, "cannot-win-on-points", () => true, null, []);
  const runnerWin = sideWin(state, RUNNER_SIDE);
  const blockedRunner = anyEffects(state, RUNNER_SIDE, "cannot-win-on-points", () => true, null, []);

  if (corpWin && !blockedCorp && runnerWin && !blockedRunner) {
    tie(state, "Tie");
  } else if (corpWin && !blockedCorp) {
    win(state, CORP_SIDE, "Agenda");
  } else if (runnerWin && !blockedRunner) {
    win(state, RUNNER_SIDE, "Agenda");
  }
}
