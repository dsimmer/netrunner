// Prompt display.
// Mirrors: src/clj/game/core/prompts.clj

import { randomUUID } from "crypto";
import type {
  GameState,
  Corp,
  Runner,
  Prompt,
  SelectionEntry,
} from "./state";
import { CORP_SIDE, RUNNER_SIDE, getSidePrompt } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import { makeEID } from "./eid";
import type { AbilityFn, MsgFn, ReqFn } from "./types";
import { getAllCards } from "./board";
import { addToPromptQueue, removeFromPromptQueue } from "./prompt_state";
import { toast } from "./toasts";
import { pluralize, sideStr } from "../utils";
import { effectCompleted } from "./eid";

// ---------------------------------------------------------------------------
// Parsed choice entry
// ---------------------------------------------------------------------------

interface ParsedChoice {
  value: string;
  uuid: string;
  idx: number;
}

// Re-export SelectionEntry so prior consumers keep their import path.
export type { SelectionEntry };

// ---------------------------------------------------------------------------
// Resolver-callable typed shapes
// ---------------------------------------------------------------------------

type UpdateFn = (state: GameState, side: string, card: Card) => void;
type ResolveAbilityFn = (
  state: GameState,
  side: string,
  ability: Record<string, unknown>,
  card: Card | null,
  cards: Card[],
) => void;

interface ShowPromptOpts {
  eid?: EID;
  waitingPrompt?: string | boolean;
  promptType?: string;
  showDiscard?: boolean;
  showOpponentDiscard?: boolean;
  cancel?: AbilityFn;
  endEffect?: AbilityFn;
  targets?: unknown[];
  selectable?: string[];
  offerBadPub?: boolean;
}

interface ShowTracePromptOpts {
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
  targets?: unknown[];
  eid?: EID;
}

// ---------------------------------------------------------------------------
// choice-parser
// ---------------------------------------------------------------------------

/**
 * Parses choices into a uniform structure.
 * If choices is a map or keyword-like (object), return as-is.
 * Otherwise, wrap each choice in a {value, uuid, idx} object.
 */
function choiceParser(
  choices: unknown,
): Record<string, unknown> | ParsedChoice[] | unknown {
  // Clojure: (if (or (map? choices) (keyword? choices)) choices ...)
  // Keywords in clj are atomic; in TS we treat non-array primitives the same way.
  if (
    choices == null ||
    typeof choices === "string" ||
    typeof choices === "number" ||
    typeof choices === "boolean"
  ) {
    return choices;
  }
  if (!Array.isArray(choices)) {
    return choices as Record<string, unknown>;
  }
  return choices.reduce<ParsedChoice[]>((acc, choice, idx) => {
    if (choice != null) {
      acc.push({ value: String(choice), uuid: randomUUID(), idx });
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// update-selectable
// ---------------------------------------------------------------------------

interface CidValueChoice {
  value?: { cid?: string };
}

function hasCidValue(c: unknown): c is CidValueChoice {
  return typeof c === "object" && c !== null && "value" in c;
}

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
  const cids: string[] = [];
  for (const c of choices as unknown[]) {
    if (hasCidValue(c)) {
      const cid = c.value?.cid;
      if (typeof cid === "string") cids.push(cid);
    }
  }
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
// resolve message helper
// ---------------------------------------------------------------------------

function resolveMessage(
  message: string | MsgFn,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
): string {
  if (typeof message === "string") return message;
  if (typeof message === "function") {
    return String(message(state, side, eid, card, targets));
  }
  // Map form: { public, corp, runner } — pick the side string or first defined.
  const obj = message as { [k: string]: string | MsgFn | undefined };
  const candidate = obj[side] ?? obj.public ?? obj.corp ?? obj.runner;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "function") {
    return String((candidate as AbilityFn)(state, side, eid, card, targets));
  }
  return "";
}

// ---------------------------------------------------------------------------
// player accessor helper
// ---------------------------------------------------------------------------

function getPlayer(state: GameState, side: string): Corp | Runner {
  return side === CORP_SIDE ? state.corp : state.runner;
}

// ---------------------------------------------------------------------------
// show-prompt
// ---------------------------------------------------------------------------

/**
 * Engine-private method for displaying a prompt where a function, not a card ability, is invoked
 * when the prompt is resolved. All prompts flow through this method.
 *
 * Single-signature replacement of the three-arity Clojure defn (dispatch by
 * opts shape is unnecessary in TS — callers pass the opts bag they need).
 */
export function showPrompt(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn,
  choices: unknown,
  f: AbilityFn | null,
  opts: ShowPromptOpts = {},
): void {
  const eid = opts.eid ?? makeEID(state);
  const targets = (opts.targets as unknown[]) ?? [];
  const prompt = resolveMessage(message, state, side, eid, card, targets);
  const parsedChoices = choiceParser(choices);
  const selectable = updateSelectable(opts.selectable, choices);

  const newPrompt: Prompt = {
    eid,
    message: prompt,
    choices: parsedChoices as Prompt["choices"],
    effect: f ?? undefined,
    card,
    selectable,
    offerBadPub: opts.offerBadPub,
    promptType: opts.promptType ?? "other",
    showDiscard: opts.showDiscard,
    showOpponentDiscard: opts.showOpponentDiscard,
    cancel: opts.cancel,
    endEffect: opts.endEffect,
  };

  if (shouldShowPrompt(opts.promptType, parsedChoices)) {
    if (opts.waitingPrompt) {
      const waitingMsg =
        opts.waitingPrompt === true
          ? `Waiting for ${sideStr(side)} to make a decision`
          : (opts.waitingPrompt as string);
      addToPromptQueue(state, oppositeSide(side), {
        eid: { id: eid.id },
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
  f: AbilityFn,
  args: ShowPromptOpts = {},
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
        typeof selection === "object" && selection !== null && "value" in selection
          ? String((selection as { value: unknown }).value)
          : typeof selection === "string"
            ? selection
            : "";
      if (value !== DICE_MSG) {
        f(selection);
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
  f: AbilityFn,
  opts: ShowTracePromptOpts,
): void {
  const eid = opts.eid ?? makeEID(state);
  const targets = opts.targets ?? [];
  const prompt = resolveMessage(message, state, side, eid, card, targets);
  const corpCredits = opts.corpCredits(eid);
  const runnerCredits = opts.runnerCredits(eid);

  const newPrompt: Prompt = {
    eid,
    message: prompt,
    choices: side === CORP_SIDE ? corpCredits : runnerCredits,
    corpCredits,
    runnerCredits,
    promptType: "trace",
    effect: f,
    card,
    player: opts.player,
    other: opts.other,
    base: opts.base,
    bonus: opts.bonus,
    strength: opts.strength,
    unbeatable: opts.unbeatable,
    beatTrace: opts.beatTrace,
    link: opts.link,
  };

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
  return queue.find((p: Prompt) => {
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
  const player = getPlayer(state, side);
  const selected = player.selected;
  if (!selected) return undefined;
  return selected.find((s: SelectionEntry) => {
    const abilityEid = s.ability?.eid as EID | undefined;
    return abilityEid?.id === eid.id;
  });
}

// ---------------------------------------------------------------------------
// resolve-select
// ---------------------------------------------------------------------------

function stripSelectedFlag(c: Card): Card {
  if ("selected" in c) {
    const copy = { ...c } as Card & { selected?: boolean };
    delete copy.selected;
    return copy;
  }
  return c;
}

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
  updateFn: UpdateFn,
  resolveAbility: ResolveAbilityFn,
): void {
  const player = getPlayer(state, side);
  const selected =
    firstSelectionByEid(state, side, eid) ?? player.selected?.[0];
  if (!selected) return;

  const selectedCards = (selected.cards ?? []) as Card[];
  const cards = selectedCards.map(stripSelectedFlag);

  const queue = getSidePrompt(state, side);
  const prompt =
    firstPromptByEid(state, side, eid, "select") ??
    queue.find((p: Prompt) => p.promptType === "select");

  if (player.selected) {
    player.selected = player.selected.filter((s) => s !== selected);
  }

  if (prompt) {
    removeFromPromptQueue(state, side, prompt);
  }

  const ability = selected.ability ?? {};

  if (cards.length > 0) {
    for (const c of cards) {
      updateFn(state, side, c);
    }
    resolveAbility(state, side, ability, card, cards);
  } else {
    const cancel = args.cancel;
    if (typeof cancel === "function") {
      (cancel as AbilityFn)();
    } else {
      const abilityEid = ability.eid as EID | undefined;
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
  _args: Record<string, unknown>,
  _updateFn: UpdateFn,
  resolveAbility: ResolveAbilityFn,
  button: string,
): void {
  const player = getPlayer(state, side);
  const selected = player.selected?.[0];
  if (!selected) return;

  const cards = ((selected.cards ?? []) as Card[]).map(stripSelectedFlag);

  const queue = getSidePrompt(state, side);
  const prompt = queue.find((p: Prompt) => p.promptType === "select");

  if (player.selected) {
    player.selected = player.selected.slice(1);
  }

  if (prompt) {
    removeFromPromptQueue(state, side, prompt);
  }

  // Clojure passes `[button]` (a vector containing the button keyword) as the
  // `cards` arg. We do the same — the resolver downstream treats the contents
  // as opaque targets, not strictly typed Card objects.
  void cards;
  resolveAbility(state, side, selected.ability ?? {}, card, [
    button as unknown as Card,
  ]);
}

// ---------------------------------------------------------------------------
// compute-selectable (private)
// ---------------------------------------------------------------------------

function isInZone(card: Card, zone: Zone): boolean {
  const cardZone = card.zone ?? [];
  if (cardZone.length !== zone.length) return false;
  for (let i = 0; i < zone.length; i++) {
    if (cardZone[i] !== zone[i]) return false;
  }
  return true;
}

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
  void ability;
  const allCards = getAllCards(state);
  let valid = allCards.filter((c) => !isInZone(c, ["deck"]));
  if (cardFn) {
    valid = valid.filter(cardFn);
  }
  if (reqFn) {
    const eid = makeEID(state);
    valid = valid.filter((c) => reqFn(state, side, eid, card, [c]));
  }
  const result: string[] = [];
  for (const c of valid) {
    if (typeof c.cid === "string") result.push(c.cid);
  }
  return result;
}

// ---------------------------------------------------------------------------
// show-select
// ---------------------------------------------------------------------------

interface SelectAbility {
  eid?: EID;
  prompt?: string | MsgFn;
  // Ability/ChoicesSpec elsewhere allows string/number/etc; we narrow to a
  // record here because show-select only meaningfully consumes :req/:card/
  // :min/:max/:all/:not-self/:counter, all of which require a map.
  choices?: Record<string, unknown> | unknown;
  offerBadPub?: boolean;
  showOpponentDiscard?: boolean;
  showDiscard?: boolean;
  [key: string]: unknown;
}

function toChoicesMap(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type MinMaxFn = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
) => number;

function resolveMinMax(
  value: unknown,
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: Card[],
): number | undefined {
  if (typeof value === "function") {
    return (value as MinMaxFn)(state, side, eid, card, targets);
  }
  if (typeof value === "number") return value;
  return undefined;
}

/**
 * A select prompt uses a targeting cursor so the user can click their desired target of the ability.
 * The preferred method for showing a select prompt is through resolve-ability.
 */
export function showSelect(
  state: GameState,
  side: string,
  card: Card | null,
  ability: SelectAbility,
  updateFn: UpdateFn,
  resolveAbility: ResolveAbilityFn,
  args: Record<string, unknown> = {},
): void {
  const eid = ability.eid ?? makeEID(state);
  const targets = (args.targets as Card[]) ?? [];

  const processedAbility: SelectAbility = { ...ability };
  const choices: Record<string, unknown> = { ...toChoicesMap(processedAbility.choices) };

  const resolvedMax = resolveMinMax(choices.max, state, side, eid, card, targets);
  if (resolvedMax !== undefined) choices.max = resolvedMax;

  const resolvedMin = resolveMinMax(choices.min, state, side, eid, card, targets);
  if (resolvedMin !== undefined) choices.min = resolvedMin;

  const all = choices.all === true;
  if (all) {
    delete choices.min; // Clojure: (if all (update-in ability [:choices] dissoc :min) ability)
  }
  processedAbility.choices = choices;

  const reqFn = (choices.req as ReqFn | undefined) as
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
  const minChoices =
    typeof choices.min === "number" ? (choices.min as number) : undefined;
  const maxChoices =
    typeof choices.max === "number" ? (choices.max as number) : undefined;

  const player = getPlayer(state, side);
  if (!player.selected) player.selected = [];
  const newSelection: SelectionEntry = {
    ability: {
      ...(processedAbility as Record<string, unknown>),
      choices: undefined,
      waitingPrompt: undefined,
      card,
    },
    cards: [],
    card: cardFn,
    req: reqFn,
    notSelf:
      choices.notSelf === true && typeof card?.cid === "string"
        ? card.cid
        : undefined,
    max: maxChoices,
    all,
  };
  player.selected.push(newSelection);

  const buildDefaultMsg = (): string => {
    const parts: string[] = ["Choose"];
    if (minChoices != null) parts.push(`at least ${minChoices}`);
    if (minChoices != null && maxChoices != null) parts.push("and");
    if (maxChoices != null) parts.push(`${all ? "" : "up to "}${maxChoices}`);
    if (maxChoices != null) parts.push(pluralize("target", maxChoices));
    else if (minChoices != null) parts.push(pluralize("target", minChoices));
    else parts.push("a target");
    parts.push(`for ${card?.title ?? ""}`);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const promptMsg: string = ability.prompt
    ? resolveMessage(ability.prompt, state, side, eid, card, [])
    : buildDefaultMsg();

  const promptChoices: string[] = all ? ["Hide"] : ["Done"];

  // wrap-function: if the named arg is truthy, replace it with a callback that
  // re-enters resolve-ability with the original ability's eid. Clojure form
  // closes over the lexical ability; we do the same.
  const wrapFunction = (
    argObj: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> => {
    const val = argObj[key];
    if (val) {
      return {
        ...argObj,
        [key]: (
          s: GameState,
          sd: string,
          _e: EID,
          c: Card | null,
          ts: Card[],
        ) => resolveAbility(s, sd, { eid }, c, ts),
      };
    }
    return argObj;
  };

  const effectFn: AbilityFn = all
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
          firstSelectionByEid(state, side, eid) ?? player.selected?.[0];
        if (!selected) return;

        const cards = ((selected.cards ?? []) as Card[]).map(stripSelectedFlag);

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

        const cancelArgs: Record<string, unknown> = {};
        const wrapped = wrapFunction(args, "cancel");
        if (wrapped.cancel !== undefined) cancelArgs.cancel = wrapped.cancel;
        resolveSelect(
          state,
          side,
          eid,
          card,
          cancelArgs,
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
        offerBadPub: ability.offerBadPub,
        selectable: selectableCards,
        showOpponentDiscard: ability.showOpponentDiscard,
        showDiscard: ability.showDiscard,
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
 *
 * Clojure has two arities: 3-arg (state side message) and 4-arg (state side
 * message opts). A 1-arg shim used by some card code (message only, no state)
 * is preserved as a no-op for backward-compat.
 */
export function showWaitPrompt(message: string): void;
export function showWaitPrompt(
  state: GameState,
  side: string,
  message: string,
  opts?: { card?: Card | null },
): void;
export function showWaitPrompt(
  stateOrMessage: GameState | string,
  side?: string,
  message?: string,
  opts?: { card?: Card | null },
): void {
  if (typeof stateOrMessage === "string") {
    // Legacy 1-arg shim: no state available, no-op.
    return;
  }
  if (side === undefined || message === undefined) return;
  showPrompt(
    stateOrMessage,
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
export function clearWaitPrompt(
  stateOrSide: GameState | string,
  side?: string,
): void {
  if (typeof stateOrSide === "string") {
    // Legacy 1-arg shim: no state available, no-op.
    return;
  }
  if (side === undefined) return;
  const queue = getSidePrompt(stateOrSide, side);
  const waitPrompt = queue.find((p: Prompt) => p.promptType === "waiting");
  if (waitPrompt) {
    removeFromPromptQueue(stateOrSide, side, waitPrompt);
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
  const runnerPrompt = runnerQueue.find((p: Prompt) => p.promptType === "run");
  if (runnerPrompt) {
    removeFromPromptQueue(state, RUNNER_SIDE, runnerPrompt);
  }

  const corpQueue = getSidePrompt(state, CORP_SIDE);
  const corpPrompt = corpQueue.find((p: Prompt) => p.promptType === "run");
  if (corpPrompt) {
    removeFromPromptQueue(state, CORP_SIDE, corpPrompt);
  }
}

// ---------------------------------------------------------------------------
// cancellable
// ---------------------------------------------------------------------------

interface TitleLike {
  title?: string;
}

function hasTitle(c: unknown): c is TitleLike {
  return typeof c === "object" && c !== null && "title" in c;
}

/**
 * Wraps a vector of prompt choices with a final 'Cancel' option.
 * Optionally sorts the vector alphabetically, with Cancel always last.
 */
export function cancellable(
  choices: unknown[],
  sorted:
    | boolean
    | string
    | { sorted?: boolean; label?: string }
    = false,
): unknown[] {
  const sortFlag =
    typeof sorted === "object" && sorted !== null
      ? !!sorted.sorted
      : typeof sorted === "string"
        ? sorted === "sorted"
        : !!sorted;
  if (sortFlag) {
    const sortedChoices = [...choices].sort((a, b) => {
      const aTitle = hasTitle(a) ? (a.title ?? "") : "";
      const bTitle = hasTitle(b) ? (b.title ?? "") : "";
      return aTitle.localeCompare(bTitle);
    });
    return [...sortedChoices, "Cancel"];
  }
  return [...choices, "Cancel"];
}

// ---------------------------------------------------------------------------
// Convenience prompt wrappers used by card definitions.
// These don't have direct clj equivalents — clj cards call resolve-ability
// with prompt/choices maps directly. The TS port uses these wrappers to keep
// card code readable. Implementations route through the real prompt queue.
// ---------------------------------------------------------------------------

type CallbackAbility = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
) => void;

interface ValueTarget {
  value: unknown;
}

function isValueTarget(t: unknown): t is ValueTarget {
  return typeof t === "object" && t !== null && "value" in t;
}

function promptTargetValue(targets: unknown[]): unknown {
  const target = targets[0];
  if (isValueTarget(target)) return target.value;
  return target;
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
    filter?: (card: Card) => boolean;
    onChoose?: (card: Card) => void;
    onChange?: (card: Card) => void;
    [key: string]: unknown;
  },
): void {
  if (!cards || cards.length === 0) return;
  const handler: CallbackAbility = (_s, _sd, _e, _c, targets) => {
    const choice = promptTargetValue(targets) as Card | undefined;
    if (choice) {
      if (opts?.onChoose) opts.onChoose(choice);
      else if (opts?.onChange) opts.onChange(choice);
    }
  };
  showPrompt(state, side, null, title, cards as unknown[], handler);
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
    const choice = promptTargetValue(targets);
    const cb = choice === "Yes" ? opts?.onYes : opts?.onNo;
    if (typeof cb === "function") {
      if (cb.length >= 1) {
        (cb as CallbackAbility)(s, sd, e, c, targets);
      } else {
        (cb as () => void)();
      }
    }
  };
  showPrompt(state, side, null, prompt, ["Yes", "No"], handler);
}

/**
 * Display a reorder-cards prompt. The player repeatedly chooses the next card
 * in order; choosing Done accepts the remaining cards in their current order.
 */
export function showReorderCardsPrompt(
  state: GameState,
  side: string,
  prompt: string,
  cards: Card[],
  opts?: { onChange?: (ordered: Card[]) => void } | null,
): void {
  if (!cards) return;

  const ordered: Card[] = [];
  const remaining = cards.slice();

  const finish = (): void => {
    opts?.onChange?.([...ordered, ...remaining]);
  };

  const chooseNext = (): void => {
    if (remaining.length === 0) {
      finish();
      return;
    }

    const handler: CallbackAbility = (_s, _sd, _e, _c, targets) => {
      const choice = promptTargetValue(targets);
      if (choice === "Done") {
        finish();
        return;
      }

      const card = choice as Card;
      const idx = remaining.findIndex((c) => c.cid === card.cid);
      if (idx >= 0) {
        const [selected] = remaining.splice(idx, 1);
        if (selected) ordered.push(selected);
      }
      chooseNext();
    };

    showPrompt(
      state,
      side,
      null,
      prompt,
      [...remaining, "Done"],
      handler,
    );
  };

  chooseNext();
}
