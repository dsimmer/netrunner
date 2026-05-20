/**
 * Core access functions (part 2)
 * Ported from Clojure core/access.clj to TypeScript
 */

import type { GameState } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import * as coreCard from "./card";
import * as coreTypes from "./types";
import * as coreEffects from "./effects";
import * as coreEid from "./eid";
import * as coreEngine from "./engine";
import * as coreFlags from "./flags";
import * as corePayment from "./payment";
import * as coreSay from "./say";
import * as coreServers from "./servers";
import * as utils from "../utils";
import { req, wait_for, continue_ability } from "../macros";
import { shouldTrigger } from "./moving_1";

import {
  accessCard,
  accessBonusCount,
  getAllContent,
  getOnlyCardToAccess,
  getServerType,
  mustContinue,
  rootContent,
} from "./access_1";

// AccessAmount mirrors the CLJ access-amount map.
// Kebab-case keys are canonical (mirroring the CLJ map); camelCase aliases are
// accepted for back-compat with card code already in the tree.
export interface AccessAmount {
  chosen: number;
  "total-mod"?: number;
  "random-access-limit"?: number;
  totalMod?: number;
  randomAccessLimit?: number;
}

// --- choose-access (multi-method) ------------------------------------------

type ChooseAccessFn = (
  state: GameState,
  side: string,
  eid: EID,
  accessAmount: AccessAmount,
  server: string[],
  args: Record<string, unknown>,
) => void;

const chooseAccessMap: Record<string, ChooseAccessFn> = {};

export function registerChooseAccess(serverType: string, fn: ChooseAccessFn): void {
  chooseAccessMap[serverType] = fn;
}

/**
 * Choose which cards to access.
 * Clojure multi-method dispatch on server type.
 */
export function chooseAccess(
  state: GameState,
  side: string,
  eid: EID,
  accessAmount: AccessAmount,
  server: string[],
  args: Record<string, unknown>,
): void {
  const serverType = server.length ? getServerType(server) : "remote";
  const fn = chooseAccessMap[serverType] || chooseAccessMap["remote"];
  if (!fn) {
    coreSay.systemMsg(state, side, `No choose-access registered for ${serverType}`);
    coreEid.effectCompleted(state, side, eid);
    return;
  }
  fn(state, side, eid, accessAmount, server, args);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function alreadyAccessedFnFor(alreadyAccessed: Set<string>): (c: Card) => boolean {
  return (c) => alreadyAccessed.has(c.cid);
}

/**
 * Resolve an Ability returned by an access-helper, or call effectCompleted
 * if the helper returned null. Threads the outer eid through ability.eid so
 * effects can complete the original work.
 */
function resolveAccessAbility(
  state: GameState,
  side: string,
  eid: EID,
  ability: Ability | null,
): void {
  if (!ability) {
    coreEid.effectCompleted(state, side, eid);
    return;
  }
  const withEid: Ability = { ...ability, eid };
  continue_ability(state, side, withEid, null as unknown as Card, null);
}

// Mirrors: accessible? (private)
function accessible(state: GameState, card: Card): boolean {
  if (coreCard.agenda(card)) return true;
  const cdef = coreTypes.getCardDef(card);
  const onAccess = (cdef as unknown as Record<string, unknown>)?.["on-access"] as Ability | undefined;
  if (!onAccess) return false;
  return shouldTrigger(state, "corp", coreEid.makeEID(state), card, [], onAccess);
}

// Mirrors: get-archives-accessible (private)
function getArchivesAccessible(state: GameState): Card[] {
  return state.corp.discard.filter((c: Card) => c.seen && accessible(state, c));
}

// Mirrors: get-archives-inactive (private)
function getArchivesInactive(state: GameState): Card[] {
  return state.corp.discard.filter((c: Card) => c.seen && !accessible(state, c));
}

// Mirrors: faceup-accessible
export function faceupAccessible(
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
): Card[] {
  const only = getOnlyCardToAccess(state);
  const source = only ? [only] : getArchivesAccessible(state);
  return source.filter((c: Card) => !alreadyAccessedFn(c));
}

// Mirrors: facedown-cards
export function facedownCards(
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
): Card[] {
  const only = getOnlyCardToAccess(state);
  const source = only ? [only] : state.corp.discard;
  return source.filter((c: Card) => !c.seen && !alreadyAccessedFn(c));
}

// Mirrors: archives-inactive (kept for back-compat; matches get-archives-inactive
// minus the already-accessed filter, then applies it).
export function archivesInactive(
  state: GameState,
  alreadyAccessedFn: (card: Card) => boolean,
): Card[] {
  return getArchivesInactive(state).filter((c: Card) => !alreadyAccessedFn(c));
}

// Mirrors: access-inactive-archives-cards (private). Walks the inactive cards
// list, auto-accessing each one until the limit is reached, then completes
// with the list of cards we actually accessed.
function accessInactiveArchivesCards(
  state: GameState,
  side: string,
  eid: EID,
  cards: Card[],
  accessAmount: AccessAmount,
  accessedCards: Card[] = [],
): void {
  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const totalMod = accessAmount["total-mod"] ?? 0;
  const limitReached =
    typeof maxAccessVal === "number" && maxAccessVal + totalMod <= accessAmount.chosen;

  if (cards.length === 0 || limitReached) {
    coreEid.completeWithResult(state, side, eid, accessedCards);
    return;
  }

  const [first, ...rest] = cards;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _binds: unknown) {
        const nextAmount: AccessAmount = {
          "total-mod": accessBonusCount(s, side, "total"),
          chosen: accessAmount.chosen + 1,
        };
        accessInactiveArchivesCards(s, side, eid, rest, nextAmount, [first, ...accessedCards]);
      },
    ],
    [accessCard, state, side, eid, first, undefined, { "no-msg": true }],
  );
}

// Mirrors: access-cards-from-rd (private). The CLJ implementation looks up the
// runner's :rd-access-fn (e.g. patched by R&D Interface effects) and applies
// it to the deck. The function takes the deck as its sole argument.
export function accessCardsFromRd(state: GameState): Card[] {
  const accessFn = (state.runner as unknown as Record<string, unknown>)["rd-access-fn"] as
    | ((deck: Card[]) => Card[])
    | undefined;
  const deck = state.corp.deck;
  return accessFn ? accessFn(deck) : deck;
}

// Mirrors: access-cards-from-hq (private).
export function accessCardsFromHq(state: GameState): Card[] {
  const accessFn = (state.runner as unknown as Record<string, unknown>)["hq-access-fn"] as
    | ((hand: Card[]) => Card[])
    | undefined;
  const hand = state.corp.hand;
  return accessFn ? accessFn(hand) : hand;
}

// ---------------------------------------------------------------------------
// access-helper-remote
// ---------------------------------------------------------------------------

/**
 * Mirrors: access-helper-remote
 * Returns an Ability that drives the remote access prompt loop, or null when
 * there is nothing left to do.
 */
export function accessHelperRemote(
  state: GameState,
  accessAmount: AccessAmount,
  alreadyAccessed: Set<string>,
  args: Record<string, unknown>,
): Ability | null {
  const server = args.server as string[];
  const serverKey = server[0];

  const currentAvailable = new Set(
    rootContent(state, serverKey).map((c: Card) => c.cid),
  );
  const filteredAccessed = new Set<string>();
  for (const cid of alreadyAccessed) {
    if (currentAvailable.has(cid)) filteredAccessed.add(cid);
  }
  const accessedFn = alreadyAccessedFnFor(filteredAccessed);
  const available = rootContent(state, serverKey, accessedFn);

  if (
    available.length === 0 ||
    !mustContinue(state, accessedFn, accessAmount, args)
  ) {
    return null;
  }

  const recurseAfter = (
    accessed: Card,
  ): ((s: GameState, _e: EID, _b: unknown) => void) =>
    function (s: GameState, _e: EID, _b: unknown) {
      const newAccessed = new Set(filteredAccessed);
      newAccessed.add(accessed.cid);
      const nextAmount: AccessAmount = {
        "total-mod": accessBonusCount(s, "runner", "total"),
        chosen: accessAmount.chosen + 1,
      };
      const next = accessHelperRemote(s, nextAmount, newAccessed, args);
      resolveAccessAbility(s, "runner", _e, next);
    };

  if (available.length === 1) {
    const only = available[0];
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        wait_for(
          s,
          [{ asyncResult: "result" }, recurseAfter(only)],
          [accessCard, s, "runner", e, only],
        );
        return null;
      }),
    };
  }

  return {
    async: true,
    prompt: "Click a card to access it. You must access all cards in this server.",
    choices: {
      card: (c: Card) => available.some((a: Card) => utils.sameCard(a, c)),
      all: true,
    },
    effect: req(function (s: GameState, _side: string, e: EID, _card: Card, targets: unknown[]) {
      const target = targets?.[0] as Card;
      wait_for(
        s,
        [{ asyncResult: "result" }, recurseAfter(target)],
        [accessCard, s, "runner", e, target],
      );
      return null;
    }),
  };
}

// ---------------------------------------------------------------------------
// access-helper-rd
// ---------------------------------------------------------------------------

export function accessHelperRd(
  state: GameState,
  accessAmount: AccessAmount,
  alreadyAccessed: Set<string>,
  args: Record<string, unknown>,
): Ability | null {
  const noRoot = Boolean(args["no-root"]);
  const accessedFn = alreadyAccessedFnFor(alreadyAccessed);
  const randomLimit = accessAmount["random-access-limit"] ?? 0;

  const deck = accessCardsFromRd(state);
  const cardToAccess = deck.find((c: Card) => !accessedFn(c)) ?? null;

  const CARD_FROM = "Card from deck";
  const disableRandomAccesses = coreEffects.anyEffects(
    state,
    "runner",
    ":disable-random-accesses",
    (v) => v === true,
    null,
    [],
  );
  const cardFromButton =
    randomLimit > 0 && !disableRandomAccesses && cardToAccess ? [CARD_FROM] : [];

  const root = rootContent(state, "rd", accessedFn);
  const upgradeButtons = noRoot
    ? []
    : root.filter((c: Card) => coreCard.rezzed(c)).map((c: Card) => c.title);

  const UNREZZED = "Unrezzed upgrade";
  const unrezzedButton =
    !noRoot && root.some((c: Card) => !coreCard.rezzed(c)) ? [UNREZZED] : [];

  const choices = [...cardFromButton, ...upgradeButtons, ...unrezzedButton];

  if (choices.length === 0 || !mustContinue(state, accessedFn, accessAmount, args)) {
    return null;
  }

  const nextAmountAfter = (decRandom: boolean): AccessAmount => ({
    "random-access-limit": decRandom ? randomLimit - 1 : randomLimit,
    "total-mod": accessBonusCount(state, "runner", "total"),
    chosen: accessAmount.chosen + 1,
  });

  const cardFromDeckFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    if (!cardToAccess) {
      resolveAccessAbility(s, "runner", e, null);
      return null;
    }
    wait_for(
      s,
      [
        { asyncResult: "result" },
        function (s2: GameState, _e: EID, _b: unknown) {
          const shuffled = ((s2.run as unknown as Record<string, unknown>)
            ?.["shuffled-during-access"] as Record<string, unknown> | undefined)?.["rd"];
          let newAccessed: Set<string>;
          if (shuffled) {
            const rootCids = new Set(
              rootContent(s2, "rd").map((c: Card) => c.cid),
            );
            newAccessed = new Set();
            for (const cid of alreadyAccessed) {
              if (rootCids.has(cid)) newAccessed.add(cid);
            }
            const sd = (s2.run as unknown as Record<string, unknown>)["shuffled-during-access"] as Record<string, unknown>;
            delete sd["rd"];
          } else {
            newAccessed = new Set(alreadyAccessed);
            newAccessed.add(cardToAccess.cid);
          }
          const next = accessHelperRd(
            s2,
            nextAmountAfter(true),
            newAccessed,
            args,
          );
          resolveAccessAbility(s2, "runner", e, next);
        },
      ],
      [accessCard, s, "runner", e, cardToAccess, "an unseen card"],
    );
    return null;
  });

  const unrezzedCardsFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    const unrezzed = root.filter((c: Card) => !coreCard.rezzed(c));
    if (unrezzed.length === 1) {
      const only = unrezzed[0];
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e: EID, _b: unknown) {
            const newAccessed = new Set(alreadyAccessed);
            newAccessed.add(only.cid);
            const next = accessHelperRd(
              s2,
              nextAmountAfter(false),
              newAccessed,
              args,
            );
            resolveAccessAbility(s2, "runner", e, next);
          },
        ],
        [accessCard, s, "runner", e, only],
      );
      return null;
    }
    continue_ability(
      s,
      "runner",
      {
        async: true,
        prompt: "Choose an upgrade in root of R&D to access",
        choices: {
          card: (c: Card) => unrezzed.some((u: Card) => utils.sameCard(u, c)),
        },
        eid: e,
        effect: req(function (
          s2: GameState,
          _side2: string,
          e2: EID,
          _c: Card,
          targets: unknown[],
        ) {
          const target = targets?.[0] as Card;
          wait_for(
            s2,
            [
              { asyncResult: "result" },
              function (s3: GameState, _e3: EID, _b: unknown) {
                const newAccessed = new Set(alreadyAccessed);
                newAccessed.add(target.cid);
                const next = accessHelperRd(
                  s3,
                  nextAmountAfter(false),
                  newAccessed,
                  args,
                );
                resolveAccessAbility(s3, "runner", e2, next);
              },
            ],
            [accessCard, s2, "runner", e2, target],
          );
          return null;
        }),
      },
      null as unknown as Card,
      null,
    );
    return null;
  });

  // single-choice fast paths (mirror CLJ cond branches)
  if (sameArray(choices, cardFromButton)) {
    return { async: true, effect: cardFromDeckFn };
  }
  if (sameArray(choices, unrezzedButton)) {
    return { async: true, effect: unrezzedCardsFn };
  }
  if (sameArray(choices, upgradeButtons) && upgradeButtons.length === 1) {
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        const upgrade = root.find((c: Card) => coreCard.rezzed(c))!;
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e: EID, _b: unknown) {
              const newAccessed = new Set(alreadyAccessed);
              newAccessed.add(upgrade.cid);
              const next = accessHelperRd(
                s2,
                nextAmountAfter(false),
                newAccessed,
                args,
              );
              resolveAccessAbility(s2, "runner", e, next);
            },
          ],
          [accessCard, s, "runner", e, upgrade],
        );
        return null;
      }),
    };
  }

  return {
    async: true,
    prompt: "Choose a card to access",
    choices: choices,
    effect: req(function (
      s: GameState,
      side: string,
      e: EID,
      _c: Card,
      targets: unknown[],
    ) {
      const target = targets?.[0] as string;
      if (target === CARD_FROM) {
        cardFromDeckFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      if (target === UNREZZED) {
        unrezzedCardsFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      const accessed = root.find((c: Card) => c.title === target);
      if (!accessed) {
        resolveAccessAbility(s, "runner", e, null);
        return null;
      }
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e2: EID, _b: unknown) {
            const newAccessed = new Set(alreadyAccessed);
            newAccessed.add(accessed.cid);
            const next = accessHelperRd(
              s2,
              nextAmountAfter(false),
              newAccessed,
              args,
            );
            resolveAccessAbility(s2, "runner", e, next);
          },
        ],
        [accessCard, s, "runner", e, accessed],
      );
      return null;
    }),
  };
}

// ---------------------------------------------------------------------------
// access-helper-hq
// ---------------------------------------------------------------------------

export function accessHelperHq(
  state: GameState,
  accessAmount: AccessAmount,
  alreadyAccessed: Set<string>,
  args: Record<string, unknown>,
): Ability | null {
  const noRoot = Boolean(args["no-root"]);
  const accessFirst = (args["access-first"] as Card[] | undefined) ?? [];
  const randomLimit = accessAmount["random-access-limit"] ?? 0;
  const accessedFn = alreadyAccessedFnFor(alreadyAccessed);

  const preventHandAccess = Boolean((state.run as unknown as Record<string, unknown>)?.["prevent-hand-access"]);
  const disableRandomAccesses = coreEffects.anyEffects(
    state,
    "runner",
    ":disable-random-accesses",
    (v) => v === true,
    null,
    [],
  );
  const hand = !preventHandAccess && !disableRandomAccesses ? state.corp.hand : [];

  const CARD_FROM = "Card from hand";
  const cardFromButton =
    randomLimit > 0 && hand.some((c: Card) => !accessedFn(c)) ? [CARD_FROM] : [];

  const root = rootContent(state, "hq", accessedFn);
  const upgradeButtons = noRoot
    ? []
    : root.filter((c: Card) => coreCard.rezzed(c)).map((c: Card) => c.title);

  const UNREZZED = "Unrezzed upgrade";
  const unrezzedButton =
    !noRoot && root.some((c: Card) => !coreCard.rezzed(c)) ? [UNREZZED] : [];

  const choices = [...cardFromButton, ...upgradeButtons, ...unrezzedButton];

  if (choices.length === 0 || !mustContinue(state, accessedFn, accessAmount, args)) {
    return null;
  }

  const nextAmountAfter = (decRandom: boolean): AccessAmount => ({
    "random-access-limit": decRandom ? randomLimit - 1 : randomLimit,
    "total-mod": accessBonusCount(state, "runner", "total"),
    chosen: accessAmount.chosen + 1,
  });

  // Continues a recursive HQ access after a single card was accessed.
  const continueAfter = (
    accessed: Card,
    decRandom: boolean,
    nextArgs: Record<string, unknown> = args,
  ) =>
    function (s: GameState, e: EID) {
      const newAccessed = new Set(alreadyAccessed);
      newAccessed.add(accessed.cid);
      const next = accessHelperHq(
        s,
        nextAmountAfter(decRandom),
        newAccessed,
        nextArgs,
      );
      resolveAccessAbility(s, "runner", e, next);
    };

  const corpChoosesAccess = coreEffects.anyEffects(
    state,
    "runner",
    ":corp-choose-hq-access",
    (v) => v === true,
    null,
    [],
  );

  const cardFromHandFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    if (corpChoosesAccess) {
      continue_ability(
        s,
        "corp",
        {
          async: true,
          prompt:
            "Choose a card in HQ for the Runner to access (clicking done will randomly choose a candidate)",
          "waiting-prompt": true,
          choices: {
            card: (c: Card) =>
              coreCard.inHand(c) && c.side === "Corp" && !accessedFn(c),
          },
          eid: e,
          effect: req(function (
            s2: GameState,
            _side2: string,
            e2: EID,
            _c: Card,
            targets: unknown[],
          ) {
            const target = targets?.[0] as Card;
            wait_for(
              s2,
              [
                { asyncResult: "result" },
                function (s3: GameState, _e: EID, _b: unknown) {
                  continueAfter(target, true)(s3, e2);
                },
              ],
              [accessCard, s2, "runner", e2, target, target.title],
            );
            return null;
          }),
          cancel: {
            async: true,
            effect: req(function (s2: GameState, side2: string, e2: EID) {
              const accessed = accessCardsFromHq(s2).find((c: Card) => !accessedFn(c));
              if (!accessed) {
                resolveAccessAbility(s2, "runner", e2, null);
                return null;
              }
              coreSay.systemMsg(
                s2,
                side2,
                `randomly chooses ${accessed.title} to be accessed`,
              );
              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e: EID, _b: unknown) {
                    continueAfter(accessed, true)(s3, e2);
                  },
                ],
                [accessCard, s2, "runner", e2, accessed, accessed.title],
              );
              return null;
            }),
          },
        },
        null as unknown as Card,
        null,
      );
      return null;
    }
    const accessed = accessCardsFromHq(s).find((c: Card) => !accessedFn(c));
    if (!accessed) {
      resolveAccessAbility(s, "runner", e, null);
      return null;
    }
    wait_for(
      s,
      [
        { asyncResult: "result" },
        function (s2: GameState, _e: EID, _b: unknown) {
          continueAfter(accessed, true)(s2, e);
        },
      ],
      [accessCard, s, "runner", e, accessed, accessed.title],
    );
    return null;
  });

  const unrezzedCardsFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    const unrezzed = root.filter((c: Card) => !coreCard.rezzed(c));
    if (unrezzed.length === 1) {
      const only = unrezzed[0];
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e: EID, _b: unknown) {
            continueAfter(only, false)(s2, e);
          },
        ],
        [accessCard, s, "runner", e, only],
      );
      return null;
    }
    continue_ability(
      s,
      "runner",
      {
        async: true,
        prompt: "Choose an upgrade in root of HQ to access",
        choices: {
          card: (c: Card) => unrezzed.some((u: Card) => utils.sameCard(u, c)),
        },
        eid: e,
        effect: req(function (
          s2: GameState,
          _side2: string,
          e2: EID,
          _c: Card,
          targets: unknown[],
        ) {
          const target = targets?.[0] as Card;
          wait_for(
            s2,
            [
              { asyncResult: "result" },
              function (s3: GameState, _e: EID, _b: unknown) {
                continueAfter(target, false)(s3, e2);
              },
            ],
            [accessCard, s2, "runner", e2, target],
          );
          return null;
        }),
      },
      null as unknown as Card,
      null,
    );
    return null;
  });

  // Forced access of pre-specified cards (e.g. Conduit), takes priority over
  // the regular flow.
  if (accessFirst.length > 0) {
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        const accessed = accessFirst[0];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e: EID, _b: unknown) {
              continueAfter(accessed, true, {
                ...args,
                "access-first": accessFirst.slice(1),
              })(s2, e);
            },
          ],
          [accessCard, s, "runner", e, accessed, accessed.title],
        );
        return null;
      }),
    };
  }

  // Single-choice fast paths
  if (sameArray(choices, cardFromButton)) {
    return { async: true, effect: cardFromHandFn };
  }
  if (sameArray(choices, unrezzedButton)) {
    return { async: true, effect: unrezzedCardsFn };
  }
  if (sameArray(choices, upgradeButtons) && upgradeButtons.length === 1) {
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        const upgrade = root.find((c: Card) => coreCard.rezzed(c))!;
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e: EID, _b: unknown) {
              continueAfter(upgrade, false)(s2, e);
            },
          ],
          [accessCard, s, "runner", e, upgrade],
        );
        return null;
      }),
    };
  }

  return {
    async: true,
    prompt: "Choose a card to access",
    choices: choices,
    effect: req(function (
      s: GameState,
      side: string,
      e: EID,
      _c: Card,
      targets: unknown[],
    ) {
      const target = targets?.[0] as string;
      if (target === CARD_FROM) {
        cardFromHandFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      if (target === UNREZZED) {
        unrezzedCardsFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      const accessed = root.find((c: Card) => c.title === target);
      if (!accessed) {
        resolveAccessAbility(s, "runner", e, null);
        return null;
      }
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e: EID, _b: unknown) {
            continueAfter(accessed, false)(s2, e);
          },
        ],
        [accessCard, s, "runner", e, accessed],
      );
      return null;
    }),
  };
}

// ---------------------------------------------------------------------------
// access-helper-archives
// ---------------------------------------------------------------------------

export function accessHelperArchives(
  state: GameState,
  accessAmount: AccessAmount,
  alreadyAccessed: Set<string>,
  args: Record<string, unknown>,
): Ability | null {
  const noRoot = Boolean(args["no-root"]);

  // Filter alreadyAccessed to current cids (cards may have moved zones).
  const currentAvailable = new Set<string>([
    ...state.corp.discard.map((c: Card) => c.cid),
    ...rootContent(state, "archives").map((c: Card) => c.cid),
  ]);
  const filteredAccessed = new Set<string>();
  for (const cid of alreadyAccessed) {
    if (currentAvailable.has(cid)) filteredAccessed.add(cid);
  }
  const accessedFn = alreadyAccessedFnFor(filteredAccessed);

  const faceupCardsButtons = faceupAccessible(state, accessedFn).map((c: Card) => c.title);
  const UNREZZED = "Unrezzed upgrade";
  const root = rootContent(state, "archives", accessedFn);
  const unrezzedButton =
    !noRoot && root.some((c: Card) => !coreCard.rezzed(c)) ? [UNREZZED] : [];
  const upgradeButtons = noRoot
    ? []
    : root.filter((c: Card) => coreCard.rezzed(c)).map((c: Card) => c.title);
  const FACEDOWN = "Facedown card in Archives";
  const facedownButton =
    facedownCards(state, accessedFn).length > 0 ? [FACEDOWN] : [];
  const EVERYTHING_ELSE = "Everything else";
  const inactiveCids = new Set(getArchivesInactive(state).map((c: Card) => c.cid));
  const everythingElseButton = (() => {
    for (const cid of inactiveCids) {
      if (!filteredAccessed.has(cid)) return [EVERYTHING_ELSE];
    }
    return [];
  })();

  const choices = [
    ...faceupCardsButtons,
    ...upgradeButtons,
    ...facedownButton,
    ...unrezzedButton,
    ...everythingElseButton,
  ];

  if (choices.length === 0 || !mustContinue(state, accessedFn, accessAmount, args)) {
    return null;
  }

  const nextAmount = (chosen: number): AccessAmount => ({
    "total-mod": accessBonusCount(state, "runner", "total"),
    chosen,
  });

  const continueAfter = (accessed: Card) =>
    function (s: GameState, e: EID) {
      const newAccessed = new Set(filteredAccessed);
      newAccessed.add(accessed.cid);
      const next = accessHelperArchives(
        s,
        nextAmount(accessAmount.chosen + 1),
        newAccessed,
        args,
      );
      resolveAccessAbility(s, "runner", e, next);
    };

  const unrezzedCardsFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    const unrezzed = root.filter((c: Card) => !coreCard.rezzed(c));
    if (unrezzed.length === 1) {
      const only = unrezzed[0];
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e: EID, _b: unknown) {
            continueAfter(only)(s2, e);
          },
        ],
        [accessCard, s, "runner", e, only],
      );
      return null;
    }
    continue_ability(
      s,
      "runner",
      {
        async: true,
        prompt: "Choose an upgrade in Archives to access",
        choices: {
          card: (c: Card) => {
            const zone = coreCard.getZone(c);
            return (zone as string[])?.[1] === "archives" && !filteredAccessed.has(c.cid);
          },
        },
        eid: e,
        effect: req(function (
          s2: GameState,
          _side2: string,
          e2: EID,
          _c: Card,
          targets: unknown[],
        ) {
          const target = targets?.[0] as Card;
          wait_for(
            s2,
            [
              { asyncResult: "result" },
              function (s3: GameState, _e: EID, _b: unknown) {
                continueAfter(target)(s3, e2);
              },
            ],
            [accessCard, s2, "runner", e2, target],
          );
          return null;
        }),
      },
      null as unknown as Card,
      null,
    );
    return null;
  });

  const facedownCardsFn = req(function (
    s: GameState,
    _side: string,
    e: EID,
  ) {
    const candidates = facedownCards(s, accessedFn);
    if (candidates.length === 0) {
      resolveAccessAbility(s, "runner", e, null);
      return null;
    }
    const shuffled = candidates.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const accessed = shuffled[0];
    wait_for(
      s,
      [
        { asyncResult: "result" },
        function (s2: GameState, _e: EID, _b: unknown) {
          continueAfter(accessed)(s2, e);
        },
      ],
      [accessCard, s, "runner", e, accessed],
    );
    return null;
  });

  const everythingElseFn = req(function (
    s: GameState,
    side: string,
    e: EID,
  ) {
    const cards = getArchivesInactive(s);
    coreSay.systemMsg(s, side, "accesses everything else in Archives");
    wait_for(
      s,
      [
        { asyncResult: "result" },
        function (s2: GameState, _e: EID, binds: { asyncResult?: unknown }) {
          const accessedList = (binds?.asyncResult as Card[]) ?? [];
          const newAccessed = new Set(filteredAccessed);
          for (const c of accessedList) newAccessed.add(c.cid);
          const next = accessHelperArchives(
            s2,
            nextAmount(accessAmount.chosen + accessedList.length),
            newAccessed,
            args,
          );
          resolveAccessAbility(s2, "runner", e, next);
        },
      ],
      [accessInactiveArchivesCards, s, "runner", e, cards, accessAmount],
    );
    return null;
  });

  // Single-choice fast paths
  if (sameArray(choices, unrezzedButton)) {
    return { async: true, effect: unrezzedCardsFn };
  }
  if (sameArray(choices, upgradeButtons) && upgradeButtons.length === 1) {
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        const upgrade = root.find((c: Card) => coreCard.rezzed(c))!;
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e: EID, _b: unknown) {
              continueAfter(upgrade)(s2, e);
            },
          ],
          [accessCard, s, "runner", e, upgrade],
        );
        return null;
      }),
    };
  }
  if (sameArray(choices, faceupCardsButtons) && faceupCardsButtons.length === 1) {
    return {
      async: true,
      effect: req(function (s: GameState, _side: string, e: EID) {
        const card = faceupAccessible(s, accessedFn)[0];
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e: EID, _b: unknown) {
              continueAfter(card)(s2, e);
            },
          ],
          [accessCard, s, "runner", e, card],
        );
        return null;
      }),
    };
  }
  if (sameArray(choices, facedownButton)) {
    return { async: true, effect: facedownCardsFn };
  }
  if (sameArray(choices, everythingElseButton)) {
    return { async: true, effect: everythingElseFn };
  }

  return {
    async: true,
    prompt: "Choose a card to access. You must access all cards",
    choices: choices,
    effect: req(function (
      s: GameState,
      side: string,
      e: EID,
      _c: Card,
      targets: unknown[],
    ) {
      const target = targets?.[0] as string;
      if (target === UNREZZED) {
        unrezzedCardsFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      if (target === FACEDOWN) {
        facedownCardsFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      if (target === EVERYTHING_ELSE) {
        everythingElseFn(s, side, e, null as unknown as Card, []);
        return null;
      }
      const accessed =
        faceupAccessible(s, accessedFn).find((c: Card) => c.title === target) ??
        rootContent(s, "archives", accessedFn).find((c: Card) => c.title === target);
      if (!accessed) {
        resolveAccessAbility(s, "runner", e, null);
        return null;
      }
      wait_for(
        s,
        [
          { asyncResult: "result" },
          function (s2: GameState, _e: EID, _b: unknown) {
            continueAfter(accessed)(s2, e);
          },
        ],
        [accessCard, s, "runner", e, accessed],
      );
      return null;
    }),
  };
}

// ---------------------------------------------------------------------------
// choose-access dispatchers (mirror CLJ defmethods)
// ---------------------------------------------------------------------------

registerChooseAccess("remote", (state, side, eid, accessAmount, _server, args) => {
  const totalMod = accessAmount["total-mod"] ?? 0;
  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const posMax = typeof maxAccessVal === "number" ? maxAccessVal + totalMod > 0 : true;
  const server = args.server as string[];
  const content =
    (state.corp.servers as unknown as Record<string, { content?: Card[]; ices?: Card[] }>)?.[server?.[0]]?.content ?? [];
  const totalCards = getAllContent(content).length;
  const posTotal = totalCards + totalMod > 0;

  if (posMax && posTotal) {
    const ability = accessHelperRemote(state, accessAmount, new Set(), args);
    resolveAccessAbility(state, side, eid, ability);
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
});

registerChooseAccess("rd", (state, side, eid, accessAmount, _server, args) => {
  const totalMod = accessAmount["total-mod"] ?? 0;
  const randomLimit = accessAmount["random-access-limit"] ?? 0;
  const noRoot = Boolean(args["no-root"]);
  const only = getOnlyCardToAccess(state);
  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const posMax = typeof maxAccessVal === "number" ? maxAccessVal + totalMod > 0 : true;

  const totalCardsCount = only
    ? 1
    : accessCardsFromRd(state).slice(0, randomLimit).length +
      (noRoot ? 0 : (state.corp.servers as unknown as Record<string, { content?: Card[]; ices?: Card[] }>)?.rd?.content?.length ?? 0);
  const posTotal = totalCardsCount + totalMod > 0;

  if (posMax && posTotal && only) {
    if (coreCard.inDeck(only) || coreCard.inRdRoot(only)) {
      accessCard(state, side, eid, only);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
    return;
  }

  if (posMax && posTotal) {
    const ability = accessHelperRd(state, accessAmount, new Set(), args);
    resolveAccessAbility(state, side, eid, ability);
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
});

registerChooseAccess("hq", (state, side, eid, accessAmount, _server, args) => {
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        const totalMod = accessAmount["total-mod"] ?? 0;
        const noRoot = Boolean(args["no-root"]);
        const only = getOnlyCardToAccess(s);
        const maxAccessVal = (s.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
        const posMax =
          typeof maxAccessVal === "number" ? maxAccessVal + totalMod > 0 : true;

        const preventHandAccess = Boolean((s.run as unknown as Record<string, unknown>)?.["prevent-hand-access"]);
        const totalCards = only
          ? 1
          : (preventHandAccess ? 0 : s.corp.hand.length) +
            (noRoot ? 0 : rootContent(s, "hq").length);
        const posTotal = totalCards + totalMod > 0;

        if (posMax && posTotal && only) {
          if (coreCard.inHand(only) || coreCard.inHqRoot(only)) {
            accessCard(s, side, eid, only);
          } else {
            coreEid.effectCompleted(s, side, eid);
          }
          return;
        }
        if (posMax && posTotal) {
          const ability = accessHelperHq(s, accessAmount, new Set(), args);
          resolveAccessAbility(s, side, eid, ability);
        } else {
          coreEid.effectCompleted(s, side, eid);
        }
      },
    ],
    [coreEngine.triggerEventSync, state, side, eid, ":candidates-determined", "hq"],
    { eid },
  );
});

registerChooseAccess("archives", (state, side, eid, accessAmount, _server, args) => {
  const totalMod = accessAmount["total-mod"] ?? 0;
  const noRoot = Boolean(args["no-root"]);
  const only = getOnlyCardToAccess(state);
  const maxAccessVal = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const posMax = typeof maxAccessVal === "number" ? maxAccessVal + totalMod > 0 : true;

  const totalCards = only
    ? 1
    : state.corp.discard.length + (noRoot ? 0 : rootContent(state, "archives").length);
  const posTotal = totalCards + totalMod > 0;

  if (posMax && posTotal && only) {
    if (coreCard.inDiscard(only) || coreCard.inArchivesRoot(only)) {
      accessCard(state, side, eid, only);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
    return;
  }
  if (posMax && posTotal) {
    const ability = accessHelperArchives(state, accessAmount, new Set(), args);
    resolveAccessAbility(state, side, eid, ability);
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
});

// ---------------------------------------------------------------------------
// maxAccess / accessBonus (unchanged from previous; included for re-export)
// ---------------------------------------------------------------------------

export function maxAccess(state: GameState, n: number): void {
  const currentMax = (state.run as unknown as Record<string, unknown>)?.["max-access"] as number | undefined;
  const newMax = typeof currentMax === "number" ? Math.min(currentMax, n) : n;
  if (state.run) (state.run as unknown as Record<string, unknown>)["max-access"] = newMax;
}

export function accessBonus(
  state: GameState,
  _side: string,
  n: number,
  duration?: string,
): void {
  const dur = duration || (state.run ? ":end-of-run" : ":end-of-access");
  const bonus = (state.bonus as unknown as Record<string, unknown>) || {};
  const accessBonus = (bonus["access-bonus"] as unknown[]) || [];
  (state.bonus as unknown as Record<string, unknown>) = {
    ...bonus,
    "access-bonus": [...accessBonus, [n, dur]],
  };
}

// ---------------------------------------------------------------------------
// numCardsToAccess multi-method (kept for re-export — semantics out of scope
// for this rewrite, but builds the access-amount maps consumed above).
// ---------------------------------------------------------------------------

type NumCardsToAccessFn = (
  state: GameState,
  side: string,
  server: string[],
  accessAmount: number | null,
) => AccessAmount;

const numCardsToAccessMap: Record<string, NumCardsToAccessFn> = {};

export function registerNumCardsToAccess(
  serverType: string,
  fn: NumCardsToAccessFn,
): void {
  numCardsToAccessMap[serverType] = fn;
}

/**
 * Mirrors: num-cards-central (CLJ helper).
 */
function numCardsCentral(
  state: GameState,
  side: string,
  base: number,
  accessKey: string,
  accessAmount: number | null,
): AccessAmount {
  const mod = accessBonusCount(state, side, accessKey);
  const randomLimit = base + mod;
  const totalMod = accessBonusCount(state, side, "total");
  return {
    "random-access-limit": accessAmount ?? randomLimit,
    "total-mod": totalMod,
    chosen: 0,
  };
}

export function numCardsToAccess(
  state: GameState,
  side: string,
  server: string[],
  accessAmount: number | null,
): AccessAmount {
  const serverType = server.length ? getServerType(server) : "remote";
  const fn = numCardsToAccessMap[serverType] || numCardsToAccessMap["remote"];
  if (!fn) return { chosen: 0 };
  return fn(state, side, server, accessAmount);
}

registerNumCardsToAccess("only", (state, side, _server, accessAmount) => {
  const totalMod = accessBonusCount(state, side, "total");
  return { "total-mod": totalMod, chosen: 0, "random-access-limit": accessAmount ?? 1 };
});

registerNumCardsToAccess("remote", (state, side, _server, _accessAmount) => {
  const totalMod = accessBonusCount(state, side, "total");
  return { "total-mod": totalMod, chosen: 0 };
});

registerNumCardsToAccess("rd", (state, side, _server, accessAmount) =>
  numCardsCentral(state, side, 1, "rd", accessAmount),
);

registerNumCardsToAccess("hq", (state, side, _server, accessAmount) =>
  numCardsCentral(state, side, 1, "hq", accessAmount),
);

registerNumCardsToAccess("archives", (state, side, _server, _accessAmount) => {
  const totalMod = accessBonusCount(state, side, "total");
  return { "total-mod": totalMod, chosen: 0 };
});

// ---------------------------------------------------------------------------
// turnArchivesFaceup, cleanAccessArgs, accessNCards, breachServer
// ---------------------------------------------------------------------------

/**
 * Mirrors: turn-archives-faceup
 * Partitions discard into seen + unseen, shuffles unseen, marks them
 * seen+new, and triggers :archives-flipped if any were flipped.
 */
export function turnArchivesFaceup(
  state: GameState,
  side: string,
  eid: EID,
  server: string[],
): void {
  if (getServerType(server) !== "archives") {
    coreEid.effectCompleted(state, side, eid);
    return;
  }
  const discard = state.corp.discard;
  const known = discard
    .filter((c: Card) => c.seen)
    .map((c: Card) => {
      const { ["new"]: _drop, ...rest } = c as Card & Record<string, unknown>;
      return rest as Card;
    });
  const unknown = discard
    .filter((c: Card) => !c.seen)
    .map((c: Card) => ({ ...c, seen: true, new: true } as Card));
  // pseudo-shuffle the unknown portion (mirrors CLJ comment about preventing info leak)
  for (let i = unknown.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unknown[i], unknown[j]] = [unknown[j], unknown[i]];
  }
  state.corp.discard = [...known, ...unknown];

  if (unknown.length > 0) {
    coreEngine.triggerEventSync(
      state,
      side,
      eid,
      ":archives-flipped",
      null,
      { count: unknown.length },
    );
  } else {
    coreEid.effectCompleted(state, side, eid);
  }
}

/**
 * Mirrors: clean-access-args. Normalizes :access-first to a sequence so the
 * helpers can pop from it; passes all other keys through unchanged.
 */
export function cleanAccessArgs(
  args: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!args || typeof args !== "object") return args ?? {};
  const accessFirst = args["access-first"];
  if (!accessFirst) return args;
  return {
    ...args,
    "access-first": Array.isArray(accessFirst) ? accessFirst : [accessFirst],
  };
}

/**
 * Mirrors: access-n-cards. Triggers a deterministic n-card access on a server.
 */
export function accessNCards(
  state: GameState,
  side: string,
  eid: EID,
  server: string[],
  n: number,
): void {
  const accessAmount = numCardsToAccess(state, side, server, n);
  if (state.run) {
    (state.run as unknown as Record<string, unknown>)["did-access"] = true;
    maxAccess(state, n);
  }
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: unknown) {
        coreEngine.unregisterFloatingEvents(s, side, ":end-of-access");
        coreEid.effectCompleted(s, side, eid);
      },
    ],
    [chooseAccess, state, side, eid, accessAmount, server, { server }],
    { eid },
  );
}

/**
 * Mirrors: breach-server. Runs the full breach lifecycle for a server.
 */
export function breachServer(
  state: GameState,
  side: string,
  eid: EID,
  server: string[],
  args: Record<string, unknown> = {},
): void {
  coreSay.systemMsg(state, side, `breaches ${coreServers.zoneToName(server)}`);
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e1: EID, _b1: unknown) {
        (s.breach as Record<string, unknown> | null | undefined) = { "breach-server": server[0], "from-server": server[0] };
        const cleanedArgs = cleanAccessArgs(args);
        const accessAmount = numCardsToAccess(s, side, server, null);
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: unknown) {
              if (s2.run) (s2.run as unknown as Record<string, unknown>)["did-access"] = true;
              wait_for(
                s2,
                [
                  { asyncResult: "result" },
                  function (s3: GameState, _e3: EID, _b3: unknown) {
                    wait_for(
                      s3,
                      [
                        { asyncResult: "result" },
                        function (s4: GameState, _e4: EID, _b4: unknown) {
                          (s4.breach as Record<string, unknown> | null | undefined) = null;
                          coreEngine.unregisterFloatingEvents(s4, side, ":end-of-access");
                          coreEid.effectCompleted(s4, side, eid);
                        },
                      ],
                      [
                        coreEngine.triggerEventSync,
                        s3,
                        side,
                        eid,
                        ":end-breach-server",
                        (s3.breach as Record<string, unknown> | null | undefined),
                      ],
                      { eid },
                    );
                  },
                ],
                [
                  chooseAccess,
                  s2,
                  side,
                  eid,
                  accessAmount,
                  server,
                  { ...cleanedArgs, server },
                ],
                { eid },
              );
            },
          ],
          [turnArchivesFaceup, s, side, eid, server],
          { eid },
        );
      },
    ],
    [coreEngine.triggerEventSync, state, side, eid, ":breach-server", null, { server: server[0] }],
    { eid },
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function sameArray<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
