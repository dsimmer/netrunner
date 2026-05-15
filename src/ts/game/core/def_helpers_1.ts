// Card definition helpers — common ability shapes shared across cards.
// Mirrors: src/clj/game/core/def_helpers.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types.ts";
import {
  isCorp,
  isRunner,
  isInstalled,
  inHand,
  inDiscard,
  hasSubtype,
  getCounters,
  isOperation,
  getCard,
} from "./card";
import { accessBonus } from "./access";
import { allInstalled, getAllCards } from "./board";
import { chooseOneHelper } from "./choose_one";
import { damage } from "./damage";
import { draw } from "./drawing";
import {
  effectCompleted,
  makeEID,
  makeEIDFrom,
  makeResult,
  registerEIDCallback,
} from "./eid";
import {
  queueEvent,
  registerEvents,
  resolveAbility,
  triggerEvent,
  triggerEventSync,
  unregisterEventByUUID,
} from "./engine";
import { anyEffects, isDisabledReg } from "./effects";
import { gainCredits, loseCredits } from "./gaining";
import { corpInstall } from "./installing";
import { move, trash } from "./moving";
import { canPay } from "./payment";
import { asyncRfg } from "./play_instants";
import { cancellable, clearWaitPrompt } from "./prompts";
import { addCounter, addProp } from "./props";
import { concealHand, reveal, revealHand, revealLoud } from "./revealing";
import { canRunServer, makeRun, jackOut } from "./runs";
import { playSfx, systemMsg, systemSay } from "./say";
import { zoneToName, nameZone } from "./servers";
import { shuffleDeck, failToFind } from "./shuffling";
import { gainTags } from "./tags";
import { toast } from "./toasts";
import { cardStr } from "./to_string";
import {
  enumerateCards,
  removeOnce,
  sameCard,
  serverCard,
  toKeyword,
  quantify,
} from "../utils";
import { factionLabel, otherSide } from "../../jinteki/utils";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Mirrors Clojure (wait-for ...). */
export function waitFor(
  state: GameState,
  parentEid: EID,
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
export function continueAbility(
  state: GameState,
  side: string,
  eid: EID,
  ability: any,
  card: Card | null,
  targets: any[],
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
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        _targets: any[],
      ) => {
        waitFor(
          state,
          eid,
          (inner) =>
            resolveAbility(state, side, { ...acc, eid: inner }, card, []),
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
    toast(
      state,
      "corp",
      'Reminder: You have unrezzed cards with "when turn begins" abilities.',
      "info",
    ),
};

// ---------------------------------------------------------------------------
// reorder-choice / reorder-final
// ---------------------------------------------------------------------------

export function reorderChoice(reorderSide: string, ...rest: any[]): any {
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
    prompt:
      `Choose a card to move next ${dest === "bottom" ? "under " : "onto "}` +
      `${reorderSide === "corp" ? "R&D" : "the stack"}`,
    choices: remaining,
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = targets?.[0];
      const newChosen = [target, ...chosen];
      if (newChosen.length < n) {
        continueAbility(
          state,
          side,
          eid,
          reorderChoice(
            reorderSide,
            waitSide,
            removeOnce((x: any) => x === target, remaining),
            newChosen,
            n,
            original,
            dest,
          ),
          card,
          [],
        );
      } else {
        continueAbility(
          state,
          side,
          eid,
          reorderFinal(reorderSide, waitSide, newChosen, original, dest),
          card,
          [],
        );
      }
    },
  };
}

function reorderFinal(
  reorderSide: string,
  waitSide: string,
  chosen: any[],
  original: any[],
  dest: string | null = null,
): any {
  const zoneName = reorderSide === "corp" ? "R&D" : "the stack";
  return {
    prompt:
      dest === "bottom"
        ? `The bottom cards of ${zoneName} will be ${enumerateCards([...chosen].reverse())}.`
        : `The top cards of ${zoneName} will be ${enumerateCards(chosen)}.`,
    choices: ["Done", "Start over"],
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = targets?.[0];
      const player = (state as any)[reorderSide];
      const finishShuffleFlag = () => {
        if (reorderSide === "corp" && state.run && (state as any).access) {
          (state.run as any)["shuffled-during-access"] = {
            ...((state.run as any)["shuffled-during-access"] ?? {}),
            rd: true,
          };
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
        systemMsg(
          state,
          side,
          `The top cards of ${zoneName} are ${enumerateCards(chosen)}`,
        );
        finishShuffleFlag();
        clearWaitPrompt(state, waitSide);
        effectCompleted(state, side, eid);
      } else {
        continueAbility(
          state,
          side,
          eid,
          reorderChoice(
            reorderSide,
            waitSide,
            original,
            [],
            original.length,
            original,
            dest,
          ),
          card,
          [],
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// breach-access-bonus
// ---------------------------------------------------------------------------

export function breachAccessBonus(
  server: string,
  bonus: number,
  args: any = {},
): any {
  return {
    event: "breach-server",
    duration: args.duration,
    req: args.req
      ? args.req
      : (
          _s: GameState,
          _side: string,
          _eid: EID,
          _c: Card | null,
          targets: any[],
        ) => server === targets?.[0]?.server,
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

export function doNetDamage(dmg: number): any {
  return dmgAbi("net damage", "net", dmg);
}
export function doMeatDamage(dmg: number): any {
  return dmgAbi("meat damage", "meat", dmg);
}
export function doBrainDamage(dmg: number): any {
  return dmgAbi("core damage", "brain", dmg);
}

// ---------------------------------------------------------------------------
// rfg-on-empty / trash-on-empty
// ---------------------------------------------------------------------------

export function rfgOnEmpty(counterType: string): any {
  return {
    event: "counter-added",
    req: (
      _s: GameState,
      _side: string,
      _eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const ctx = targets?.[0];
      return (
        sameCard(card, ctx?.card) &&
        !(card as any)?.special?.["skipped-loading"] &&
        !(getCounters(card, counterType) > 0)
      );
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
    req: (
      _s: GameState,
      _side: string,
      _eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const ctx = targets?.[0];
      return (
        sameCard(card, ctx?.card) &&
        !(card as any)?.special?.["skipped-loading"] &&
        !(getCounters(card, counterType) > 0)
      );
    },
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      systemMsg(state, side, `trashes ${(card as any)?.title}`);
      trash(state, side, eid, card as Card, {
        unpreventable: true,
        "source-card": card,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// SFX helpers
// ---------------------------------------------------------------------------

export function pickTieredSfx(
  base: string,
  upperLimit: number,
  n: number,
): string | null {
  if (!(n > 0)) return null;
  if (n === 1) return base;
  if (n < upperLimit) return `${base}-${n}`;
  return `${base}-${upperLimit}`;
}

export function playTieredSfx(
  state: GameState,
  side: string,
  base: string,
  upperLimit: number,
  n: number,
): void {
  const sfx = pickTieredSfx(base, upperLimit, n);
  if (sfx) playSfx(state, side, sfx);
}

// ---------------------------------------------------------------------------
// draw helpers
// ---------------------------------------------------------------------------

export function drawAbi(
  x: number,
  drawArgs: any = null,
  abBase: any = null,
): any {
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
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  n: number,
  args: any = null,
): void {
  resolveAbility(
    state,
    side,
    { ...drawAbi(n, args), eid } as Ability,
    card,
    [],
  );
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
      if (events && events.length)
        registerEvents(state, side, card as Card, events);
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
      Array.isArray((state as any).runnableServers) &&
      (state as any).runnableServers.length > 0,
    label: "Run a server",
    "makes-run": true,
    msg: (
      _s: GameState,
      _sd: string,
      _e: EID,
      _c: Card | null,
      targets: any[],
    ) => `make a run on ${targets?.[0]}`,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      if (events && events.length)
        registerEvents(state, side, card as Card, events);
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
      ((state as any).remotes ?? []).filter((r: string) =>
        canRunServer(state, r),
      ).length > 0,
  },
  choices: (state: GameState) =>
    ((state as any).remotes ?? []).filter((r: string) =>
      canRunServer(state, r),
    ),
  label: "Run a remote server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
    `make a run on ${targets?.[0]}`,
  effect: (
    state: GameState,
    _side: string,
    eid: EID,
    card: Card | null,
    targets: any[],
  ) => makeRun(state, _side, eid, targets?.[0], card),
};

const CENTRAL_SERVERS = new Set(["HQ", "R&D", "Archives"]);

export const runCentralServerAbility: any = {
  prompt: "Choose a central server",
  choices: (state: GameState) =>
    ((state as any).runnableServers ?? []).filter((s: string) =>
      CENTRAL_SERVERS.has(s),
    ),
  "change-in-game-state": {
    req: (state: GameState) =>
      ((state as any).runnableServers ?? []).filter((s: string) =>
        CENTRAL_SERVERS.has(s),
      ).length > 0,
  },
  async: true,
  label: "Run a central server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: any[]) =>
    `make a run on ${targets?.[0]}`,
  effect: (
    state: GameState,
    _side: string,
    eid: EID,
    card: Card | null,
    targets: any[],
  ) => makeRun(state, _side, eid, targets?.[0], card),
};

export function runServerFromChoicesAbility(
  choices: string[],
  abBase: any = {},
): any {
  const { events, ...rest } = abBase ?? {};
  const choiceSet = new Set(choices);
  return {
    prompt: "Choose a server",
    choices: (state: GameState) =>
      choices.filter((s) => canRunServer(state, s)),
    "change-in-game-state": {
      req: (state: GameState) =>
        ((state as any).runnableServers ?? []).filter((s: string) =>
          choiceSet.has(s),
        ).length > 0,
    },
    async: true,
    msg: (
      _s: GameState,
      _sd: string,
      _e: EID,
      _c: Card | null,
      targets: any[],
    ) => `make a run on ${targets?.[0]}`,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      if (events && events.length)
        registerEvents(state, side, card as Card, events);
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
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  type: string,
  n: number | "all",
  args: any = null,
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
      state,
      eid,
      (inner) =>
        addCounter(
          state,
          side,
          fresh,
          type,
          -toTake,
          { placed: true, "suppress-checkpoint": true },
          inner,
        ),
      () => gainCredits(state, side, eid, toTake, args ?? undefined),
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

export function takeNCreditsAbility(
  n: number,
  t: string = "card",
  abBase: any = null,
): any {
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
      if (abBase?.action)
        playTieredSfx(
          state,
          side,
          "click-credit",
          3,
          getCounters(card, "credit"),
        );
      takeCredits(state, side, eid, card, "credit", "all");
    },
    ...(abBase ?? {}),
  };
}

// ---------------------------------------------------------------------------
// in-hand* helpers
// ---------------------------------------------------------------------------

export function inHandStar(state: GameState, card: any): boolean {
  return (
    inHand(card) ||
    anyEffects(
      state,
      (card as any)?.side,
      "can-play-as-if-in-hand",
      (v: unknown) => v === true,
      card,
    )
  );
}

export function allCardsInHandStar(state: GameState, side: string): Card[] {
  return getAllCards(state).filter(
    (c: any) =>
      (side === "runner" ? isRunner(c) : isCorp(c)) && inHandStar(state, c),
  );
}

// ---------------------------------------------------------------------------
// spend-credits
// ---------------------------------------------------------------------------

export function spendCredits(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  type: string,
  n: number | "all",
  args: any = null,
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
      state,
      eid,
      (inner) =>
        addCounter(
          state,
          side,
          fresh,
          type,
          -toTake,
          { placed: true, "suppress-checkpoint": true },
          inner,
        ),
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
    effect: (state: GameState, side: string) =>
      move(state, side, targetCard, "deck", { front: true }),
  };
}
