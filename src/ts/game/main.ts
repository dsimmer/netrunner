/**
 * Main entry point handlers for game actions
 * Ported from Clojure main.clj to TypeScript
 */

import * as core from './core';
import * as toasts from './toasts';
import type { State, Side } from '../types';

/**
 * Creates a unique action id for each server response - used in client lock
 */
export function setActionId(state: State, side: Side): void {
  const path = [side, 'aid'];
  const current = (state as any)[side]?.aid ?? 0;
  (state as any)[side].aid = (current ?? 0) + 1;
}

/**
 * Ensures the user is allowed to do command they are trying to do
 */
export function handleAction(state: State, side: Side, command: string, args: any[]): boolean {
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
    core.concede(state, side);
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
export function handleNotification(state: State, _arg1: any, text: string): void;
export function handleNotification(state: State, _arg1: any, _arg2: any, text: string): void;
export function handleNotification(state: State, ...args: any[]): void {
  // Overload resolution: last argument is always text
  const text = args[args.length - 1];
  if (state) {
    core.systemSay(state, null, text);
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
  const stateAny = state as any;
  let side: Side | null = null;
  
  if (stateAny.corp?.user?._id === user._id) {
    side = 'corp';
  } else if (stateAny.runner?.user?._id === user._id) {
    side = 'runner';
  }
  
  if (side) {
    stateAny[side].user = user;
    handleNotification(state, `${user.username} rejoined the game.`);
  }
}
