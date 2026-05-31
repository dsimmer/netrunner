// Player-initiated actions: ability play, card movement, advance, score, etc.
// Mirrors: src/clj/game/core/actions.clj

import type { GameState, Prompt, ChoicesMap, Corp, Runner } from "./state";
import { CORP_SIDE, RUNNER_SIDE, getPlayer, getSidePrompt } from "./state";
import type { Card } from "./card";
import {
  getAdvancementRequirement,
  getAgendaPoints,
  getCounters,
} from "./card";
import { getCard } from "./finding";
import type { EID } from "./eid";
import { makeEID, makeEIDFrom, effectCompleted } from "./eid";
import type { Ability } from "./types";
import type { CostData } from "./payment";
import type { RuntimeSubroutine } from "./ice";
import {
  updateAdvancementRequirement,
  updateAllAdvancementRequirements,
  updateAllAgendaPoints,
} from "./agendas";
import { badPublicityAvailable } from "./bad_publicity";
import { installableServers } from "./board";
import { cardDef } from "./card_defs";
import {
  breakSubAbilityCost,
  cardAbilityCost,
  scoreAdditionalCostBonus,
} from "./cost_fns";
import { anyEffects, isDisabledReg } from "./effects";
import {
  abilityAsHandler,
  checkpoint,
  registerOnce,
  registerPendingEvent,
  pay,
  queueEvent,
  resolveAbility,
  triggerEventSimult,
} from "./engine";
import { canAdvance, canScore } from "./flags";
import {
  breakSubroutine,
  getCurrentIce,
  getPumpStrength,
  getStrength,
  pump,
  resolveSubroutine,
  resolveUnbrokenSubsEx as resolveUnbrokenSubs,
  substituteXCreditCosts,
} from "./ice";
const breakSubsEventContext: (...args: unknown[]) => undefined = (..._a: unknown[]) => undefined;
import { cardInit } from "./initializing";
import { move, trash } from "./moving";
import { buildSpendMsg, canPay, mergeCosts, buildCostString } from "./payment";
import { playInstant } from "./play_instants";
import { expend, expendable } from "./expend";
import { removeFromPromptQueue } from "./prompt_state";
import {
  resolveSelect,
  firstPromptByEid,
  firstSelectionByEid,
} from "./prompts";
import { addCounter, addProp, setProp } from "./props";
import { runContinue as continueRun, getRunnableZones } from "./runs";
import { playSfx, systemMsg, implementationMsg, nLastLogs } from "./say";
import { nameZone, zonesToSortedNames } from "./servers";
import { cardStr } from "./to_string";
import { toast } from "./toasts";
import { update } from "./update";
import { continue_ability, req, wait_for } from "../macros";
import {
  dissocIn,
  quantify,
  removeOnce,
  sameCard,
  sameSide,
  serverCards,
  toKeyword,
} from "../utils";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors `(->c :type amount)` from payment.clj. */
export function c(type: string, amount: number): CostData {
  return { type, amount };
}

/** Allocates an EID with `:source card :source-type :ability`. */
export function makeAbilityEID(state: GameState, card: Card | null): EID {
  const eid = makeEID(state);
  eid.source = card;
  eid.sourceType = "ability";
  return eid;
}

/** Returns the side player object (typed loose for ad-hoc fields). */
export function side_(state: GameState, side: string): Corp | Runner {
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
function sideSelected(state: GameState, side: string): unknown[] {
  const p = side_(state, side) as (Corp | Runner) & { selected?: unknown[] };
  if (!p.selected) p.selected = [];
  return p.selected;
}

// ---------------------------------------------------------------------------
// History bookkeeping
// ---------------------------------------------------------------------------

/** Returns the state without history-related keys. Mirrors `without-history`. */
function withoutHistory(state: GameState): Record<string, unknown> {
  const { log, history, clickStates, turnState, paidAbilityState, ...rest } =
    state as GameState & Record<string, unknown>;
  return rest;
}

/** Mirrors `update-click-state`. */
function updateClickState(state: GameState, ability: Ability): void {
  if (!(ability as Ability & Record<string, unknown>).action) return;
  const snapshot = withoutHistory(state);
  const prev = (state.clickStates ?? []) as unknown[];
  state.clickStates = [...prev, snapshot].slice(-4);
}

/** Mirrors `update-paid-ability-state`. */
function updatePaidAbilityState(state: GameState, ability: Ability): void {
  if ((ability as Ability & Record<string, unknown>).action) {
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
export function noBlockingOrPreventPrompt(
  state: GameState,
  side: string,
): boolean {
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
export function doPlayAbility(
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
        const costs = cardAbilityCost(
          state,
          side,
          args.ability,
          card,
          (targets ?? []) as Card[],
        );
        return costs && costs.length > 0 ? costs : null;
      })();
  const ability: Ability = {
    ...args.ability,
    cost: cost ?? undefined,
  } as Ability;

  if (
    cost == null ||
    canPay(state, side, useEid, card, card.title ?? "", cost)
  ) {
    updateHistory(state, ability);
    if ((ability as Ability & Record<string, unknown>).action) {
      const strippedCard = {
        cid: card.cid,
        type: card.type,
        title: card.title,
      };
      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: unknown) {
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b2: unknown) {
                  triggerEventSimult(
                    s2,
                    side,
                    useEid,
                    "action-resolved",
                    {},
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
          triggerEventSimult,
          state,
          side,
          "action-played",
          null,
          { "ability-idx": abilityIdx, card: strippedCard },
        ],
        { eid: useEid },
      );
    } else {
      // resolve-ability uses eid embedded in ability
      const abilityWithEid: Ability = { ...ability, eid: useEid };
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
  state: GameState,
  side: string,
  args: { card: Card; ability: number; targets?: unknown[] },
): void;
export function playAbility(
  state: GameState,
  side: string,
  eid: EID | null,
  args: { card: Card; ability: number; targets?: unknown[] },
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
    ((ability as Ability & Record<string, unknown>).action && state.run != null) ||
    blockingPrompt ||
    cardSide !== side ||
    anyEffects(state, side, "prevent-paid-ability", (v) => v === true, card, [
      ability as unknown as Card,
      abilityIdx as unknown as Card,
    ]) ||
    isDisabledReg(state, card) != null;

  if (blockingPrompt) {
    toast(
      state,
      side,
      "You cannot play abilities while other abilities are resolving.",
      "warning",
    );
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
  state: GameState,
  side: string,
  args: { card: Card },
): void {
  if (noBlockingOrPreventPrompt(state, side)) {
    const card = getCard(state, args.card);
    if (!card) return;
    const eid = makeAbilityEID(state, card);
    const expendAb = expend((cardDef(card) as Record<string, unknown>).expend as Ability | undefined);
    doPlayAbility(state, side, eid, {
      card,
      ability: expendAb,
      abilityIdx: 0,
      targets: null,
    });
  } else {
    toast(
      state,
      side,
      "You cannot play abilities while other abilities are resolving.",
      "warning",
    );
  }
}

/** Called when the player clicks a flashback card from hand. Mirrors `flashback`. */
export function flashback(
  state: GameState,
  side: string,
  ctx: { card: Card },
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  const flashbackCost = (cardDef(card) as Record<string, unknown>).flashback;
  const eid = makeAbilityEID(state, card);
  const cardWithFlag: Card = {
    ...card,
    "rfg-instead-of-trashing": true,
  };
  const ability: Ability = {
    async: true,
    effect: function (
      state2: GameState,
      side2: string,
      eid2: EID,
      _card: Card | null,
      _targets: unknown[],
    ) {
      playInstant(
        state2,
        side2,
        eid2,
        { ...cardWithFlag, "rfg-instead-of-trashing": true },
        { "base-cost": flashbackCost, "as-flashback": true } as unknown as Parameters<typeof playInstant>[4],
      );
    },
  };
  (ability as Ability & Record<string, unknown>).action = true;
  doPlayAbility(state, side, eid, {
    card: cardWithFlag,
    ability,
    abilityIdx: 0,
    targets: [],
  });
}

/** Called when the player clicks a card from hand. Mirrors `play`. */
export function play(
  state: GameState,
  side: string,
  ctx: { card: Card } & Record<string, unknown>,
): void {
  const card = getCard(state, ctx.card);
  if (!card) return;
  if (getPromptType(state, side) != null) return;
  if (side === CORP_SIDE && state.corpPhase12) return;
  if (side === RUNNER_SIDE && state.runnerPhase12) return;

  const context = { ...ctx, card };
  const t = card.type;
  const sidePlayer = side_(state, side);
  const basic = sidePlayer.basicActionCard;
  if (!basic) return;
  if (t === "Event" || t === "Operation") {
    playAbility(state, side, { card: basic, ability: 3, targets: [context] });
  } else if (
    t === "Hardware" ||
    t === "Resource" ||
    t === "Program" ||
    t === "ICE" ||
    t === "Upgrade" ||
    t === "Asset" ||
    t === "Agenda"
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
  state: GameState,
  side: string,
  args: { card: Card; server: string },
): void {
  const { card, server } = args;
  const cur = getCard(state, card);
  if (!cur) return;
  const zone = cur.zone ?? [];
  const lastZone = zone[zone.length - 1];
  const src = nameZone(cur.side ?? "", zone);
  const fromStr = cardStr(state, cur);
  const s: string =
    server === "HQ" || server === "R&D" || server === "Archives"
      ? CORP_SIDE
      : RUNNER_SIDE;

  if (
    src === server ||
    !sameSide(s, card.side) ||
    getPromptType(state, side) === "select" ||
    !(lastZone === "play-area" || sameSide(side, card.side))
  ) {
    return;
  }

  const moveCardTo = (
    zoneTo: string,
    opts?: Record<string, unknown>,
  ): unknown => move(state, s, cur, zoneTo, opts);

  const cardPrompts = sidePrompts(state, side).filter((p: Prompt) =>
    sameCard((x: Card) => x?.title, p.card as Card, cur as Card),
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
  state: GameState,
  side: string,
  eid: EID,
  card: Card,
): void {
  systemMsg(state, side, `trashes ${cardStr(state, card)}`);
  trash(state, side, eid, card, { unpreventable: true });
}

// ---------------------------------------------------------------------------
// Prompt resolution helpers
// ---------------------------------------------------------------------------

function finishPrompt(
  state: GameState,
  side: string,
  prompt: Prompt | null,
  card: Card | null,
): boolean {
  const p = prompt as Prompt & Record<string, unknown>;
  const endEffect = (p?.endEffect ?? p?.["end-effect"]) as
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: unknown,
      ) => void)
    | undefined;
  if (endEffect) {
    endEffect(state, side, makeEID(state), card, null);
  }
  return true;
}

function promptError(
  context: string,
  prompt: unknown,
  promptArgs: unknown,
): void {
  // Mirrors the timbre/error call.
  console.error(
    new Error(
      `Error ${context}\nPrompt: ${JSON.stringify(prompt)}\nPrompt args: ${JSON.stringify(promptArgs)}`,
    ),
  );
}

function maybePay(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  choices: Prompt["choices"],
  choice: number,
): void {
  if (choices === "credit") {
    const credit = getPlayer(state, side).credit ?? 0;
    pay(state, side, eid, card, [c("credit", Math.min(choice, credit))]);
  } else {
    effectCompleted(state, side, eid);
  }
}

/** Mirrors `resolve-bad-pub-choice`. */
export function resolveBadPubChoice(
  state: GameState,
  side: string,
  args: {
    eid: EID;
    shiftKeyHeld?: boolean;
    "shift-key-held"?: boolean;
  } & Record<string, unknown>,
): void {
  const eid = args.eid;
  const shiftKeyHeld = args.shiftKeyHeld ?? args["shift-key-held"];
  if (badPublicityAvailable(state, side) > 0) {
    const prompt =
      firstPromptByEid(state, side, eid) ?? sidePrompts(state, side)[0] ?? null;
    if (!prompt) {
      toast(
        state,
        side,
        "You cannot choose Bad Publicity for this effect.",
        "warning",
      );
      return;
    }
    const card = (prompt as Prompt & Record<string, unknown>).card as Card | null;
    const effect = (prompt as Prompt & Record<string, unknown>).effect as
      | ((arg: unknown) => void)
      | undefined;
    (side_(state, side) as Corp & Runner & Record<string, unknown>).shiftKeySelect = shiftKeyHeld;
    if ((prompt as Prompt & Record<string, unknown>)["offer-bad-pub?"] || (prompt as Prompt & Record<string, unknown>).offerBadPub) {
      removeFromPromptQueue(state, side, prompt);
      if (effect) effect("bad-publicity");
      finishPrompt(state, side, prompt, card);
    } else {
      toast(
        state,
        side,
        "You cannot choose Bad Publicity for this effect.",
        "warning",
      );
    }
  } else {
    toast(
      state,
      side,
      "You cannot choose Bad Publicity for this effect.",
      "warning",
    );
  }
}

/**
 * Resolves a prompt by invoking its effect function with the selected target.
 * Mirrors `resolve-prompt`. Note: resolve-prompt does some evil things with
 * eids, matching the Clojure note from nbk 2025.
 */
export function resolvePrompt(
  state: GameState,
  side: string,
  args: { choice: unknown; eid: EID } & Record<string, unknown>,
): void {
  const { choice, eid } = args;
  const prompt =
    firstPromptByEid(state, side, eid) ?? sidePrompts(state, side)[0] ?? null;
  if (!prompt) return;
  const effect = (prompt as Prompt & Record<string, unknown>).effect as ((arg: unknown) => void) | undefined;
  const card = getCard(state, (prompt as Prompt & Record<string, unknown>).card as Card | null);
  const choices = (prompt as Prompt & Record<string, unknown>).choices;
  const promptType =
    (prompt as Prompt & Record<string, unknown>).promptType ?? (prompt as Prompt & Record<string, unknown>)["prompt-type"];

  const choicesMap =
    choices && typeof choices === "object" && !Array.isArray(choices)
      ? (choices as ChoicesMap)
      : null;

  // Integer prompt
  if (
    choices === "credit" ||
    promptType === "trace" ||
    (choicesMap && (choicesMap.counter || choicesMap.number))
  ) {
    if (typeof choice === "number") {
      removeFromPromptQueue(state, side, prompt);
      const newEid = makeEIDFrom(state, (prompt as Prompt & Record<string, unknown>).eid as EID);
      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, _b: unknown) {
            if (choicesMap && choicesMap.counter) {
              addCounter(
                s,
                side,
                makeEIDFrom(s, newEid),
                card,
                choicesMap.counter,
                -choice,
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
  if (choicesMap && choicesMap["card-title"]) {
    if (typeof choice === "string") {
      const titleFn = choicesMap["card-title"] as (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: Card[],
      ) => unknown;
      const found = serverCards().find(
        (sc) =>
          choice.toLowerCase() === ((sc.title as string) ?? "").toLowerCase(),
      );
      if (found) {
        if (titleFn(state, side, makeEID(state), card, [found as unknown as Card])) {
          removeFromPromptQueue(state, side, prompt);
          if (effect) effect(choice ?? card);
          finishPrompt(state, side, prompt, card);
        } else {
          toast(
            state,
            side,
            `You cannot choose ${choice} for this effect.`,
            "warning",
          );
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
  if (choice && typeof choice === "object" && (choice as Record<string, unknown>).uuid) {
    const uuid = (choice as Record<string, unknown>).uuid;
    const list: Record<string, unknown>[] = Array.isArray(choices) ? (choices as unknown as Record<string, unknown>[]) : [];
    const match = list.find((o) => o.uuid === uuid);
    if (match) {
      removeFromPromptQueue(state, side, prompt);
      if (match.value === "Cancel") {
        const cancel = (prompt as Prompt & Record<string, unknown>).cancel as
          | ((arg: unknown) => void)
          | undefined;
        if (cancel) {
          cancel(choice);
        } else if ((prompt as Prompt & Record<string, unknown>).eid) {
          effectCompleted(state, side, (prompt as Prompt & Record<string, unknown>).eid as EID);
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
type Selection = {
  ability?: { eid?: { id?: unknown; eid?: unknown } };
  cards?: Card[];
} & Record<string, unknown>;

function updateFirst(
  selection: Selection[],
  target: Card,
  eid: EID | null,
  c2: Card,
): Selection[] {
  return selection.map((sObj) => {
    const abEid = sObj?.ability?.eid?.id ?? sObj?.ability?.eid?.eid;
    if (eid && abEid === eid.id) {
      const cards: Card[] = sObj.cards ?? [];
      const newCards = (c2 as Card).selected
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
  args: {
    card: Card;
    eid: EID;
    shiftKeyHeld?: boolean;
    "shift-key-held"?: boolean;
  },
): void {
  const eid = args.eid;
  const shiftKeyHeld = args.shiftKeyHeld ?? args["shift-key-held"];
  const target = getCard(state, args.card);
  if (!target) return;
  const prompt =
    firstSelectionByEid(state, side, eid) ??
    sideSelected(state, side)[0] ??
    null;
  if (!prompt) return;
  const ability = (prompt as Prompt & Record<string, unknown>).ability as Ability | undefined;
  const promptCard =
    ability && (ability as Ability & Record<string, unknown>).card
      ? getCard(state, (ability as Ability & Record<string, unknown>).card)
      : null;
  const cardReq = (prompt as Prompt & Record<string, unknown>).req as Function | undefined;
  const cardCondition = (prompt as Prompt & Record<string, unknown>).card as
    | ((c: Card) => boolean)
    | undefined;
  const cid = (prompt as Prompt & Record<string, unknown>)["not-self"] ?? (prompt as Prompt & Record<string, unknown>).notSelf;

  (side_(state, side) as Corp & Runner & Record<string, unknown>).shiftKeySelect = shiftKeyHeld;

  const meets =
    target.cid !== cid &&
    (cardCondition
      ? cardCondition(target)
      : cardReq
        ? cardReq(state, side, (ability as Ability & Record<string, unknown>).eid, promptCard, [target])
        : true);
  if (!meets) return;

  const updated: Card = {
    ...target,
    selected: !((target as Card & { selected?: boolean })).selected,
  };
  update(state, side, updated);
  (side_(state, side) as Corp & Runner & Record<string, unknown>).selected = updateFirst(
    sideSelected(state, side) as Selection[],
    target,
    eid,
    updated,
  );

  const selected =
    firstSelectionByEid(state, side, eid) ??
    sideSelected(state, side)[0] ??
    null;
  const selectPrompt =
    firstPromptByEid(state, side, eid, "select") ??
    sidePrompts(state, side).find(
      (p) => (((p as Prompt & Record<string, unknown>)).promptType ?? ((p as Prompt & Record<string, unknown>))["prompt-type"]) === "select",
    ) ??
    null;

  const selectedCount = ((selected as { cards?: unknown[]; max?: number } | undefined))?.cards?.length ?? 0;
  const selMax = ((selected as { cards?: unknown[]; max?: number } | undefined))?.max ?? 1;
  if (selectedCount === selMax) {
    resolveSelect(
      state,
      side,
      eid,
      promptCard,
      selectPrompt ? { cancel: ((selectPrompt as Prompt & Record<string, unknown>)).cancel } : {},
      update,
      resolveAbility,
    );
  }
}

// ---------------------------------------------------------------------------
// auto-pump / auto-pump-and-break
// ---------------------------------------------------------------------------

/** Sums the credit amount of a cost list. */
export function sumCostAmount(costs: CostData[] | null | undefined): number {
  let total = 0;
  for (const cc of costs ?? []) total += cc.amount ?? 0;
  return total;
}

/** Mirrors `play-auto-pump`. */
export function playAutoPump(
  state: GameState,
  side: string,
  args: { card: Card },
): void {
  const card = getCard(state, args.card);
  if (!card) return;
  const eid = makeAbilityEID(state, card);
  const currentIce = getCurrentIce(state);

  const canPump = (ability: Ability): boolean => {
    if (!(ability as Ability & Record<string, unknown>).pump) return false;
    return ((ability as Ability & Record<string, unknown>).req as Function)(state, side, eid, card, null);
  };

  const abilities = ((cardDef(card) as Record<string, unknown>).abilities ?? []) as Ability[];
  const candidates: [Ability, CostData[]][] = abilities
    .filter((a) => !(a as Ability & Record<string, unknown>)["auto-pump-ignore"])
    .flatMap((a) => {
      if (!canPump(a)) return [];
      const cost = cardAbilityCost(state, side, a, card, [currentIce as Card]);
      return [[a, cost] as [Ability, CostData[]]];
    })
    .filter(([a]) => !(a as Ability & Record<string, unknown>)["auto-pump-ignore"]);

  if (candidates.length === 0) return;
  candidates.sort(
    (a, b) =>
      (((a[0] as Ability & Record<string, unknown>)["auto-pump-sort"] as number) ?? 0) -
      (((b[0] as Ability & Record<string, unknown>)["auto-pump-sort"] as number) ?? 0),
  );
  const best = candidates.reduce((acc, cur) =>
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
    pumpAbility && timesPump > 0
      ? new Array(timesPump).fill(pumpCost).flat()
      : null;

  if (canPay(state, side, eid, card, card.title ?? "", totalPumpCost)) {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: { asyncResult?: unknown }) {
          for (let i = 0; i < timesPump; i++) {
            const ab = { ...pumpAbility };
            delete (ab as Ability & Record<string, unknown>).cost;
            delete (ab as Ability & Record<string, unknown>).msg;
            resolveAbility(s, side, ab, getCard(s, card), null);
          }
          systemMsg(
            s,
            side,
            `${buildSpendMsg((binds.asyncResult as { msg?: string })?.msg, "increase")}the strength of ${card.title} to ${getStrength(getCard(s, card))}`,
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
export function playHeapBreakerAutoPumpAndBreakImpl(
  state: GameState,
  side: string,
  subGroupsToBreak: unknown[][],
  currentIce: Card,
): Ability {
  return {
    async: true,
    effect: function (
      s: GameState,
      _side: string,
      eid: EID,
      card: Card | null,
      _targets: unknown[],
    ) {
      const subsToBreak = subGroupsToBreak[0];
      const rest = subGroupsToBreak.slice(1);
      for (const sub of subsToBreak) {
        breakSubroutine(getCard(s, currentIce) as Card, sub as RuntimeSubroutine, card);
      }
      const ice = getCard(s, currentIce);
      const onBreakSubs = ice
        ? ((cardDef(currentIce) as Record<string, unknown>))["on-break-subs"]
        : null;
      const eventArgs = onBreakSubs
        ? { "card-abilities": abilityAsHandler(ice as Card, onBreakSubs) }
        : null;
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: unknown) {
            if (rest.length === 0) {
              effectCompleted(s2, side, eid);
            } else {
              continue_ability(
                s2,
                side,
                playHeapBreakerAutoPumpAndBreakImpl(s2, side, rest, currentIce),
                card,
                null,
              );
            }
          },
        ],
        [
          triggerEventSimult,
          s,
          side,
          "subroutines-broken",
          eventArgs,
          breakSubsEventContext(s, ice as Card, subsToBreak, card),
        ],
        { eid },
      );
    },
  };
}
