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

import {
  continueAbility,
  makeRecurringAbility,
  moveToTop,
  waitFor,
} from "./def_helpers_1";

export function moveToBottom(targetCard: any, actingSide: string): any {
  const dest = isRunner(targetCard) ? "the Stack" : "R&D";
  return {
    msg: {
      public: (state: GameState) =>
        `add ${cardStr(state, targetCard)} from ${nameZone(targetCard.side, targetCard.zone)} to the bottom of ${dest}`,
      [actingSide]: (state: GameState) =>
        `add ${cardStr(state, targetCard, { "maybe-visible": true })} from ${nameZone(targetCard.side, targetCard.zone)} to the bottom of ${dest}`,
    },
    effect: (state: GameState, side: string) =>
      move(state, side, targetCard, "deck"),
  };
}

export function moveCardToTopOrBottom(
  targetCard: any,
  actingSide: string,
): any {
  const zone = isRunner(targetCard) ? "the Stack" : "R&D";
  return chooseOneHelper(
    { prompt: `Move ${(targetCard as any).title} where?` } as any,
    [
      {
        option: `Top of ${zone}`,
        ability: moveToTop(targetCard, actingSide),
      } as any,
      {
        option: `Bottom of ${zone}`,
        ability: moveToBottom(targetCard, actingSide),
      } as any,
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
  card: any,
): void {
  const cardSide = toKeyword(card?.side);
  const title = card?.title;
  if (card?.["rfg-instead-of-trashing"]) {
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

export function offerJackOut(args: { req?: any; once?: any } = {}): any {
  const { req: jackOutReq, once } = args;
  return {
    optional: {
      player: "runner",
      req: (
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: any[],
      ) => (jackOutReq ? jackOutReq(state, side, eid, card, targets) : true),
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
            `uses ${(card as any)?.title} to jack out`,
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
            `uses ${(card as any)?.title} to continue the run`,
          ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// get-x-fn
// ---------------------------------------------------------------------------

export function getXFn(): (
  state: GameState,
  side: string,
  eid: EID,
  card: any,
  targets: any[],
) => number {
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
    req: (
      _s: GameState,
      _side: string,
      _eid: EID,
      _c: Card | null,
      targets: any[],
    ) => {
      return (targets ?? []).some((entry: any) => {
        const event = entry?.event;
        const contextCard = entry?.card;
        return (
          event === eventKeyword ||
          ((event === "play-event" || event === "play-operation") &&
            !sameCard(card, contextCard) &&
            hasSubtype(contextCard, "Current"))
        );
      });
    },
    value: trashOrRfg,
  };
  return {
    ...ability,
    "static-abilities": [
      ...((ability["static-abilities"] as any[]) ?? []),
      staticAb,
    ],
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
  return allInstalled(state, "corp").some(
    (c: any) => !(c as any)?.faceup || canBeAdvanced(state, c),
  );
}

function canBeAdvanced(_state: GameState, card: any): boolean {
  // approximation — card.advanceable or agenda type
  return !!card?.advanceable || card?.type === "Agenda";
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
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      const target = targets?.[0];
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
            inner as any,
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

export function gainCreditsAbility(x: number): any {
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

export function drainCredits(
  drainingSide: string,
  victimSide: string,
  qty:
    | number
    | ((
        state: GameState,
        side: string,
        eid: EID,
        card: Card | null,
        targets: any[],
      ) => number),
  multiplier: number = 1,
  tagsToGain: number = 0,
): any {
  const toDrain = (state: GameState): number => {
    const q =
      typeof qty === "function"
        ? qty(state, drainingSide, makeEID(state), null, [])
        : qty;
    return Math.min((state as any)[victimSide]?.credit ?? 0, q);
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
          (inner) => gainTags(state, drainingSide as any, inner, tagsToGain),
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

export function corpRecur(pred: (c: any) => boolean = () => true): any {
  return {
    label: "add card from Archives to HQ",
    prompt: "Choose a card to add to HQ",
    "does-something": (state: GameState) =>
      ((state.corp as any)?.discard ?? []).length > 0,
    "waiting-prompt": true,
    "show-discard": true,
    choices: {
      card: (c: any) => isCorp(c) && inDiscard(c) && pred(c),
    },
    msg: {
      public: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: any[],
      ) => {
        const target = targets?.[0];
        return `add ${cardStr(state, target, { visible: !!(target as any)?.faceup })} to HQ`;
      },
      corp: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: any[],
      ) => {
        const target = targets?.[0];
        return `add ${cardStr(state, target, { "maybe-visible": true })} to HQ`;
      },
    },
    effect: (
      state: GameState,
      _side: string,
      _eid: EID,
      _c: Card | null,
      targets: any[],
    ) => move(state, "corp", targets?.[0], "hand"),
  };
}

// ---------------------------------------------------------------------------
// tutor-abi
// ---------------------------------------------------------------------------

export function tutorAbi(
  reveal_: boolean,
  restriction: ((c: any) => boolean) | null = null,
): any {
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
        ((state as any)[side]?.deck ?? []).filter(
          (c: any) => !restriction || restriction(c),
        ),
        true,
      ),
    msg: (
      _s: GameState,
      side: string,
      _e: EID,
      _c: Card | null,
      targets: any[],
    ) =>
      `search ${side === "corp" ? "R&D" : "[their] Stack"} for ${reveal_ ? (targets?.[0] as any)?.title : "a card"} and add it to ${side === "corp" ? "HQ" : "[their] Grip"}`,
    cancel: failToFind,
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      _c: Card | null,
      targets: any[],
    ) => {
      const target = targets?.[0];
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

export const cardDefsCache = new Map<string, any>();

import { cardDefRegistry } from "./types.ts";

/**
 * Define a card to be returned from card-def. Mirrors `defcard` macro.
 * In TS we register directly: each call records the title→definition mapping.
 */
export function defcard(
  title: string,
  ability: any,
  ...transformers: any[]
): void {
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
  const player = (state as any)[targetSide];
  const targetCards = ((player?.deck ?? []) as any[]).slice(0, quant);
  const zoneName = targetSide === "corp" ? "R&D" : "the stack";
  const scrySide = side;
  const scryFn =
    targetCards.length === 1
      ? `the top card of ${zoneName} is ${(targetCards[0] as any)?.title}`
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
      msg: { [scrySide]: scryFn } as any,
      prompt: scryFn,
    } as Ability,
    card,
    [],
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
    state: GameState,
    side: string,
    card: Card | null,
    wasOpen: boolean,
  ): () => void {
    if (wasOpen) return () => undefined;
    const events = registerEvents(
      state,
      side,
      card as Card,
      [
        {
          event: "card-moved",
          req: (
            _s: GameState,
            _sd: string,
            _e: EID,
            _c: Card | null,
            targets: any[],
          ) => {
            const sidefn = targetSide === "corp" ? isCorp : isRunner;
            const moved = targets?.[0]?.["moved-card"];
            return sidefn(moved) && inHand(moved);
          },
          silent: true,
          effect: (state2: GameState) => concealHand(state2, targetSide),
        },
      ] as any,
    );
    const uuid = (events?.[0] as any)?.uuid;
    return () => uuid && unregisterEventByUUID(state, side, uuid);
  }

  function maybeReveal(
    state: GameState,
    side: string,
    eid: EID,
    card: Card | null,
  ): void {
    if (skipReveal) {
      effectCompleted(state, side, eid);
      return;
    }
    const player = (state as any)[targetSide];
    revealLoud(state, eventSide ?? side, eid, card as Card, args, player?.hand ?? []);
  }

  return {
    async: true,
    effect: (
      state: GameState,
      side: string,
      eid: EID,
      card: Card | null,
      targets: any[],
    ) => {
      waitFor(
        state,
        eid,
        (inner) => maybeReveal(state, side, inner, card),
        () => {
          const wasOpen = !!(state as any)[targetSide]?.openhand;
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
  pred: ((c: any) => boolean) | null = null,
): any {
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
        targets: any[],
      ) => {
        const target = targets?.[0];
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
        targets: any[],
      ) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets?.[0])}`,
      corp: (
        state: GameState,
        _sd: string,
        _e: EID,
        _c: Card | null,
        targets: any[],
      ) =>
        `place ${quantify(qty, "advancement counter")} on ${cardStr(state, targets?.[0], { "maybe-visible": true })}`,
    },
    async: true,
    effect: (
      state: GameState,
      _side: string,
      eid: EID,
      _c: Card | null,
      targets: any[],
    ) =>
      addProp(state, _side, eid, targets?.[0], "advance-counter", qty, {
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
): any {
  const zone = lookingSide === "corp" ? "R&D" : "the stack";
  const seen = (state: GameState): number =>
    Math.min(qty, (((state as any)[deckSide]?.deck ?? []) as any[]).length);
  return {
    msg: {
      public: (state: GameState) =>
        `look at the top ${quantify(seen(state), "card")} of ${zone}`,
      [lookingSide]: (state: GameState) => {
        const top = (((state as any)[deckSide]?.deck ?? []) as any[]).slice(
          0,
          qty,
        );
        return `look at the top ${quantify(seen(state), "card")} of ${zone} (top->bottom): ${enumerateCards(top)}`;
      },
    },
    async: true,
    "waiting-prompt": true,
    "change-in-game-state": {
      silent: true,
      req: (state: GameState) =>
        (((state as any)[deckSide]?.deck ?? []) as any[]).length > 0,
    },
    effect: (state: GameState, side: string, eid: EID, card: Card | null) => {
      const top = (((state as any)[deckSide]?.deck ?? []) as any[]).slice(
        0,
        qty,
      );
      resolveAbility(
        state,
        side,
        {
          eid,
          prompt: `The top cards of ${zone} are (top->bottom): ${enumerateCards(top)}`,
          choices: ["OK"],
        } as Ability,
        card,
        [],
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
