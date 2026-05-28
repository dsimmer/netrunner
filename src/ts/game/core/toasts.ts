// Toast notification system.
// Mirrors: src/clj/game/core/toasts.clj + src/go/game/core/toasts.go

import type { GameState } from "./state";
import { CORP_SIDE, RUNNER_SIDE } from "./state";
import { makeEID } from "./eid";

export interface ToastEntry {
  id: string;
  msg: string;
  type: string;
  options?: Record<string, unknown>;
}

/**
 * Adds a toast message to the given side's toast list.
 * Mirrors: toast in toasts.clj
 */
export function toast(
  state: GameState,
  side: string,
  message: string,
  msgType = "warning",
  options?: Record<string, unknown>,
): void {
  if (!message) return;
  const eid = makeEID(state);
  const entry: ToastEntry = {
    id: String(eid.id),
    msg: message,
    type: msgType,
    options,
  };
  if (side === CORP_SIDE) {
    state.corp.toast.push(entry);
  } else if (side === RUNNER_SIDE) {
    state.runner.toast.push(entry);
  }
}

/**
 * Removes a toast with the given ID from the side's toast list.
 * Mirrors: ack-toast in toasts.clj
 */
export function ackToast(
  state: GameState,
  side: string,
  toastId: string,
): void {
  if (!toastId) return;
  const filter = (toasts: unknown[]): unknown[] =>
    toasts.filter((t) => (t as ToastEntry).id !== toastId);
  if (side === CORP_SIDE) {
    state.corp.toast = filter(state.corp.toast);
  } else if (side === RUNNER_SIDE) {
    state.runner.toast = filter(state.runner.toast);
  }
}

/**
 * Adds the standard game-error toast to the given side.
 * Mirrors: show-error-toast in toasts.clj
 */
export function showErrorToast(state: GameState, side: string): void {
  toast(
    state,
    side,
    "Your last action caused a game error on the server. You can keep playing, but there " +
      "may be errors in the game's current state. Please click the button below to submit a report " +
      "to our GitHub issues page.<br/><br/>Use /error to see this message again.",
    "exception",
    { "time-out": 0, "close-button": true },
  );
}
