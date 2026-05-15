// Player-initiated actions: ability play, card movement, advance, score, etc.
// Mirrors: src/clj/game/core/actions.clj

import type { GameState, Prompt } from "./state.js";
import { CORP_SIDE, RUNNER_SIDE, getPlayer, getSidePrompt } from "./state.js";
import type { Card } from "./card.js";
import {
  getCard, getAdvancementRequirement, getAgendaPoints, getCounters,
} from "./card.js";
import type { EID } from "./eid.js";
import { makeEID, makeEIDFrom, effectCompleted } from "./eid.js";
import type { Ability } from "./types.js";
import type { CostData } from "./payment.js";
import {
  updateAdvancementRequirement, updateAllAdvancementRequirements,
  updateAllAgendaPoints,
} from "./agendas.js";
import { badPublicityAvailable } from "./bad_publicity.js";
import { installableServers } from "./board.js";
import { cardDef } from "./card_defs.js";
import {
  breakSubAbilityCost, cardAbilityCost, scoreAdditionalCostBonus,
} from "./cost_fns.js";
import { anyEffects, isDisabledReg } from "./effects.js";
import {
  abilityAsHandler, checkpoint, registerOnce, registerPendingEvent,
  pay, queueEvent, resolveAbility, triggerEventSimult,
} from "./engine.js";
import { canAdvance, canScore } from "./flags.js";
import {
  breakSubroutine, breakSubsEventContext, getCurrentIce, getPumpStrength,
  getStrength, pump, resolveSubroutine, resolveUnbrokenSubs,
  substituteXCreditCosts,
} from "./ice.js";
import { cardInit } from "./initializing.js";
import { move, trash } from "./moving.js";
import {
  buildSpendMsg, canPay, mergeCosts, buildCostString,
} from "./payment.js";
import { playInstant } from "./play_instants.js";
import { expend, expendable } from "./expend.js";
import { removeFromPromptQueue } from "./prompt_state.js";
import {
  resolveSelect, firstPromptByEid, firstSelectionByEid,
} from "./prompts.js";
import { addCounter, addProp, setProp } from "./props.js";
import { continueRun, getRunnableZones } from "./runs.js";
import {
  playSfx, systemMsg, implementationMsg, nLastLogs,
} from "./say.js";
import { nameZone, zonesToSortedNames } from "./servers.js";
import { cardStr } from "./to_string.js";
import { toast } from "./toasts.js";
import { update } from "./update.js";
import { continue_ability, req, wait_for } from "../macros.js";
import {
  dissocIn, quantify, removeOnce, sameCard, sameSide, serverCards, toKeyword,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors `(->c :type amount)` from payment.clj. */
function c(type: string, amount: number): CostData {
  return { type, amount };
}

/** Allocates an EID with `:source card :source-type :ability`. */
function makeAbilityEID(state: GameState, card: Card | null): EID {
  const eid = makeEID(state);
  eid.source = card;
  eid.sourceType = "ability";
  return eid;
}

/** Returns the side player object (typed loose for ad-hoc fields). */
function side_(state: GameState, side: string): any {
  return getPlayer(state, side);
}

/** Returns `:prompt-state :prompt-type` for the given side. */
function getPromptType(state: GameState, side: string): string | undefined {
  return side_(state, side)?.promptState?.promptType;
}

/** Returns the prompt queue for the given side. */
function sidePrompts(state: GameState, side: string): Prompt[] {
  return getSidePrompt(state, side);
}

/** Returns the side's selected list (selection prompts). */
function sideSelected(state: GameState, side: string): any[] {
  const p = side_(state, side);
  if (!p.selected) p.selected = [];
  return p.selected;
}

// ---------------------------------------------------------------------------
// History bookkeeping
// ---------------------------------------------------------------------------

/** Returns the state without history-related keys. Mirrors `without-history`. */
function withoutHistory(state: GameState): Record<string, unknown> {
  const { log, history, clickStates, turnState, paidAbilityState, ...rest } =
    state as any;
  return rest;
}

/** Mirrors `update-click-state`. */
function updateClickState(state: GameState, ability: Ability): void {
  if (!(ability as any).action) return;
  const snapshot = withoutHistory(state);
  const prev = (state.clickStates ?? []) as unknown[];
  state.clickStates = [...prev, snapshot].slice(-4);
}

/** Mirrors `update-paid-ability-state`. */
function updatePaidAbilityState(state: GameState, ability: Ability): void {
  if ((ability as any).action) {
    state.paidAbilityState = undefined;
  } else {
    state.paidAbilityState = withoutHistory(state);
  }
}

/** Mirrors `update-history!`. */
function updateHistory(state: GameState, ability: Ability): void {
  updatePaidAbilityState(state, ability);
  updateClickState(state, ability);
}

/** Mirrors `no-blocking-prompt?`. */
function noBlockingPrompt(state: GameState, side: string): boolean {
  const t = getPromptType(state, side);
  return t == null || t === "run" || t === "prevent";
}

/** Mirrors `no-blocking-or-prevent-prompt?`. */
function noBlockingOrPreventPrompt(state: GameState, side: string): boolean {
  const t = getPromptType(state, side);
  return t == null || t === "run";
}

// ---------------------------------------------------------------------------
// Neutral actions
// ---------------------------------------------------------------------------

interface PlayAbilityArgs {
  card: Card;
  ability: Ability;
  abilityIdx?: number;
  ability_idx?: number;
  targets?: unknown[] | null;
  ignoreCost?: boolean;
}

/** Mirrors `do-play-ability`. */
function doPlayAbility(
  state: GameState,
  side: string,
  eid: EID | null,
  args: PlayAbilityArgs,
): void {
  const { card, targets } = args;
  const abilityIdx = args.abilityIdx ?? args.ability_idx;
  const source: Record<string, unknown> = {
    source: card,
    "source-type": "ability",
    "source-info": {
      "ability-idx": abilityIdx,
      "ability-targets": targets,
    },
  };
  let useEid: EID;
  if (eid) {
    useEid = eid;
  } else {
    useEid = makeEID(state);
    useEid.source = card;
    useEid.sourceType = "ability";
    useEid.sourceInfo = source["source-info"] as Record<string, unknown>;
  }

  const cost = args.ignoreCost
    ? null
    : (() => {
        const costs = cardAbilityCost(state, side, args.ability, card, targets ?? []);
        return costs && costs.length > 0 ? costs : null;
      })();
  const ability: Ability = { ...args.ability, cost: cost ?? undefined } as Ability;

  if (cost == null || canPay(state, side, useEid, card, card.title ?? "", cost)) {
    updateHistory(state, ability);
    if ((ability as any).action) {
      const strippedCard = {
        cid: card.cid,
        type: card.type,
        title: card.title,
      };
      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: any) {
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b2: any) {
                  triggerEventSimult(
                    s2, side, useEid, "action-resolved", null,
                    { "ability-idx": abilityIdx, card: strippedCard },
                  );
                },
              ],
              [resolveAbility, s, side, ability, card, targets ?? []],
              { eid: useEid },
            );
          },
        ],
        [
          triggerEventSimult, state, side, "action-played", null,
          { "ability-idx": abilityIdx, card: strippedCard },
        ],
        { eid: useEid },
      );
    } else {
      // resolve-ability uses eid embedded in ability
      const abilityWithEid: Ability = { ...ability, eid: useEid } as any;
      resolveAbility(state, side, abilityWithEid, card, targets ?? []);
    }
  }
}

/**
 * Triggers a card's ability using its zero-based index into the card's
 * card-def :abilities vector.
 * Mirrors `play-ability`.
 */
export function playAbility(
  state: GameState, side: string, args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playAbility(
  state: GameState, side: string, eid: EID | null, args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playAbility(
  state: GameState,
  side: string,
  eidOrArgs: EID | null | { card: Card; ability: number; targets?: unknown[] },
  maybeArgs?: { card: Card; ability: number; targets?: unknown[] },
): void {
  let eid: EID | null;
  let args: { card: Card; ability: number; targets?: unknown[] };
  if (maybeArgs === undefined) {
    eid = null;
    args = eidOrArgs as { card: Card; ability: number; targets?: unknown[] };
  } else {
    eid = eidOrArgs as EID | null;
    args = maybeArgs;
  }
  const cardArg = args.card;
  const card = getCard(state, cardArg);
  if (!card) return;
  const abilityIdx = args.ability;
  const ability = (card.abilities ?? [])[abilityIdx];
  if (!ability) return;

  const blockingPrompt = !noBlockingPrompt(state, side);
  const cardSide = toKeyword(card.side ?? "");
  const cannotPlay =
    card.disabled === true ||
    ((ability as any).action && state.run != null) ||
    blockingPrompt ||
    cardSide !== side ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as any, abilityIdx as any,
    ]) ||
    isDisabledReg(state, card) != null;

  if (blockingPrompt) {
    toast(state, side, "You cannot play abilities while other abilities are resolving.", "warning");
  }
  if (!cannotPlay) {
    doPlayAbility(state, side, eid, {
      card,
      ability,
      abilityIdx,
      targets: args.targets ?? null,
    });
  }
}

/** Called when the player clicks a card from hand (expend). Mirrors `expend-ability`. */
export function expendAbility(
  state: GameState, side: string, args: { card: Card },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    if (!card) return;
    const eid = makeAbilityEID(state, card);
    const expendAb = expend((cardDef(card) as any).expend);
    doPlayAbility(state, side, eid, {
      card,
      ability: expendAb,
      abilityIdx: 0,
      targets: null,
    });
  } else {
    toast(state, side, "You cannot play abilities while other abilities are resolving.", "warning");
  }
}

/** Called when the player clicks a flashback card from hand. Mirrors `flashback`. */
export function flashback(
  state: GameState, side: string, ctx: { card: Card },
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  const flashbackCost = (cardDef(card) as any).flashback;
  const eid = makeAbilityEID(state, card);
  const cardWithFlag: Card = { ...card, "rfg-instead-of-trashing": true } as any;
  const ability: Ability = {
    async: true,
    effect: function (state2, side2, eid2, _card, _targets) {
      playInstant(
        state2, side2, eid2,
        { ...cardWithFlag, "rfg-instead-of-trashing": true } as any,
        { "base-cost": flashbackCost, "as-flashback": true },
      );
    },
  } as any;
  (ability as any).action = true;
  doPlayAbility(state, side, eid, {
    card: cardWithFlag,
    ability,
    abilityIdx: 0,
    targets: [],
  });
}

/** Called when the player clicks a card from hand. Mirrors `play`. */
export function play(
  state: GameState, side: string, ctx: { card: Card } & Record<string, unknown>,
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  if (getPromptType(state, side) != null) return;
  if (side === CORP_SIDE && (state as any).corpPhase12) return;
  if (side === RUNNER_SIDE && (state as any).runnerPhase12) return;

  const context = { ...ctx, card };
  const t = card.type;
  const sidePlayer = side_(state, side);
  const basic = sidePlayer.basicActionCard;
  if (!basic) return;
  if (t === "Event" || t === "Operation") {
    playAbility(state, side, { card: basic, ability: 3, targets: [context] });
  } else if (
    t === "Hardware" || t === "Resource" || t === "Program" ||
    t === "ICE" || t === "Upgrade" || t === "Asset" || t === "Agenda"
  ) {
    playAbility(state, side, { card: basic, ability: 2, targets: [context] });
  }
}

/** Click to draw. Mirrors `click-draw`. */
export function clickDraw(state: GameState, side: string, _: unknown): void {
  const basic = side_(state, side).basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 1 });
}

/** Click to gain 1 credit. Mirrors `click-credit`. */
export function clickCredit(state: GameState, side: string, _: unknown): void {
  const basic = side_(state, side).basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 0 });
}

// ---------------------------------------------------------------------------
// move-card
// ---------------------------------------------------------------------------

/** Called when the user drags a card from one zone to another. Mirrors `move-card`. */
export function moveCard(
  state: GameState, side: string, args: { card: Card; server: string },
): void {
  const { card, server } = args;
  const cur = getCard(state, card);
  if (!cur) return;
  const zone = cur.zone ?? [];
  const lastZone = zone[zone.length - 1];
  const src = nameZone(cur.side ?? "", zone);
  const fromStr = cardStr(state, cur);
  const s: string =
    server === "HQ" || server === "R&D" || server === "Archives" ? CORP_SIDE : RUNNER_SIDE;

  if (
    src === server ||
    !sameSide(s, card.side) ||
    getPromptType(state, side) === "select" ||
    !(lastZone === "play-area" || sameSide(side, card.side))
  ) {
    return;
  }

  const moveCardTo = (zoneTo: string, opts?: Record<string, unknown>): unknown =>
    move(state, s, cur, zoneTo, opts);

  const cardPrompts = sidePrompts(state, side).filter(
    (p) => sameCard((x: any) => x?.title, p.card as any, cur as any),
  );

  const logMove = (verb: string, ...text: string[]): void => {
    const tail = text.length ? " " + text.join("") : "";
    systemMsg(state, side, `${verb} ${fromStr}${tail}`);
  };

  switch (server) {
    case "Heap":
    case "Archives": {
      if (cardPrompts.length > 0) {
        for (const prompt of cardPrompts) {
          removeFromPromptQueue(state, side, prompt);
          if (prompt.eid) effectCompleted(state, side, prompt.eid);
        }
      }
      if (zone[0] === "hand") {
        moveCardTo("discard", { force: true });
        logMove("discards");
      } else {
        trash(state, s, makeEID(state), cur, { unpreventable: true });
        logMove("trashes");
      }
      return;
    }
    case "the Grip":
    case "HQ":
      moveCardTo("hand", { force: true });
      logMove("moves", "to ", server);
      return;
    case "Stack":
    case "R&D":
      moveCardTo("deck", { front: true, force: true });
      logMove("moves", "to the top of ", server);
      return;
    default:
      return;
  }
}

/** Mirrors `trash-button`. */
export function trashButton(
  state: GameState, side: string, eid: EID, card: Card,
): void {
  systemMsg(state, side, `trashes ${cardStr(state, card)}`);
  trash(state, side, eid, card, { unpreventable: true });
}

// ---------------------------------------------------------------------------
// Prompt resolution helpers
// ---------------------------------------------------------------------------

function finishPrompt(
  state: GameState, side: string, prompt: Prompt | null, card: Card | null,
): boolean {
  const endEffect = (prompt as any)?.endEffect ?? (prompt as any)?.["end-effect"];
  if (endEffect) {
    endEffect(state, side, makeEID(state), card, null);
  }
  return true;
}

function promptError(
  context: string, prompt: unknown, promptArgs: unknown,
): void {
  // Mirrors the timbre/error call.
  console.error(
    new Error(
      `Error ${context}\nPrompt: ${JSON.stringify(prompt)}\nPrompt args: ${JSON.stringify(promptArgs)}`,
    ),
  );
}

function maybePay(
  state: GameState, side: string, eid: EID, card: Card | null,
  choices: any, choice: number,
): void {
  if (choices === "credit") {
    const credit = (getPlayer(state, side) as any).credit ?? 0;
    pay(state, side, eid, card, c("credit", Math.min(choice, credit)));
  } else {
    effectCompleted(state, side, eid);
  }
}

/** Mirrors `resolve-bad-pub-choice`. */
export function resolveBadPubChoice(
  state: GameState,
  side: string,
  args: { eid: EID; shiftKeyHeld?: boolean; "shift-key-held"?: boolean } & Record<string, unknown>,
): void {
  const eid = args.eid;
  const shiftKeyHeld = args.shiftKeyHeld ?? args["shift-key-held"];
  if (badPublicityAvailable(state, side) > 0) {
    const prompt =
      firstPromptByEid(state, side, eid) ?? sidePrompts(state, side)[0] ?? null;
    if (!prompt) {
      toast(state, side, "You cannot choose Bad Publicity for this effect.", "warning");
      return;
    }
    const card = (prompt as any).card as Card | null;
    const effect = (prompt as any).effect as ((arg: unknown) => void) | undefined;
    (side_(state, side) as any).shiftKeySelect = shiftKeyHeld;
    if ((prompt as any)["offer-bad-pub?"] || (prompt as any).offerBadPub) {
      removeFromPromptQueue(state, side, prompt);
      if (effect) effect("bad-publicity");
      finishPrompt(state, side, prompt, card);
    } else {
      toast(state, side, "You cannot choose Bad Publicity for this effect.", "warning");
    }
  } else {
    toast(state, side, "You cannot choose Bad Publicity for this effect.", "warning");
  }
}

/**
 * Resolves a prompt by invoking its effect function with the selected target.
 * Mirrors `resolve-prompt`. Note: resolve-prompt does some evil things with
 * eids, per the Clojure TODO from nbk 2025.
 */
export function resolvePrompt(
  state: GameState,
  side: string,
  args: { choice: any; eid: EID } & Record<string, unknown>,
): void {
  const { choice, eid } = args;
  const prompt =
    firstPromptByEid(state, side, eid) ?? sidePrompts(state, side)[0] ?? null;
  if (!prompt) return;
  const effect = (prompt as any).effect as ((arg: unknown) => void) | undefined;
  const card = getCard(state, (prompt as any).card as Card | null);
  const choices = (prompt as any).choices;
  const promptType = (prompt as any).promptType ?? (prompt as any)["prompt-type"];

  // Integer prompt
  if (
    choices === "credit" ||
    promptType === "trace" ||
    (choices && typeof choices === "object" && (choices.counter || choices.number))
  ) {
    if (typeof choice === "number") {
      removeFromPromptQueue(state, side, prompt);
      const newEid = makeEIDFrom(state, (prompt as any).eid as EID);
      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: any) {
            if (choices && typeof choices === "object" && choices.counter) {
              addCounter(
                s, side, makeEIDFrom(s, newEid), card, choices.counter, -choice,
              );
            }
            if (effect) effect(choice ?? card);
            finishPrompt(s, side, prompt, card);
          },
        ],
        [maybePay, state, side, newEid, card, choices, choice],
        { eid: newEid },
      );
    } else {
      promptError("in an integer prompt", prompt, args);
    }
    return;
  }

  // Card-title autocomplete prompt
  if (choices && typeof choices === "object" && choices["card-title"]) {
    if (typeof choice === "string") {
      const titleFn = choices["card-title"];
      const found = serverCards().find(
        (sc: any) => choice.toLowerCase() === ((sc.title as string) ?? "").toLowerCase(),
      );
      if (found) {
        if (titleFn(state, side, makeEID(state), card, [found])) {
          removeFromPromptQueue(state, side, prompt);
          if (effect) effect(choice ?? card);
          finishPrompt(state, side, prompt, card);
        } else {
          toast(state, side, `You cannot choose ${choice} for this effect.`, "warning");
        }
      } else {
        toast(state, side, `Could not find a card named ${choice}.`, "warning");
      }
    } else {
      promptError("in a card-title prompt", prompt, args);
    }
    return;
  }

  // Generic uuid choice
  if (choice && typeof choice === "object" && (choice as any).uuid) {
    const uuid = (choice as any).uuid;
    const list: any[] = Array.isArray(choices) ? choices : [];
    const match = list.find((o) => o.uuid === uuid);
    if (match) {
      removeFromPromptQueue(state, side, prompt);
      if (match.value === "Cancel") {
        const cancel = (prompt as any).cancel as ((arg: unknown) => void) | undefined;
        if (cancel) {
          cancel(choice);
        } else if ((prompt as any).eid) {
          effectCompleted(state, side, (prompt as any).eid as EID);
        }
        finishPrompt(state, side, prompt, card);
      } else {
        if (effect) effect(match);
        finishPrompt(state, side, prompt, card);
      }
    }
    return;
  }

  promptError("in an unknown prompt type", prompt, args);
}

// ---------------------------------------------------------------------------
// Selection prompts
// ---------------------------------------------------------------------------

/** Mirrors `update-first` (unique helper for update-in selected list). */
function updateFirst(
  selection: any[], target: Card, eid: EID | null, c2: Card,
): any[] {
  return selection.map((sObj) => {
    const abEid = sObj?.ability?.eid?.id ?? sObj?.ability?.eid?.eid;
    if (eid && abEid === eid.id) {
      const cards: Card[] = sObj.cards ?? [];
      const newCards = (c2 as any).selected
        ? [...cards, c2]
        : removeOnce((x: Card) => sameCard(x, target), cards);
      return { ...sObj, cards: newCards };
    }
    return sObj;
  });
}

/**
 * Attempt to select a card to satisfy the current select prompt.
 * Mirrors `select`.
 */
export function select(
  state: GameState,
  side: string,
  args: { card: Card; eid: EID; shiftKeyHeld?: boolean; "shift-key-held"?: boolean },
): void {
  const eid = args.eid;
  const shiftKeyHeld = args.shiftKeyHeld ?? args["shift-key-held"];
  const target = getCard(state, args.card);
  if (!target) return;
  const prompt =
    firstSelectionByEid(state, side, eid) ?? sideSelected(state, side)[0] ?? null;
  if (!prompt) return;
  const ability = (prompt as any).ability as Ability | undefined;
  const promptCard = ability && (ability as any).card
    ? getCard(state, (ability as any).card)
    : null;
  const cardReq = (prompt as any).req as Function | undefined;
  const cardCondition = (prompt as any).card as ((c: Card) => boolean) | undefined;
  const cid = (prompt as any)["not-self"] ?? (prompt as any).notSelf;

  (side_(state, side) as any).shiftKeySelect = shiftKeyHeld;

  const meets =
    target.cid !== cid &&
    (cardCondition
      ? cardCondition(target)
      : cardReq
        ? cardReq(state, side, (ability as any).eid, promptCard, [target])
        : true);
  if (!meets) return;

  const updated: Card = { ...target, selected: !((target as any).selected) } as any;
  update(state, side, (x: Card) => x, updated);
  (side_(state, side) as any).selected = updateFirst(
    sideSelected(state, side), target, eid, updated,
  );

  const selected =
    firstSelectionByEid(state, side, eid) ?? sideSelected(state, side)[0] ?? null;
  const selectPrompt =
    firstPromptByEid(state, side, eid, "select") ??
    sidePrompts(state, side).find(
      (p) => ((p as any).promptType ?? (p as any)["prompt-type"]) === "select",
    ) ?? null;

  const selectedCount = (selected as any)?.cards?.length ?? 0;
  const selMax = (selected as any)?.max ?? 1;
  if (selectedCount === selMax) {
    resolveSelect(
      state, side, eid, promptCard,
      selectPrompt ? { cancel: (selectPrompt as any).cancel } : {},
      update, resolveAbility,
    );
  }
}

// ---------------------------------------------------------------------------
// auto-pump / auto-pump-and-break
// ---------------------------------------------------------------------------

/** Sums the credit amount of a cost list. */
function sumCostAmount(costs: CostData[] | null | undefined): number {
  let total = 0;
  for (const cc of costs ?? []) total += cc.amount ?? 0;
  return total;
}

/** Mirrors `play-auto-pump`. */
export function playAutoPump(
  state: GameState, side: string, args: { card: Card },
): void {
  const card = getCard(state, args.card);
  if (!card) return;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);

  const canPump = (ability: Ability): boolean => {
    if (!(ability as any).pump) return false;
    return ((ability as any).req as Function)(state, side, eid, card, null);
  };

  const candidates = ((cardDef(card) as any).abilities ?? [])
    .filter((a: Ability) => !(a as any)["auto-pump-ignore"])
    .flatMap((a: Ability) => {
      if (!canPump(a)) return [];
      const cost = cardAbilityCost(state, side, a, card, currentIce);
      return [[a, cost] as [Ability, CostData[]]];
    })
    .filter(([a]: [Ability, CostData[]]) => !(a as any)["auto-pump-ignore"]);

  if (candidates.length === 0) return;
  candidates.sort(
    (a: any, b: any) =>
      ((a[0] as any)["auto-pump-sort"] ?? 0) - ((b[0] as any)["auto-pump-sort"] ?? 0),
  );
  const best = candidates.reduce((acc: any, cur: any) =>
    sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
  );
  const [pumpAbility, pumpCost] = best;

  const pumpStrength = getPumpStrength(state, side, pumpAbility, card);
  const ciStrength = currentIce ? getStrength(currentIce) : null;
  const cardStrength = getStrength(card);
  const strengthDiff =
    currentIce && ciStrength != null && cardStrength != null
      ? Math.max(0, ciStrength - cardStrength)
      : null;
  const timesPump =
    strengthDiff != null && pumpStrength > 0
      ? Math.ceil(strengthDiff / pumpStrength)
      : 0;
  const totalPumpCost: CostData[] | null =
    pumpAbility && timesPump > 0 ? new Array(timesPump).fill(pumpCost).flat() : null;

  if (canPay(state, side, eid, card, card.title ?? "", totalPumpCost)) {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: any) {
          for (let i = 0; i < timesPump; i++) {
            const ab = { ...pumpAbility };
            delete (ab as any).cost;
            delete (ab as any).msg;
            resolveAbility(s, side, ab, getCard(s, card), null as any);
          }
          systemMsg(
            s, side,
            `${buildSpendMsg((binds.asyncResult as any)?.msg, "increase")}the strength of ${card.title} to ${getStrength(getCard(s, card))}`,
          );
          effectCompleted(s, side, eid);
        },
      ],
      [pay, state, side, makeEIDFrom(state, eid), card, totalPumpCost],
      { eid },
    );
  }
}

/** Mirrors `play-heap-breaker-auto-pump-and-break-impl` (returns ability map). */
function playHeapBreakerAutoPumpAndBreakImpl(
  state: GameState,
  side: string,
  subGroupsToBreak: any[][],
  currentIce: Card,
): Ability {
  return {
    async: true,
    effect: function (s, _side, eid, card, _targets) {
      const subsToBreak = subGroupsToBreak[0];
      const rest = subGroupsToBreak.slice(1);
      for (const sub of subsToBreak) {
        breakSubroutine(s, getCard(s, currentIce), sub, card);
      }
      const ice = getCard(s, currentIce);
      const onBreakSubs = ice ? (cardDef(currentIce) as any)["on-break-subs"] : null;
      const eventArgs = onBreakSubs
        ? { "card-abilities": abilityAsHandler(ice as Card, onBreakSubs) }
        : null;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: any) {
            if (rest.length === 0) {
              effectCompleted(s2, side, eid);
            } else {
              continue_ability(
                s2, side,
                playHeapBreakerAutoPumpAndBreakImpl(s2, side, rest, currentIce),
                card, null as any,
              );
            }
          },
        ],
        [
          triggerEventSimult, s, side, "subroutines-broken", eventArgs,
          breakSubsEventContext(s, ice as Card, subsToBreak, card),
        ],
        { eid },
      );
    },
  } as any;
}

/** Mirrors `play-heap-breaker-auto-pump-and-break`. */
export function playHeapBreakerAutoPumpAndBreak(
  state: GameState, side: string, args: { card: Card },
): void {
  const card = getCard(state, args.card);
  if (!card) return;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;

  const canPump = (ability: Ability): boolean => {
    if (!(ability as any)["heap-breaker-pump"]) return false;
    if (anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [ability as any])) {
      return false;
    }
    const reqFn = (ability as any).req ?? (() => true);
    return reqFn(state, side, eid, card, null);
  };

  const breakerAbility = ((cardDef(card) as any).abilities ?? []).find(canPump) as Ability | undefined;
  const pumpStrengthAtOnce = breakerAbility ? (breakerAbility as any)["heap-breaker-pump"] : null;
  const subsBrokenAtOnce = breakerAbility ? (breakerAbility as any)["heap-breaker-break"] : null;

  const ciStrength = getStrength(currentIce);
  const cardStrength = getStrength(card);
  const strengthDiff =
    ciStrength != null && cardStrength != null ? Math.max(0, ciStrength - cardStrength) : null;
  const subroutines: any[] = (currentIce as any).subroutines ?? [];
  const unbrokenSubs = subroutines.filter((s) => !s.broken).length;
  const xNumber =
    strengthDiff != null && unbrokenSubs != null ? Math.max(strengthDiff, unbrokenSubs) : null;
  const xBreaker = pumpStrengthAtOnce === "x";

  const pumpsNeeded =
    strengthDiff != null && pumpStrengthAtOnce != null
      ? xBreaker ? 1 : Math.ceil(strengthDiff / pumpStrengthAtOnce)
      : null;
  const breaksNeeded =
    unbrokenSubs != null && subsBrokenAtOnce != null
      ? xBreaker ? 1 : Math.ceil(unbrokenSubs / subsBrokenAtOnce)
      : null;
  const abilityUsesNeeded =
    pumpsNeeded != null && breaksNeeded != null
      ? xBreaker
        ? 1
        : pumpsNeeded + breaksNeeded + (pumpsNeeded > 0 ? -1 : 0)
      : null;

  const totalCost: CostData[] | null =
    breakerAbility && abilityUsesNeeded != null
      ? xBreaker
        ? [c("credit", xNumber as number)]
        : new Array(abilityUsesNeeded).fill((breakerAbility as any).cost).flat()
      : null;

  if (!breakerAbility || !canPay(state, side, eid, card, card.title ?? "", totalCost)) return;

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        if (xBreaker) {
          pump(s, side, getCard(s, card), xNumber as number);
        } else {
          pump(s, side, getCard(s, card), pumpStrengthAtOnce * (abilityUsesNeeded as number));
        }
        const paymentStr = (binds.asyncResult as any)?.msg as string;
        const subGroupsToBreak: any[][] =
          typeof subsBrokenAtOnce === "number" && subsBrokenAtOnce > 0
            ? partition(subsBrokenAtOnce, subroutines.filter((x) => !x.broken))
            : [subroutines.filter((x) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              systemMsg(
                s2, side,
                `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all subroutines on ${(currentIce as any).title}`,
              );
              continueRun(s2, side, null as any);
            },
          ],
          [
            resolveAbility, s, side,
            playHeapBreakerAutoPumpAndBreakImpl(s, side, subGroupsToBreak, currentIce),
            card, null,
          ],
          { eid },
        );
      },
    ],
    [pay, state, side, makeEIDFrom(state, eid), card, totalCost],
    { eid },
  );
}

/** Mirrors `play-auto-pump-and-break-impl` (returns ability map). */
function playAutoPumpAndBreakImpl(
  state: GameState,
  side: string,
  paymentEid: EID,
  subGroupsToBreak: any[][],
  currentIce: Card,
  breakAbility: Ability,
): Ability {
  return {
    async: true,
    effect: function (s, _side, eid, card, _targets) {
      const subsToBreak = subGroupsToBreak[0];
      const rest = subGroupsToBreak.slice(1);
      for (const sub of subsToBreak) {
        breakSubroutine(s, getCard(s, currentIce), sub, card);
      }
      const ice = getCard(s, currentIce);
      const onBreakSubs = ice ? (cardDef(currentIce) as any)["on-break-subs"] : null;
      const eventArgs = onBreakSubs
        ? { "card-abilities": abilityAsHandler(ice as Card, onBreakSubs) }
        : null;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: any) {
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s3: GameState, _e3: EID, _b3: any) {
                  if (rest.length === 0) {
                    effectCompleted(s3, side, eid);
                  } else {
                    continue_ability(
                      s3, side,
                      playAutoPumpAndBreakImpl(
                        s3, side, paymentEid, rest, currentIce, breakAbility,
                      ),
                      card, null as any,
                    );
                  }
                },
              ],
              [
                triggerEventSimult, s2, side, "subroutines-broken", eventArgs,
                breakSubsEventContext(s2, ice as Card, subsToBreak, card),
              ],
              { eid },
            );
          },
        ],
        [
          resolveAbility, s, side,
          { ...((breakAbility as any)["additional-ability"]), eid: makeEIDFrom(s, paymentEid) } as Ability,
          getCard(s, card), null,
        ],
        { eid },
      );
    },
  } as any;
}

/** Returns successive subsequences of size n. Mirrors `(partition n n nil coll)`. */
function partition<T>(n: number, coll: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < coll.length; i += n) out.push(coll.slice(i, i + n));
  return out;
}

/** Mirrors `play-auto-pump-and-break`. */
export function playAutoPumpAndBreak(
  state: GameState, side: string, args: { card: Card },
): void {
  const baseCard = getCard(state, args.card);
  if (!baseCard) return;
  const baseAbilities: Ability[] = ((cardDef(baseCard) as any).abilities ?? []) as Ability[];
  if (baseAbilities.some((a) => (a as any)["heap-breaker-break"])) {
    playHeapBreakerAutoPumpAndBreak(state, side, args);
    return;
  }

  const card = baseCard;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);
  if (!currentIce) return;

  // Pump
  const canPump = (ability: Ability): boolean => {
    if (!(ability as any).pump) return false;
    return ((ability as any).req as Function)(state, side, eid, card, null);
  };
  const pumpCandidates = baseAbilities
    .filter((a) => !(a as any)["auto-pump-ignore"])
    .flatMap((a) => {
      if (!canPump(a)) return [];
      return [[a, cardAbilityCost(state, side, a, card, currentIce)] as [Ability, CostData[]]];
    });
  let pumpAbility: Ability | undefined;
  let pumpCost: CostData[] | undefined;
  if (pumpCandidates.length > 0) {
    pumpCandidates.sort(
      (a: any, b: any) =>
        ((a[0] as any)["auto-pump-sort"] ?? 0) - ((b[0] as any)["auto-pump-sort"] ?? 0),
    );
    const best = pumpCandidates.reduce((acc: any, cur: any) =>
      sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
    );
    pumpAbility = best[0];
    pumpCost = best[1];
  }
  const pumpStrength = pumpAbility ? getPumpStrength(state, side, pumpAbility, card) : 0;
  const ciStrength = getStrength(currentIce);
  const cardStrength = getStrength(card);
  const strengthDiff =
    ciStrength != null && cardStrength != null ? Math.max(0, ciStrength - cardStrength) : null;
  const timesPump =
    strengthDiff != null && pumpStrength > 0 ? Math.ceil(strengthDiff / pumpStrength) : 0;
  const totalPumpCost: CostData[] | null =
    pumpAbility && timesPump > 0 ? new Array(timesPump).fill(pumpCost).flat() : null;

  // Break
  const canBreak = (ability: Ability): boolean => {
    if (!(ability as any)["break-req"]) return false;
    if (anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [ability as any])) {
      return false;
    }
    return ((ability as any)["break-req"] as Function)(state, side, eid, card, null);
  };
  const breakCandidates = baseAbilities.flatMap((a) => {
    if (!canBreak(a)) return [];
    return [[a, breakSubAbilityCost(state, side, a, card, currentIce)] as [Ability, CostData[]]];
  });
  let breakAbility: Ability | undefined;
  let breakCost: CostData[] | undefined;
  if (breakCandidates.length > 0) {
    breakCandidates.sort(
      (a: any, b: any) =>
        ((a[0] as any)["auto-break-sort"] ?? 0) - ((b[0] as any)["auto-break-sort"] ?? 0),
    );
    const best = breakCandidates.reduce((acc: any, cur: any) =>
      sumCostAmount(cur[1]) < sumCostAmount(acc[1]) ? cur : acc,
    );
    breakAbility = best[0];
    breakCost = best[1];
  }
  const onceKey = breakAbility ? (breakAbility as any).once : undefined;
  const subsBrokenAtOnce = breakAbility ? ((breakAbility as any).break ?? 1) : null;
  const subroutines: any[] = (currentIce as any).subroutines ?? [];
  const unbrokenSubsCount =
    subroutines.length > 0 ? subroutines.filter((s) => !s.broken).length : null;
  const someAlreadyBroken = unbrokenSubsCount !== subroutines.length;
  const timesBreak =
    unbrokenSubsCount != null && subsBrokenAtOnce != null
      ? subsBrokenAtOnce > 0
        ? Math.ceil(unbrokenSubsCount / subsBrokenAtOnce)
        : 1
      : null;
  const adjustedBreakCost = substituteXCreditCosts(
    breakCost as any,
    unbrokenSubsCount as any,
    breakAbility ? (breakAbility as any)["auto-break-creds-per-sub"] : null,
  );
  const totalBreakCost: CostData[] | null =
    adjustedBreakCost && timesBreak != null
      ? new Array(timesBreak).fill(adjustedBreakCost).flat()
      : null;
  const totalCost = mergeCosts([
    ...(totalPumpCost ?? []), ...(totalBreakCost ?? []),
  ] as any);

  if (!breakAbility || !canPay(state, side, eid, card, card.title ?? "", totalCost)) {
    return;
  }

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        for (let i = 0; i < timesPump; i++) {
          const ab = { ...(pumpAbility as Ability) };
          delete (ab as any).cost;
          delete (ab as any).msg;
          resolveAbility(s, side, ab, getCard(s, card), null as any);
        }
        const paymentEid = binds.asyncResult as EID;
        const paymentStr = (paymentEid as any)?.msg as string;
        const subGroupsToBreak: any[][] =
          (subsBrokenAtOnce as number) > 0
            ? partition(
                subsBrokenAtOnce as number,
                subroutines.filter((x) => !x.broken),
              )
            : [subroutines.filter((x) => !x.broken)];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              if (timesPump > 0) {
                systemMsg(
                  s2, side,
                  `${buildSpendMsg(paymentStr, "increase")}the strength of ${card.title} to ${getStrength(getCard(s2, card))} and break all ${(unbrokenSubsCount as number) > 1 ? unbrokenSubsCount : ""} subroutines on ${(currentIce as any).title}`,
                );
              } else {
                systemMsg(
                  s2, side,
                  `${buildSpendMsg(paymentStr, "use")}${card.title} to break ${someAlreadyBroken ? "the remaining " : "all "}${unbrokenSubsCount} subroutines on ${(currentIce as any).title}`,
                );
              }
              if (onceKey) registerOnce(s2, side, { once: onceKey } as any, card);
              continueRun(s2, side, null as any);
            },
          ],
          [
            resolveAbility, s, side,
            playAutoPumpAndBreakImpl(
              s, side, paymentEid, subGroupsToBreak, currentIce, breakAbility as Ability,
            ),
            card, null,
          ],
          { eid },
        );
      },
    ],
    [pay, state, side, makeEIDFrom(state, eid), card, totalCost],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Dynamic abilities
// ---------------------------------------------------------------------------

const dynamicAbilities: Record<
  string,
  (state: GameState, side: string, args: any) => void
> = {
  "auto-pump": playAutoPump,
  "auto-pump-and-break": playAutoPumpAndBreak,
};

/** Mirrors `play-dynamic-ability`. */
export function playDynamicAbility(
  state: GameState,
  side: string,
  args: { dynamic: string } & Record<string, unknown>,
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const fn = dynamicAbilities[args.dynamic];
    if (fn) fn(state, toKeyword(side), args);
  } else {
    toast(state, side, "You cannot play abilities while other abilities are resolving.", "warning");
  }
}

// ---------------------------------------------------------------------------
// corp/runner card cross-side abilities
// ---------------------------------------------------------------------------

/** Mirrors `play-corp-ability`. */
export function playCorpAbility(
  state: GameState, side: string, args: { card: Card; ability: number },
): void;
export function playCorpAbility(
  state: GameState, side: string, eid: EID | null, args: { card: Card; ability: number },
): void;
export function playCorpAbility(
  state: GameState,
  side: string,
  eidOrArgs: EID | null | { card: Card; ability: number },
  maybeArgs?: { card: Card; ability: number },
): void {
  const eid = (maybeArgs ? eidOrArgs : null) as EID | null;
  const args = (maybeArgs ?? eidOrArgs) as { card: Card; ability: number };
  const card = getCard(state, args.card);
  if (!card) return;
  const cdef = cardDef(card) as any;
  const abilityIdx = args.ability;
  const ability = (cdef.corpAbilities ?? cdef["corp-abilities"] ?? [])[abilityIdx] as Ability;
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as any, abilityIdx as any,
    ]);
  if (cannotPlay) return;
  doPlayAbility(state, side, eid, {
    ability,
    card,
    abilityIdx,
    targets: null,
  });
}

/** Mirrors `play-runner-ability`. */
export function playRunnerAbility(
  state: GameState, side: string, args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playRunnerAbility(
  state: GameState, side: string, eid: EID | null, args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playRunnerAbility(
  state: GameState,
  side: string,
  eidOrArgs: EID | null | { card: Card; ability: number; targets?: unknown[] },
  maybeArgs?: { card: Card; ability: number; targets?: unknown[] },
): void {
  const eid = (maybeArgs ? eidOrArgs : null) as EID | null;
  const args = (maybeArgs ?? eidOrArgs) as { card: Card; ability: number; targets?: unknown[] };
  const card = getCard(state, args.card);
  if (!card) return;
  const cdef = cardDef(card) as any;
  const abilityIdx = args.ability;
  const ability = (cdef.runnerAbilities ?? cdef["runner-abilities"] ?? [])[abilityIdx] as Ability;
  const cannotPlay =
    card.disabled === true ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as any, abilityIdx as any,
    ]);
  if (cannotPlay) return;
  doPlayAbility(state, side, eid, {
    card,
    ability,
    abilityIdx,
    targets: args.targets ?? null,
  });
}

// ---------------------------------------------------------------------------
// Subroutines
// ---------------------------------------------------------------------------

/** Mirrors `play-subroutine`. */
export function playSubroutine(
  state: GameState, side: string, args: { card: Card; subroutine: number },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    const sub = card ? (card.subroutines ?? [])[args.subroutine] ?? null : null;
    if (card) resolveSubroutine(state, side, card, sub);
  } else {
    toast(state, side, "You cannot fire subroutines while abilities are being resolved.", "warning");
  }
}

/** Mirrors `play-unbroken-subroutines`. */
export function playUnbrokenSubroutines(
  state: GameState, side: string, args: { card: Card },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    if (card) resolveUnbrokenSubs(state, side, card);
  } else {
    toast(state, side, "You cannot fire subroutines while abilities are being resolved.", "warning");
  }
}

// ---------------------------------------------------------------------------
// Corp actions
// ---------------------------------------------------------------------------

/** Click to trash a resource. Mirrors `trash-resource`. */
export function trashResource(state: GameState, side: string, _: unknown): void {
  const basic = state.corp.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 5 });
}

/** Purge viruses. Mirrors `do-purge`. */
export function doPurge(state: GameState, side: string, _: unknown): void {
  const basic = state.corp.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 6 });
}

/** Click to advance an installed card. Mirrors `click-advance`. */
export function clickAdvance(
  state: GameState, side: string, ctx: { card: Card } & Record<string, unknown>,
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  const context = { ...ctx, card };
  if (canAdvance(state, side, card)) {
    const basic = state.corp.basicActionCard;
    if (!basic) return;
    playAbility(state, side, { card: basic, ability: 4, targets: [context] });
  } else {
    toast(state, CORP_SIDE, "Cannot advance cards this turn.", "warning");
  }
}

// ---------------------------------------------------------------------------
// Runner actions
// ---------------------------------------------------------------------------

/** Click to start a run. Mirrors `click-run`. */
export function clickRun(state: GameState, side: string, ctx: unknown): void {
  const basic = state.runner.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 4, targets: [ctx] });
}

/** Click to remove a tag. Mirrors `remove-tag`. */
export function removeTag(state: GameState, side: string, _: unknown): void {
  const basic = state.runner.basicActionCard;
  if (!basic) return;
  playAbility(state, side, { card: basic, ability: 5 });
}

/** View deck. Mirrors `view-deck`. */
export function viewDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "looks at [their] deck");
  (side_(state, side) as any).viewDeck = true;
}

/** Close deck view. Mirrors `close-deck`. */
export function closeDeck(state: GameState, side: string, _: unknown): void {
  systemMsg(state, side, "stops looking at [their] deck");
  delete (side_(state, side) as any).viewDeck;
}

// ---------------------------------------------------------------------------
// Install / runnable lists
// ---------------------------------------------------------------------------

/** Mirrors `generate-install-list`. */
export function generateInstallList(
  state: GameState, _side: unknown, args: { card: Card | null },
): void {
  const card = args.card ? getCard(state, args.card) : null;
  if (card) {
    if (expendable(state, card)) {
      (state.corp as any).installList = [...installableServers(state, card), "Expend"];
    } else {
      (state.corp as any).installList = installableServers(state, card);
    }
  } else {
    delete (state.corp as any).installList;
  }
}

/** Mirrors `generate-runnable-zones`. */
export function generateRunnableZones(
  state: GameState, _side: unknown, _args: unknown,
): void {
  (state.runner as any).runnableList = zonesToSortedNames(getRunnableZones(state));
}

// ---------------------------------------------------------------------------
// Advance / score
// ---------------------------------------------------------------------------

/**
 * Advance a corp card that can be advanced. If no-cost is truthy, advances
 * for free (used by the card Success). Mirrors `advance`.
 */
export function advance(state: GameState, side: string, args: { card: Card }): void;
export function advance(state: GameState, side: string, card: Card, noCost: boolean): void;
export function advance(
  state: GameState, side: string, eid: EID, card: Card, noCost: boolean,
): void;
export function advance(
  state: GameState,
  side: string,
  a: { card: Card } | EID | Card,
  b?: Card | boolean,
  c2?: boolean,
): void {
  let eid: EID;
  let card: Card | null;
  let noCost: boolean | undefined;
  if (b === undefined) {
    eid = makeEID(state);
    card = getCard(state, (a as { card: Card }).card);
    noCost = false;
  } else if (c2 === undefined) {
    eid = makeEID(state);
    card = getCard(state, a as Card);
    noCost = b as boolean;
  } else {
    eid = a as EID;
    card = getCard(state, b as Card);
    noCost = c2;
  }
  if (!card) {
    effectCompleted(state, side, eid);
    return;
  }
  (eid as any).sourceType = "advance";

  if (canAdvance(state, side, card)) {
    const payEid = makeEIDFrom(state, eid);
    (payEid as any).action = "corp-advance";
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: any) {
          const paymentStr = (binds.asyncResult as any)?.msg as string;
          if (paymentStr) {
            systemMsg(
              s, side,
              `${buildSpendMsg(paymentStr, "advance")}${cardStr(s, card)}`,
            );
            updateAdvancementRequirement(s, card as Card);
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b2: any) {
                  playSfx(s2, side, "click-advance");
                  effectCompleted(s2, side, eid);
                },
              ],
              [addProp, s, side, getCard(s, card as Card), "advance-counter", 1],
              { eid },
            );
          } else {
            effectCompleted(s, side, eid);
          }
        },
      ],
      [
        pay, state, side, payEid, card,
        c("click", noCost ? 0 : 1), c("credit", noCost ? 0 : 1),
      ],
      { eid },
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

/** Mirrors `resolve-score`. */
export function resolveScore(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  args: { advancementTokens?: number; advancementRequirement?: number; "advancement-tokens"?: number; "advancement-requirement"?: number },
): void {
  const advancementTokens = args.advancementTokens ?? args["advancement-tokens"];
  const advancementRequirement = args.advancementRequirement ?? args["advancement-requirement"];

  const moved = move(state, CORP_SIDE, card, "scored") as unknown as Card;
  const initialised = cardInit(state, CORP_SIDE, moved, {
    "resolve-effect": false, "init-data": true,
  } as any) as unknown as Card;
  updateAllAdvancementRequirements(state);
  updateAllAgendaPoints(state);
  const c2 = getCard(state, initialised) as Card;
  const points = getAgendaPoints(c2);

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        systemMsg(s, CORP_SIDE, `scores ${c2.title} and gains ${quantify(points, "agenda point")}`);
        implementationMsg(s, card);
        setProp(s, CORP_SIDE, getCard(s, c2), "advance-counter", 0);
        const reg = (s.corp.register ?? {}) as any;
        reg["scored-agenda"] = (reg["scored-agenda"] ?? 0) + points;
        s.corp.register = reg;
        playSfx(s, side, "agenda-score");
        const onScore = (cardDef(c2) as any)["on-score"] ?? (cardDef(c2) as any).onScore;
        if (onScore) registerPendingEvent(s, "agenda-scored", c2, onScore);
        queueEvent(s, "agenda-scored", {
          card: c2,
          "scored-card": card,
          "advancement-requirement": advancementRequirement,
          "advancement-tokens": advancementTokens,
          points,
        } as any);
        checkpoint(s, null, eid, { duration: "agenda-scored" } as any);
      },
    ],
    [
      triggerEventSimult, state, side, "pre-agenda-scored", null,
      {
        card: c2,
        "scored-card": card,
        "advancement-requirement": advancementRequirement,
        "advancement-tokens": advancementTokens,
        points,
      },
    ],
    { eid },
  );
}

/** Score an agenda. Mirrors `score`. */
export function score(state: GameState, side: string, eid: EID, card: Card): void;
export function score(
  state: GameState, side: string, eid: EID, card: Card,
  opts: { noReq?: boolean; ignoreTurn?: boolean; ignoreAdv?: boolean } | null,
): void;
export function score(
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
  opts?: { noReq?: boolean; ignoreTurn?: boolean; ignoreAdv?: boolean } | null,
): void {
  const noReq = opts?.noReq ?? false;
  const ignoreTurn = opts?.ignoreTurn ?? false;
  const ignoreAdv = opts?.ignoreAdv ?? false;

  if (!canScore(state, side, card, { noReq, ignoreTurn, ignoreAdv } as any)) {
    effectCompleted(state, side, eid);
    return;
  }

  const cost = scoreAdditionalCostBonus(state, side, card);
  const advCost = noReq || ignoreAdv ? 0 : (getAdvancementRequirement(card) ?? 0);
  const advTokens = getCounters(card, "advancement");
  const costStrs = buildCostString(cost);
  const additionalEid = makeEIDFrom(state, { ...eid, additionalCosts: cost } as any);
  const canPayResult = canPay(state, side, additionalEid, card, card.title ?? "", cost);

  if (!costStrs || costStrs.trim() === "") {
    resolveScore(state, side, eid, card, {
      advancementRequirement: advCost,
      advancementTokens: advTokens,
    });
    return;
  }
  if (!canPayResult) {
    effectCompleted(state, side, eid);
    return;
  }

  const payEid = makeEIDFrom(state, eid);
  (payEid as any).additionalCosts = cost;
  (payEid as any).source = card;
  (payEid as any).sourceType = "corp-score";
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        const paymentResult = binds.asyncResult as any;
        const msg = paymentResult?.msg as string;
        if (!msg || msg.trim() === "") {
          effectCompleted(s, side, eid);
        } else {
          systemMsg(s, side, `${msg} to score ${card.title}`);
          resolveScore(s, side, eid, card, {
            advancementRequirement: advCost,
            advancementTokens: advTokens,
          });
        }
      },
    ],
    [pay, state, side, payEid, card, cost],
    { eid },
  );
}
