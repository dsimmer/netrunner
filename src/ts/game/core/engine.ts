// Core game engine: ability resolution, event registration/triggering,
// checkpoints, and payment processing.
// Mirrors: src/clj/game/core/engine.clj

import { randomUUID } from "crypto";
import type { GameState, Prompt } from "./state.js";
import type { Card, Zone } from "./card.js";
import type { EID } from "./eid.js";
import type {
  Ability, ReqFn, MsgFn, AbilityFn, NumberFn, Cost, ChoicesSpec,
} from "./types.js";
import type { Effect, RegisteredEvent } from "./state.js";
import { CORP_SIDE, RUNNER_SIDE, getPlayer } from "./state.js";
import {
  getTitle, getType, getSide, isCorp, isRunner, isInstalled,
  isRezzed, isFacedown, isFaceup, isAgenda, isICE, isUpgrade,
  isAsset, isCounter, isEvent, isOperation, isHardware, isProgram,
  isResource, isIdentity, isBasicAction, inHand, inDiscard, inRFG,
  getZone, inZone, printedTitle,
} from "./card.js";
import { getCardDef } from "./types.js";
import {
  getEffectMaps, unregisterLingeringEffects, isDisabled,
  isDisabledReg, updateDisabledCards,
} from "./effects.js";
import {
  makeEID, makeEIDFrom, effectCompleted, completeWithResult,
} from "./eid.js";
import { getCard, findCID, getAllCards } from "./finding.js";
import {
  canPay, buildSpendMsg,
} from "./payment.js";
import {
  handler as payHandler,
} from "./costs.js";
import { addToPromptQueue } from "./prompt_state.js";
import {
  showPrompt, showSelect, showWaitPrompt, clearWaitPrompt,
} from "./prompts.js";
import { systemMsg, multiMsg, systemSay, nLastLogs } from "./say.js";
import { update } from "./update.js";
import { checkWinByAgenda } from "./winning.js";
import { updateMU } from "./memory.js";
import { cardStr } from "./to_string.js";
import { otherSide } from "../../jinteki/utils.js";
import {
  sameCard, sideStr, toKeyword, removeOnce, distinctBy,
  enumerateStr, inColl,
} from "../utils.js";
import {
  allActiveInstalled, allInstalled, allInstalledRunner,
  allInstalledRunnerType, clearEmptyRemotes,
} from "./board.js";
import { continue_ability, req, wait_for } from "../macros.js";
import { move as moveAction } from "./moving.js";
import { checkpoint } from "./checkpoint.js";
import type { CostData } from "./payment.js";
import { toC } from "./payment.js";

// ---------------------------------------------------------------------------
// Payment (pay) - mirrors pay in engine.clj
// ---------------------------------------------------------------------------

/**
 * Pay a sequence of costs. Mirrors `pay` in engine.clj.
 * Uses `wait_for` pattern to handle async payment flow.
 */
export function pay(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  costs: CostData[],
): void {
  const flattened: CostData[] = [];
  for (const c of costs) {
    if (Array.isArray(c)) {
      for (const item of c) flattened.push(item as CostData);
    } else {
      flattened.push(c);
    }
  }

  const checkable = canPay(state, side, eid, card, card ? getTitle(card) : "", flattened);
  if (!checkable || checkable.length === 0) {
    completeWithResult(state, side, eid, null);
    return;
  }

  // Pay each cost sequentially via payNext
  const payEid = makeEID(state, eid);

  function payNextRecursive(currentCosts: CostData[], msgs: unknown[]): void {
    if (currentCosts.length === 0) {
      const paymentResult = msgs;
      queueEvent(state, "costs-paid", { side, payment: paymentResult });
      checkpoint(state, null, makeEID(state, eid), null);
      const msg = enumerateStr(
        paymentResult.filter((m: any) => m && m["paid/msg"]).map((m: any) => m["paid/msg"])
      );
      const costPaid: Record<string, unknown> = {};
      for (const item of paymentResult) {
        if (item && item["paid/type"] && Object.keys(item).length > 1) {
          costPaid[item["paid/type"]] = item;
        }
      }
      completeWithResult(state, side, eid, { msg, costPaid });
      return;
    }

    const firstCost = currentCosts[0] as CostData;
    const restCosts = currentCosts.slice(1);
    const costEid = makeEID(state, payEid);
    wait_for(
      state,
      [(result: unknown) => {
        payNextRecursive(restCosts, [...msgs, result]);
      }],
      [payHandler, firstCost, state, side, costEid, card],
    );
  }

  payNextRecursive(checkable, []);
}

// ---------------------------------------------------------------------------
// Ability type registry
// ---------------------------------------------------------------------------

/**
 * Registry of "ability-type" keywords (e.g. :psi, :trace, :optional) to their
 * resolver functions.  Mirrors `ability-types` atom.
 */
const abilityTypes = new Map<string, (state: GameState, side: string, ability: Ability, card: Card | null, targets: unknown[]) => void>();

/** Register a new ability-type handler. Mirrors `register-ability-type`. */
export function registerAbilityType(
  kw: string,
  fn: (state: GameState, side: string, ability: Ability, card: Card | null, targets: unknown[]) => void,
): void {
  abilityTypes.set(kw, fn);
}

/**
 * Returns the first key in `ability` that matches a registered ability-type.
 * Mirrors `select-ability-kw`.
 */
function selectAbilityKw(ability: Ability): string | undefined {
  for (const [kw] of abilityTypes) {
    if (kw in ability) return kw;
  }
  return undefined;
}

/**
 * Strip the top-level :req or nested :req from an ability.
 * Mirrors `dissoc-req`.
 */
export function dissocReq(ability: Ability): Ability {
  const ab = selectAbilityKw(ability);
  if (ab && ab in ability && typeof (ability as any)[ab] === "object" && (ability as any)[ab] !== null) {
    const nested = { ...((ability as any)[ab] as Ability) };
    delete (nested as any).req;
    const out = { ...ability };
    (out as any)[ab] = nested;
    return out;
  }
  const out = { ...ability };
  delete (out as any).req;
  return out;
}

// ---------------------------------------------------------------------------
// Ability triggering helpers
// ---------------------------------------------------------------------------

/**
 * Checks if the specified ability definition should trigger.
 * Mirrors `should-trigger?`.
 * Returns true if no :req found, returns false if the supplied ability is null/undefined.
 */
function shouldTrigger(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
  ability: Ability | undefined,
): boolean {
  if (!ability) return false;
  const ab = selectAbilityKw(ability);
  if (ab && ab in ability && typeof (ability as any)[ab] === "object" && (ability as any)[ab] !== null) {
    return shouldTrigger(state, side, eid, card, targets, (ability as any)[ab] as Ability);
  }
  if (ability.req) {
    return ability.req(state, side, eid, card, targets as Card[]);
  }
  return true;
}

/**
 * Checks that a :once ability has not already fired.
 * Mirrors `not-used-once?`.
 */
function notUsedOnce(
  state: GameState,
  ability: Ability,
  card: Card | null,
): boolean {
  const once = (ability as any).once as string | undefined;
  const onceKey = (ability as any).onceKey as string | undefined;
  if (!once) return true;
  const key = onceKey ?? card?.cid ?? "";
  // Check per-run / per-turn / per-encounter registry
  const reg = once === "per-turn" ? state.perTurn :
              once === "per-run" ? state.perRun :
              (state as any).perEncounter ?? {};
  return !(key in reg);
}

/**
 * Combined check: ability can trigger?
 * Mirrors `can-trigger?`.
 */
export function canTrigger(
  state: GameState,
  side: string,
  eid: EID,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): boolean {
  return notUsedOnce(state, ability, card) &&
         shouldTrigger(state, side, eid, card, targets, ability);
}

/**
 * Returns true if a given map looks like a card ability.
 * Mirrors `is-ability?`.
 */
export function isAbility(ability: Ability | undefined): boolean {
  if (!ability) return false;
  if (ability.effect || ability.msg) return true;
  for (const [kw] of abilityTypes) {
    if (kw in ability) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Once-registration
// ---------------------------------------------------------------------------

/**
 * Register ability as having happened if :once specified.
 * Mirrors `register-once`.
 */
export function registerOnce(
  state: GameState,
  _side: string,
  ability: Ability,
  card: Card | null,
): void {
  const once = (ability as any).once as string | undefined;
  const onceKey = (ability as any).onceKey as string | undefined;
  if (!once) return;
  const key = onceKey ?? card?.cid ?? "";
  const reg = once === "per-turn" ? state.perTurn :
              once === "per-run" ? state.perRun :
              (state as any).perEncounter ?? {};
  if (!reg) return;
  (reg as Record<string, unknown>)[key] = true;
}

// ---------------------------------------------------------------------------
// Console / unique helpers (not yet in card.ts)
// ---------------------------------------------------------------------------

/** Returns true if the card is a Console subtype hardware. Mirrors `console?`. */
function isConsole(card: Card | null): boolean {
  if (!card) return false;
  return card.type === "Hardware" && hasSubtype(card, "Console");
}

/** Returns true if card has the given subtype. Mirrors `has-subtype?` from card.cljc. */
function hasSubtype(card: Card | null, subtype: string): boolean {
  if (!card) return false;
  const subs = Array.isArray(card.subtypes) ? card.subtypes :
               typeof card.subtype === "string" ? card.subtype.split(" - ") : [];
  return subs.some((s: string) => s.toLowerCase() === subtype.toLowerCase());
}

/** Returns true if the card is active (receives events). Mirrors `active?` from card.cljc. */
function isActive(card: Card | null): boolean {
  if (!card) return false;
  if (isBasicAction(card)) return true;
  if (isIdentity(card) && !isFacedown(card)) return true;
  if (inZone(card, "play-area")) return true;
  if (inZone(card, "current")) return true;
  if (inZone(card, "scored")) return true;
  if (card.type === "Counter") return true;
  if (isCorp(card) && isInstalled(card) && isRezzed(card)) return true;
  if (isRunner(card) && isInstalled(card) && !isFacedown(card)) return true;
  return false;
}

/** Returns true if the card is in set-aside. Mirrors `in-set-aside?`. */
function inSetAside(card: Card | null): boolean {
  return inZone(card, "set-aside");
}

/** Returns true if the card is faceup (installed and not facedown). Mirrors `faceup?`. */
function isFaceupCard(card: Card | null): boolean {
  return !!card && isInstalled(card) && !isFacedown(card);
}

// ---------------------------------------------------------------------------
// resolve-ability
// ---------------------------------------------------------------------------

/**
 * Top-level ability resolution.  If no `eid` is provided one is created.
 * Mirrors `resolve-ability`.
 */
export function resolveAbility(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  const eid = (ability as any).eid ?? makeEID(state);
  const eidObj = typeof eid === "object" ? eid as EID : makeEID(state);
  resolveAbilityWithEID(state, side, eidObj, ability, card, targets);
}

/**
 * Resolve-ability variant with explicit EID.
 * Mirrors `resolve-ability-eid`.
 */
function resolveAbilityWithEID(
  state: GameState,
  side: string,
  eid: EID,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  // Resolve card from eid source if not provided
  const resolvedCard = card ?? (eid.source ?? null);

  // Only has the eid, in effect a nil ability
  if (eid && Object.keys(ability).length === 1 && "eid" in ability) {
    effectCompleted(state, side, eid);
    return;
  }

  // Called directly without an eid present
  if (ability && !eid) {
    resolveAbility(state, side, ability, resolvedCard, targets);
    return;
  }

  if (ability && eid) {
    eid.source = resolvedCard;
    const ab = selectAbilityKw(ability);
    const abilityFn = ab ? abilityTypes.get(ab) : undefined;
    if (ab && abilityFn) {
      abilityFn(state, side, ability, resolvedCard, targets);
    } else if ((ability as any).choices) {
      checkChoices(state, side, ability, resolvedCard, targets);
    } else {
      checkAbility(state, side, ability, resolvedCard, targets);
    }
    return;
  }

  // Something has gone terribly wrong, error out
  console.error("Ability is nil????", ability, resolvedCard, targets);
  try {
    nLastLogs(state, 5);
  } catch (_e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Checking functions for resolve-ability
// ---------------------------------------------------------------------------

function checkChoices(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  if (canTrigger(state, side, (ability as any).eid, ability, card, targets)) {
    doChoices(state, side, ability, card, targets);
  } else {
    effectCompleted(state, side, (ability as any).eid);
  }
}

function checkAbility(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  if (canTrigger(state, side, (ability as any).eid, ability, card, targets)) {
    doAbility(state, side, ability, card, targets);
  } else {
    effectCompleted(state, side, (ability as any).eid);
  }
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

function getSideMessage(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
  paymentStr: string,
): string | undefined {
  const message = ability.msg;
  if (!message) return undefined;

  const desc = (message === ":cost" || typeof message === "string")
    ? message as string
    : (message as MsgFn)(state, side, (ability as any).eid, card, targets as Card[]);

  const costSpendMsg = buildSpendMsg(state, side, paymentStr, "use");

  if (desc === ":cost") {
    return `${paymentStr} to satisfy ${getTitle(card)}`;
  }
  return `${costSpendMsg}${getTitle(card)} to ${desc}`;
}

/** Prints the ability message. Mirrors `print-msg`. */
function printMsg(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
  paymentStr: string,
): void {
  const displaySide = (ability as any).displaySide ?? toKeyword(getSide(card) ?? side);

  if (typeof (ability as any).msg === "object" && (ability as any).msg !== null && !Array.isArray((ability as any).msg)) {
    const msgMap = (ability as any).msg as Record<string, string | MsgFn>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(msgMap)) {
      const msg = getSideMessage(state, side, { ...ability, msg: v }, card, targets, paymentStr);
      if (msg) out[k] = msg;
    }
    if (Object.keys(out).length > 0) {
      multiMsg(state, displaySide, out as any);
    }
    return;
  }

  const message = getSideMessage(state, side, ability, card, targets, paymentStr);
  if (message) {
    systemMsg(state, displaySide, message);
  }
}

// ---------------------------------------------------------------------------
// do-nothing / do-effect
// ---------------------------------------------------------------------------

function doNothing(
  state: GameState,
  side: string,
  eid: EID,
  ability: Ability,
  card: Card | null,
  paymentStr?: string,
): void {
  const silent = ((ability as any).changeInGameState as any)?.silent;
  if (!silent) {
    printMsg(state, side, { ...ability, msg: "do nothing" }, card, [], paymentStr ?? "");
  }
  effectCompleted(state, side, eid);
}

function changeInGameState(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): boolean {
  const cigReq = ((ability as any).changeInGameState as any)?.req as ReqFn | undefined;
  if (!cigReq) return true;
  return cigReq(state, side, (ability as any).eid, card, targets as Card[]);
}

/** Trigger the effect. Mirrors `do-effect`. */
function doEffect(
  state: GameState,
  side: string,
  eid: EID,
  ability: Ability,
  card: Card | null,
  paymentStr: string,
  targets: unknown[],
): void {
  if (changeInGameState(state, side, ability, card, targets)) {
    printMsg(state, side, ability, card, targets, paymentStr);
    if (ability.effect) {
      ability.effect(state, side, eid, card, targets as Card[]);
    } else {
      effectCompleted(state, side, eid);
    }
  } else {
    doNothing(state, side, eid, ability, card, paymentStr);
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// Cost merging
// ---------------------------------------------------------------------------

interface CostPaid {
  "paid/type": string;
  "paid/value": number;
  "paid/x-value": number;
  "paid/targets": unknown[];
}

function mergeCostsPaid(...costPaidArr: (Record<string, unknown> | undefined)[]): Record<string, CostPaid> {
  if (costPaidArr.length === 1) {
    return costPaidArr[0] as Record<string, CostPaid> ?? {};
  }

  // Flatten all values from each costPaid map
  const allEntries: CostPaid[] = [];
  for (const cp of costPaidArr) {
    if (cp && typeof cp === "object") {
      for (const v of Object.values(cp)) {
        if (v && typeof v === "object") allEntries.push(v as CostPaid);
      }
    }
  }

  const acc: Record<string, CostPaid> = {};
  for (const cur of allEntries) {
    const type = cur["paid/type"] ?? "";
    const existing = acc[type] ?? { "paid/type": type, "paid/value": 0, "paid/x-value": 0, "paid/targets": [] };
    acc[type] = {
      "paid/type": type,
      "paid/value": (existing["paid/value"] ?? 0) + (cur["paid/value"] ?? 0),
      "paid/x-value": (existing["paid/x-value"] ?? 0) + (cur["paid/x-value"] ?? 0),
      "paid/targets": [...(existing["paid/targets"] ?? []), ...(cur["paid/targets"] ?? [])].filter(Boolean),
    };
  }
  return acc;
}

// ---------------------------------------------------------------------------
// do-paid-ability
// ---------------------------------------------------------------------------

function doPaidAbility(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
  asyncResult: Record<string, unknown>,
): void {
  const eid = (ability as any).eid;
  const paymentStr = (asyncResult.msg as string) ?? "";
  const costPaid = mergeCostsPaid((eid as any)?.["cost-paid"], asyncResult["cost-paid"] ?? {});
  (eid as any)["cost-paid"] = costPaid;
  const lastPaymentStr = (eid as any)["latest-payment-str"];
  (eid as any)["latest-payment-str"] = paymentStr.trim() ? paymentStr : lastPaymentStr;

  // After paying costs, counters will be removed, so fetch the latest version.
  const resolvedCard = getCard(state, card) ?? card;

  registerOnce(state, side, ability, resolvedCard);
  doEffect(state, side, eid, ability, resolvedCard, paymentStr, targets);

  if (!(ability.async ?? false)) {
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// do-ability
// ---------------------------------------------------------------------------

/**
 * Perform the ability, checking all costs can be paid etc.
 * Mirrors `do-ability`.
 */
function doAbility(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  const eid = (ability as any).eid ?? makeEID(state);
  const cost = (ability as any).cost as Cost[] | undefined;
  const player = ability.player;
  const waitingPrompt = (ability as any).waitingPrompt as string | boolean | undefined;

  if (waitingPrompt) {
    const waiterSide = player
      ? (player === CORP_SIDE ? RUNNER_SIDE : CORP_SIDE)
      : (side === CORP_SIDE ? RUNNER_SIDE : CORP_SIDE);
    const msg = typeof waitingPrompt === "boolean" && waitingPrompt
      ? `${sideStr(side)} to make a decision`
      : waitingPrompt;
    addToPromptQueue(
      state, waiterSide,
      {
        eid: { id: eid.id },
        card: card,
        promptType: "waiting",
        msg: msg,
      } as Prompt,
    );
  }

  if (cost && cost.length > 0) {
    const costEid = makeEID(state);
    // Use wait-for pattern
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _eid: EID, binds: any) {
          const result = binds.asyncResult;
          if (result && ("cost-paid" in result)) {
            doPaidAbility(state, side, ability, card, targets, result);
          } else {
            effectCompleted(state, side, eid);
          }
        },
      ],
      [payHandler, state, side, costEid, card, cost[0]],
      { eid },
    );
  } else {
    doPaidAbility(state, side, ability, card, targets, { msg: "" });
  }
}

// ---------------------------------------------------------------------------
// do-choices
// ---------------------------------------------------------------------------

/** Handle a choices ability. Mirrors `do-choices`. */
function doChoices(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  const eid = (ability as any).eid;
  const choices = (ability as any).choices as ChoicesSpec | undefined;
  const notDistinct = (ability as any).notDistinct as boolean | undefined;
  const player = ability.player;
  const prompt = ability.prompt;

  const s = player ?? side;
  // Strip choices and waiting-prompt
  const ab: Ability = { ...ability };
  delete (ab as any).choices;
  delete (ab as any).waitingPrompt;

  const args: Record<string, unknown> = {
    async: ability.async,
    cancel: (ability as any).cancel,
    promptType: (ability as any).promptType,
    showDiscard: (ability as any).showDiscard,
    endEffect: (ability as any).endEffect,
    waitingPrompt: (ability as any).waitingPrompt,
    targets,
  };

  if (!changeInGameState(state, side, ability, card, targets)) {
    if ((ability as any).changeInGameState?.payCost) {
      doAbility(state, side, ab, card, targets);
    } else {
      // Pay without cost
      const stripped = { ...ab };
      delete (stripped as any).cost;
      doAbility(state, side, stripped, card, targets);
    }
    return;
  }

  if (choices && typeof choices === "object" && !Array.isArray(choices) && choices !== null) {
    const choicesMap = choices as Record<string, unknown>;
    // Counter prompt
    if (choicesMap.counter) {
      promptFn(state, s, card, prompt, choices, ab, args);
      return;
    }
    // Select prompt
    if (choicesMap.req || choicesMap.card) {
      showSelect(state, s, card, ability, update, resolveAbility, args as any);
      return;
    }
    // Number prompt
    if (choicesMap.number) {
      const n = typeof choicesMap.number === "function"
        ? (choicesMap.number as NumberFn)(state, side, eid, card, targets as Card[])
        : choicesMap.number as number;
      const m = (choicesMap.minimum as number) ?? 0;
      const dfunc = choicesMap.default as NumberFn | undefined;
      const d = dfunc ? dfunc(state, side, makeEID(state), card, targets as Card[]) : m;
      promptFn(state, s, card, prompt, { number: n, default: d, minimum: m }, ab, args);
      return;
    }
    // card-title prompt
    if (choicesMap["card-title"]) {
      const predicate = choicesMap["card-title"] as (s: GameState, sid: string, e: EID, c: Card | null, t: unknown[]) => boolean;
      const serverCardTitles = serverCardTitles(state, predicate);
      const augmentedChoices = { ...choicesMap, autocomplete: serverCardTitles };
      (args as any).promptType = "card-title";
      promptFn(state, s, card, prompt, augmentedChoices, ab, args);
      return;
    }
    // Unknown choice
    return;
  }

  // Not a map; either :credit, :counter, or a vector of cards or strings
  const cs = typeof choices === "function"
    ? (() => {
        const cards = (choices as any)(state, side, eid, card, targets as Card[]);
        return notDistinct ? cards : distinctBy((c: unknown) => (c as Card)?.title ?? c, cards);
      })()
    : choices;
  promptFn(state, s, card, prompt, cs, ab, args);
}

/** Get sorted card titles from server (card registry). */
function serverCardTitles(
  state: GameState,
  predicate: (s: GameState, sid: string, e: EID, c: Card | null, t: unknown[]) => boolean,
): string[] {
  const allCardsList = getAllCards(state);
  return [...new Set(
    allCardsList
      .filter((c) => predicate(state, "", makeEID(state), null, [c]))
      .map((c) => getTitle(c))
  )].sort();
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * Shows a prompt with the given message and choices.
 * Mirrors `prompt!`.
 */
function promptFn(
  state: GameState,
  side: string,
  card: Card | null,
  message: string | MsgFn | undefined,
  choices: ChoicesSpec,
  ability: Ability,
  args: Record<string, unknown>,
): void {
  const eid = (ability as any).eid;
  const f: AbilityFn = (s, s2, e, c, t) => {
    resolveAbility(s, s2, ability, c, t);
  };

  let cancelFn: AbilityFn | undefined;
  if ((args as any).cancel) {
    cancelFn = (s, s2, e, c, t) => {
      resolveAbility(s, s2, (args as any).cancel as Ability, c, t);
    };
  }

  const promptArgs = cancelFn
    ? { ...args, cancel: cancelFn }
    : args;

  showPrompt(state, side, eid, card, message, choices, f, promptArgs as any);
}

// ---------------------------------------------------------------------------
// Event suppression registration
// ---------------------------------------------------------------------------

interface SuppressEntry {
  event: string;
  ability: Ability;
  card: Card;
  uuid: string;
  req?: ReqFn;
}

/**
 * Registers each suppression handler in the given card definition.
 * Mirrors `register-suppress`.
 */
export function registerSuppress(
  state: GameState,
  side: string,
  card: Card,
): SuppressEntry[] {
  const cdef = getCardDef(card);
  const events = (cdef as any).suppress as Ability[] | undefined;
  if (!events || !events.length) return [];
  return registerSuppressInternal(state, side, card, events);
}

function registerSuppressInternal(
  state: GameState,
  _side: string,
  card: Card,
  events: Ability[],
): SuppressEntry[] {
  const abilities: SuppressEntry[] = events.map((ability) => ({
    event: ability.event ?? "",
    ability: { ...ability, event: undefined },
    card,
    uuid: randomUUID(),
  }));

  const existing = (state as any).suppress ?? [];
  state.suppress = [...existing, ...abilities];
  return abilities;
}

/**
 * Removes all event handler suppression effects as defined for the given card.
 * Mirrors `unregister-suppress`.
 */
export function unregisterSuppress(
  state: GameState,
  side: string,
  card: Card,
): void {
  const cdef = getCardDef(card);
  const events = (cdef as any).suppress as Ability[] | undefined;
  if (!events) return;
  unregisterSuppressInternal(state, side, card, events);
}

function unregisterSuppressInternal(
  state: GameState,
  _side: string,
  card: Card,
  events: Ability[],
): void {
  const eventNames = new Set(events.map((e) => e.event ?? ""));
  const existing = (state as any).suppress ?? [];
  state.suppress = existing.filter(
    (entry: SuppressEntry) =>
      !(sameCard(card, entry.card) && eventNames.has(entry.event)),
  );
}

/**
 * Removes a single event handler with matching uuid.
 * Mirrors `unregister-suppress-by-uuid`.
 */
export function unregisterSuppressByUUID(
  state: GameState,
  _side: string,
  uuid: string,
): void {
  const existing = (state as any).suppress ?? [];
  state.suppress = existing.filter((entry: SuppressEntry) => entry.uuid !== uuid);
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------

/**
 * Default locations for a card type.
 * Mirrors `default-locations`.
 */
function defaultLocations(card: Card | null): Set<string> {
  if (!card) return new Set();
  const type = toKeyword(card.type ?? "");
  switch (type) {
    case "agenda": return new Set(["scored"]);
    case "asset": case "ice": case "upgrade": return new Set(["servers"]);
    case "counter": return new Set(["hosted"]);
    case "event": case "operation": return new Set(["current", "play-area"]);
    case "hardware": case "program": case "resource": return new Set(["rig"]);
    case "identity": case "fake-identity": return new Set(["identity"]);
    default: return new Set();
  }
}

/**
 * Build location set from ability. Mirrors `build-location`.
 */
function buildLocation(card: Card | null, ability: Ability): Set<string> {
  const location = (ability as any).location;
  if (!location) return defaultLocations(card);
  if (Array.isArray(location)) return new Set(location);
  if (typeof location === "string") return new Set([location]);
  return defaultLocations(card);
}

/**
 * Build condition keyword. Mirrors `build-condition`.
 */
function buildCondition(ability: Ability): string {
  const condition = (ability as any).condition as string | undefined;
  if (condition) return condition;
  const location = (ability as any).location;
  if (location) return "in-location";
  return "active";
}

/**
 * Build an event handler entry. Mirrors `build-event-ability`.
 */
export function buildEventAbility(ability: Ability, card: Card): RegisteredEvent {
  return {
    event: ability.event ?? "",
    location: buildLocation(card, ability),
    duration: (ability as any).duration ?? "default-duration",
    condition: buildCondition(ability),
    unregisterOnceResolved: (ability as any).unregisterOnceResolved ?? false,
    oncePerInstance: (ability as any).oncePerInstance ?? false,
    ability: { ...ability, event: undefined, duration: undefined, condition: undefined },
    card,
    uuid: randomUUID(),
    side: getSide(card) ?? "",
    effect: ability.effect,
  };
}

/**
 * Registers each event handler defined in the given card definition.
 * Mirrors `register-events`.
 */
export function registerEvents(
  state: GameState,
  _side: string,
  card: Card,
  events: Ability[],
): RegisteredEvent[] {
  if (!events.length) return [];
  const abilities = events.map((ability) => buildEventAbility(ability, card));
  state.events = [...state.events, ...abilities];
  return abilities;
}

/**
 * Registers default (non-location-specific) events for a card.
 * Mirrors `register-default-events`.
 */
export function registerDefaultEvents(
  state: GameState,
  side: string,
  card: Card,
): void {
  registerSuppress(state, side, card);
  const cdef = getCardDef(card);
  const allEvents = [(cdef as any).events, (cdef as any).derezzedEvents].flat().filter((e: any) => !e?.location);
  registerEvents(state, side, card, allEvents as Ability[]);
}

/**
 * Registers a pending event (fires once at next checkpoint).
 * Mirrors `register-pending-event`.
 */
export function registerPendingEvent(
  state: GameState,
  event: string,
  card: Card,
  ability: Ability,
): void {
  const pending: Ability = {
    ...ability,
    event,
    duration: (ability as any).duration ?? "pending",
    unregisterOnceResolved: true,
    oncePerInstance: (ability as any).oncePerInstance ?? false,
  };
  registerEvents(state, "", card, [pending]);
}

/**
 * Removes all event handlers defined for the given card.
 * Mirrors `unregister-events`.
 */
export function unregisterEvents(
  state: GameState,
  side: string,
  card: Card,
  cdef?: Record<string, unknown>,
): void {
  const events = cdef
    ? [(cdef as any).events, (cdef as any).derezzedEvents].flat()
    : (() => {
        const def = getCardDef(card);
        return [(def as any).events, (def as any).derezzedEvents].flat();
      })();

  const eventNames = new Set(events.map((e: any) => e?.event ?? ""));

  state.events = state.events.filter((entry) =>
    !(sameCard(card, entry.card)
      && eventNames.has(entry.event)
      && entry.duration === "default-duration"),
  );

  unregisterSuppress(state, side, card);
}

/**
 * Updates floating event durations.
 * Mirrors `update-floating-event-durations`.
 */
export function updateFloatingEventDurations(
  state: GameState,
  _side: string,
  fromKey: string,
  toKey: string,
): void {
  state.events = state.events.map((e) =>
    e.duration === fromKey ? { ...e, duration: toKey } : e,
  );
}

/**
 * Removes all event handlers with a non-persistent duration.
 * Mirrors `unregister-floating-events`.
 */
export function unregisterFloatingEvents(
  state: GameState,
  _side: string,
  duration: string,
): void {
  if (duration === "default-duration") return;
  state.events = state.events.filter((e) => e.duration !== duration);
}

/**
 * Removes a single event handler by uuid.
 * Mirrors `unregister-event-by-uuid`.
 */
export function unregisterEventByUUID(
  state: GameState,
  _side: string,
  uuid: string,
): void {
  state.events = state.events.filter((e) => e.uuid !== uuid);
}

// ---------------------------------------------------------------------------
// Event triggering
// ---------------------------------------------------------------------------

/** Handler is skippable? Mirrors `handler-skippable?`. */
function handlerSkippable(handler: any): boolean {
  const ability = handler?.handler?.ability ?? handler?.ability;
  return ability?.skippable ?? false;
}

/**
 * Priority ordering for automatic resolution.
 * Mirrors `automatic-priority`.
 */
const automaticPriority: Record<string, number> = {
  "pre-bypass": 1,
  "corp-damage": 1,
  "force-discard": 1,
  "lose-clicks": 1,
  "gain-clicks": 2,
  "drain-credits": 4,
  "bypass": 4,
  "lose-credits": 4,
  "pre-gain-credits": 5,
  "gain-credits": 6,
  "pre-draw-cards": 7,
  "draw-cards": 8,
  "post-draw-cards": 9,
  "pre-breach": 9,
  true: 10,
  "trace": 11,
  "corp-lose-tag": 11,
  "last": 999,
};

function getAbilitySide(ability: RegisteredEvent): string {
  return (ability.ability as any)?.side ?? "";
}

function isActivePlayer(state: GameState, ability: RegisteredEvent): boolean {
  return state.activePlayer === getSide(ability.card);
}

/**
 * Check condition for event handler. Mirrors `valid-condition?`.
 */
function validCondition(
  state: GameState,
  card: Card | null,
  ability: Ability,
): Card | null {
  if (!card) return null;
  const condition = (ability as any).condition as string | undefined;
  const location = (ability as any).location as Set<string> | undefined;

  const condOk = (() => {
    switch (condition) {
      case "accessed":
        return sameCard(card, (state as any).access);
      case "active": return isActive(card);
      case "derezzed": return isInstalled(card) && !isRezzed(card);
      case "installed": return isInstalled(card);
      case "facedown": return isInstalled(card) && isFacedown(card);
      case "faceup": return isFaceupCard(card);
      case "hosted": return !!card.host;
      case "floating": return true;
      case "inactive": return !isActive(card);
      case "in-location": {
        if (!location) return false;
        if (location.has("discard")) return inDiscard(card);
        if (location.has("set-aside")) return inSetAside(card);
        if (location.has("hosted")) {
          const z = getZone(card);
          return z && z.length > 0 && z[0] === "onhost";
        }
        if (location.has("rfg")) return inRFG(card);
        if (location.has("hand")) return inHand(card);
        return false;
      }
      case "test-condition": return true;
      default: return true;
    }
  })();

  if (!condOk) return null;
  if (isDisabled(state, "", card)) return null;
  if (isDisabledReg(state, card)) return null;
  return card;
}

/**
 * Get the (possibly refreshed) card for an event handler.
 * Mirrors `card-for-ability`.
 */
function cardForAbility(state: GameState, ability: RegisteredEvent): Card | null {
  const duration = ability.duration;
  if (duration === "default-duration" || duration === "pending") {
    const found = getCard(state, ability.card);
    if (found) return validCondition(state, found, ability);
    // Ice that's swapped still triggers events when passed
    if (isInstalled(ability.card)) {
      const side = getSide(ability.card);
      const installed = allInstalled(state, side ?? "");
      const cid = ability.card.cid;
      const swapped = installed.find((c) => c.cid === cid) ?? null;
      if (swapped) return validCondition(state, swapped, ability);
    }
  }
  return ability.card;
}

/**
 * Check if event should be suppressed.
 * Mirrors `trigger-suppress`.
 */
function triggerSuppress(
  state: GameState,
  side: string,
  event: string,
  ...targets: unknown[]
): boolean {
  const suppressList = (state as any).suppress ?? [];
  const matching = suppressList.filter((e: SuppressEntry) => e.event === event);
  for (const entry of matching) {
    const ability = entry.ability;
    const card = cardForAbility(state, entry as any);
    if (ability.req) {
      try {
        if (ability.req(state, side, makeEID(state), card, targets as Card[])) return true;
      } catch (_e) { /* ignore */ }
    }
  }
  return false;
}

/**
 * Gather all event handlers for the given player/event.
 * Mirrors `gather-events`.
 */
function gatherEvents(
  state: GameState,
  side: string,
  eid: EID,
  event: string,
  targets: unknown[],
  cardAbilities?: any[] | null,
): RegisteredEvent[] {
  const matching = state.events.filter((e) => e.event === event);
  const all = cardAbilities ? [...matching, ...cardAbilities.filter(Boolean)] : matching;

  const valid: RegisteredEvent[] = [];
  for (const ability of all) {
    const card = cardForAbility(state, ability);
    if (!card) continue;
    if (triggerSuppress(state, side, event, card, ...targets)) continue;
    if (!canTrigger(state, side, eid, ability, card, targets)) continue;
    valid.push(ability);
  }

  // Active player's handlers last (non-active first)
  valid.sort((a, b) => {
    const aActive = isActivePlayer(state, a) ? 1 : 0;
    const bActive = isActivePlayer(state, b) ? 1 : 0;
    return aActive - bActive;
  });

  return valid;
}

/**
 * Log an event to turn/run events.
 * Mirrors `log-event`.
 */
function logEvent(state: GameState, event: string, targets: unknown[]): void {
  (state as any).turnEvents = [(event, targets), ...((state as any).turnEvents ?? [])];
  if (state.run) {
    (state.run as any).events = [(event, targets), ...((state.run as any).events ?? [])];
  }
}

/**
 * Resolve all handlers for an event (async, no ordering).
 * Mirrors `trigger-event`.
 */
export function triggerEvent(
  state: GameState,
  side: string,
  event: string | null,
  context?: Record<string, unknown> | null,
): void {
  if (!event) return;

  logEvent(state, event, [context]);
  const handlers = gatherEvents(state, side, makeEID(state), event, [context]);

  for (const toResolve of handlers) {
    const card = cardForAbility(state, toResolve);
    if (!card) continue;

    if (toResolve.unregisterOnceResolved) {
      unregisterEventByUUID(state, side, toResolve.uuid);
    }

    const eid = makeEID(state);
    eid.source = card;
    eid.sourceType = "ability";

    resolveAbility(
      state, side, eid,
      dissocReq(toResolve),
      card, [context],
    );
  }
}

/**
 * Trigger event synchronously — each handler must complete before the next.
 * Mirrors `trigger-event-sync-next`.
 */
function triggerEventSyncNext(
  state: GameState,
  side: string,
  eid: EID,
  handlers: RegisteredEvent[],
  event: string,
  targets: unknown[],
): void {
  if (handlers.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const [toResolve, ...rest] = handlers;
  const card = cardForAbility(state, toResolve);
  if (!card) {
    triggerEventSyncNext(state, side, eid, rest, event, targets);
    return;
  }

  if (toResolve.unregisterOnceResolved) {
    unregisterEventByUUID(state, side, toResolve.uuid);
  }

  const newEid = makeEID(state);
  newEid.source = card;
  newEid.sourceType = "ability";

  // Use wait-for pattern for async sequencing
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: any) {
        triggerEventSyncNext(s, side, eid, rest, event, targets);
      },
    ],
    [
      resolveAbility,
      state, side, newEid, dissocReq(toResolve), card, targets,
    ],
    { eid },
  );
}

/**
 * Trigger event synchronously.
 * Mirrors `trigger-event-sync`.
 */
export function triggerEventSync(
  state: GameState,
  side: string,
  eid: EID,
  event: string | null,
  ...targets: unknown[]
): void {
  if (!event) {
    effectCompleted(state, side, eid);
    return;
  }

  logEvent(state, event, targets);
  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";

  const isPlayer = (player: string, ability: any): boolean => {
    const s = getSide((ability as any).card ?? ability.card);
    const as2 = getAbilitySide(ability);
    return s === player || as2 === player;
  };

  const handlers = gatherEvents(state, side, eid, event, targets);
  const activePlayerEvents = handlers.filter((h) => isPlayer(activePlayer, h));
  const opponentEvents = handlers.filter((h) => isPlayer(opponent, h));

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: any) {
        triggerEventSyncNext(s, opponent, eid, opponentEvents, event, targets);
      },
    ],
    [triggerEventSyncNext, state, activePlayer, makeEID(state), activePlayerEvents, event, targets],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Simultaneous event resolution
// ---------------------------------------------------------------------------

/**
 * Triggers simultaneous event handlers for a player.
 * Mirrors `trigger-event-simult-player`.
 */
function triggerEventSimultPlayer(
  state: GameState,
  side: string,
  eid: EID,
  handlers: RegisteredEvent[],
  cancelFn: ((state: GameState) => boolean) | null,
  eventTargets: unknown[],
): void {
  if (handlers.length === 0) {
    effectCompleted(state, side, eid);
    return;
  }

  const chooseHandler = (remaining: RegisteredEvent[], done?: boolean): Ability => {
    const filtered = (cancelFn && cancelFn(state))
      ? remaining
      : remaining.filter(
          (h) => {
            const card = cardForAbility(state, h);
            return card && !card.disabled;
          },
        );

    // Non-silent handlers
    const nonSilent = filtered.filter((h) => {
      const silent = (h.ability as any)?.silent;
      const card = cardForAbility(state, h);
      if (!silent) return true;
      if (silent === true) return false;
      return !(silent as ReqFn)(state, side, makeEID(state), card, eventTargets as Card[]);
    });

    const interactive = nonSilent.filter((h) => {
      const interactiveFn = (h.ability as any)?.interactive as ReqFn | undefined;
      const card = cardForAbility(state, h);
      return interactiveFn ? interactiveFn(state, side, makeEID(state), card, eventTargets as Card[]) : false;
    });

    // If only 1 handler or no interactive ones, auto-resolve
    if (filtered.length <= 1 || interactive.length === 0 || nonSilent.length <= 1) {
      const toResolve = nonSilent.length === 1 ? nonSilent[0] : filtered[0];
      const card = cardForAbility(state, toResolve);
      if (!card) {
        return {
          async: true,
          effect: req(() => {
            if (shouldContinue(state, handlers)) {
              continue_ability(state, side, chooseHandler(filtered.slice(1)), null, eventTargets);
            } else {
              effectCompleted(state, side, eid);
            }
          }),
        };
      }

      const remaining = nonSilent.length === 1
        ? filtered.filter((h) => !sameCard(card, cardForAbility(state, h)))
        : filtered.slice(1);

      return {
        async: true,
        effect: req(() => {
          if (toResolve.unregisterOnceResolved) {
            unregisterEventByUUID(state, side, toResolve.uuid);
          }
          const newEid = makeEID(state);
          newEid.source = card;
          newEid.sourceType = "ability";
          const cardSide = toKeyword(getSide(card) ?? side);
          wait_for(
            state,
            [
              { asyncResult: "result" },
              function (s: GameState, _e: EID, _b: any) {
                if (shouldContinue(s, handlers)) {
                  continue_ability(s, side, chooseHandler(remaining), null, eventTargets);
                } else {
                  effectCompleted(s, side, eid);
                }
              },
            ],
            [resolveAbility, state, cardSide, newEid, dissocReq(toResolve), card, eventTargets],
            { eid },
          );
        }),
      };
    }

    // Show prompt for manual ordering
    const titles = nonSilent.map((h) => {
      const abiName = (h.ability as any)?.abilityName as string | undefined;
      const card = cardForAbility(state, h);
      return abiName ?? card ?? { title: "unknown" } as Card;
    });
    const choices = [...titles.map((c) => getTitle(c) ?? ""), "Done"];

    return {
      prompt: "Choose a trigger to resolve",
      choices,
      async: true,
      effect: req(() => {
        const target = (eventTargets[0] as string) ?? "";
        if (target === "Done") {
          // Resolve remaining handlers automatically
          for (const { handler } of handlers.filter(handlerSkippable)) {
            if (handler.unregisterOnceResolved) {
              unregisterEventByUUID(state, side, handler.uuid);
            }
            registerOnce(state, "", handler, handler.card);
          }
          const autoHandlers = handlers
            .filter((h) => !handlerSkippable(h))
            .sort((a, b) => (printedTitle((a as any).card) ?? "").localeCompare(printedTitle((b as any).card) ?? ""))
            .sort((a, b) => {
              const pa = (a.ability as any)?.automatic;
              const pb = (b.ability as any)?.automatic;
              return (automaticPriority[pa ?? true] ?? 10) - (automaticPriority[pb ?? true] ?? 10);
            })
            .map((h) => ({
              ...h,
              ability: { ...h.ability, silent: true, interactive: undefined },
            }));

          if (autoHandlers.length > 0) {
            continue_ability(state, side, chooseHandler(autoHandlers as any, true), null, eventTargets);
          } else {
            effectCompleted(state, side, eid);
          }
        } else {
          // Find selected handler
          const toResolve = handlers.find((h) => {
            const card = cardForAbility(state, h);
            const abiName = (h.ability as any)?.abilityName;
            if (abiName) return abiName === target;
            return sameCard({ cid: (target as any)?.cid }, card);
          });
          if (!toResolve) {
            effectCompleted(state, side, eid);
            return;
          }
          const card = cardForAbility(state, toResolve);
          if (toResolve.unregisterOnceResolved) {
            unregisterEventByUUID(state, side, toResolve.uuid);
          }
          const newEid = makeEID(state);
          newEid.source = card;
          newEid.sourceType = "ability";

          wait_for(
            state,
            [
              { asyncResult: "result" },
              function (s: GameState, _e: EID, _b: any) {
                const remaining = handlers.filter((h) => h !== toResolve);
                if (shouldContinue(s, handlers)) {
                  continue_ability(s, side, chooseHandler(remaining), null, eventTargets);
                } else {
                  effectCompleted(s, side, eid);
                }
              },
            ],
            [resolveAbility, state, toKeyword(getSide(card) ?? side), newEid, dissocReq(toResolve), card, eventTargets],
            { eid },
          );
        }
      }),
    };
  };

  continue_ability(state, side, chooseHandler(handlers), null, eventTargets);
}

function shouldContinue(state: GameState, handlers: RegisteredEvent[]): boolean {
  return handlers.length > 1;
}

/**
 * Wrap a card ability as an event handler.
 * Mirrors `ability-as-handler`.
 */
export function abilityAsHandler(card: Card, ability: Ability): RegisteredEvent {
  return buildEventAbility({ ...ability, duration: (ability as any).duration ?? "pending" }, card);
}

/**
 * String description of internal event keyword.
 * Mirrors `event-title`.
 */
function eventTitle(event: string): string {
  return event.replace(/^:/, "");
}

/**
 * Trigger event simultaneously (manual ordering).
 * Mirrors `trigger-event-simult`.
 */
export function triggerEventSimult(
  state: GameState,
  side: string,
  eid: EID,
  event: string | null,
  opts: {
    firstAbility?: Ability;
    cardAbilities?: any[] | any;
    afterActivePlayer?: Ability;
    cancelFn?: (state: GameState) => boolean;
  },
  ...targets: unknown[]
): void {
  if (!event) {
    effectCompleted(state, side, eid);
    return;
  }

  logEvent(state, event, targets);
  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";
  const { firstAbility, cardAbilities, afterActivePlayer, cancelFn } = opts;

  const caList = cardAbilities
    ? Array.isArray(cardAbilities) ? cardAbilities : [cardAbilities]
    : [];

  const handlers = gatherEvents(state, side, eid, event, targets, caList);
  const activePlayerEvents = handlers.filter((h) => {
    const s = getSide(h.card);
    return s === activePlayer || getAbilitySide(h) === activePlayer;
  });
  const opponentEvents = handlers.filter((h) => {
    const s = getSide(h.card);
    return s === opponent || getAbilitySide(h) === opponent;
  });

  const cancelFunc = cancelFn ?? null;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        showWaitPrompt(s, opponent, `${sideStr(activePlayer)} to resolve ${eventTitle(event)} triggers`);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              if (afterActivePlayer) {
                resolveAbility(s2, side, eid, afterActivePlayer, null, []);
              }
              clearWaitPrompt(s2, opponent);
              showWaitPrompt(s2, activePlayer, `${sideStr(opponent)} to resolve ${eventTitle(event)} triggers`);

              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: any) {
                    clearWaitPrompt(s3, activePlayer);
                    effectCompleted(s3, side, eid);
                  },
                ],
                [triggerEventSimultPlayer, s2, opponent, makeEID(state), opponentEvents, cancelFunc, targets],
                { eid },
              );
            },
          ],
          [triggerEventSimultPlayer, s, activePlayer, makeEID(state), activePlayerEvents, cancelFunc, targets],
          { eid },
        );
      },
    ],
    firstAbility ? [resolveAbility, state, side, makeEID(state), firstAbility, null, []] : [],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Event queueing
// ---------------------------------------------------------------------------

/**
 * Queue an event for checkpoint processing.
 * Mirrors `queue-event`.
 */
export function queueEvent(
  state: GameState,
  event: string,
  contextMap?: Record<string, unknown> | null,
): void {
  if (!event) return;
  const queued = (state as any).queuedEvents ?? {};
  if (!Array.isArray(queued[event])) {
    queued[event] = [];
  }
  queued[event].push({ ...contextMap, event });
  (state as any).queuedEvents = queued;
}

/**
 * Gather queued event handlers.
 * Mirrors `gather-queued-event-handlers`.
 */
function gatherQueuedEventHandlers(
  state: GameState,
  eventMaps: Record<string, unknown[][]>,
): Array<{ handlers: RegisteredEvent[]; contextMaps: unknown[][] }> {
  const result: Array<{ handlers: RegisteredEvent[]; contextMaps: unknown[][] }> = [];
  for (const [event, contextMaps] of Object.entries(eventMaps)) {
    result.push({
      handlers: state.events.filter((e) => e.event === event),
      contextMaps: [...contextMaps as unknown[]],
    });
  }
  return result;
}

/**
 * Create handler-context instances.
 * Mirrors `create-instances`.
 */
function createInstances(
  entry: { handlers: RegisteredEvent[]; contextMaps: unknown[][] },
): Array<{ handler: RegisteredEvent; context: unknown[] }> {
  const out: Array<{ handler: RegisteredEvent; context: unknown[] }> = [];
  for (const handler of entry.handlers) {
    if ((handler as any).oncePerInstance) {
      out.push({ handler, context: entry.contextMaps });
    } else {
      for (const context of entry.contextMaps) {
        out.push({ handler, context: [context] });
      }
    }
  }
  return out;
}

/**
 * Create and filter handlers from queued events.
 * Mirrors `create-handlers`.
 */
function createHandlers(
  state: GameState,
  eid: EID,
  eventMaps: Record<string, unknown[][]>,
): Array<{ handler: RegisteredEvent; context: unknown[] }> {
  const entries = gatherQueuedEventHandlers(state, eventMaps);
  const instances = entries.flatMap(createInstances);

  const valid = instances.filter(({ handler, context }) => {
    const card = cardForAbility(state, handler);
    if (!card) return false;
    if (triggerSuppress(state, toKeyword(getSide(card) ?? ""), handler.event, card, ...context)) return false;
    return canTrigger(state, toKeyword(getSide(card) ?? ""), eid, handler, card, context);
  });

  // Sort: non-active player first
  valid.sort((a, b) => {
    const aActive = isActivePlayer(state, a.handler) ? 1 : 0;
    const bActive = isActivePlayer(state, b.handler) ? 1 : 0;
    return aActive - bActive;
  });

  return valid;
}

/**
 * Trigger queued events for a player.
 * Mirrors `trigger-queued-event-player`.
 */
function triggerQueuedEventPlayer(
  state: GameState,
  side: string,
  eid: EID,
  handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>,
  args: { cancelFn?: (state: GameState) => boolean },
): void {
  if (handlers.length === 0) {
    effectCompleted(state, "", eid);
    return;
  }

  const cancelFn = args.cancelFn ?? null;
  const filtered = (cancelFn && cancelFn(state))
    ? handlers
    : handlers.filter((h) => {
        const card = cardForAbility(state, h.handler);
        if (!card || card.disabled) return false;
        return !triggerSuppress(state, toKeyword(getSide(card) ?? ""), h.handler.event, card, ...h.context);
      });

  const nonSilent = filtered.filter((h) => {
    const silent = (h.handler.ability as any)?.silent;
    if (!silent) return true;
    const card = cardForAbility(state, h.handler);
    if (silent === true) return false;
    return !(silent as ReqFn)(state, side, makeEID(state), card, h.context as Card[]);
  });

  const interactive = nonSilent.filter((h) => {
    const interactiveFn = (h.handler.ability as any)?.interactive as ReqFn | undefined;
    const card = cardForAbility(state, h.handler);
    return interactiveFn ? interactiveFn(state, side, makeEID(state), card, h.context as Card[]) : false;
  });

  if (filtered.length <= 1 || interactive.length === 0 || nonSilent.length <= 1) {
    const h = nonSilent.length === 1 ? nonSilent[0] : filtered[0];
    const toResolve = h.handler;
    const ability = toResolve;
    const context = h.context;
    const abilityCard = cardForAbility(state, toResolve);
    const remaining = nonSilent.length === 1
      ? filtered.filter((fh) => !sameCard(abilityCard, cardForAbility(state, fh.handler)))
      : filtered.slice(1);

    if (abilityCard) {
      if (toResolve.unregisterOnceResolved) {
        unregisterEventByUUID(state, side, toResolve.uuid);
      }
      const newEid = makeEID(state);
      newEid.source = abilityCard;
      newEid.sourceType = "ability";

      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: any) {
            triggerQueuedEventPlayer(s, side, eid, remaining, args);
          },
        ],
        [resolveAbility, state, toKeyword(getSide(abilityCard) ?? ""), newEid, dissocReq(ability), abilityCard, context],
        { eid },
      );
    } else {
      triggerQueuedEventPlayer(state, side, eid, remaining, args);
    }
  } else {
    // Show prompt
    const choicesMap = filtered.map((h) => {
      const card = cardForAbility(state, h.handler);
      const abiName = (h.handler.ability as any)?.abilityName;
      return [abiName ?? card ?? { title: "unknown" } as Card, h];
    });
    const choicesTitles = [...choicesMap.map(([c]) => getTitle(c) ?? ""), "Done"];

    continue_ability(
      state,
      side,
      {
        async: true,
        prompt: "Choose a trigger to resolve",
        choices: choicesTitles,
        effect: req(() => {
          const target = (eventTargets[0] as string) ?? "";
          if (target === "Done") {
            for (const { handler: h } of filtered.filter(handlerSkippable)) {
              if (h.unregisterOnceResolved) unregisterEventByUUID(state, side, h.uuid);
              registerOnce(state, "", h, h.card);
            }
            const autoHandlers = filtered
              .filter((h) => !handlerSkippable(h))
              .sort((a, b) => (printedTitle(a.handler.card) ?? "").localeCompare(printedTitle(b.handler.card) ?? ""))
              .sort((a, b) => {
                const pa = (a.handler.ability as any)?.automatic;
                const pb = (b.handler.ability as any)?.automatic;
                return (automaticPriority[pa ?? true] ?? 10) - (automaticPriority[pb ?? true] ?? 10);
              })
              .map((h) => ({
                ...h,
                handler: { ...h.handler, ability: { ...h.handler.ability, silent: true, interactive: undefined } },
              }));
            if (autoHandlers.length > 0) {
              triggerQueuedEventPlayer(state, side, eid, autoHandlers as any, args);
            } else {
              effectCompleted(state, side, eid);
            }
          } else {
            const match = choicesMap.find(([c]) => getTitle(c) === target || sameCard(target as any, c));
            const handler = match?.[1];
            if (!handler) {
              effectCompleted(state, side, eid);
              return;
            }
            const toResolve = handler.handler;
            const card = cardForAbility(state, toResolve);
            if (toResolve.unregisterOnceResolved) unregisterEventByUUID(state, side, toResolve.uuid);
            const newEid = makeEID(state);
            newEid.source = card;
            newEid.sourceType = "ability";

            wait_for(
              state,
              [
                { asyncResult: "result" },
                function (s: GameState, _e: EID, _b: any) {
                  const remaining = filtered.filter((h) => h !== handler);
                  triggerQueuedEventPlayer(s, side, eid, remaining, args);
                },
              ],
              [resolveAbility, state, toKeyword(getSide(card) ?? ""), newEid, dissocReq(toResolve), card, handler.context],
              { eid },
            );
          }
        }),
      },
      null,
      null,
    );
  }
}

/**
 * Mark pending abilities (from queued events).
 * Mirrors `mark-pending-abilities`.
 */
function markPendingAbilities(
  state: GameState,
  eid: EID,
  _args: any,
): { handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>; contextMaps: unknown[] } {
  const eventMaps = (state as any).queuedEvents ?? {};
  for (const [event, contextMaps] of Object.entries(eventMaps)) {
    logEvent(state, event, contextMaps as unknown[]);
  }
  if (Object.keys(eventMaps).length === 0) {
    return { handlers: [], contextMaps: [] };
  }
  const handlers = createHandlers(state, eid, eventMaps);
  (state as any).queuedEvents = {};
  state.events = state.events.filter((e) => e.duration !== "pending");
  return { handlers, contextMaps: Object.values(eventMaps).flat() as unknown[] };
}

/**
 * Trigger pending abilities at checkpoint.
 * Mirrors `trigger-pending-abilities`.
 */
function triggerPendingAbilities(
  state: GameState,
  eid: EID,
  handlers: Array<{ handler: RegisteredEvent; context: unknown[] }>,
  args: any,
): void {
  if (handlers.length === 0) {
    effectCompleted(state, "", eid);
    return;
  }

  const activePlayer = state.activePlayer;
  const opponent = otherSide(activePlayer) ?? "";

  const isPlayer = (player: string, h: { handler: RegisteredEvent }) => {
    const s = getSide(h.handler.card);
    const as2 = getAbilitySide(h.handler);
    return s === player || as2 === player;
  };

  const activePlayerHandlers = handlers.filter((h) => isPlayer(activePlayer, h));
  const opponentHandlers = handlers.filter((h) => isPlayer(opponent, h));
