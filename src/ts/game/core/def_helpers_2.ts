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
  getCard,
  canBeAdvanced,
  isFaceup,
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

import {
  continueAbility,
  makeRecurringAbility,
  moveToTop,
  waitFor,
} from "./def_helpers_1";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

import type { Corp, Runner } from "./state";

function getPlayerBySide(state: GameState, side: string): Corp | Runner {
  if (side === "corp" || side === ":corp") return state.corp;
  if (side === "runner" || side === ":runner") return state.runner;
  // Default to corp for unknown side strings (matches legacy implicit reads)
  return state.corp;
}

export function moveToBottom(targetCard: Card, actingSide: string): Ability {
  const dest = isRunner(targetCard) ? "the Stack" : "R&D";
  return {
    msg: {
      public: (state: GameState) =>
        `add ${cardStr(state, targetCard)} from ${nameZone(targetCard.side ?? "", targetCard.zone ?? [])} to the bottom of ${dest}`,
      [actingSide]: (state: GameState) =>
        `add ${cardStr(state, targetCard, { maybeVisible: true })} from ${nameZone(targetCard.side ?? "", targetCard.zone ?? [])} to the bottom of ${dest}`,
    },
    effect: (state: GameState, side: string) =>
      move(state, side, targetCard, "deck"),
  };
}

export function moveCardToTopOrBottom(
  targetCard: Card,
  actingSide: string,
): Ability {
  const zone = isRunner(targetCard) ? "the Stack" : "R&D";
  return chooseOneHelper(
    { prompt: `Move ${targetCard.title ?? ""} where?` },
    [
      {
        option: `Top of ${zone}`,
        ability: moveToTop(targetCard, actingSide),
      },
      {
        option: `Bottom of ${zone}`,
        ability: moveToBottom(targetCard, actingSide),
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// trash-or-rfg
// ---------------------------------------------------------------------------

export function trashOrRfg(
  state: GameState,
  _side: string,
  eid: EID,
  card: Card | null,
): void {
  if (!card) {
    effectCompleted(state, _side, eid);
    return;
  }
  const cardSide = toKeyword(card.side ?? "");
  const title = card.title ?? "";
  if (card["rfg-instead-of-trashing"]) {
    systemSay(state, cardSide, `${title} is removed from the game.`);
    asyncRfg(state, cardSide, eid, card);
  } else {
    systemSay(state, cardSide, `${title} is trashed.`);
    trash(state, cardSide, eid, card, {
      unpreventable: true,
      "game-trash": true,
    });
  }
}

// ---------------------------------------------------------------------------
// offer-jack-out
// ---------------------------------------------------------------------------

import type { ReqFn } from "./types";

interface OfferJackOutArgs {
  req?: ReqFn;
  once?: string;
}

export function offerJackOut(args: OfferJackOutArgs = {}): Ability {
  const { req: jackOutReq, once } = args;
  return {
    optional: {
      player: "runner",
      req: (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: unknown[],
      ) =>
        jackOutReq
          ? typeof jackOutReq === "function"
            ? jackOutReq(state, side, eid, card, targets)
            : jackOutReq
          : true,
      once,
      prompt: "Jack out?",
      "waiting-prompt": true,
      "yes-ability": {
        async: true,
        effect: (
          state: GameState,
          _side: string,
          eid: EID,
          card: Card | null,
        ) => {
          systemMsg(
            state,
            "runner",
            `uses ${card?.title ?? ""} to jack out`,
          );
          jackOut(state, "runner", eid);
        },
      },
      "no-ability": {
        effect: (
          state: GameState,
          _side: string,
          _eid: EID,
          card: Card | null,
        ) =>
          systemMsg(
            state,
            "runner",
            `uses ${card?.title ?? ""} to continue the run`,
          ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// get-x-fn
// ---------------------------------------------------------------------------

type XFnReader = (
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targets: unknown[],
) => number;

export function getXFn(): XFnReader {
  return function getXFnInner(state, side, eid, card, targets) {
    const xFn = card?.["x-fn"];
    if (!isDisabledReg(state, card) && typeof xFn === "function") {
      return (xFn as XFnReader)(state, side, eid, card, targets);
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
// make-current-event-handler
// ---------------------------------------------------------------------------

interface CurrentEventContext {
  event?: string;
  card?: Card | null;
}

export function makeCurrentEventHandler(title: string, ability: Ability): Ability {
  const card = serverCard(title, false) as Card | null;
  if (!hasSubtype(card, "Current")) return ability;
  const eventKeyword = isCorp(card) ? "agenda-stolen" : "agenda-scored";
  const staticAb = {
    type: "trash-when-expired",
    req: (
      _s: GameState,
      _side: string,
      _eid: EID,
      _c: Card | null,
      targets: unknown[],
    ) => {
      return (targets ?? []).some((entry: unknown) => {
        const ctx = entry as CurrentEventContext | null;
        const event = ctx?.event;
        const contextCard = ctx?.card ?? null;
        return (
          event === eventKeyword ||
          ((event === "play-event" || event === "play-operation") &&
            !sameCard(card, contextCard) &&
            hasSubtype(contextCard, "Current") !== undefined)
        );
      });
    },
    value: trashOrRfg,
  };
  return {
    ...ability,
    "static-abilities": [
      ...((ability["static-abilities"] as unknown[]) ?? []),
      staticAb,
    ],
  };
}

// ---------------------------------------------------------------------------
// add-default-abilities
// ---------------------------------------------------------------------------

export function addDefaultAbilities(title: string, ability: Ability): Ability {
  return makeRecurringAbility(makeCurrentEventHandler(title, ability));
}

// ---------------------------------------------------------------------------
// something-can-be-advanced?
// ---------------------------------------------------------------------------

export function somethingCanBeAdvanced(state: GameState): boolean {
  return allInstalled(state, "corp").some(
    (c: Card) => !isFaceup(c) || canBeAdvanced(state, c),
  );
}

// ---------------------------------------------------------------------------
// corp-install-up-to-n-cards
// ---------------------------------------------------------------------------

export function corpInstallUpToNCards(
  n: number,
  args: Record<string, unknown> | null = null,
): Ability {
  return {
    prompt: `install a card from HQ${n > 1 ? ` (${n} remaining)` : ""}`,
    choices: {
      card: (c: Card) => isCorp(c) && inHand(c) && !isOperation(c),
    },
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as Card;
      waitFor(
        state,
        eid,
        (inner) =>
          corpInstall(
            state,
            side,
            target,
            null,
            { ...(args ?? {}), "msg-keys": { "install-source": card } },
            inner,
          ),
        () => {
          if (n > 1) {
            continueAbility(
              state,
              side,
              eid,
              corpInstallUpToNCards(n - 1),
              card,
              [],
            );
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

export function gainCreditsAbility(x: number): Ability {
  return {
    msg: `gain ${x} [Credits]`,
    label: `gain ${x} [Credits]`,
    async: true,
    effect: (state: GameState, side: string, eid: EID) =>
      gainCredits(state, side, eid, x),
  };
}

// ---------------------------------------------------------------------------
// drain-credits
// ---------------------------------------------------------------------------

type DrainCreditsQty =
  | number
  | ((
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => number);

export function drainCredits(
  drainingSide: string,
  victimSide: string,
  qty: DrainCreditsQty,
  multiplier: number = 1,
  tagsToGain: number = 0,
): Ability {
  const toDrain = (state: GameState): number => {
    const q =
      typeof qty === "function"
        ? qty(state, drainingSide, makeEID(state), null, [])
        : qty;
    const victim = getPlayerBySide(state, victimSide);
    return Math.min(victim.credit ?? 0, q);
  };
  const toGain = (state: GameState): number => toDrain(state) * multiplier;

  return {
    msg: (state: GameState) => {
      const cap = victimSide.charAt(0).toUpperCase() + victimSide.slice(1);
      const tail =
        tagsToGain > 0
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
          state,
          eid,
          (inner) =>
            loseCredits(
              state,
              victimSide,
              cDrain,
              { "suppress-checkpoint": true },
              inner,
            ),
          () => gainCredits(state, drainingSide, eid, cGain),
        );
      } else {
        waitFor(
          state,
          eid,
          (inner) => gainTags(state, drainingSide, inner, tagsToGain),
          () =>
            waitFor(
              state,
              eid,
              (inner2) =>
                loseCredits(
                  state,
                  victimSide,
                  cDrain,
                  { "suppress-checkpoint": true },
                  inner2,
                ),
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

export function corpRecur(pred: (c: Card) => boolean = () => true): Ability {
  return {
    label: "add card from Archives to HQ",
    prompt: "Choose a card to add to HQ",
    "does-something": (state: GameState) =>
      (state.corp.discard ?? []).length > 0,
    "waiting-prompt": true,
    "show-discard": true,
    choices: {
      card: (c: Card) => isCorp(c) && inDiscard(c) && pred(c),
    },
    msg: {
      public: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: unknown[],
      ) => {
        const target = targets[0] as Card;
        return `add ${cardStr(state, target, { visible: target?.faceup === true })} to HQ`;
      },
      corp: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: unknown[],
      ) => {
        const target = targets[0] as Card;
        return `add ${cardStr(state, target, { maybeVisible: true })} to HQ`;
      },
    },
    effect: (
      state: GameState,
      _side: string,
      _eid: EID,
      _c: Card | null,
      targets: unknown[],
    ) => move(state, "corp", targets[0] as Card, "hand"),
  };
}

// ---------------------------------------------------------------------------
// tutor-abi
// ---------------------------------------------------------------------------

export function tutorAbi(
  reveal_: boolean,
  restriction: ((c: Card) => boolean) | null = null,
): Ability {
  return {
    "change-in-game-state": {
      req: (state: GameState, side: string) =>
        (getPlayerBySide(state, side).deck ?? []).length > 0,
    },
    prompt: "Choose a card",
    // clj uses a side-dispatched label function; flatten to the more common
    // generic phrasing here. Caller can override via the merged-in transformer.
    label: "Search your deck and add 1 card to your hand",
    choices: (state: GameState, side: string) =>
      cancellable(
        (getPlayerBySide(state, side).deck ?? []).filter(
          (c: Card) => !restriction || restriction(c),
        ),
        true,
      ),
    msg: (
      _s: GameState,
      side: string,
      _e: EID,
      _c: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as Card | undefined;
      return `search ${side === "corp" ? "R&D" : "[their] Stack"} for ${reveal_ ? target?.title ?? "" : "a card"} and add it to ${side === "corp" ? "HQ" : "[their] Grip"}`;
    },
    cancel: failToFind,
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      _c: Card | null,
      targets: unknown[],
    ) => {
      const target = targets[0] as Card;
      if (side === "runner") triggerEvent(state, side, "searched-stack");
      if (reveal_) {
        waitFor(
          state,
          eid,
          (inner) => reveal(state, side, inner, target),
          () => {
            move(state, side, target, "hand");
            shuffleDeck(state, side);
            effectCompleted(state, side, eid);
          },
        );
      } else {
        move(state, side, target, "hand");
        shuffleDeck(state, side);
        effectCompleted(state, side, eid);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// card-defs cache + defcard
// ---------------------------------------------------------------------------

export const cardDefsCache = new Map<string, Ability>();

import { cardDefRegistry } from "./types";

type DefcardTransformer = ((a: Ability) => Ability) | Partial<Ability>;

/**
 * Define a card to be returned from card-def. Mirrors `defcard` macro.
 * In TS we register directly: each call records the title→definition mapping.
 */
export function defcard(
  title: string,
  ability: Ability,
  ...transformers: DefcardTransformer[]
): void {
  cardDefsCache.delete(title);
  // Apply transformers right-to-left (mirroring `(reverse (cons body more))`).
  let result: Ability = ability;
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

export const trashOnPurge: Ability = {
  event: "purge",
  async: true,
  msg: "trash itself",
  effect: (state: GameState, _side: string, eid: EID, card: Card | null) =>
    trash(state, "runner", eid, card as Card, {
      cause: "purge",
      "cause-card": card,
    }),
};

// ---------------------------------------------------------------------------
// scry
// ---------------------------------------------------------------------------

export function scry(
  state: GameState,
  side: string,
  eid: EID,
  card: Card | null,
  targetSide: string,
  quant: number,
): void {
  const player = getPlayerBySide(state, targetSide);
  const targetCards = (player.deck ?? []).slice(0, quant);
  const zoneName = targetSide === "corp" ? "R&D" : "the stack";
  const scrySide = side;
  const scryFn =
    targetCards.length === 1
      ? `the top card of ${zoneName} is ${targetCards[0]?.title ?? ""}`
      : `the top ${quantify(quant, "card")} of ${zoneName} are (top->bottom): ${enumerateCards(targetCards)}`;

  resolveAbility(
    state,
    side,
    {
      eid,
      player: side,
      "waiting-prompt": true,
      req: () => targetCards.length > 0,
      choices: ["OK"],
      msg: { [scrySide]: scryFn },
      prompt: scryFn,
    },
    card,
    [],
  );
}

// ---------------------------------------------------------------------------
// with-revealed-hand
// ---------------------------------------------------------------------------

interface WithRevealedHandArgs {
  eventSide?: string;
  forced?: boolean;
  skipReveal?: boolean;
  [key: string]: unknown;
}

interface CardMovedContext {
  "moved-card"?: Card;
}

export function withRevealedHand(
  targetSide: string,
  argsOrAbi: WithRevealedHandArgs | Ability,
  abi?: Ability,
): Ability {
  let args: WithRevealedHandArgs = {};
  let ability: Ability;
  if (abi === undefined) {
    ability = argsOrAbi as Ability;
  } else {
    args = (argsOrAbi as WithRevealedHandArgs) ?? {};
    ability = abi;
  }
  const { eventSide, skipReveal } = args;

  function maybeRegisterEv(
    state: GameState,
    side: string,
    card: Card | null,
    wasOpen: boolean,
  ): () => void {
    if (wasOpen || !card) return () => undefined;
    const events = registerEvents(state, side, card, [
      {
        event: "card-moved",
        req: (
          _s: GameState,
          _sd: string,
          _e: EID,
          _c: Card | null,
          targets: unknown[],
        ) => {
          const sidefn = targetSide === "corp" ? isCorp : isRunner;
          const ctx = targets[0] as CardMovedContext | undefined;
          const moved = ctx?.["moved-card"];
          return Boolean(moved && sidefn(moved) && inHand(moved));
        },
        silent: true,
        effect: (state2: GameState) => concealHand(state2, targetSide),
      },
    ]);
    const first = events?.[0] as { uuid?: string } | undefined;
    const uuid = first?.uuid;
    return () => uuid && unregisterEventByUUID(state, side, uuid);
  }

  function maybeReveal(
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
  ): void {
    if (skipReveal || !card) {
      effectCompleted(state, side, eid);
      return;
    }
    const player = getPlayerBySide(state, targetSide);
    revealLoud(state, eventSide ?? side, eid, card, args, player.hand ?? []);
  }

  return {
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: unknown[],
    ) => {
      waitFor(
        state,
        eid,
        (inner) => maybeReveal(state, side, inner, card),
        () => {
          const wasOpen = Boolean(getPlayerBySide(state, targetSide).openhand);
          const unregister = maybeRegisterEv(state, side, card, wasOpen);
          if (!wasOpen) revealHand(state, targetSide);
          waitFor(
            state,
            eid,
            (inner) =>
              resolveAbility(
                state,
                side,
                { ...ability, eid: inner },
                card,
                targets,
              ),
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
  advanceableOnly: boolean | null,
  qty: number = 1,
  cardLine: string = "a card",
  pred: ((c: Card) => boolean) | null = null,
): Ability {
  const onlyAdvanceable = advanceableOnly === true;
  const label = `Place ${quantify(qty, "advancement counter")} on ${cardLine}${onlyAdvanceable ? " that can be advanced" : ""}`;
  return {
    label,
    prompt: label,
    choices: {
      req: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: unknown[],
      ) => {
        const target = targets[0] as Card | undefined;
        if (!target) return false;
        return (
          isCorp(target) &&
          isInstalled(target) &&
          (!pred || pred(target)) &&
          (!onlyAdvanceable || canBeAdvanced(state, target))
        );
      },
    },
    msg: {
      public: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: unknown[],
      ) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets[0] as Card)}`,
      corp: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: unknown[],
      ) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets[0] as Card, { maybeVisible: true })}`,
    },
    async: true,
    effect: (
      state: GameState,
      _side: string,
      eid: EID,
      _c: Card | null,
      targets: unknown[],
    ) =>
      addProp(state, _side, eid, targets[0] as Card, "advance-counter", qty, {
        placed: true,
      }),
  };
}

// ---------------------------------------------------------------------------
// look-at-the-top
// ---------------------------------------------------------------------------

export function lookAtTheTop(
  lookingSide: string,
  deckSide: string,
  qty: number,
): Ability {
  const zone = lookingSide === "corp" ? "R&D" : "the stack";
  const seen = (state: GameState): number =>
    Math.min(qty, (getPlayerBySide(state, deckSide).deck ?? []).length);
  return {
    msg: {
      public: (state: GameState) =>
        `look at the top ${quantify(seen(state), "card")} of ${zone}`,
      [lookingSide]: (state: GameState) => {
        const top = (getPlayerBySide(state, deckSide).deck ?? []).slice(0, qty);
        return `look at the top ${quantify(seen(state), "card")} of ${zone} (top->bottom): ${enumerateCards(top)}`;
      },
    },
    async: true,
    "waiting-prompt": true,
    "change-in-game-state": {
      silent: true,
      req: (state: GameState) =>
        (getPlayerBySide(state, deckSide).deck ?? []).length > 0,
    },
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      const top = (getPlayerBySide(state, deckSide).deck ?? []).slice(0, qty);
      resolveAbility(
        state,
        side,
        {
          eid,
          prompt: `The top cards of ${zone} are (top->bottom): ${enumerateCards(top)}`,
          choices: ["OK"],
        },
        card,
        [],
      );
    },
  };
}

// ---------------------------------------------------------------------------
// make-icon
// ---------------------------------------------------------------------------

export function makeIcon(text: string, card: Card): [string, string, string] {
  return [text, card.cid ?? "", factionLabel(card)];
}
