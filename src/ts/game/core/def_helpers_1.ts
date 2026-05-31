// Card definition helpers — common ability shapes shared across cards.
// Mirrors: src/clj/game/core/def_helpers.clj

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import {
  isCorp,
  isRunner,
  isInstalled,
  inHand,
  inDiscard,
  hasSubtype,
  getCounters,
  isOperation,
} from "./card";
import { getCard } from "./finding";
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
  registerEIDCallback(state, inner, (_s: GameState, _side: string, completed: EID) => {
    next(completed.result, completed);
  });
  start(inner);
}

/** continue-ability shorthand — fresh resolve at current eid. Mirrors clj's 3/4/5/6-arity form.
 *
 *  Arg types are intentionally `unknown` for state/side because some tier-2 card files
 *  call this with (cardDef, target, null) — a known port bug that will be fixed when
 *  those card files are verified. Once card-side cleanup is done, narrow back to
 *  `(state: GameState, side: string, ...)`.
 */
export function continueAbility(
  state: unknown,
  side: unknown,
  arg3: Ability | EID | null | undefined,
  arg4?: Ability | Card | null,
  arg5?: Card | unknown[] | null,
  arg6?: unknown[],
): void {
  let eid: EID | undefined;
  let ability: Ability | null;
  let card: Card | null;
  let targets: unknown[];

  // 6-arg form: state, side, eid, ability, card, targets
  if (
    arg3 &&
    typeof arg3 === "object" &&
    "id" in arg3 &&
    !("effect" in arg3) &&
    !("msg" in arg3)
  ) {
    eid = arg3 as EID;
    ability = (arg4 as Ability | null) ?? null;
    card = (arg5 as Card | null) ?? null;
    targets = arg6 ?? [];
  } else {
    ability = (arg3 as Ability | null) ?? null;
    card = (arg4 as Card | null) ?? null;
    targets = (arg5 as unknown[]) ?? [];
  }

  if (!ability) return;
  const finalAbility: Ability = eid ? { ...ability, eid } : ability;
  resolveAbility(state as GameState, side as string, finalAbility, card, targets);
}

// ---------------------------------------------------------------------------
// combine-abilities
// ---------------------------------------------------------------------------

export function combineAbilities(...abilities: Ability[]): Ability {
  if (abilities.length < 2) return abilities[0] ?? {};
  return abilities.slice(1).reduce<Ability>((acc, ab) => {
    return {
      label: `${acc.label}. ${ab.label}`,
      async: true,
      effect: (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        _targets: unknown[],
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
  }, abilities[0] ?? {});
}

// ---------------------------------------------------------------------------
// corp-rez-toast
// ---------------------------------------------------------------------------

export const corpRezToast: Ability = {
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

// Wide overload signatures to tolerate the variety of shapes tier-2 card files
// pass — some use Card[], some use unknown[] from upstream targets, some include
// keyword-prefixed sides (":corp" / "corp"). The body normalises internally.
export function reorderChoice(reorderSide: string, cards: readonly unknown[]): Ability;
export function reorderChoice(
  reorderSide: string,
  waitSide: string,
  remaining: readonly unknown[],
  chosen: readonly unknown[],
  n: number,
  original: readonly unknown[],
  dest?: string | null,
): Ability;
export function reorderChoice(
  reorderSide: string,
  arg2: readonly unknown[] | string,
  arg3?: readonly unknown[],
  arg4?: readonly unknown[],
  arg5?: number,
  arg6?: readonly unknown[],
  arg7?: string | null,
): Ability {
  let waitSide: string;
  let remaining: Card[];
  let chosen: Card[];
  let n: number;
  let original: Card[];
  let dest: string | null;

  if (typeof arg2 === "string") {
    waitSide = arg2;
    remaining = (arg3 ?? []) as Card[];
    chosen = (arg4 ?? []) as Card[];
    n = arg5 ?? 0;
    original = (arg6 ?? []) as Card[];
    dest = arg7 ?? null;
  } else {
    const cards = arg2 as Card[];
    waitSide = otherSide(reorderSide) ?? "";
    remaining = cards;
    chosen = [];
    n = cards.length;
    original = cards;
    dest = null;
  }

  // Always return an Ability (never undefined) so callers that pass directly
  // into resolveAbility don't trip TS strict-null. Empty-remaining → a no-op
  // ability that immediately completes.
  if (!remaining || remaining.length === 0) {
    return {
      async: true,
      effect: (state: GameState, side: string, eid: EID) =>
        effectCompleted(state, side, eid),
    };
  }

  return {
    prompt:
      `Choose a card to move next ${dest === "bottom" ? "under " : "onto "}` +
      `${reorderSide === "corp" ? "R&D" : "the stack"}`,
    choices: remaining as unknown as string[],
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as Card;
      const newChosen = [target, ...chosen];
      if (newChosen.length < n) {
        const nextAbility = reorderChoice(
          reorderSide,
          waitSide,
          removeOnce((x: Card) => x === target, remaining) as Card[],
          newChosen,
          n,
          original,
          dest,
        );
        continueAbility(state, side, eid, nextAbility, card, []);
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
  chosen: Card[],
  original: Card[],
  dest: string | null = null,
): Ability {
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
      targets: unknown[],
    ) => {
      const target = targets[0];
      const player = reorderSide === "corp" ? state.corp : state.runner;
      const finishShuffleFlag = () => {
        if (reorderSide === "corp" && state.run && state.access) {
          const run = state.run as { "shuffled-during-access"?: Record<string, boolean> };
          run["shuffled-during-access"] = {
            ...(run["shuffled-during-access"] ?? {}),
            rd: true,
          };
        }
      };

      if (dest === "bottom" && target === "Done") {
        const deck = player.deck ?? [];
        player.deck = [...deck.slice(chosen.length), ...[...chosen].reverse()];
        finishShuffleFlag();
        clearWaitPrompt(state, waitSide);
        effectCompleted(state, side, eid);
      } else if (target === "Done") {
        const deck = player.deck ?? [];
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
        const nextAbility = reorderChoice(
          reorderSide,
          waitSide,
          original,
          [],
          original.length,
          original,
          dest,
        );
        continueAbility(state, side, eid, nextAbility, card, []);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// breach-access-bonus
// ---------------------------------------------------------------------------

interface BreachAccessBonusArgs {
  duration?: string;
  req?: Ability["req"];
  msg?: string;
}

export function breachAccessBonus(
  server: string,
  bonus: number,
  args: BreachAccessBonusArgs = {},
): Ability {
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
          targets: unknown[],
        ) => {
          const ctx = targets[0] as { server?: string } | undefined;
          return server === ctx?.server;
        },
    msg: args.msg,
    effect: (state: GameState) => accessBonus(state, "runner", bonus, server),
  };
}

// ---------------------------------------------------------------------------
// damage shorthands
// ---------------------------------------------------------------------------

function dmgAbi(label: string, type: string, dmg: number): Ability {
  return {
    label: `Do ${dmg} ${label}`,
    async: true,
    msg: `do ${dmg} ${label}`,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) =>
      damage(state, side, eid, type, dmg, { card }),
  };
}

export function doNetDamage(dmg: number): Ability {
  return dmgAbi("net damage", "net", dmg);
}
export function doMeatDamage(dmg: number): Ability {
  return dmgAbi("meat damage", "meat", dmg);
}
export function doBrainDamage(dmg: number): Ability {
  return dmgAbi("core damage", "brain", dmg);
}

// ---------------------------------------------------------------------------
// rfg-on-empty / trash-on-empty
// ---------------------------------------------------------------------------

interface CounterAddedContext {
  card?: Card | null;
}

function counterDrainedReq(counterType: string) {
  return (
    _s: GameState,
    _side: string,
    _eid: EID,
    card: Card | null,
    targets: unknown[],
  ): boolean => {
    const ctx = targets[0] as CounterAddedContext | undefined;
    const skipped = card?.special?.["skipped-loading"] === true;
    return Boolean(sameCard(card, ctx?.card ?? null)) && !skipped && !(getCounters(card, counterType) > 0);
  };
}

export function rfgOnEmpty(counterType: string): Ability {
  return {
    event: "counter-added",
    req: counterDrainedReq(counterType),
    effect: (state: GameState, side: string, _eid: EID, card: Card | null) => {
      systemMsg(state, side, `removes ${card?.title ?? ""} from the game`);
      if (card) move(state, side, card, "rfg");
    },
  };
}

export function trashOnEmpty(counterType: string): Ability {
  return {
    event: "counter-added",
    req: counterDrainedReq(counterType),
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      systemMsg(state, side, `trashes ${card?.title ?? ""}`);
      if (card) {
        trash(state, side, eid, card, {
          unpreventable: true,
          "source-card": card,
        });
      }
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
  drawArgs: Record<string, unknown> | null = null,
  abBase: Partial<Ability> | null = null,
): Ability {
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
  args: Record<string, unknown> | null = null,
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

export function giveTags(n: number): Ability {
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

interface RunAbilityBase extends Partial<Ability> {
  events?: Ability[];
  action?: boolean;
}

export function runServerAbility(server: string, abBase: RunAbilityBase = {}): Ability {
  const { events, ...rest } = abBase;
  return {
    async: true,
    "change-in-game-state": {
      req: (state: GameState) => canRunServer(state, server),
    },
    label: `run ${zoneToName(server)}`,
    msg: `make a run on ${zoneToName(server)}`,
    "makes-run": true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      if (events && events.length && card)
        registerEvents(state, side, card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, server, card);
    },
    ...rest,
  };
}

export function runAnyServerAbility(abBase: RunAbilityBase = {}): Ability {
  const { events, ...rest } = abBase;
  return {
    async: true,
    prompt: "Choose a server",
    choices: (state: GameState) => state.runnableServers ?? [],
    req: (state: GameState) =>
      Array.isArray(state.runnableServers) && state.runnableServers.length > 0,
    label: "Run a server",
    "makes-run": true,
    msg: (
      _s: GameState,
      _sd: string,
      _e: EID,
      _c: Card | null,
      targets: unknown[],
    ) => `make a run on ${String(targets[0] ?? "")}`,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => {
      if (events && events.length && card)
        registerEvents(state, side, card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, String(targets[0] ?? ""), card);
    },
    ...rest,
  };
}

// Typed as union of object Ability and factory function. The exported value is
// the object form; the factory branch is included so legacy card-side wrappers
// (`typeof ability === "function" ? ability(...) : {...ability}`) compile.
export const runRemoteServerAbility: Ability | ((opts?: RunAbilityBase) => Ability) = {
  async: true,
  prompt: "Choose a remote server",
  "change-in-game-state": {
    req: (state: GameState) =>
      (state.remotes ?? []).filter((r: string) => canRunServer(state, r)).length > 0,
  },
  choices: (state: GameState) =>
    (state.remotes ?? []).filter((r: string) => canRunServer(state, r)),
  label: "Run a remote server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: unknown[]) =>
    `make a run on ${String(targets[0] ?? "")}`,
  effect: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: unknown[],
  ) => makeRun(state, side, eid, String(targets[0] ?? ""), card),
};

const CENTRAL_SERVERS = new Set(["HQ", "R&D", "Archives"]);

export const runCentralServerAbility: Ability | ((opts?: RunAbilityBase) => Ability) = {
  prompt: "Choose a central server",
  choices: (state: GameState) =>
    (state.runnableServers ?? []).filter((s: string) => CENTRAL_SERVERS.has(s)),
  "change-in-game-state": {
    req: (state: GameState) =>
      (state.runnableServers ?? []).filter((s: string) => CENTRAL_SERVERS.has(s)).length > 0,
  },
  async: true,
  label: "Run a central server",
  msg: (_s: GameState, _sd: string, _e: EID, _c: Card | null, targets: unknown[]) =>
    `make a run on ${String(targets[0] ?? "")}`,
  effect: (
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
    targets: unknown[],
  ) => makeRun(state, side, eid, String(targets[0] ?? ""), card),
};

export function runServerFromChoicesAbility(
  choices: string[],
  abBase: RunAbilityBase = {},
): Ability {
  const { events, ...rest } = abBase;
  const choiceSet = new Set(choices);
  return {
    prompt: "Choose a server",
    choices: (state: GameState) =>
      choices.filter((s) => canRunServer(state, s)),
    "change-in-game-state": {
      req: (state: GameState) =>
        (state.runnableServers ?? []).filter((s: string) => choiceSet.has(s)).length > 0,
    },
    async: true,
    msg: (
      _s: GameState,
      _sd: string,
      _e: EID,
      _c: Card | null,
      targets: unknown[],
    ) => `make a run on ${String(targets[0] ?? "")}`,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => {
      if (events && events.length && card)
        registerEvents(state, side, card, events);
      if (abBase.action) playSfx(state, side, "click-run");
      makeRun(state, side, eid, String(targets[0] ?? ""), card);
    },
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// take-credits / take-n-credits-ability
// ---------------------------------------------------------------------------

type TakeCreditsAmount = number | "all" | ":all";

export function takeCredits(
  state: GameState,
  side: string,
  card: Card | null,
  type: string,
  n: TakeCreditsAmount,
  args?: Record<string, unknown> | null,
): void;
export function takeCredits(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  type: string,
  n: TakeCreditsAmount,
  args?: Record<string, unknown> | null,
): void;
export function takeCredits(
  state: GameState,
  side: string,
  arg3: EID | Card | null,
  arg4: Card | string | null,
  arg5: string | TakeCreditsAmount,
  arg6?: TakeCreditsAmount | Record<string, unknown> | null,
  arg7?: Record<string, unknown> | null,
): void {
  let eid: EID;
  let card: Card | null;
  let type: string;
  let n: TakeCreditsAmount;
  let args: Record<string, unknown> | null;

  // Detect EID by 3rd-arg shape (object with `id` but no `title`)
  if (arg3 && typeof arg3 === "object" && "id" in arg3 && !("title" in arg3)) {
    eid = arg3 as EID;
    card = arg4 as Card | null;
    type = arg5 as string;
    n = arg6 as TakeCreditsAmount;
    args = arg7 ?? null;
  } else {
    eid = makeEID(state);
    card = arg3 as Card | null;
    type = arg4 as string;
    n = arg5 as TakeCreditsAmount;
    args = (arg6 as Record<string, unknown> | null) ?? null;
  }

  const fresh = getCard(state, card);
  if (!fresh) {
    effectCompleted(state, side, eid);
    return;
  }
  const counters = getCounters(fresh, type);
  const want = n === "all" || n === ":all" ? counters : n;
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

interface CreditAbilityBase extends Partial<Ability> {
  action?: boolean;
}

export function takeNCreditsAbility(
  n: number,
  t: string = "card",
  abBase: CreditAbilityBase | null = null,
): Ability {
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

export function takeAllCreditsAbility(
  abBase: CreditAbilityBase | null = null,
): Ability {
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

export function inHandStar(state: GameState, card: Card | null): boolean {
  return (
    inHand(card) ||
    anyEffects(
      state,
      card?.side ?? "",
      "can-play-as-if-in-hand",
      (v: unknown) => v === true,
      card,
    )
  );
}

export function allCardsInHandStar(state: GameState, side: string): Card[] {
  return getAllCards(state).filter(
    (c: Card) =>
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
  args: Record<string, unknown> | null = null,
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

export function makeRecurringAbility(ability: Ability): Ability {
  if (!ability?.recurring) return ability;
  const recurringAbility: Ability = {
    msg: "take 1 [Recurring Credits]",
    req: (_s: GameState, _side: string, _eid: EID, card: Card | null) =>
      getCounters(card, "recurring") > 0,
    async: true,
    effect: (state: GameState, side: string, eid: EID, card: Card | null) =>
      spendCredits(state, side, eid, card, "recurring", 1),
  };
  return {
    ...ability,
    abilities: [...((ability.abilities as Ability[]) ?? []), recurringAbility],
  };
}

// ---------------------------------------------------------------------------
// move-to-top / move-to-bottom
// ---------------------------------------------------------------------------

export function moveToTop(targetCard: Card, actingSide: string): Ability {
  const dest = isRunner(targetCard) ? "the Stack" : "R&D";
  return {
    msg: {
      public: (state: GameState) =>
        `add ${cardStr(state, targetCard)} from ${nameZone(targetCard.side ?? "", targetCard.zone ?? [])} to the top of ${dest}`,
      [actingSide]: (state: GameState) =>
        `add ${cardStr(state, targetCard, { maybeVisible: true })} from ${nameZone(targetCard.side ?? "", targetCard.zone ?? [])} to the top of ${dest}`,
    },
    effect: (state: GameState, side: string) =>
      move(state, side, targetCard, "deck", { front: true }),
  };
}
