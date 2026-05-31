// Core game engine: ability resolution, event registration/triggering,
// checkpoints, and payment processing.
// Mirrors: src/clj/game/core/engine.clj

import { randomUUID } from "crypto";
import type { GameState, Prompt } from "./state";
import type { Card, Zone } from "./card";
import type { EID } from "./eid";
import type { Ability, AbilityFn, ChoicesSpec, Cost, Counter, MsgFn, NumberFn, ReqFn } from "./types";
import type { Effect, RegisteredEvent } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer } from "./state";
import {
  getTitle,
  getType,
  getSide,
  isCorp,
  isRunner,
  isInstalled,
  isRezzed,
  isFacedown,
  isFaceup,
  isAgenda,
  isICE,
  isUpgrade,
  isAsset,
  isCounter,
  isEvent,
  isOperation,
  isHardware,
  isProgram,
  isResource,
  isIdentity,
  isBasicAction,
  inHand,
  inDiscard,
  inRFG,
  getZone,
  inZone,
  printedTitle,
} from "./card";
import { getCardDef } from "./types";
import {
  getEffectMaps,
  unregisterLingeringEffects,
  isDisabled,
  isDisabledReg,
  updateDisabledCards,
} from "./effects";
import {
  makeEID,
  makeEIDFrom,
  effectCompleted,
  completeWithResult,
} from "./eid";
import { getCard, findCID, getAllCards } from "./finding";
import { canPay, buildSpendMsg } from "./payment";
import { handler as payHandler } from "./costs";
import { addToPromptQueue } from "./prompt_state";
import {
  showPrompt,
  showSelect,
  showWaitPrompt,
  clearWaitPrompt,
} from "./prompts";
import { systemMsg, multiMsg, systemSay, nLastLogs } from "./say";
import { update } from "./update";
import { checkWinByAgenda } from "./winning";
import { updateMU } from "./memory";
import { cardStr } from "./to_string";
import { otherSide } from "../../jinteki/utils";
import {
  sameCard,
  sideStr,
  toKeyword,
  removeOnce,
  distinctBy,
  enumerateStr,
  inColl,
} from "../utils";
import {
  allActiveInstalled,
  allInstalled,
  allInstalledRunner,
  allInstalledRunnerType,
  clearEmptyRemotes,
} from "./board";
import { continue_ability, req, wait_for } from "../macros";
import { move as moveAction } from "./moving";
import { checkpoint } from "./checkpoint";
import type { CostData } from "./payment";
import { toC } from "./payment";

import { promptFn, serverCardTitles } from "./engine_2";
import { queueEvent } from "./engine_3";

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
  ...costsArgs: (CostData | CostData[])[]
): void {
  // Accept either pay(state, side, eid, card, [cost1, cost2]) or pay(state, side, eid, card, cost1, cost2)
  const costs: CostData[] = [];
  for (const c of costsArgs) {
    if (Array.isArray(c)) costs.push(...c);
    else if (c) costs.push(c);
  }
  const flattened: CostData[] = [];
  for (const c of costs) {
    if (Array.isArray(c)) {
      for (const item of c) flattened.push(item as CostData);
    } else {
      flattened.push(c);
    }
  }

  const checkable = canPay(
    state,
    side,
    eid,
    card,
    card ? (getTitle(card) ?? "") : "",
    flattened,
  );
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
      checkpoint(state, null, makeEID(state, eid), undefined);
      const msg = enumerateStr(
        paymentResult
          .filter((m: unknown): m is Record<string, unknown> => !!m && typeof m === "object" && "paid/msg" in (m as Record<string, unknown>))
          .map((m: Record<string, unknown>) => m["paid/msg"]) as string[],
      );
      const costPaid: Record<string, unknown> = {};
      for (const itemRaw of paymentResult) {
        if (
          itemRaw &&
          typeof itemRaw === "object" &&
          "paid/type" in (itemRaw as Record<string, unknown>) &&
          Object.keys(itemRaw as Record<string, unknown>).length > 1
        ) {
          const item = itemRaw as Record<string, unknown>;
          costPaid[item["paid/type"] as string] = item;
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
      [
        (result: unknown) => {
          payNextRecursive(restCosts, [...msgs, result]);
        },
      ],
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
const abilityTypes = new Map<
  string,
  (
    state: GameState,
    side: string,
    ability: Ability,
    card: Card | null,
    targets: unknown[],
  ) => void
>();

/** Register a new ability-type handler. Mirrors `register-ability-type`. */
export function registerAbilityType(
  kw: string,
  fn: (
    state: GameState,
    side: string,
    ability: Ability,
    card: Card | null,
    targets: unknown[],
  ) => void,
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
  if (
    ab &&
    ab in ability &&
    typeof (ability as Record<string, unknown>)[ab] === "object" &&
    (ability as Record<string, unknown>)[ab] !== null
  ) {
    const nested = { ...((ability as Record<string, unknown>)[ab] as Ability) };
    delete nested.req;
    const out = { ...ability };
    (out as Record<string, unknown>)[ab] = nested;
    return out;
  }
  const out = { ...ability };
  delete out.req;
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
  if (
    ab &&
    ab in ability &&
    typeof (ability as Record<string, unknown>)[ab] === "object" &&
    (ability as Record<string, unknown>)[ab] !== null
  ) {
    return shouldTrigger(
      state,
      side,
      eid,
      card,
      targets,
      (ability as Record<string, unknown>)[ab] as Ability,
    );
  }
  if (ability.req) {
    if (typeof ability.req !== "function") return !!ability.req;
    return ability.req(state, side, eid, card, targets as Card[]);
  }
  return true;
}

/**
 * Checks that a :once ability has not already fired.
 * Mirrors `not-used-once?`.
 */
export function notUsedOnce(
  state: GameState,
  ability: Ability,
  card: Card | null,
): boolean {
  const once = ability.once as string | undefined;
  const onceKey = ability.onceKey as string | undefined;
  if (!once) return true;
  const key = onceKey ?? card?.cid ?? "";
  // Check per-run / per-turn / per-encounter registry
  const reg =
    once === "per-turn"
      ? state.perTurn
      : once === "per-run"
        ? state.perRun
        : (state.perEncounter ?? {});
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
  return (
    notUsedOnce(state, ability, card) &&
    shouldTrigger(state, side, eid, card, targets, ability)
  );
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
  const once = ability.once as string | undefined;
  const onceKey = ability.onceKey as string | undefined;
  if (!once) return;
  const key = onceKey ?? card?.cid ?? "";
  const reg =
    once === "per-turn"
      ? state.perTurn
      : once === "per-run"
        ? state.perRun
        : (state.perEncounter ?? {});
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
  const subs = Array.isArray(card.subtypes)
    ? card.subtypes
    : typeof card.subtype === "string"
      ? card.subtype.split(" - ")
      : [];
  return subs.some((s: string) => s.toLowerCase() === subtype.toLowerCase());
}

/** Returns true if the card is active (receives events). Mirrors `active?` from card.cljc. */
export function isActive(card: Card | null): boolean {
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
export function inSetAside(card: Card | null): boolean {
  return inZone(card, "set-aside");
}

/** Returns true if the card is faceup (installed and not facedown). Mirrors `faceup?`. */
export function isFaceupCard(card: Card | null): boolean {
  return !!card && isInstalled(card) && !isFacedown(card);
}

// ---------------------------------------------------------------------------
// resolve-ability
// ---------------------------------------------------------------------------

/**
 * Top-level ability resolution.  If no `eid` is provided one is created.
 * Mirrors `resolve-ability`.
 */
export function resolveAbility(state: GameState, side: string, ability: Ability, card: Card | null, targets?: unknown[] | null): void;
export function resolveAbility(state: GameState, side: string, eid: EID, ability: Ability, card: Card | null, targets?: unknown[] | null): void;
export function resolveAbility(
  state: GameState,
  side: string,
  arg3: Ability | EID,
  arg4: Ability | Card | null,
  arg5?: Card | unknown[] | null,
  arg6?: unknown[] | null,
): void {
  let ability: Ability;
  let card: Card | null;
  let targets: unknown[] | null = null;
  let eidExplicit: EID | undefined;
  // Distinguish (state, side, eid, ability, card, targets?) from (state, side, ability, card, targets?)
  // by checking if 3rd arg looks like an EID (object with id or empty source-type).
  if (
    arg3 &&
    typeof arg3 === "object" &&
    ("id" in arg3 || "source-type" in arg3 || "sourceType" in arg3 || "source" in arg3) &&
    !("effect" in arg3) &&
    !("msg" in arg3)
  ) {
    eidExplicit = arg3 as EID;
    ability = arg4 as Ability;
    card = arg5 as Card | null;
    targets = arg6 ?? null;
  } else {
    ability = arg3 as Ability;
    card = arg4 as Card | null;
    targets = (arg5 as unknown[] | null) ?? null;
  }
  targets = targets ?? [];
  const eid = eidExplicit ?? (ability.eid as EID | undefined) ?? makeEID(state);
  const eidObj = typeof eid === "object" ? (eid as EID) : makeEID(state);
  const abilityWithEid = { ...ability, eid: eidObj };
  resolveAbilityWithEID(state, side, eidObj, abilityWithEid, card, targets);
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
  const resolvedCard = card ?? eid.source ?? null;

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
    } else if (ability.choices) {
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
  } catch (_e) {
    /* ignore */
  }
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
  const eid = (ability.eid as EID | undefined) ?? makeEID(state);
  if (canTrigger(state, side, eid, ability, card, targets)) {
    doChoices(state, side, ability, card, targets);
  } else {
    effectCompleted(state, side, eid);
  }
}

function checkAbility(
  state: GameState,
  side: string,
  ability: Ability,
  card: Card | null,
  targets: unknown[],
): void {
  const eid = (ability.eid as EID | undefined) ?? makeEID(state);
  if (canTrigger(state, side, eid, ability, card, targets)) {
    doAbility(state, side, ability, card, targets);
  } else {
    effectCompleted(state, side, eid);
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

  const desc =
    message === ":cost" || typeof message === "string"
      ? (message as string)
      : (message as AbilityFn)(
          state,
          side,
          (ability.eid as EID | undefined),
          card,
          targets as Card[],
        );

  const costSpendMsg = buildSpendMsg(paymentStr, "use");

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
  const displaySide =
    (ability.displaySide as string | undefined) ??
    toKeyword(getSide(card) ?? side);

  const rawMsg = ability.msg;
  if (
    typeof rawMsg === "object" &&
    rawMsg !== null &&
    !Array.isArray(rawMsg)
  ) {
    const msgMap = rawMsg as Record<string, string | MsgFn>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(msgMap)) {
      const msg = getSideMessage(
        state,
        side,
        { ...ability, msg: v },
        card,
        targets,
        paymentStr,
      );
      if (msg) out[k] = msg;
    }
    if (Object.keys(out).length > 0) {
      multiMsg(state, displaySide, out);
    }
    return;
  }

  const message = getSideMessage(
    state,
    side,
    ability,
    card,
    targets,
    paymentStr,
  );
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
  const cig = ability.changeInGameState as { silent?: unknown; req?: ReqFn } | undefined;
  const silent = cig?.silent;
  if (!silent) {
    printMsg(
      state,
      side,
      { ...ability, msg: "do nothing" },
      card,
      [],
      paymentStr ?? "",
    );
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
  const cig = ability.changeInGameState as { req?: ReqFn } | undefined;
  const cigReq = cig?.req;
  if (!cigReq) return true;
  if (typeof cigReq !== "function") return !!cigReq;
  return cigReq(state, side, (ability.eid as EID | undefined), card, targets as Card[]);
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

function mergeCostsPaid(
  ...costPaidArr: (Record<string, unknown> | undefined)[]
): Record<string, CostPaid> {
  if (costPaidArr.length === 1) {
    return (costPaidArr[0] as Record<string, CostPaid>) ?? {};
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
    const existing = acc[type] ?? {
      "paid/type": type,
      "paid/value": 0,
      "paid/x-value": 0,
      "paid/targets": [],
    };
    acc[type] = {
      "paid/type": type,
      "paid/value": (existing["paid/value"] ?? 0) + (cur["paid/value"] ?? 0),
      "paid/x-value":
        (existing["paid/x-value"] ?? 0) + (cur["paid/x-value"] ?? 0),
      "paid/targets": [
        ...(existing["paid/targets"] ?? []),
        ...(cur["paid/targets"] ?? []),
      ].filter(Boolean),
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
  const eid = (ability.eid as EID | undefined) ?? makeEID(state);
  const paymentStr = (asyncResult.msg as string) ?? "";
  const eidRec = eid as (EID & Record<string, unknown>) | undefined;
  const costPaid = mergeCostsPaid(
    eidRec?.["cost-paid"] as Record<string, unknown> | undefined,
    (asyncResult["cost-paid"] ?? {}) as Record<string, unknown>,
  );
  if (eidRec) {
    eidRec["cost-paid"] = costPaid;
    const lastPaymentStr = eidRec["latest-payment-str"];
    eidRec["latest-payment-str"] = paymentStr.trim() ? paymentStr : lastPaymentStr;
  }

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
  const eid = (ability.eid as EID | undefined) ?? makeEID(state);
  const cost = ability.cost;
  const player = ability.player;
  const waitingPrompt = ability.waitingPrompt as
    | string
    | boolean
    | undefined;

  if (waitingPrompt) {
    const waiterSide = player
      ? player === CORP_SIDE
        ? RUNNER_SIDE
        : CORP_SIDE
      : side === CORP_SIDE
        ? RUNNER_SIDE
        : CORP_SIDE;
    const msg =
      typeof waitingPrompt === "boolean" && waitingPrompt
        ? `${sideStr(side)} to make a decision`
        : waitingPrompt;
    addToPromptQueue(state, waiterSide, {
      eid: { id: eid.id },
      card: card,
      promptType: "waiting",
      msg: msg,
    } as Prompt);
  }

  if (cost && cost.length > 0) {
    const costEid = makeEID(state);
    // Use wait-for pattern
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _eid: EID, binds: Record<string, unknown>) {
          const result = binds.asyncResult;
          if (
            result &&
            typeof result === "object" &&
            "cost-paid" in result
          ) {
            doPaidAbility(state, side, ability, card, targets, result as Record<string, unknown>);
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
  const eid = (ability.eid as EID | undefined);
  const choices = ability.choices as ChoicesSpec | undefined;
  const notDistinct = ability.notDistinct as boolean | undefined;
  const player = ability.player;
  const prompt = ability.prompt;

  const s = player ?? side;
  // Strip choices and waiting-prompt
  const ab: Ability = { ...ability };
  delete ab.choices;
  delete ab.waitingPrompt;

  const args: Record<string, unknown> = {
    async: ability.async,
    cancel: ability.cancel,
    promptType: ability.promptType,
    showDiscard: ability.showDiscard,
    endEffect: ability.endEffect,
    waitingPrompt: ability.waitingPrompt,
    targets,
  };

  if (!changeInGameState(state, side, ability, card, targets)) {
    const cig = ability.changeInGameState as { payCost?: boolean } | undefined;
    if (cig?.payCost) {
      doAbility(state, side, ab, card, targets);
    } else {
      // Pay without cost
      const stripped = { ...ab };
      delete stripped.cost;
      doAbility(state, side, stripped, card, targets);
    }
    return;
  }

  if (
    choices &&
    typeof choices === "object" &&
    !Array.isArray(choices) &&
    choices !== null
  ) {
    const choicesMap = choices as Record<string, unknown>;
    // Counter prompt
    if (choicesMap.counter) {
      promptFn(state, s, card, prompt, choices, ab, args);
      return;
    }
    // Select prompt
    if (choicesMap.req || choicesMap.card) {
      showSelect(state, s, card, ability, update, resolveAbility, args);
      return;
    }
    // Number prompt
    if (choicesMap.number) {
      const n =
        typeof choicesMap.number === "function"
          ? (choicesMap.number as AbilityFn)(
              state,
              side,
              eid,
              card,
              targets as Card[],
            )
          : (choicesMap.number as number);
      const m = (choicesMap.minimum as number) ?? 0;
      const dfunc = choicesMap.default as AbilityFn | undefined;
      const d = dfunc
        ? dfunc(state, side, makeEID(state), card, targets as Card[])
        : m;
      promptFn(
        state,
        s,
        card,
        prompt,
        { number: n, default: d, minimum: m },
        ab,
        args,
      );
      return;
    }
    // card-title prompt
    if (choicesMap["card-title"]) {
      const predicate = choicesMap["card-title"] as (
        s: GameState,
        sid: string,
        e: EID,
        c: Card | null,
        t: unknown[],
      ) => boolean;
      const serverCardTitlesList = serverCardTitles(state, predicate);
      const augmentedChoices = {
        ...choicesMap,
        autocomplete: serverCardTitlesList,
      };
      args.promptType = "card-title";
      promptFn(state, s, card, prompt, augmentedChoices, ab, args);
      return;
    }
    // Unknown choice
    return;
  }

  // Not a map; either :credit, :counter, or a vector of cards or strings
  const cs =
    typeof choices === "function"
      ? (() => {
          const cards = (choices as AbilityFn)(
            state,
            side,
            eid,
            card,
            targets as Card[],
          );
          return notDistinct
            ? cards
            : distinctBy((c: unknown) => (c as Card)?.title ?? c, cards);
        })()
      : choices;
  promptFn(state, s, card, prompt, cs, ab, args);
}
