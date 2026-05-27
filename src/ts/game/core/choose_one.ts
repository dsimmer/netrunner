/**
 * Choose-one functionality for prompting the player to select from multiple options.
 * Mirrors: src/clj/game/core/choose_one.clj
 */

import type { GameState } from "./state";
import type { EID } from "./eid";
import type { Card } from "./card";
import type { Ability, MsgFn, NumberFn, ReqFn } from "./types";
import { continue_ability } from "../macros";
import { buildCostString, canPay } from "./payment";
import { effectCompleted, makeEID, registerEIDCallback } from "./eid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single choice option in a choose-one prompt. */
export interface ChoiceOption {
  option?: string;
  req?: ReqFn;
  cost?: unknown[];
  ability?: Ability;
  card?: Card;
  player?: string;
  [key: string]: unknown;
}

/** Arguments passed to choose-one-helper. */
export interface ChooseOneArgs {
  prompt?: string | MsgFn;
  count?: number | NumberFn;
  optional?: "after-first" | boolean;
  noPrune?: boolean;
  noWaitMsg?: boolean;
  interactive?: ReqFn | boolean;
  requireMeaningfulChoice?: boolean;
  action?: string;
  player?: string;
  side?: string;
  once?: string;
  unregisterOnceResolved?: boolean;
  event?: string;
  label?: string;
  changeInGameState?: boolean;
  onChangeGameState?: unknown;
  location?: string | string[] | string[][];
  additionalCost?: unknown[];
  duration?: string;
  waitingPrompt?: boolean;
  req?: ReqFn;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// choose-one-helper
// ---------------------------------------------------------------------------

/**
 * Main choose-one function. Creates a prompt asking the player to select one
 * (or more) options from the given list.
 *
 * Keys unique to this function:
 *   - noPrune: can I select the same option more than once?
 *   - noWaitMsg: do we hide the wait message from the runner?
 *   - count: number of choices we're allowed to pick
 *
 * @param args   - Configuration arguments (optional)
 * @param xs     - List of choice options
 * @returns An Ability object describing the async choose-one prompt
 */
export function chooseOneHelper(choices: ChoiceOption[]): Ability;
export function chooseOneHelper(args: ChooseOneArgs, xs: ChoiceOption[]): Ability;
export function chooseOneHelper(args?: ChooseOneArgs): Ability;
export function chooseOneHelper(
  args?: ChooseOneArgs | ChoiceOption[],
  xs?: ChoiceOption[],
): Ability {
  // If first arg looks like a choices array (no `prompt`, `count`, etc.)
  let actualArgs: ChooseOneArgs = {};
  let choices: ChoiceOption[] = [];

  if (args && Array.isArray(args)) {
    choices = args as unknown as ChoiceOption[];
  } else if (args && xs) {
    actualArgs = args;
    choices = xs;
  } else if (args) {
    actualArgs = args as ChooseOneArgs;
  }

  return buildChooseOne(actualArgs, choices);
}

/**
 * Build the full choose-one ability object.
 * Mirrors (choose-one-helper args xs) in Clojure.
 */
function buildChooseOne(args: ChooseOneArgs, xs: ChoiceOption[]): Ability {
  // Check if count is a 5-fn (needs to be computed at runtime)
  const countIsFn = typeof args.count === "function";

  if (countIsFn) {
    const countFn = args.count as (...a: any[]) => number;
    return {
      async: true,
      effect: (state: GameState, side: string, eid: EID, card: Card, targets: any[]) => {
        const newCount = countFn(state, side, eid, card, targets);
        continue_ability(
          state,
          side,
          { ...args, count: newCount } as Ability,
          card,
          targets,
        );
      },
    };
  }

  // xs of the form: {option, req, cost, ability, card}
  // next-optional: (= optional :after-first)
  const nextOptional = args.optional === "after-first";
  // apply-optional: (and optional (not next-optional))
  const applyOptional = args.optional && !nextOptional;

  // If optional is set (but not :after-first), add a "Done" option
  const processedXs = applyOptional ? [...xs, { option: "Done" }] : xs;

  // base-map: (select-keys args [:action :player :once :unregister-once-resolved ...])
  const baseMap: Partial<Ability> = {};
  const baseKeys: (keyof ChooseOneArgs)[] = [
    "action",
    "player",
    "once",
    "unregisterOnceResolved",
    "event",
    "label",
    "changeInGameState",
    "location",
    "additionalCost",
    "duration",
  ];
  for (const key of baseKeys) {
    if (key in args) {
      (baseMap as Record<string, unknown>)[key] = (args as any)[key];
    }
  }

  // payable?: checks if the cost of a choice can be paid
  const payable = (
    x: ChoiceOption,
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ): ChoiceOption | undefined => {
    if (
      !x.cost ||
      canPay(state, args.player || side, eid, card, null, x.cost as any)
    ) {
      return x;
    }
    return undefined;
  };

  // costed-str: builds the display string for a choice
  const costedStr = (x: ChoiceOption): string | { title: string } => {
    let choiceStr: string;
    if (!x.cost) {
      choiceStr = x.option || "";
    } else {
      const cs = buildCostString(x.cost as any) ?? "";
      choiceStr = x.option ? `${cs}: ${x.option}` : cs;
    }

    if (x.card) {
      return { title: choiceStr };
    }
    return choiceStr;
  };

  // choices-fn: converts an option to a choice (filtering by payable and req)
  const choicesFn = (
    x: ChoiceOption,
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
  ): string | { title: string } | undefined => {
    if (!payable(x, state, side, eid, card, targets)) {
      return undefined;
    }
    if (!x.req) {
      return costedStr(x);
    }
    const reqResult = typeof x.req === "function"
      ? x.req(state, side, eid, card, targets)
      : !!x.req;
    if (reqResult) {
      return costedStr(x);
    }
    return undefined;
  };

  // meaningful-req?: skips the prompt if only 'done' is available
  const meaningfulReq: ReqFn | undefined = args.requireMeaningfulChoice
    ? (state: GameState, side: string, eid: EID, card: Card, targets: any[]) => {
        const cs = processedXs
          .map((x: any) => choicesFn(x, state, side, eid, card, targets))
          .filter(Boolean) as (string | { title: string })[];
        return (
          cs.length !== 1 ||
          cs[0] !== "Done" ||
          !args.req ||
          (args.req as any)(state, side, eid, card, targets)
        );
      }
    : undefined;

  // Resolve choices: pick the matching choice, pay, resolve it, and continue
  // This is the inner resolve-choices function from Clojure
  const resolveChoices = (
    xs: ChoiceOption[],
    full: ChoiceOption[],
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: Card[],
    target: unknown,
  ): void => {
    if (!xs.length) {
      return effectCompleted(state, side, eid);
    }

    const firstChoice = xs[0];
    const firstStr = costedStr(firstChoice);

    if (target === firstStr) {
      const ability = {
        ...firstChoice.ability,
        cost: firstChoice.cost as any,
      } as Ability;
      const abSide = firstChoice.player || side;
      const newEid = makeEID(state, eid);

      // Allow for resolving multiple options, like Deuces Wild
      // Use wait_for pattern: register callback, then call resolve
      const count = args.count as number | undefined;
      const remainingTarget = target;

      registerEIDCallback(state, newEid, (newState: GameState, newSide: string, newEidInner: EID) => {
        if (count && count > 1 && remainingTarget !== "Done") {
          // The 'Done' is already there, so can dissoc optional
          const newArgs: ChooseOneArgs = {
            ...args,
            count: count - 1,
            optional: nextOptional,
          };
          const newXs = args.noPrune
            ? full
            : full.filter((x: any) => costedStr(x) !== remainingTarget);
          continue_ability(
            newState,
            newSide,
            buildChooseOne(newArgs, newXs),
            card as Card,
            null,
          );
        } else {
          effectCompleted(newState, newSide, newEidInner);
        }
      });

      continue_ability(state, abSide, ability, card as Card, targets);

      return;
    }

    // Try the next choice (recursive)
    resolveChoices(xs.slice(1), full, state, side, eid, card, targets, target);
  };

  // Build the prompt string
  let fullPrompt: string;
  if (typeof args.prompt === "function") {
    // Prompt will be computed at runtime in the effect
    fullPrompt = "Choose one";
  } else {
    fullPrompt = typeof args.prompt === "string" ? args.prompt : "Choose one";
  }

  // Add count indicator if applicable
  let promptWithCount = fullPrompt;
  if (args.count && typeof args.count === "number" && args.count > 0) {
    promptWithCount += ` (${args.count} remaining)`;
  }

  return {
    ...baseMap,
    choices: (state: GameState, side: string, eid: EID, card: Card, targets: any[]) => {
      return processedXs
        .map((x: any) => choicesFn(x, state, side, eid, card, targets))
        .filter(Boolean) as (string | { title: string })[];
    },
    waitingPrompt: args.waitingPrompt ?? !args.noWaitMsg,
    prompt: promptWithCount,
    req: meaningfulReq || args.req,
    async: true,
    interactive: args.interactive
      ? typeof args.interactive === "boolean"
        ? (_state: GameState, _side: string, _eid: EID, _card: Card, _targets: any[]) => args.interactive
        : args.interactive
      : undefined,
    effect: (state: GameState, side: string, eid: EID, card: Card, targets: any[]) => {
      // Compute the runtime prompt if it's a MsgFn
      let finalPrompt = promptWithCount;
      if (typeof args.prompt === "function") {
        finalPrompt =
          (args.prompt as any)(state, side, eid, card, targets) || "Choose one";
        if (args.count && typeof args.count === "number" && args.count > 0) {
          finalPrompt += ` (${args.count} remaining)`;
        }
      }

      // Update the prompt queue with the final computed values
      const promptQueue =
        side === "corp" ? state.corpPrompt : state.runnerPrompt;
      const promptIndex = promptQueue.findIndex((p) => p.eid?.id === eid.id);
      if (promptIndex >= 0) {
        promptQueue[promptIndex] = {
          ...promptQueue[promptIndex],
          prompt: finalPrompt,
          waitingPrompt: args.waitingPrompt ?? !args.noWaitMsg,
          req: meaningfulReq || args.req,
          interactive: args.interactive
            ? typeof args.interactive === "boolean"
              ? (_s: any, _si: any, _e: any, _c: any, _t: any) => args.interactive
              : args.interactive
            : undefined,
        } as any;
      }

      // Extract target from targets[0] (mirrors Clojure's target form)
      const target = targets.length > 0 ? targets[0] : undefined;
      // Call resolve-choices to find and process the selected choice
      resolveChoices(xs, xs, state, side, eid, card, targets, target);
    },
  };
}

// ---------------------------------------------------------------------------
// cost-option
// ---------------------------------------------------------------------------

/**
 * Creates a choice option with a cost.
 * Mirrors (cost-option cost side) in Clojure.
 *
 * @param cost - The cost for this option
 * @param side - Which side pays the cost ("corp" or "runner")
 * @returns A ChoiceOption with cost and a display-side ability
 */
export function costOption(cost: unknown[], side: string): ChoiceOption {
  return {
    cost,
    ability: {
      displaySide: side,
      msg: "cost" as const,
    },
  };
}
