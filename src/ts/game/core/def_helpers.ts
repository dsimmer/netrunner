// Card definition helpers — common ability shapes shared across cards.
// Mirrors: src/clj/game/core/def_helpers.clj

import type { GameState } from "./state.js";
import type { Card } from "./card.js";
import type { EID } from "./eid.js";
import type { Ability } from "./types.js";
import {
  isCorp, isRunner, isInstalled, inHand, inDiscard,
  hasSubtype, getCounters, isOperation, getCard,
} from "./card.js";
import { accessBonus } from "./access.js";
import { allInstalled, getAllCards } from "./board.js";
import { chooseOneHelper } from "./choose_one.js";
import { damage } from "./damage.js";
import { draw } from "./drawing.js";
import {
  effectCompleted, makeEID, makeEIDFrom, makeResult, registerEIDCallback,
} from "./eid.js";
import {
  queueEvent, registerEvents, resolveAbility,
  triggerEvent, triggerEventSync, unregisterEventByUUID,
} from "./engine.js";
import { anyEffects, isDisabledReg } from "./effects.js";
import { gainCredits, loseCredits } from "./gaining.js";
import { corpInstall } from "./installing.js";
import { move, trash } from "./moving.js";
import { canPay } from "./payment.js";
import { asyncRfg } from "./play_instants.js";
import { cancellable, clearWaitPrompt } from "./prompts.js";
import { addCounter, addProp } from "./props.js";
import {
  concealHand, reveal, revealHand, revealLoud,
} from "./revealing.js";
import { canRunServer, makeRun, jackOut } from "./runs.js";
import { playSfx, systemMsg, systemSay } from "./say.js";
import { zoneToName, nameZone } from "./servers.js";
import { shuffleDeck, failToFind } from "./shuffling.js";
import { gainTags } from "./tags.js";
import { toast } from "./toasts.js";
import { cardStr } from "./to_string.js";
import {
  enumerateCards, removeOnce, sameCard, serverCard,
  toKeyword, quantify,
} from "../utils.js";
import { factionLabel, otherSide } from "../../jinteki/utils.js";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors Clojure (wait-for ...). */
function waitFor(
  state: GameState, parentEid: EID,
  start: (innerEid: EID) => void,
  next: (asyncResult: unknown, innerEid: EID) => void,
): void {
  const inner = makeEIDFrom(state, parentEid);
  registerEIDCallback(state, inner, (_s, _side, completed) => {
    next((completed as EID).result, completed as EID);
  });
  start(inner);
}

/** continue-ability shorthand — fresh resolve at current eid. */
function continueAbility(
  state: GameState, side: string, eid: EID, ability: any, card: Card | null, targets: any[],
): void {
  resolveAbility(state, side, { ...ability, eid } as Ability, card, targets);
}

// ---------------------------------------------------------------------------
// combine-abilities
// ---------------------------------------------------------------------------

export function combineAbilities(...abilities: any[]): any {
  if (abilities.length < 2) return abilities[0];
  const combined = abilities.slice(1).reduce((acc, ab) => {
    return {
      label: `${acc.label}. ${ab.label}`,
      async: true,
      effect: (state: GameState, side: string, eid: EID, card: Card | null, _targets: any[]) => {
        waitFor(
          state, eid,
          (inner) => resolveAbility(state, side, { ...acc, eid: inner }, card, []),
          () => continueAbility(state, side, eid, ab, card, []),
        );
      },
    };
  }, abilities[0]);
  return combined;
}

// ---------------------------------------------------------------------------
// corp-rez-toast
// ---------------------------------------------------------------------------

export const corpRezToast: any = {
  event: "runner-turn-ends",
  effect: (state: GameState) =>
    toast(state, "corp",
      "Reminder: You have unrezzed cards with \"when turn begins\" abilities.",
      "info"),
};

// ---------------------------------------------------------------------------
// reorder-choice / reorder-final
// ---------------------------------------------------------------------------

export function reorderChoice(
  reorderSide: string,
  ...rest: any[]
): any {
  let waitSide: string;
  let remaining: any[];
  let chosen: any[];
  let n: number;
  let original: any[];
  let dest: string | null;

  if (rest.length === 1) {
    const cards = rest[0] as any[];
    waitSide = otherSide(reorderSide) ?? "";
    remaining = cards;
    chosen = [];
    n = cards.length;
    original = cards;
    dest = null;
  } else if (rest.length === 5) {
    [waitSide, remaining, chosen, n, original] = rest;
    dest = null;
  } else {
    [waitSide, remaining, chosen, n, original, dest] = rest;
  }

  if (!remaining || remaining.length === 0) return undefined;

  return {
    prompt: `Choose a card to move next ${dest === "bottom" ? "under " : "onto "}` +
            `${reorderSide === "corp" ? "R&D" : "the stack"}`,
    choices: remaining,
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      const target = targets?.[0];
      const newChosen = [target, ...chosen];
      if (newChosen.length < n) {
        continueAbility(
          state, side, eid,
          reorderChoice(reorderSide, waitSide,
            removeOnce((x: any) => x === target, remaining),
            newChosen, n, original, dest),
          card, [],
        );
      } else {
        continueAbility(
          state, side, eid,
          reorderFinal(reorderSide, waitSide, newChosen, original, dest),
          card, [],
        );
      }
    },
  };
}

function reorderFinal(
  reorderSide: string, waitSide: string,
  chosen: any[], original: any[], dest: string | null = null,
): any {
  const zoneName = reorderSide === "corp" ? "R&D" : "the stack";
  return {
    prompt: dest === "bottom"
      ? `The bottom cards of ${zoneName} will be ${enumerateCards([...chosen].reverse())}.`
      : `The top cards of ${zoneName} will be ${enumerateCards(chosen)}.`,
    choices: ["Done", "Start over"],
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      const target = targets?.[0];
      const player = (state as any)[reorderSide];
      const finishShuffleFlag = () => {
        if (reorderSide === "corp" && state.run && (state as any).access) {
          (state.run as any)["shuffled-during-access"] =
            { ...((state.run as any)["shuffled-during-access"] ?? {}), rd: true };
        }
      };

      if (dest === "bottom" && target === "Done") {
        const deck = (player.deck ?? []) as any[];
        player.deck = [...deck.slice(chosen.length), ...[...chosen].reverse()];
        finishShuffleFlag();
        clearWaitPrompt(state, waitSide);
        effectCompleted(state, side, eid);
      } else if (target === "Done") {
        const deck = (player.deck ?? []) as any[];
        player.deck = [...chosen, ...deck.slice(chosen.length)];
        systemMsg(state, side,
          `The top cards of ${zoneName} are ${enumerateCards(chosen)}`);
        finishShuffleFlag();
        clearWaitPrompt(state, waitSide);
        effectCompleted(state, side, eid);
      } else {
        continueAbility(
          state, side, eid,
          reorderChoice(reorderSide, waitSide, original, [], original.length, original, dest),
          card, [],
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// breach-access-bonus
// ---------------------------------------------------------------------------

export function breachAccessBonus(server: string, bonus: number, args: any = {}): any {
  return {
    event: "breach-server",
    duration: args.duration,
    req: args.req
      ? args.req
      : (_s: GameState, _side: string, _eid: EID, _c: Card | null, targets: any[]) =>
          server === targets?.[0]?.server,
    msg: args.msg,
    effect: (state: GameState) => accessBonus(state, "runner", server, bonus),
  };
}

// ---------------------------------------------------------------------------
// damage shorthands
// ---------------------------------------------------------------------------

function dmgAbi(label: string, type: string, dmg: number): any {
  return {
    label: `Do ${dmg} ${label}`,
    async: true,
    msg: `do ${dmg} ${label}`,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) =>
      damage(state, side, eid, type, dmg, { card }),
  };
}

export function doNetDamage(dmg: number): any { return dmgAbi("net damage", "net", dmg); }
export function doMeatDamage(dmg: number): any { return dmgAbi("meat damage", "meat", dmg); }
export function doBrainDamage(dmg: number): any { return dmgAbi("core damage", "brain", dmg); }

// ---------------------------------------------------------------------------
// rfg-on-empty / trash-on-empty
// ---------------------------------------------------------------------------

export function rfgOnEmpty(counterType: string): any {
  return {
    event: "counter-added",
    req: (_s: GameState, _side: string, _eid: EID, card: Card | null, targets: any[]) => {
      const ctx = targets?.[0];
      return sameCard(card, ctx?.card)
        && !((card as any)?.special?.["skipped-loading"])
        && !(getCounters(card, counterType) > 0);
    },
    effect: (state: GameState, side: string, _eid: EID, card: Card | null) => {
      systemMsg(state, side, `removes ${(card as any)?.title} from the game`);
      move(state, side, card as Card, "rfg");
    },
  };
}

export function trashOnEmpty(counterType: string): any {
  return {
    event: "counter-added",
    req: (_s: GameState, _side: string, _eid: EID, card: Card | null, targets: any[]) => {
      const ctx = targets?.[0];
      return sameCard(card, ctx?.card)
        && !((card as any)?.special?.["skipped-loading"])
        && !(getCounters(card, counterType) > 0);
    },
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      systemMsg(state, side, `trashes ${(card as any)?.title}`);
      trash(state, side, eid, card as Card, { unpreventable: true, "source-card": card });
    },
  };
}

// ---------------------------------------------------------------------------
// SFX helpers
// ---------------------------------------------------------------------------

export function pickTieredSfx(base: string, upperLimit: number, n: number): string | null {
  if (!(n > 0)) return null;
  if (n === 1) return base;
  if (n < upperLimit) return `${base}-${n}`;
  return `${base}-${upperLimit}`;
}

export function playTieredSfx(
  state: GameState, side: string, base: string, upperLimit: number, n: number,
): void {
  const sfx = pickTieredSfx(base, upperLimit, n);
  if (sfx) playSfx(state, side, sfx);
}

// ---------------------------------------------------------------------------
// draw helpers
// ---------------------------------------------------------------------------

export function drawAbi(x: number, drawArgs: any = null, abBase: any = null): any {
  return {
    msg: `draw ${quantify(x, "card")}`,
    label: `Draw ${quantify(x, "card")}`,
    async: true,
    effect: (state: GameState, side: string, eid: EID) => {
      if (abBase?.action) playTieredSfx(state, side, "click-card", 3, x);
      draw(state, side, eid, x, drawArgs ?? undefined);
    },
    ...(abBase ?? {}),
  };
}

export function drawLoud(
  state: GameState, side: string, eid: EID, card: Card | null, n: number, args: any = null,
): void {
  resolveAbility(state, side, { ...drawAbi(n, args), eid } as Ability, card, []);
}

// ---------------------------------------------------------------------------
// give-tags
// ---------------------------------------------------------------------------

export function giveTags(n: number): any {
  return {
    label: `Give the Runner ${quantify(n, "tag")}`,
    msg: `give the Runner ${quantify(n, "tag")}`,
    interactive: () => true,
    async: true,
    effect: (state: GameState, _side: string, eid: EID) =>
      gainTags(state, "corp", eid, n),
  };
}

// ---------------------------------------------------------------------------
// run-server abilities
// ---------------------------------------------------------------------------

export function runServerAbility(server: string, abBase: any = {}): any {
  const { events, ...rest } = abBase ?? {};
  return {
    async: true,
    "change-in-game-state": {
      req: (state: GameState) => canRunServer(state, server),
    },
    label: `run ${zoneToName(server)}`,
    msg: `make a run on ${zoneToName(server)}`,
    "makes-run": true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      if (events && events.length) registerEvents(state, side, card as Card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, server, card);
    },
    ...rest,
  };
}

export function runAnyServerAbility(abBase: any = {}): any {
  const { events, ...rest } = abBase ?? {};
  return {
    async: true,
    prompt: "Choose a server",
    choices: (state: GameState, side: string) =>
      (state as any).runnableServers ?? [],
    req: (state: GameState) =>
      Array.isArray((state as any).runnableServers) && (state as any).runnableServers.length > 0,
    label: "Run a server",
    "makes-run": true,
    msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
      `make a run on ${targets?.[0]}`,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      if (events && events.length) registerEvents(state, side, card as Card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, targets?.[0], card);
    },
    ...rest,
  };
}

export const runRemoteServerAbility: any = {
  async: true,
  prompt: "Choose a remote server",
  "change-in-game-state": {
    req: (state: GameState) =>
      ((state as any).remotes ?? []).filter((r: string) => canRunServer(state, r)).length > 0,
  },
  choices: (state: GameState) =>
    ((state as any).remotes ?? []).filter((r: string) => canRunServer(state, r)),
  label: "Run a remote server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
    `make a run on ${targets?.[0]}`,
  effect: (state: GameState, _side: string, eid: EID, card: Card | null, targets: any[]) =>
    makeRun(state, _side, eid, targets?.[0], card),
};

const CENTRAL_SERVERS = new Set(["HQ", "R&D", "Archives"]);

export const runCentralServerAbility: any = {
  prompt: "Choose a central server",
  choices: (state: GameState) =>
    ((state as any).runnableServers ?? []).filter((s: string) => CENTRAL_SERVERS.has(s)),
  "change-in-game-state": {
    req: (state: GameState) =>
      ((state as any).runnableServers ?? []).filter((s: string) => CENTRAL_SERVERS.has(s)).length > 0,
  },
  async: true,
  label: "Run a central server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
    `make a run on ${targets?.[0]}`,
  effect: (state: GameState, _side: string, eid: EID, card: Card | null, targets: any[]) =>
    makeRun(state, _side, eid, targets?.[0], card),
};

export function runServerFromChoicesAbility(choices: string[], abBase: any = {}): any {
  const { events, ...rest } = abBase ?? {};
  const choiceSet = new Set(choices);
  return {
    prompt: "Choose a server",
    choices: (state: GameState) => choices.filter((s) => canRunServer(state, s)),
    "change-in-game-state": {
      req: (state: GameState) =>
        ((state as any).runnableServers ?? []).filter((s: string) => choiceSet.has(s)).length > 0,
    },
    async: true,
    msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
      `make a run on ${targets?.[0]}`,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      if (events && events.length) registerEvents(state, side, card as Card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, targets?.[0], card);
    },
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// take-credits / take-n-credits-ability
// ---------------------------------------------------------------------------

export function takeCredits(
  state: GameState, side: string, eid: EID,
  card: Card | null, type: string, n: number | "all", args: any = null,
): void {
  const fresh = getCard(state, card);
  if (!fresh) {
    effectCompleted(state, side, eid);
    return;
  }
  const counters = getCounters(fresh, type);
  const want = n === "all" ? counters : n;
  const toTake = Math.min(want as number, counters);
  if (toTake > 0) {
    waitFor(
      state, eid,
      (inner) => addCounter(state, side, fresh, type, -toTake,
        { placed: true, "suppress-checkpoint": true }, inner),
      () => gainCredits(state, side, eid, toTake, args ?? undefined),
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

export function takeNCreditsAbility(n: number, t: string = "card", abBase: any = null): any {
  return {
    label: `Take ${n} [Credits] from this ${t}`,
    "change-in-game-state": {
      req: (_s: GameState, _side: string, _eid: EID, card: Card | null) =>
        getCounters(card, "credit") > 0,
      silent: () => !abBase?.action,
    },
    msg: (_s: GameState, _sd: string, _e: EID, card: Card | null) =>
      `gain ${Math.min(n, getCounters(card, "credit"))} [Credits]`,
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      if (abBase?.action) playTieredSfx(state, side, "click-credit", 3, n);
      takeCredits(state, side, eid, card, "credit", n);
    },
    ...(abBase ?? {}),
  };
}

export function takeAllCreditsAbility(abBase: any = null): any {
  return {
    label: "Take all hosted credits",
    "change-in-game-state": {
      req: (_s: GameState, _side: string, _eid: EID, card: Card | null) =>
        getCounters(card, "credit") > 0,
    },
    async: true,
    msg: (_s: GameState, _sd: string, _e: EID, card: Card | null) =>
      `gain ${getCounters(card, "credit")} [Credits]`,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      if (abBase?.action) playTieredSfx(state, side, "click-credit", 3, getCounters(card, "credit"));
      takeCredits(state, side, eid, card, "credit", "all");
    },
    ...(abBase ?? {}),
  };
}

// ---------------------------------------------------------------------------
// in-hand* helpers
// ---------------------------------------------------------------------------

export function inHandStar(state: GameState, card: any): boolean {
  return inHand(card)
    || anyEffects(state, (card as any)?.side, "can-play-as-if-in-hand", (v: unknown) => v === true, card);
}

export function allCardsInHandStar(state: GameState, side: string): Card[] {
  return getAllCards(state).filter((c: any) =>
    (side === "runner" ? isRunner(c) : isCorp(c)) && inHandStar(state, c),
  );
}

// ---------------------------------------------------------------------------
// spend-credits
// ---------------------------------------------------------------------------

export function spendCredits(
  state: GameState, side: string, eid: EID,
  card: Card | null, type: string, n: number | "all", args: any = null,
): void {
  const fresh = getCard(state, card);
  if (!fresh) {
    effectCompleted(state, side, eid);
    return;
  }
  const counters = getCounters(fresh, type);
  const want = n === "all" ? counters : n;
  const toTake = Math.min(want as number, counters);
  if (toTake > 0) {
    waitFor(
      state, eid,
      (inner) => addCounter(state, side, fresh, type, -toTake,
        { placed: true, "suppress-checkpoint": true }, inner),
      () => {
        queueEvent(state, "spent-credits-from-card", { card: fresh });
        gainCredits(state, side, eid, toTake, args ?? undefined);
      },
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// make-recurring-ability
// ---------------------------------------------------------------------------

export function makeRecurringAbility(ability: any): any {
  if (!ability?.recurring) return ability;
  const recurringAbility = {
    msg: "take 1 [Recurring Credits]",
    req: (_s: GameState, _side: string, _eid: EID, card: Card | null) =>
      getCounters(card, "recurring") > 0,
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) =>
      spendCredits(state, side, eid, card, "recurring", 1),
  };
  return {
    ...ability,
    abilities: [...((ability.abilities as any[]) ?? []), recurringAbility],
  };
}

// ---------------------------------------------------------------------------
// move-to-top / move-to-bottom
// ---------------------------------------------------------------------------

export function moveToTop(targetCard: any, actingSide: string): any {
  const dest = isRunner(targetCard) ? "the Stack" : "R&D";
  return {
    msg: {
      public: (state: GameState) =>
        `add ${cardStr(state, targetCard)} from ${nameZone(targetCard.side, targetCard.zone)} to the top of ${dest}`,
      [actingSide]: (state: GameState) =>
        `add ${cardStr(state, targetCard, { "maybe-visible": true })} from ${nameZone(targetCard.side, targetCard.zone)} to the top of ${dest}`,
    },
    effect: (state: GameState, side: string) => move(state, side, targetCard, "deck", { front: true }),
  };
}

export function moveToBottom(targetCard: any, actingSide: string): any {
  const dest = isRunner(targetCard) ? "the Stack" : "R&D";
  return {
    msg: {
      public: (state: GameState) =>
        `add ${cardStr(state, targetCard)} from ${nameZone(targetCard.side, targetCard.zone)} to the bottom of ${dest}`,
      [actingSide]: (state: GameState) =>
        `add ${cardStr(state, targetCard, { "maybe-visible": true })} from ${nameZone(targetCard.side, targetCard.zone)} to the bottom of ${dest}`,
    },
    effect: (state: GameState, side: string) => move(state, side, targetCard, "deck"),
  };
}

export function moveCardToTopOrBottom(targetCard: any, actingSide: string): any {
  const zone = isRunner(targetCard) ? "the Stack" : "R&D";
  return chooseOneHelper(
    { prompt: `Move ${(targetCard as any).title} where?` } as any,
    [
      { option: `Top of ${zone}`, ability: moveToTop(targetCard, actingSide) } as any,
      { option: `Bottom of ${zone}`, ability: moveToBottom(targetCard, actingSide) } as any,
    ],
  );
}

// ---------------------------------------------------------------------------
// trash-or-rfg
// ---------------------------------------------------------------------------

export function trashOrRfg(
  state: GameState, _side: string, eid: EID, card: any,
): void {
  const cardSide = toKeyword(card?.side);
  const title = card?.title;
  if (card?.["rfg-instead-of-trashing"]) {
    systemSay(state, cardSide, `${title} is removed from the game.`);
    asyncRfg(state, cardSide, eid, card);
  } else {
    systemSay(state, cardSide, `${title} is trashed.`);
    trash(state, cardSide, eid, card, { unpreventable: true, "game-trash": true });
  }
}

// ---------------------------------------------------------------------------
// offer-jack-out
// ---------------------------------------------------------------------------

export function offerJackOut(args: { req?: any; once?: any } = {}): any {
  const { req: jackOutReq, once } = args;
  return {
    optional: {
      player: "runner",
      req: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) =>
        jackOutReq ? jackOutReq(state, side, eid, card, targets) : true,
      once,
      prompt: "Jack out?",
      "waiting-prompt": true,
      "yes-ability": {
        async: true,
        effect: (state: GameState, _side: string, eid: EID, card: Card | null) => {
          systemMsg(state, "runner", `uses ${(card as any)?.title} to jack out`);
          jackOut(state, "runner", eid);
        },
      },
      "no-ability": {
        effect: (state: GameState, _side: string, _eid: EID, card: Card | null) =>
          systemMsg(state, "runner", `uses ${(card as any)?.title} to continue the run`),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// get-x-fn
// ---------------------------------------------------------------------------

export function getXFn(): (state: GameState, side: string, eid: EID, card: any, targets: any[]) => number {
  return function getXFnInner(state, side, eid, card, targets) {
    if (!isDisabledReg(state, card) && card?.["x-fn"]) {
      return card["x-fn"](state, side, eid, card, targets);
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
// make-current-event-handler
// ---------------------------------------------------------------------------

export function makeCurrentEventHandler(title: string, ability: any): any {
  const card = serverCard(title, false) as any;
  if (!hasSubtype(card, "Current")) return ability;
  const eventKeyword = isCorp(card) ? "agenda-stolen" : "agenda-scored";
  const staticAb = {
    type: "trash-when-expired",
    req: (_s: GameState, _side: string, _eid: EID, _c: Card | null, targets: any[]) => {
      return (targets ?? []).some((entry: any) => {
        const event = entry?.event;
        const contextCard = entry?.card;
        return event === eventKeyword
          || ((event === "play-event" || event === "play-operation")
              && !sameCard(card, contextCard)
              && hasSubtype(contextCard, "Current"));
      });
    },
    value: trashOrRfg,
  };
  return {
    ...ability,
    "static-abilities": [...((ability["static-abilities"] as any[]) ?? []), staticAb],
  };
}

// ---------------------------------------------------------------------------
// add-default-abilities
// ---------------------------------------------------------------------------

export function addDefaultAbilities(title: string, ability: any): any {
  return makeRecurringAbility(makeCurrentEventHandler(title, ability));
}

// ---------------------------------------------------------------------------
// something-can-be-advanced?
// ---------------------------------------------------------------------------

export function somethingCanBeAdvanced(state: GameState): boolean {
  return allInstalled(state, "corp").some((c: any) =>
    !((c as any)?.faceup) || canBeAdvanced(state, c),
  );
}

function canBeAdvanced(_state: GameState, card: any): boolean {
  // approximation — card.advanceable or agenda type
  return !!(card?.advanceable) || card?.type === "Agenda";
}

// ---------------------------------------------------------------------------
// corp-install-up-to-n-cards
// ---------------------------------------------------------------------------

export function corpInstallUpToNCards(n: number, args: any = null): any {
  return {
    prompt: `install a card from HQ${n > 1 ? ` (${n} remaining)` : ""}`,
    choices: {
      card: (c: any) => isCorp(c) && inHand(c) && !isOperation(c),
    },
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      const target = targets?.[0];
      waitFor(
        state, eid,
        (inner) => corpInstall(
          state, side, target, null,
          { ...(args ?? {}), "msg-keys": { "install-source": card } },
          inner as any,
        ),
        () => {
          if (n > 1) {
            continueAbility(state, side, eid, corpInstallUpToNCards(n - 1), card, []);
          } else {
            effectCompleted(state, side, eid);
          }
        },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// gain-credits-ability
// ---------------------------------------------------------------------------

export function gainCreditsAbility(x: number): any {
  return {
    msg: `gain ${x} [Credits]`,
    label: `gain ${x} [Credits]`,
    async: true,
    effect: (state: GameState, side: string, eid: EID) => gainCredits(state, side, eid, x),
  };
}

// ---------------------------------------------------------------------------
// drain-credits
// ---------------------------------------------------------------------------

export function drainCredits(
  drainingSide: string, victimSide: string,
  qty: number | ((state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => number),
  multiplier: number = 1, tagsToGain: number = 0,
): any {
  const toDrain = (state: GameState): number => {
    const q = typeof qty === "function"
      ? qty(state, drainingSide, makeEID(state), null, [])
      : qty;
    return Math.min(((state as any)[victimSide]?.credit ?? 0), q);
  };
  const toGain = (state: GameState): number => toDrain(state) * multiplier;

  return {
    msg: (state: GameState) => {
      const cap = victimSide.charAt(0).toUpperCase() + victimSide.slice(1);
      const tail = tagsToGain > 0
        ? `${drainingSide === "corp" ? ", and give Runner " : ", and take "}${quantify(tagsToGain, "tag")}`
        : "";
      const sep = tagsToGain === 0 ? " and " : "";
      return `force the ${cap} to lose ${toDrain(state)} [Credits], ${sep}gain ${toGain(state)} [Credits]${tail}`;
    },
    async: true,
    effect: (state: GameState, _side: string, eid: EID) => {
      const cDrain = toDrain(state);
      const cGain = toGain(state);
      if (tagsToGain === 0) {
        waitFor(
          state, eid,
          (inner) => loseCredits(state, victimSide, cDrain, { "suppress-checkpoint": true }, inner),
          () => gainCredits(state, drainingSide, eid, cGain),
        );
      } else {
        waitFor(
          state, eid,
          (inner) => gainTags(state, drainingSide as any, inner, tagsToGain),
          () => waitFor(
            state, eid,
            (inner2) => loseCredits(state, victimSide, cDrain, { "suppress-checkpoint": true }, inner2),
            () => gainCredits(state, drainingSide, eid, cGain),
          ),
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// corp-recur
// ---------------------------------------------------------------------------

export function corpRecur(pred: (c: any) => boolean = () => true): any {
  return {
    label: "add card from Archives to HQ",
    prompt: "Choose a card to add to HQ",
    "does-something": (state: GameState) => ((state.corp as any)?.discard ?? []).length > 0,
    "waiting-prompt": true,
    "show-discard": true,
    choices: {
      card: (c: any) => isCorp(c) && inDiscard(c) && pred(c),
    },
    msg: {
      public: (state: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) => {
        const target = targets?.[0];
        return `add ${cardStr(state, target, { visible: !!(target as any)?.faceup })} to HQ`;
      },
      corp: (state: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) => {
        const target = targets?.[0];
        return `add ${cardStr(state, target, { "maybe-visible": true })} to HQ`;
      },
    },
    effect: (state: GameState, _side: string, _eid: EID, _c: Card | null, targets: any[]) =>
      move(state, "corp", targets?.[0], "hand"),
  };
}

// ---------------------------------------------------------------------------
// tutor-abi
// ---------------------------------------------------------------------------

export function tutorAbi(reveal_: boolean, restriction: ((c: any) => boolean) | null = null): any {
  return {
    "change-in-game-state": {
      req: (state: GameState, side: string) =>
        ((state as any)[side]?.deck ?? []).length > 0,
    },
    prompt: "Choose a card",
    label: (_s: GameState, side: string) =>
      side === "corp"
        ? "Search R&D and add 1 card to HQ"
        : "Search the Stack and add 1 card to the Grip",
    choices: (state: GameState, side: string) =>
      cancellable(
        ((state as any)[side]?.deck ?? []).filter((c: any) => !restriction || restriction(c)),
        true,
      ),
    msg: (_s: GameState, side: string, _e: EID, _c: Card | null, targets: any[]) =>
      `search ${side === "corp" ? "R&D" : "[their] Stack"} for ${reveal_ ? (targets?.[0] as any)?.title : "a card"} and add it to ${side === "corp" ? "HQ" : "[their] Grip"}`,
    cancel: failToFind,
    async: true,
    effect: (state: GameState, side: string, eid: EID, _c: Card | null, targets: any[]) => {
      const target = targets?.[0];
      if (side === "runner") triggerEvent(state, side, "searched-stack");
      if (reveal_) {
        waitFor(
          state, eid,
          (inner) => reveal(state, side, inner, target),
          () => {
            move(state, side, target, "hand");
            shuffleDeck(state, side, "deck");
            effectCompleted(state, side, eid);
          },
        );
      } else {
        move(state, side, target, "hand");
        shuffleDeck(state, side, "deck");
        effectCompleted(state, side, eid);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// card-defs cache + defcard
// ---------------------------------------------------------------------------

export const cardDefsCache = new Map<string, any>();

import { cardDefRegistry } from "./types.js";

/**
 * Define a card to be returned from card-def. Mirrors `defcard` macro.
 * In TS we register directly: each call records the title→definition mapping.
 */
export function defcard(title: string, ability: any, ...transformers: any[]): void {
  cardDefsCache.delete(title);
  // Apply transformers right-to-left (mirroring `(reverse (cons body more))`).
  let result = ability;
  for (const t of transformers) {
    result = typeof t === "function" ? t(result) : { ...t, ...result };
  }
  result = addDefaultAbilities(title, result);
  cardDefsCache.set(title, result);
  cardDefRegistry.set(title, result);
}

// ---------------------------------------------------------------------------
// trash-on-purge
// ---------------------------------------------------------------------------

export const trashOnPurge: any = {
  event: "purge",
  async: true,
  msg: "trash itself",
  effect: (state: GameState, _side: string, eid: EID, card: Card | null) =>
    trash(state, "runner", eid, card as Card, { cause: "purge", "cause-card": card }),
};

// ---------------------------------------------------------------------------
// scry
// ---------------------------------------------------------------------------

export function scry(
  state: GameState, side: string, eid: EID,
  card: Card | null, targetSide: string, quant: number,
): void {
  const player = (state as any)[targetSide];
  const targetCards = ((player?.deck ?? []) as any[]).slice(0, quant);
  const zoneName = targetSide === "corp" ? "R&D" : "the stack";
  const scrySide = side;
  const scryFn = targetCards.length === 1
    ? `the top card of ${zoneName} is ${(targetCards[0] as any)?.title}`
    : `the top ${quantify(quant, "card")} of ${zoneName} are (top->bottom): ${enumerateCards(targetCards)}`;

  resolveAbility(
    state, side,
    {
      eid,
      player: side,
      "waiting-prompt": true,
      req: () => targetCards.length > 0,
      choices: ["OK"],
      msg: { [scrySide]: scryFn } as any,
      prompt: scryFn,
    } as Ability,
    card, [],
  );
}

// ---------------------------------------------------------------------------
// with-revealed-hand
// ---------------------------------------------------------------------------

export function withRevealedHand(
  targetSide: string,
  argsOrAbi: any,
  abi?: any,
): any {
  let args: any = {};
  let ability: any;
  if (abi === undefined) {
    ability = argsOrAbi;
  } else {
    args = argsOrAbi ?? {};
    ability = abi;
  }
  const { eventSide, forced, skipReveal } = args;

  function maybeRegisterEv(
    state: GameState, side: string, card: Card | null, wasOpen: boolean,
  ): () => void {
    if (wasOpen) return () => undefined;
    const events = registerEvents(state, side, card as Card, [{
      event: "card-moved",
      req: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) => {
        const sidefn = targetSide === "corp" ? isCorp : isRunner;
        const moved = targets?.[0]?.["moved-card"];
        return sidefn(moved) && inHand(moved);
      },
      silent: true,
      effect: (state2: GameState) => concealHand(state2, targetSide),
    }] as any);
    const uuid = (events?.[0] as any)?.uuid;
    return () => uuid && unregisterEventByUUID(state, side, uuid);
  }

  function maybeReveal(
    state: GameState, side: string, eid: EID, card: Card | null,
  ): void {
    if (skipReveal) {
      effectCompleted(state, side, eid);
      return;
    }
    const player = (state as any)[targetSide];
    revealLoud(state, eventSide ?? side, eid, card, args, player?.hand ?? []);
  }

  return {
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null, targets: any[]) => {
      waitFor(
        state, eid,
        (inner) => maybeReveal(state, side, inner, card),
        () => {
          const wasOpen = !!(state as any)[targetSide]?.openhand;
          const unregister = maybeRegisterEv(state, side, card, wasOpen);
          if (!wasOpen) revealHand(state, targetSide);
          waitFor(
            state, eid,
            (inner) => resolveAbility(state, side, { ...ability, eid: inner }, card, targets),
            () => {
              if (!wasOpen) concealHand(state, targetSide);
              unregister();
              effectCompleted(state, side, eid);
            },
          );
        },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// place-advancement-counter
// ---------------------------------------------------------------------------

export function placeAdvancementCounter(
  advanceableOnly: boolean,
  qty: number = 1,
  cardLine: string = "a card",
  pred: ((c: any) => boolean) | null = null,
): any {
  const label = `Place ${quantify(qty, "advancement counter")} on ${cardLine}${advanceableOnly ? " that can be advanced" : ""}`;
  return {
    label,
    prompt: label,
    choices: {
      req: (state: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) => {
        const target = targets?.[0];
        return isCorp(target) && isInstalled(target)
          && (!pred || pred(target))
          && (!advanceableOnly || canBeAdvanced(state, target));
      },
    },
    msg: {
      public: (state: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets?.[0])}`,
      corp: (state: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets?.[0], { "maybe-visible": true })}`,
    },
    async: true,
    effect: (state: GameState, _side: string, eid: EID, _c: Card | null, targets: any[]) =>
      addProp(state, _side, eid, targets?.[0], "advance-counter", qty, { placed: true }),
  };
}

// ---------------------------------------------------------------------------
// look-at-the-top
// ---------------------------------------------------------------------------

export function lookAtTheTop(
  lookingSide: string, deckSide: string, qty: number,
): any {
  const zone = lookingSide === "corp" ? "R&D" : "the stack";
  const seen = (state: GameState): number =>
    Math.min(qty, (((state as any)[deckSide]?.deck ?? []) as any[]).length);
  return {
    msg: {
      public: (state: GameState) =>
        `look at the top ${quantify(seen(state), "card")} of ${zone}`,
      [lookingSide]: (state: GameState) => {
        const top = (((state as any)[deckSide]?.deck ?? []) as any[]).slice(0, qty);
        return `look at the top ${quantify(seen(state), "card")} of ${zone} (top->bottom): ${enumerateCards(top)}`;
      },
    },
    async: true,
    "waiting-prompt": true,
    "change-in-game-state": {
      silent: true,
      req: (state: GameState) => (((state as any)[deckSide]?.deck ?? []) as any[]).length > 0,
    },
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      const top = (((state as any)[deckSide]?.deck ?? []) as any[]).slice(0, qty);
      resolveAbility(
        state, side,
        {
          eid,
          prompt: `The top cards of ${zone} are (top->bottom): ${enumerateCards(top)}`,
          choices: ["OK"],
        } as Ability,
        card, [],
      );
    },
  };
}

// ---------------------------------------------------------------------------
// make-icon
// ---------------------------------------------------------------------------

export function makeIcon(text: string, card: any): [string, string, string] {
  return [text, card?.cid, factionLabel(card)];
}
