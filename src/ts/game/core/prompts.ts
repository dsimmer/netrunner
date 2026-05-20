// Prompt display.
// Mirrors: src/clj/game/core/prompts.clj

import { randomUUID } from "crypto";
import type { GameState, Corp, Runner, Prompt } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getSidePrompt } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import { makeEID } from "./eid";
import type { AbilityFn, MsgFn } from "./types.ts";
import { getAllCards } from "./board";
import { addToPromptQueue, removeFromPromptQueue } from "./prompt_state";
import { toast } from "./toasts";
import { pluralize, sideStr } from "../utils";
import { effectCompleted } from "./eid";

// ---------------------------------------------------------------------------
// Selection entry (stored in per-side :selected)
// ---------------------------------------------------------------------------

export interface SelectionEntry {
  ability: Record<string, unknown>;
  cards: (Card & { selected?: boolean })[];
  card?: (c: Card) => boolean;
  req?: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ) => boolean;
  notSelf?: string;
  max?: number;
  all?: boolean;
}

// ---------------------------------------------------------------------------
// Parsed choice entry
// ---------------------------------------------------------------------------

interface ParsedChoice {
  value: string;
  uuid: string;
  idx: number;
}

// ---------------------------------------------------------------------------
// choice-parser
// ---------------------------------------------------------------------------

/**
 * Parses choices into a uniform structure.
 * If choices is a map or keyword-like (object), return as-is.
 * Otherwise, wrap each choice string in a {value, uuid, idx} object.
 */
function choiceParser(
  choices: unknown,
): Record<string, unknown> | ParsedChoice[] {
  if (choices == null || typeof choices === "object") {
    return (choices as Record<string, unknown>) ?? {};
  }
  // sequential (array) of strings
  const arr = choices as unknown[];
  return arr.reduce<ParsedChoice[]>((acc, choice, idx) => {
    if (choice != null) {
      acc.push({ value: String(choice), uuid: randomUUID(), idx });
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// update-selectable
// ---------------------------------------------------------------------------

/**
 * Collects the :cid of each selectable choice value, appending to prevSelectable.
 */
function updateSelectable(
  prevSelectable: string[] | undefined,
  choices: unknown,
): string[] {
  if (
    !choices ||
    typeof choices === "string" ||
    (typeof choices === "object" && !Array.isArray(choices))
  ) {
    return prevSelectable ?? [];
  }
  const choiceArr = choices as Array<{ value?: { cid?: string } }>;
  const cids = choiceArr
    .filter(Boolean)
    .map((c: any) => (c?.value as { cid?: string })?.cid)
    .filter((cid): cid is string => typeof cid === "string");
  return [...(prevSelectable ?? []), ...cids];
}

// ---------------------------------------------------------------------------
// should-show-prompt? (extracted from show-prompt body)
// ---------------------------------------------------------------------------

function shouldShowPrompt(
  promptType: string | undefined,
  choices: unknown,
): boolean {
  if (promptType === "waiting" || promptType === "run") return true;
  if (
    typeof choices === "object" &&
    choices != null &&
    !Array.isArray(choices)
  ) {
    const obj = choices as Record<string, unknown>;
    if (
      obj.number != null ||
      obj.cardTitle != null ||
      obj.credit != null ||
      obj.counter != null
    ) {
      return true;
    }
  }
  if (Array.isArray(choices) && choices.length > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// opposite-side
// ---------------------------------------------------------------------------

function oppositeSide(side: string): string {
  return side === CORP_SIDE ? RUNNER_SIDE : CORP_SIDE;
}

// ---------------------------------------------------------------------------
// show-prompt
// ---------------------------------------------------------------------------

/**
 * Engine-private method for displaying a prompt where a function, not a card ability, is invoked
 * when the prompt is resolved. All prompts flow through this method.
 *
 * Overloads mirror the three-arity Clojure defn.
 */
export function showPrompt(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  choices: unknown,
  f: unknown,
  args?: Record<string, unknown>,
  eid?: EID,
): void;
export function showPrompt(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  choices: unknown,
  f: unknown,
  opts?: {
    eid?: EID;
    waitingPrompt?: string | boolean;
    promptType?: string;
    showDiscard?: boolean;
    showOpponentDiscard?: boolean;
    cancel?: unknown;
    endEffect?: unknown;
    targets?: unknown;
    selectable?: string[];
    offerBadPub?: boolean;
  },
): void;
export function showPrompt(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  choices: unknown,
  f: unknown,
  opts: Record<string, unknown> = {},
): void {
  const eid = (opts.eid as EID) ?? makeEID(state);
  const prompt =
    typeof message === "string"
      ? message
      : (message as (...args: any[]) => string)(state, side, eid, card, []);
  const parsedChoices = choiceParser(choices);
  const selectable = updateSelectable(
    opts.selectable as string[] | undefined,
    choices,
  );

  const newPrompt = {
    eid,
    message: prompt,
    choices: parsedChoices as Prompt["choices"],
    effect: f as AbilityFn,
    card,
    selectable,
    offerBadPub: opts.offerBadPub,
    promptType: opts.promptType ?? "other",
    showDiscard: opts.showDiscard,
    showOpponentDiscard: opts.showOpponentDiscard,
    cancel: opts.cancel as AbilityFn | undefined,
    endEffect: opts.endEffect,
  } as unknown as Prompt & Record<string, unknown>;

  if (shouldShowPrompt(opts.promptType as string | undefined, parsedChoices)) {
    if (opts.waitingPrompt) {
      const waitingMsg =
        opts.waitingPrompt === true
          ? `Waiting for ${sideStr(side)} to make a decision`
          : (opts.waitingPrompt as string);
      addToPromptQueue(state, oppositeSide(side), {
        eid,
        card,
        promptType: "waiting",
        message: waitingMsg,
      });
    }
    addToPromptQueue(state, side, newPrompt);
  }
}

// ---------------------------------------------------------------------------
// show-prompt-with-dice
// ---------------------------------------------------------------------------

/**
 * Calls showPrompt normally, but appends a 'Roll a d6' button to choices.
 * If the user chooses to roll d6, reveal the result and re-display the prompt
 * without the 'Roll a d6' button.
 */
export function showPromptWithDice(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  otherChoices: unknown,
  f: unknown,
  args: Record<string, unknown> = {},
): void {
  const DICE_MSG = "Roll a d6";
  const choices = Array.isArray(otherChoices)
    ? [...otherChoices, DICE_MSG]
    : [DICE_MSG];

  showPrompt(
    state,
    side,
    card,
    message,
    choices,
    (selection: unknown) => {
      const value =
        (selection as { value?: string })?.value ??
        (typeof selection === "string" ? selection : "");
      if (value !== DICE_MSG) {
        (f as Function)(selection);
      } else {
        const diceResult = Math.floor(Math.random() * 6) + 1;
        showPromptWithDice(
          state,
          side,
          card,
          typeof message === "string"
            ? `${message} (Dice result: ${diceResult})`
            : message,
          otherChoices,
          f,
          args,
        );
      }
    },
    args,
  );
}

// ---------------------------------------------------------------------------
// show-trace-prompt
// ---------------------------------------------------------------------------

/**
 * Specific function for displaying a trace prompt. Works like showPrompt with some extensions.
 * Always uses :credit as the choices variable, and passes on some extra properties, such as base and bonus.
 */
export function showTracePrompt(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  f: unknown,
  opts: {
    corpCredits: (eid: EID) => number;
    runnerCredits: (eid: EID) => number;
    player?: string;
    other?: string;
    base?: number;
    bonus?: number;
    strength?: number;
    link?: number;
    unbeatable?: number;
    beatTrace?: number;
    targets?: unknown;
    eid?: EID;
  },
): void {
  const eid = opts.eid ?? makeEID(state);
  const prompt =
    typeof message === "string"
      ? message
      : (message as (...args: any[]) => string)(state, side, eid, card, []);
  const corpCredits = opts.corpCredits(eid);
  const runnerCredits = opts.runnerCredits(eid);

  const newPrompt = {
    eid,
    message: prompt,
    choices: (side === CORP_SIDE
      ? corpCredits
      : runnerCredits) as Prompt["choices"],
    corpCredits,
    runnerCredits,
    promptType: "trace",
    effect: f as AbilityFn,
    card,
    player: opts.player,
    other: opts.other,
    base: opts.base,
    bonus: opts.bonus,
    strength: opts.strength,
    unbeatable: opts.unbeatable,
    beatTrace: opts.beatTrace,
    link: opts.link,
  } as Prompt & Record<string, unknown>;

  addToPromptQueue(state, side, newPrompt);
}

// ---------------------------------------------------------------------------
// first-prompt-by-eid
// ---------------------------------------------------------------------------

/**
 * Find the first prompt in the side's queue matching the given eid.
 * Optionally filter by promptType as well.
 */
export function firstPromptByEid(
  state: GameState,
  side: string,
  eid: EID,
  type?: string,
): Prompt | undefined {
  const queue = getSidePrompt(state, side);
  return queue.find((p: any) => {
    const eidMatch = p.eid?.id === eid.id;
    if (type) return eidMatch && p.promptType === type;
    return eidMatch;
  });
}

// ---------------------------------------------------------------------------
// first-selection-by-eid
// ---------------------------------------------------------------------------

/**
 * Find the first selection entry whose ability's eid matches.
 */
export function firstSelectionByEid(
  state: GameState,
  side: string,
  eid: EID,
): SelectionEntry | undefined {
  const player = (side === CORP_SIDE ? state.corp : state.runner) as
    | Corp
    | (Runner & { selected?: SelectionEntry[] });
  const selected = (player as any).selected as SelectionEntry[] | undefined;
  if (!selected) return undefined;
  return selected.find((s: any) => {
    const abilityEid = (s.ability as any)?.eid as EID | undefined;
    return abilityEid?.id === eid.id;
  });
}

// ---------------------------------------------------------------------------
// resolve-select
// ---------------------------------------------------------------------------

/**
 * Resolves a selection prompt by invoking the prompt's ability with the targeted cards.
 * Called when the user clicks 'Done' or selects the :max number of cards.
 */
export function resolveSelect(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  args: Record<string, unknown>,
  updateFn: (state: GameState, side: string, card: Card) => void,
  resolveAbility: (
    state: GameState,
    side: string,
    ability: Record<string, unknown>,
    card: Card | null,
    cards: Card[],
  ) => void,
): void {
  const selected =
    firstSelectionByEid(state, side, eid) ??
    ((side === CORP_SIDE ? state.corp : state.runner) as any).selected?.[0];
  if (!selected) return;

  const cards = (selected.cards as Card[]).map((c: Card) => {
    const { selected: _s, ...rest } = c as any;
    return rest;
  });

  const queue = getSidePrompt(state, side);
  const prompt =
    firstPromptByEid(state, side, eid, "select") ??
    queue.find((p: any) => p.promptType === "select");

  // Remove the selection entry
  const player = (side === CORP_SIDE ? state.corp : state.runner) as any;
  if (player.selected) {
    player.selected = player.selected.filter(
      (s: SelectionEntry) => s !== selected,
    );
  }

  if (prompt) {
    removeFromPromptQueue(state, side, prompt);
  }

  if (cards.length > 0) {
    for (const c of cards) {
      updateFn(state, side, c as Card);
    }
    resolveAbility(state, side, selected.ability, card, cards);
  } else {
    if (args.cancel) {
      (args.cancel as Function)();
    } else {
      const abilityEid = (selected.ability as any)?.eid as EID | undefined;
      if (abilityEid) {
        effectCompleted(state, side, abilityEid);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// resolve-select-bad-publicity!
// ---------------------------------------------------------------------------

/**
 * Resolves a selection prompt by invoking the prompt's ability with the targeted cards.
 * Called when the user clicks 'Done' or selects the :max number of cards.
 * Bad publicity variant.
 */
export function resolveSelectBadPublicity(
  state: GameState,
  side: string,
  card: Card | null,
  args: Record<string, unknown>,
  updateFn: (state: GameState, side: string, card: Card) => void,
  resolveAbility: (
    state: GameState,
    side: string,
    ability: Record<string, unknown>,
    card: Card | null,
    cards: Card[],
  ) => void,
  button: string,
): void {
  const player = (side === CORP_SIDE ? state.corp : state.runner) as any;
  const selected = player.selected?.[0] as SelectionEntry | undefined;
  if (!selected) return;

  const cards = (selected.cards as Card[]).map((c: Card) => {
    const { selected: _s, ...rest } = c as any;
    return rest;
  });

  const queue = getSidePrompt(state, side);
  const prompt = queue.find((p: any) => p.promptType === "select");

  if (player.selected) {
    player.selected = player.selected.slice(1);
  }

  if (prompt) {
    removeFromPromptQueue(state, side, prompt);
  }

  resolveAbility(state, side, selected.ability, card, [
    button as unknown as Card,
  ]);
}

// ---------------------------------------------------------------------------
// compute-selectable (private)
// ---------------------------------------------------------------------------

function computeSelectable(
  state: GameState,
  side: string,
  card: Card | null,
  ability: Record<string, unknown>,
  reqFn:
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => boolean)
    | undefined,
  cardFn: ((c: Card) => boolean) | undefined,
): string[] {
  const allCards = getAllCards(state);
  // Filter out cards in deck zone
  let valid = allCards.filter((c: any) => !isInZone(c, ["deck"]));
  // Filter by card function
  if (cardFn) {
    valid = valid.filter(cardFn);
  }
  // Filter by req function
  if (reqFn) {
    const eid = makeEID(state);
    valid = valid.filter((c: any) => reqFn(state, side, eid, card, [c]));
  }
  return valid.map((c: any) => c.cid);
}

/** Helper: check if a card's zone equals a target zone path. */
function isInZone(card: Card, zone: Zone): boolean {
  const cardZone = card.zone ?? [];
  if (cardZone.length !== zone.length) return false;
  for (let i = 0; i < zone.length; i++) {
    if (cardZone[i] !== zone[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// show-select
// ---------------------------------------------------------------------------

/**
 * A select prompt uses a targeting cursor so the user can click their desired target of the ability.
 * The preferred method for showing a select prompt is through resolve-ability.
 */
export function showSelect(
  state: GameState,
  side: string,
  card: Card | null,
  ability: Record<string, unknown>,
  updateFn: (state: GameState, side: string, card: Card) => void,
  resolveAbility: (
    state: GameState,
    side: string,
    ability: Record<string, unknown>,
    card: Card | null,
    cards: Card[],
  ) => void,
  args: Record<string, unknown> = {},
): void {
  // If :max or :min are functions, call them and replace with their return value
  const eid = (ability as any).eid ?? makeEID(state);
  const targets = args.targets;

  let processedAbility = { ...ability };
  const choices = (processedAbility.choices ?? {}) as Record<string, unknown>;

  const maxVal = choices.max;
  if (typeof maxVal === "function") {
    (choices as any).max = (maxVal as Function)(
      state,
      side,
      eid,
      card,
      targets as Card[],
    );
  }
  const minVal = choices.min;
  if (typeof minVal === "function") {
    (choices as any).min = (minVal as Function)(
      state,
      side,
      eid,
      card,
      targets as Card[],
    );
  }

  const all = choices.all as boolean | undefined;
  if (all) {
    delete (choices as any).min; // ignore :min if :all is set
  }

  const reqFn = choices.req as
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => boolean)
    | undefined;
  const cardFn = choices.card as ((c: Card) => boolean) | undefined;

  const selectableCards = computeSelectable(
    state,
    side,
    card,
    processedAbility,
    reqFn,
    cardFn,
  );
  const minChoices = choices.min as number | undefined;
  const maxChoices = choices.max as number | undefined;

  // Add selection entry to the side's selected array
  const player = (side === CORP_SIDE ? state.corp : state.runner) as any;
  if (!player.selected) player.selected = [];
  player.selected.push({
    ability: {
      ...processedAbility,
      choices: undefined,
      waitingPrompt: undefined,
      card,
    },
    cards: [],
    card: cardFn,
    req: reqFn,
    notSelf: choices.notSelf ? card?.cid : undefined,
    max: maxChoices,
    all,
  } as SelectionEntry);

  // Build the prompt message
  const promptMsg = ability.prompt
    ? typeof ability.prompt === "string"
      ? ability.prompt
      : (ability.prompt as (...args: any[]) => string)(state, side, eid, card, [])
    : "Choose" +
      (minChoices != null ? ` at least ${minChoices}` : "") +
      (minChoices != null && maxChoices != null ? " and" : "") +
      (maxChoices != null ? ` ${all ? "" : "up to"} ${maxChoices}` : "") +
      (maxChoices != null
        ? ` ${pluralize("target", maxChoices)}`
        : minChoices != null
          ? ` ${pluralize("target", minChoices)}`
          : " a target") +
      ` for ${card?.title ?? ""}`;

  const promptChoices = all ? ["Hide"] : ["Done"];

  // Wrap cancel function if present
  const wrapFunction = (
    argObj: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> => {
    const val = argObj[key];
    if (val) {
      return {
        ...argObj,
        [key]: (
          state: GameState,
          side: string,
          eid: EID,
          card: Card | null,
          targets: Card[],
        ) => resolveAbility(state, side, { eid }, card, targets),
      };
    }
    return argObj;
  };

  const effectFn = all
    ? (_selection: unknown) => {
        // "Hide" was selected. Show toast and reapply select prompt.
        toast(
          state,
          side,
          `You must choose ${maxChoices} ${pluralize("card", maxChoices ?? 1)}`,
        );
        showSelect(state, side, card, ability, updateFn, resolveAbility, args);
      }
    : (selection: unknown) => {
        if (selection === "bad-publicity") {
          resolveSelectBadPublicity(
            state,
            side,
            card,
            ability,
            updateFn,
            resolveAbility,
            "bad-publicity",
          );
          return;
        }

        const selected =
          firstSelectionByEid(state, side, eid) ??
          (player.selected?.[0] as SelectionEntry | undefined);
        if (!selected) return;

        const cards = (selected.cards as Card[]).map((c: Card) => {
          const { selected: _s, ...rest } = c as any;
          return rest;
        });

        // Check for :min. If not enough cards are selected, show toast and stay in select prompt.
        if (minChoices != null && cards.length < minChoices) {
          toast(
            state,
            side,
            `You must choose at least ${minChoices} ${pluralize("card", minChoices)}`,
          );
          showSelect(
            state,
            side,
            card,
            ability,
            updateFn,
            resolveAbility,
            args,
          );
          return;
        }

        resolveSelect(
          state,
          side,
          eid,
          card,
          Object.fromEntries(
            Object.entries(wrapFunction(args, "cancel")).filter(
              ([k]) => k === "cancel",
            ),
          ),
          updateFn,
          resolveAbility,
        );
      };

  showPrompt(
    state,
    side,
    card,
    promptMsg,
    promptChoices,
    effectFn,
    wrapFunction(
      {
        ...args,
        promptType: "select",
        offerBadPub: (ability as any).offerBadPub,
        selectable: selectableCards,
        showOpponentDiscard: (ability as any).showOpponentDiscard,
        showDiscard: (ability as any).showDiscard,
      },
      "cancel",
    ),
  );
}

// ---------------------------------------------------------------------------
// show-wait-prompt
// ---------------------------------------------------------------------------

/**
 * Shows a 'Waiting for ...' prompt to the given side with the given message.
 * The prompt cannot be closed except by a later call to clearWaitPrompt.
 */
export function showWaitPrompt(message: string): void;
export function showWaitPrompt(
  state: GameState,
  side: string,
  message: string,
  opts?: { card?: Card | null },
): void;
export function showWaitPrompt(...args: any[]): void {
  if (args.length === 1) {
    // One-arg form (legacy/card-shim): no-op (no state to attach prompt to).
    return;
  }
  const state = args[0] as GameState;
  const side = args[1] as string;
  const message = args[2] as string;
  const opts = args[3] as { card?: Card | null } | undefined;
  showPrompt(
    state,
    side,
    opts?.card ?? null,
    `Waiting for ${message}`,
    null,
    null,
    { promptType: "waiting" },
  );
}

// ---------------------------------------------------------------------------
// clear-wait-prompt
// ---------------------------------------------------------------------------

/**
 * Removes the first 'Waiting for...' prompt from the given side's prompt queue.
 */
export function clearWaitPrompt(side: string): void;
export function clearWaitPrompt(state: GameState, side: string): void;
export function clearWaitPrompt(...args: any[]): void {
  if (args.length === 1) return; // shorthand: no state, no-op
  const state = args[0] as GameState;
  const side = args[1] as string;
  const queue = getSidePrompt(state, side);
  const waitPrompt = queue.find((p: any) => p.promptType === "waiting");
  if (waitPrompt) {
    removeFromPromptQueue(state, side, waitPrompt);
  }
}

// ---------------------------------------------------------------------------
// show-run-prompts
// ---------------------------------------------------------------------------

/**
 * Adds a dummy prompt to both sides' prompt queues.
 * The prompt cannot be closed except by a later call to clearRunPrompts.
 */
export function showRunPrompts(
  state: GameState,
  msg: string,
  card: Card | null,
): void {
  showPrompt(state, RUNNER_SIDE, card, `You are ${msg}`, null, null, {
    promptType: "run",
  });
  showPrompt(state, CORP_SIDE, card, `The Runner is ${msg}`, null, null, {
    promptType: "run",
  });
}

// ---------------------------------------------------------------------------
// clear-run-prompts
// ---------------------------------------------------------------------------

/**
 * Removes the first 'run' prompt from both sides' prompt queues.
 */
export function clearRunPrompts(state: GameState): void {
  const runnerQueue = getSidePrompt(state, RUNNER_SIDE);
  const runnerPrompt = runnerQueue.find((p: any) => p.promptType === "run");
  if (runnerPrompt) {
    removeFromPromptQueue(state, RUNNER_SIDE, runnerPrompt);
  }

  const corpQueue = getSidePrompt(state, CORP_SIDE);
  const corpPrompt = corpQueue.find((p: any) => p.promptType === "run");
  if (corpPrompt) {
    removeFromPromptQueue(state, CORP_SIDE, corpPrompt);
  }
}

// ---------------------------------------------------------------------------
// cancellable
// ---------------------------------------------------------------------------

/**
 * Wraps a vector of prompt choices with a final 'Cancel' option.
 * Optionally sorts the vector alphabetically, with Cancel always last.
 */
export function cancellable(
  choices: unknown[],
  sorted: boolean | string | { sorted?: boolean; label?: string; [k: string]: any } = false,
): (unknown | string)[] {
  const sortFlag =
    typeof sorted === "object" && sorted !== null
      ? !!sorted.sorted
      : typeof sorted === "string"
        ? sorted === "sorted"
        : !!sorted;
  if (sortFlag) {
    return [
      ...(choices as Array<{ title?: string }>).sort((a: any, b: any) =>
        ((a as any).title ?? "").localeCompare((b as any).title ?? ""),
      ),
      "Cancel",
    ];
  }
  return [...choices, "Cancel"];
}

// ---------------------------------------------------------------------------
// Convenience prompt wrappers used by card definitions.
// These don't have direct clj equivalents — clj cards call resolve-ability
// with prompt/choices maps directly. The TS port uses these wrappers to keep
// card code readable. Implementations route through the real prompt queue.
// ---------------------------------------------------------------------------

interface CallbackAbility {
  (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: unknown[],
  ): void;
}

/**
 * Display a card-selection prompt. The user picks one card from `cards`;
 * `opts.onChoose` (if provided) is invoked with the chosen card.
 *
 * `_source` indicates the intended destination ("move", "install", "hand",
 * "discard", etc.) and is currently informational — the caller is responsible
 * for performing the actual move in the callback.
 */
export function showChooseCardsPrompt(
  state: GameState,
  side: string,
  title: string,
  cards: Card[],
  _source?: string,
  opts?: {
    min?: number;
    max?: number;
    faceup?: boolean;
    onChoose?: (card: Card) => void;
    onChange?: (card: Card) => void;
    [key: string]: any;
  },
): void {
  if (!cards || cards.length === 0) return;
  const handler: CallbackAbility = (_s, _sd, _e, _c, targets) => {
    const t = (targets as unknown[])[0] as any;
    const choice = (t && (t.value ?? t)) as Card | undefined;
    if (choice) {
      if (opts?.onChoose) opts.onChoose(choice);
      else if (opts?.onChange) opts.onChange(choice);
    }
  };
  showPrompt(state, side, null, title, cards as unknown[], handler as any);
}

/**
 * Display a yes/no prompt and invoke `onYes` or `onNo` accordingly.
 */
export function showYesNoPrompt(
  state: GameState,
  side: string,
  prompt: string,
  opts?: {
    onYes?: CallbackAbility | (() => void);
    onNo?: CallbackAbility | (() => void);
  } | null,
): void {
  const handler: CallbackAbility = (s, sd, e, c, targets) => {
    const t = (targets as unknown[])[0] as any;
    const choice = (t && (t.value ?? t)) as string | undefined;
    const cb = choice === "Yes" ? opts?.onYes : opts?.onNo;
    if (typeof cb === "function") {
      // Tolerate both zero-arg and ability-shaped callbacks
      if ((cb as any).length >= 1) {
        (cb as CallbackAbility)(s, sd, e, c, targets);
      } else {
        (cb as () => void)();
      }
    }
  };
  showPrompt(state, side, null, prompt, ["Yes", "No"], handler as any);
}

/**
 * Display a reorder-cards prompt. Full reorder UI is not yet implemented in
 * the TS client — for now we preserve the given order and immediately invoke
 * `opts.onChange` with the unchanged list, matching the no-op contract.
 *
 * TODO: wire up a proper reorder prompt-type with drag UI when the client
 * supports it. Until then, behavior is "user accepts default order".
 */
export function showReorderCardsPrompt(
  state: GameState,
  side: string,
  prompt: string,
  cards: Card[],
  opts?: { onChange?: (ordered: Card[]) => void } | null,
): void {
  if (!cards) return;
  const handler: CallbackAbility = () => {
    if (opts?.onChange) opts.onChange(cards.slice());
  };
  // Single-button prompt — clicking 'Done' accepts default order.
  showPrompt(state, side, null, prompt, ["Done"], handler as any);
}
