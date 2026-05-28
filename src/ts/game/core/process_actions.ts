// Action dispatch: command parsing, command table, process-action.
// Mirrors: src/clj/game/core/process_actions.clj

import type { GameState, Prompt } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer, getSidePrompt } from "./state";
import type { Card } from "./card";
import { getCard } from "./finding";
import { change } from "./change_vals";
import { fakeCheckpoint } from "./checkpoint";
import { parseCommand } from "./commands";
import { makeEID } from "./eid";
import { trash } from "./moving";
import { derez, rez } from "./rezzing";
import {
  checkForEmptyServer,
  runContinue,
  handleEndRun,
  jackOut,
  startNextPhase,
  toggleAutoNoAction,
} from "./runs";
import { indicateAction, say, systemMsg, systemSay } from "./say";
import { keepHand, mulligan } from "./set_up";
import { shuffleDeck } from "./shuffling";
import { ackToast } from "./toasts";
import {
  endPhase12,
  phase12PassPriority,
  endTurn,
  endTurnContinue,
  postDiscardPassPriority,
  startTurn,
} from "./turns";
import { concede } from "./winning";

// Re-export all action functions used by the command table
import {
  clickAdvance,
  clickCredit,
  clickDraw,
  clickRun,
  closeDeck,
  doPurge,
  flashback,
  generateInstallList,
  generateRunnableZones,
  moveCard,
  expendAbility,
  play,
  playAbility,
  playCorpAbility,
  playDynamicAbility,
  playRunnerAbility,
  playSubroutine,
  playUnbrokenSubroutines,
  removeTag,
  resolveBadPubChoice,
  resolvePrompt,
  score,
  select,
  trashButton,
  trashResource,
  viewDeck,
} from "./actions";

// ---------------------------------------------------------------------------
// checkpoint+clean-up
// Run a fake checkpoint, then end the run if running an empty remote
// or if the end-run flag is set.
// Mirrors: checkpoint+clean-up in process_actions.clj
// ---------------------------------------------------------------------------

export function checkpointPlusCleanup(state: GameState): void {
  fakeCheckpoint(state);

  // End the run if running an empty remote
  if (checkForEmptyServer(state) || state.endRun?.ended) {
    handleEndRun(state, "corp", null);
    fakeCheckpoint(state);
  }
}

export const checkpointcleanUp = checkpointPlusCleanup;

// ---------------------------------------------------------------------------
// set-property
// Set properties of the game state that need to be adjustable by the frontend.
// Mirrors: set-property in process_actions.clj
// ---------------------------------------------------------------------------

export function setProperty(
  state: GameState,
  side: string,
  opts: { key: string; value: unknown },
): void {
  const acceptableKeys = new Set([
    "trash-like-cards",
    "auto-purge",
    "force-phase-12-self",
    "force-phase-12-opponent",
    "force-post-discard-self",
    "force-post-discard-opponent",
  ]);

  if (!acceptableKeys.has(opts.key)) {
    // In Clojure this would fall through and throw; in TS we throw explicitly.
    throw new Error(`Unacceptable set-property key: ${opts.key}`);
  }

  const player = getPlayer(state, side);
  if (!(player as any).properties) {
    (player as any).properties = {};
  }
  (player as any).properties[opts.key] = opts.value;
}

// ---------------------------------------------------------------------------
// should-process-command?
// Determines if a command should be processed based on current prompt state.
// Mirrors: should-process-command? in process_actions.clj
// ---------------------------------------------------------------------------

function shouldProcessCommand(
  state: GameState,
  side: string,
  command: string,
): boolean {
  const promptType = (getSidePrompt(state, side) as any)?.promptType;

  // These commands can always be processed (admin/fix commands)
  const alwaysAllowed = new Set([
    "/close-prompt",
    "/undo-click",
    "/undo-turn",
    "/undo-paid-ability",
    "/swap-sides",
    "/save-replay",
  ]);

  if (alwaysAllowed.has(command.trim())) {
    return true;
  }

  // Otherwise, only process if there is no prompt, or just a run prompt
  return !promptType || promptType === "run";
}

// ---------------------------------------------------------------------------
// command-parser
// Parse and dispatch a command or chat message.
// Mirrors: command-parser in process_actions.clj
// ---------------------------------------------------------------------------

export function commandParser(
  state: GameState,
  side: string,
  args: { user?: Record<string, unknown> | null; text: string },
): void {
  const user = args.user ?? (getPlayer(state, side) as any).user;
  let text = args.text;
  if (text.trim() === "null") {
    text = " null";
  }

  const command = parseCommand(state, side, text);
  if (command) {
    if (
      side &&
      side !== "spectator" &&
      shouldProcessCommand(state, side, text)
    ) {
      command(state, side);
      const username = (user as Record<string, unknown>)?.username ?? "unknown";
      systemSay(state, side, `[!]${username} uses a command: ${text}`);
    }
  } else {
    say(state, side, args);
  }
}

// ---------------------------------------------------------------------------
// Command type
// ---------------------------------------------------------------------------

type CommandFn = (
  state: GameState,
  side: string,
  args: Record<string, unknown>,
) => void;

// ---------------------------------------------------------------------------
// commands
// Maps command names to handler functions.
// Mirrors: commands map in process_actions.clj
// ---------------------------------------------------------------------------

const commands: Record<string, CommandFn> = {
  ability: (state, side, args) => playAbility(state, side, args as any),
  advance: (state, side, args) => clickAdvance(state, side, args as any),
  "bad-pub-choice": (state, side, args) =>
    resolveBadPubChoice(state, side, args as any),
  change: (state, side, args) =>
    change(state, side, args as { key: string; delta: number }),
  choice: (state, side, args) => resolvePrompt(state, side, args as any),
  "close-deck": (state, side, args) => closeDeck(state, side, args as any),
  concede: (state, side, args) => concede(state, side),
  continue: (state, side, args) => runContinue(state, side, null),
  "corp-ability": (state, side, args) => playCorpAbility(state, side, args as any),
  credit: (state, side, args) => clickCredit(state, side, args as any),
  derez: (state, side, args) => {
    derez(state, side, makeEID(state), (args as any).card as Card, {
      noEvent: true,
    });
  },
  draw: (state, side, args) => clickDraw(state, side, args as any),
  "dynamic-ability": (state, side, args) =>
    playDynamicAbility(state, side, args as any),
  "end-phase-12": (state, side, args) =>
    endPhase12(state, side, undefined, undefined),
  "phase-12-pass-priority": (state, side, args) =>
    phase12PassPriority(state, side, undefined, undefined),
  "start-next-phase": (state, side, args) => startNextPhase(state, side, null),
  "end-turn": (state, side, args) => endTurn(state, side, undefined, undefined),
  "post-discard-pass-priority": (state, side, args) =>
    postDiscardPassPriority(state, side, undefined, undefined),
  "end-post-discard": (state, side, args) =>
    endTurnContinue(state, side, undefined, undefined),
  flashback: (state, side, args) => flashback(state, side, args as any),
  "generate-install-list": (state, side, args) =>
    generateInstallList(state, side, args as any),
  "generate-runnable-zones": (state, side, args) =>
    generateRunnableZones(state, side, args as any),
  "indicate-action": (state, side, args) =>
    indicateAction(state, side, (args as any).card as Card),
  "jack-out": (state, side, args) => jackOut(state, side, makeEID(state)),
  keep: (state, side, args) => keepHand(state, side, null),
  move: (state, side, args) => moveCard(state, side, args as any),
  mulligan: (state, side, args) => mulligan(state, side, null),
  play: (state, side, args) => play(state, side, args as any),
  expend: (state, side, args) => expendAbility(state, side, args as any),
  purge: (state, side, args) => doPurge(state, side, args as any),
  "remove-tag": (state, side, args) => removeTag(state, side, args as any),
  rez: (state, side, args) => {
    const card = (args as any).card as Card;
    const rezArgs = { ...args };
    delete (rezArgs as any).card;
    rez(state, side, makeEID(state), card, rezArgs as any);
  },
  run: (state, side, args) => clickRun(state, side, args as any),
  "runner-ability": (state, side, args) => playRunnerAbility(state, side, args as any),
  score: (state, side, args) => {
    const card = getCard(state, (args as any).card as Card | null);
    if (card) {
      score(state, side, makeEID(state), card, null);
    }
  },
  select: (state, side, args) => select(state, side, args as any),
  "set-property": (state, side, args) =>
    setProperty(state, side, args as { key: string; value: unknown }),
  shuffle: (state, side, args) =>
    shuffleDeck(
      state,
      side,
      (args as any)?.close ? { close: true } : undefined,
    ),
  "start-turn": (state, side, args) => startTurn(state, side, args as any),
  subroutine: (state, side, args) => playSubroutine(state, side, args as any),
  "system-msg": (state, side, args) =>
    systemMsg(state, side, (args as any).msg as string),
  toast: (state, side, args) =>
    ackToast(state, side, (args as any).id as string),
  "toggle-auto-no-action": (state, side, args) =>
    toggleAutoNoAction(state, side, null),
  trash: (state, side, args) => {
    trashButton(
      state,
      side,
      makeEID(state),
      (getCard(state, (args as any).card as Card | null) ?? null) as Card,
    );
  },
  "trash-resource": (state, side, args) => trashResource(state, side, args as any),
  "unbroken-subroutines": (state, side, args) =>
    playUnbrokenSubroutines(state, side, args as any),
  "view-deck": (state, side, args) => viewDeck(state, side, args as any),
};

// ---------------------------------------------------------------------------
// process-action
// Dispatch an action by command name, then run checkpoint+clean-up.
// Mirrors: process-action in process_actions.clj
// ---------------------------------------------------------------------------

export function processAction(
  command: string,
  state: GameState,
  side: string,
  args: Record<string, unknown>,
): boolean {
  const handler = commands[command];
  if (handler) {
    handler(state, side, args);
    checkpointPlusCleanup(state);
    return true;
  }
  return false;
}
