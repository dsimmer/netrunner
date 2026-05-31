/**
 * Main entry point handlers for game actions
 * Ported from Clojure main.clj to TypeScript
 */

import * as core from './core';
import * as toasts from './core/toasts';
import { concede } from './core/winning';
import type { Side, State } from '../types';
/**
 * Creates a unique action id for each server response - used in client lock
 */
export function setActionId(state: State, side: Side): void {
  const player = side === "corp" || side === ":corp" ? state.corp : state.runner;
  player.aid = (player.aid ?? 0) + 1;
}

/**
 * Ensures the user is allowed to do command they are trying to do
 */
export function handleAction(state: State, side: Side, command: string, args: Record<string, unknown>): boolean {
  if (core.processAction(command, state, side, args)) {
    setActionId(state, side);
    return true;
  }
  return false;
}

/**
 * Concedes victory from the given player.
 */
export function handleConcede(state: State, side: Side): void {
  if (state && side) {
    concede(state, side);
  }
}

/**
 * Adds a message from a user to the chat log.
 */
export function handleSay(state: State, side: Side, user: { username: string; emailhash?: string }, message: string): void {
  if (state && side) {
    core.commandParser(state, side, {
      user: {
        username: user.username,
        emailhash: user.emailhash,
      },
      text: message,
    });
  }
}

/**
 * Handle notification - sends a system message
 */
export function handleNotification(state: State, text: string): void;
export function handleNotification(state: State, _arg1: unknown, text: string): void;
export function handleNotification(state: State, _arg1: unknown, _arg2: unknown, text: string): void;
export function handleNotification(state: State, ...args: unknown[]): void {
  // Overload resolution: last argument is always text
  const text = String(args[args.length - 1] ?? "");
  if (state) {
    core.systemSay(state, '', text);
  }
}

/**
 * Handle announcement - shows toast to all players
 */
export function handleAnnouncement(state: State, text: string): void {
  if (state) {
    for (const side of ['runner', 'corp'] as Side[]) {
      toasts.toast(state, side, text, 'warning', { timeout: 0, closeButton: true });
    }
  }
}

/**
 * Handle rejoin - allows a user to rejoin the game
 */
export function handleRejoin(state: State, user: { _id: string; username: string }): void {
  let side: Side | null = null;
  const corpUserId = (state.corp.user as { _id?: string } | undefined)?._id;
  const runnerUserId = (state.runner.user as { _id?: string } | undefined)?._id;

  if (corpUserId === user._id) {
    side = 'corp';
  } else if (runnerUserId === user._id) {
    side = 'runner';
  }

  if (side) {
    const player = side === "corp" ? state.corp : state.runner;
    player.user = user as unknown as Record<string, unknown>;
    handleNotification(state, `${user.username} rejoined the game.`);
  }
}
