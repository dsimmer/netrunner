// Prompt queue and prompt-state management.
// Mirrors: src/clj/game/core/prompt-state.clj

import type { GameState, Prompt } from "./state.js";

/**
 * Sets the current prompt-state for the given side.
 * When called with just (state, side), selects the first prompt from the queue.
 * When called with (state, side, prompt), directly sets the prompt-state.
 * Mirrors set-prompt-state in prompt-state.clj.
 */
export function setPromptState(state: GameState, side: string, prompt?: Prompt): void {
  if (prompt === undefined) {
    const queue = side === "corp" ? state.corpPrompt : state.runnerPrompt;
    prompt = queue[0];
  }
  if (side === "corp") {
    state.corp.promptState = prompt ?? null;
  } else {
    state.runner.promptState = prompt ?? null;
  }
}

/**
 * Removes a prompt from the queue and updates the current prompt-state.
 * Mirrors remove-from-prompt-queue in prompt-state.clj.
 */
export function removeFromPromptQueue(state: GameState, side: string, prompt: Prompt): void {
  if (side === "corp") {
    state.corpPrompt = state.corpPrompt.filter((p) => p !== prompt);
  } else {
    state.runnerPrompt = state.runnerPrompt.filter((p) => p !== prompt);
  }
  setPromptState(state, side);
}

/**
 * Adds a newly created prompt to the front of the current prompt queue
 * and updates the current prompt-state.
 * Mirrors add-to-prompt-queue in prompt-state.clj.
 */
export function addToPromptQueue(state: GameState, side: string, prompt: Prompt): void {
  if (side === "corp") {
    state.corpPrompt = [prompt, ...state.corpPrompt];
  } else {
    state.runnerPrompt = [prompt, ...state.runnerPrompt];
  }
  setPromptState(state, side);
}
