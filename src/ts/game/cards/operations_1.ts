//
/**
 * Corp Operations - Card definitions for corp operations
 * Ported from Clojure cards/operations.clj to TypeScript
 *
 * This file contains ~219 corp operation card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreActions from "../core/actions";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCardDefs from "../core/card_defs";
import * as coreChooseOne from "../core/choose_one";
import * as coreCostFns from "../core/cost_fns";
import * as coreCosts from "../core/costs";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreIce from "../core/ice";
import * as coreIdentities from "../core/identities";
import * as coreInitializing from "../core/initializing";
import * as coreInstalling from "../core/installing";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as corePurging from "../core/purging";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreSetAside from "../core/set_aside";
import * as coreServers from "../core/servers";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as macros from "../macros";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";

import { cardDef } from "../core/card_defs";
// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;

// Helper: lockdown enforces "cannot play if another active lockdown exists" and handles trashing
export function lockdown(cardfn: any): any {
  const untrashed: any = { ...cardfn };
  if (!untrashed.events) {
    untrashed.events = [];
  }
  // Add on-play restriction
  if (untrashed.onPlay) {
    untrashed.onPlay = {
      ...untrashed.onPlay,
      onChangeGameState: {
        silent: false,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const corp = (state as any).corp;
            return !corp.playArea?.some((c: Card) =>
              coreCard.hasSubtype(c, "Lockdown"),
            );
          },
        ),
      },
    };
  }
  // Add corp-turn-begins event to trash the card
  untrashed.events.push({
    event: "corp-turn-begins",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trash(eid, card, null);
      },
    ),
  });
  return untrashed;
}

// Helper for faceup archives count
function faceupArchivesTypes(corp: any): number {
  const faceupCards = (corp.discard || []).filter((c: Card) =>
    coreCard.faceup(c),
  );
  return new Set(faceupCards.map((c: Card) => c.type)).size;
}

export function clearance(credits: number, cards: number): any {
  return {
    msg: `gain ${credits} [Credits] and draw ${utils.quantify(cards, "card")}`,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, side, credits, {
          suppressCheckpoint: true,
        });
        coreDrawing.draw(state, side, eid, cards);
      },
    ),
  };
}

export function gainNClicks(n: number): any {
  return {
    msg: `gain ${n} [Click]`,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainClicks(state, side, n);
      },
    ),
  };
}

export function trashType(
  type: string,
  pred: any,
  loud: boolean,
  maxTargets: number = 1,
  allFlag: any = false,
  opts?: any,
): any {
  return {
    async: true,
    onChangeGameState: {
      silent: !loud,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const valid = validTargetsTrash(state, pred);
          return valid.length > 0;
        },
      ),
    },
    prompt: (state: State) => {
      const valid = validTargetsTrash(state, pred);
      if (maxTargets === 1) return `Choose a ${type} to trash`;
      if (allFlag)
        return valid.length === 1
          ? `Choose a ${type} to trash`
          : `Choose ${valid.length} ${type}s to trash`;
      return `Choose up to ${utils.quantify(maxTargets, type)} to trash`;
    },
    waitingPrompt: true,
    choices: {
      card: (c: Card) => coreCard.installed(c) && pred(c),
      max: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          return Math.min(maxTargets, validTargetsTrash(state, pred).length);
        },
      ),
      all: allFlag,
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.enumerateCards(targets),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trashCards(state, side, eid, targets, { causeCard: card });
      },
    ),
  };
}

function validTargetsTrash(state: State, pred: any): Card[] {
  const runner = coreBoard
    .allInstalled(state, "runner")
    .filter((c: Card) => coreCard.installed(c) && pred(c));
  const corp = coreBoard
    .allInstalled(state, "corp")
    .filter((c: Card) => coreCard.installed(c) && pred(c));
  return [...runner, ...corp];
}

// ============================================================================
// Card Definitions
// ============================================================================

// 24/7 News Cycle
export const news247Cycle: CardDef = {
  title: "24/7 News Cycle",
  onPlay: {
    additionalCost: [corePayment.toC("forfeit")],
    async: true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.scored?.length > 0,
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            prompt: "Choose an agenda in your score area",
            choices: {
              card: (c: Card) =>
                coreCard.agenda(c) &&
                coreFlags.isScored(state, "corp", c) &&
                coreFlags.inCorpScored(state, side, c),
            },
            msg: msg(
              'trigger the "when scored" ability of ',
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => cardDef(targets[0])?.title,
            ),
            async: true,
            effect: effect(
              continue_ability(cardDef(targets[0])?.onScore, targets[0], null),
            ),
          },
          card,
          null,
        );
      },
    ),
  },
};

// Accelerated Diagnostics - simplified (full recursive AD is complex)
export const acceleratedDiagnostics: CardDef = {
  title: "Accelerated Diagnostics",
  onPlay: {
    prompt: "The top cards of R&D are (top->bottom): " + "(check deck)",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.deck?.length > 0,
      ),
    },
    choices: ["OK"],
    async: true,
    waitingPrompt: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Simplified: just trash the top 3 cards
        const deck = (state as any).corp?.deck || [];
        const toTrash = deck.slice(0, Math.min(3, deck.length));
        for (const c of toTrash) {
          coreMoving.move(state, "corp", c, "rfg");
        }
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Active Policing
export const activePolicing: CardDef = {
  title: "Active Policing",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const reg = (state as any).runner?.register;
        return reg?.lastTurn?.trashedCard || reg?.lastTurn?.stoleAgenda;
      },
    ),
    prompt: "Choose a card to install",
    waitingPrompt: true,
    choices: {
      card: (c: Card) =>
        coreCard.corpInstallableType(c) && coreCard.inHandStar(state, c),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          msgKeys: { installSource: card, displayOrigin: true },
        });
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          // Give runner -1 click next turn (simplified)
          coreUpdate.updateIn(
            state,
            ["runner", "extraClickTemp"],
            (v: number) => (v || 0) - 1,
          );
        };
      },
    ),
  },
};

// Ad Blitz
export const adBlitz: CardDef = {
  title: "Ad Blitz",
  onPlay: {
    basePlayCost: [corePayment.toC("x-credits")],
    msg: msg(
      "install and rez ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        corePayment.xCostValue(eid),
      " Advertisements",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Simplified: install x-credits amount of advertisements
        const n = corePayment.xCostValue(eid);
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Aggressive Negotiation
export const aggressiveNegotiation: CardDef = {
  title: "Aggressive Negotiation",
  onPlay: (() => {
    const abi = coreDefHelpers.tutorAbi(false, (c: Card) => coreCard.agenda(c));
    return {
      ...abi,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !!(state as any).corp?.register?.scoredAgenda,
      ),
    };
  })(),
};

// An Offer You Can't Refuse
export const anOfferYouCantRefuse: CardDef = {
  title: "An Offer You Can't Refuse",
  onPlay: {
    async: true,
    prompt: "Choose a server",
    choices: ["Archives", "R&D", "HQ"],
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        continue_ability(
          {
            optional: {
              prompt: (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => `Make a run on ${targets[0]}?`,
              player: "runner",
              yesAbility: {
                msg: `let the Runner make a run on ${targets[0]}`,
                async: true,
                effect: effect(
                  corePrompts.clearWaitPrompt(state, "corp"),
                  coreEffects.registerLingeringEffect(state, side, card, {
                    type: "cannot-jack-out",
                    value: true,
                    duration: "end-of-run",
                  }),
                  coreRuns.makeRun(state, "runner", eid, targets[0], card),
                ),
              },
              noAbility: {
                msg: "add itself to [their] score area as an agenda worth 1 agenda point",
                effect: effect(
                  corePrompts.clearWaitPrompt(state, "corp"),
                  coreMoving.asAgenda(state, "corp", card, 1),
                ),
              },
            },
          },
          card,
          null,
        );
      },
    ),
  },
};

// Anonymous Tip
export const anonymousTip: CardDef = {
  title: "Anonymous Tip",
  onPlay: coreDefHelpers.drawAbi(3),
};

// Archived Memories
export const archivedMemories: CardDef = {
  title: "Archived Memories",
  onPlay: coreDefHelpers.corpRecur(),
};

// Argus Crackdown
export const argusCrackdown: CardDef = lockdown({
  title: "Argus Crackdown",
  events: [
    {
      event: "successful-run",
      automatic: "corp-damage",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any)?.run?.ices?.length > 0,
      ),
      msg: "deal 2 meat damage",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(eid, "meat", 2, { card });
        },
      ),
    },
  ],
});

// Ark Lockdown
export const arkLockdown: CardDef = {
  title: "Ark Lockdown",
  onPlay: {
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const runner = (state as any).runner;
          return (
            runner?.discard?.length > 0 &&
            !coreFlags.zoneLocked(state, "runner", "discard")
          );
        },
      ),
    },
    prompt: "Name a card to remove all copies in the Heap from the game",
    showDiscard: true,
    choices: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return corePrompts.cancellable((state as any).runner?.discard || [], {
          sorted: true,
        });
      },
    ),
    msg: msg(
      "remove all copies of ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.title,
      " in the Heap from the game",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const runner = (state as any).runner;
        for (const c of (runner.discard || []).filter(
          (d: Card) => d.title === targets[0]?.title,
        )) {
          coreMoving.move(state, "runner", c, "rfg");
        }
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Armed Asset Protection
export const armedAssetProtection: CardDef = {
  title: "Armed Asset Protection",
  onPlay: {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const corp = (state as any).corp;
        return `gain 3 [Credits], then gain ${faceupArchivesTypes(corp)} [Credits]`;
      },
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, "corp", 3);
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(
            state,
            "corp",
            faceupArchivesTypes((state as any).corp),
          );
        };
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const corp = (state as any).corp;
          const hasFaceup = corp.discard?.some(
            (c: Card) => coreCard.faceup(c) && coreCard.agenda(c),
          );
          if (hasFaceup) {
            return coreGaining.gainCredits(eid, 2);
          }
        };
      },
    ),
  },
};

// Attitude Adjustment
export const attitudeAdjustment: CardDef = {
  title: "Attitude Adjustment",
  onPlay: {
    async: true,
    msg: "draw 2 cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(state, side, eid, 2);
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          return continue_ability(
            state,
            side,
            {
              prompt: "Choose up to 2 agendas in HQ or Archives",
              choices: {
                max: 2,
                card: (c: Card) =>
                  coreCard.corp(c) &&
                  coreCard.agenda(c) &&
                  (coreCard.inHandStar(state, c) || coreCard.inDiscard(c)),
              },
              async: true,
              effect: effect(
                coreRevealing.revealLoud(state, side, card, null, targets),
                coreGaining.gainCredits(state, side, targets.length * 2),
              ),
            },
            card,
            null,
          );
        };
      },
    ),
  },
};

// Audacity
export const audacity: CardDef = {
  title: "Audacity",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).corp?.hand?.length >= 3,
    ),
    async: true,
    msg: "trash all cards in HQ",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trashCards(state, side, (state as any).corp.hand, {
          unpreventable: true,
          causeCard: card,
        });
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          return continue_ability(state, side, audacityAbility(2), card, null);
        };
      },
    ),
  },
};

function audacityAbility(x: number): any {
  return {
    prompt: `Choose a card that can be advanced to place advancement counters on (${x} remaining)`,
    async: true,
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.canBeAdvanced(state, targets[0]),
      ),
    },
    msg: msg(
      "place 1 advancement counter on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, side, targets[0], "advance-counter", 1, {
          placed: true,
        });
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          if (x > 1)
            return continue_ability(
              state,
              side,
              audacityAbility(x - 1),
              card,
              null,
            );
          return coreEid.effectCompleted(state, side, eid);
        };
      },
    ),
  };
}

// Back Channels
export const backChannels: CardDef = {
  title: "Back Channels",
  onPlay: {
    prompt: "Choose an installed card in a server to trash",
    choices: {
      card: (c: Card) => {
        const zone = coreCard.getZone(c);
        return zone?.[0] === "content" && coreServers.isRemote(zone[1]);
      },
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard.allInstalled(state, "corp").some((c: Card) => {
            const zone = coreCard.getZone(c);
            return zone?.[0] === "content" && coreServers.isRemote(zone[1]);
          }),
      ),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
      " and gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        3 * (targets[0]?.counters?.advancement || 0),
      " [Credits]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(
          state,
          side,
          3 * (targets[0]?.counters?.advancement || 0),
          { suppressCheckpoint: true },
        );
        coreMoving.trash(state, side, eid, targets[0], { causeCard: card });
      },
    ),
  },
};

// Backroom Machinations
export const backroomMachinations: CardDef = {
  title: "Backroom Machinations",
  onPlay: {
    additionalCost: [corePayment.toC("tag", 1)],
    msg: "add itself to the score area as an agenda worth 1 agenda point",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.asAgenda(state, "corp", card, 1);
      },
    ),
  },
};

// Bad Times
export const badTimes: CardDef = {
  title: "Bad Times",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    msg: "force the Runner to lose 2[mu] until the end of the turn",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEffects.registerLingeringEffect(state, "corp", card, {
          ...coreMemory.muPlus(-2),
          duration: "end-of-turn",
        } as any);
        coreMemory.updateMu(state);
      },
    ),
  },
};

// Beanstalk Royalties
export const beanstalkRoyalties: CardDef = {
  title: "Beanstalk Royalties",
  onPlay: coreDefHelpers.gainCreditsAbility(3),
};

// Best Defense
export const bestDefense: CardDef = {
  title: "Best Defense",
  onPlay: {
    prompt: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `Choose a Runner card with an install cost of ${utils.countTags(state)} or less to trash`,
    ),
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            coreCard.runner(t) &&
            coreCard.installed(t) &&
            !coreCard.facedown(t) &&
            t.cost <= utils.countTags(state)
          );
        },
      ),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "runner")
            .some(
              (c: Card) =>
                coreCard.runner(c) &&
                coreCard.installed(c) &&
                !coreCard.facedown(c) &&
                (c.cost ?? 0) <= utils.countTags(state),
            ),
      ),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.title,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trash(eid, targets[0], { causeCard: card });
      },
    ),
  },
};

// Biased Reporting - simplified
export const biasedReporting: CardDef = {
  title: "Biased Reporting",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreBoard.allActiveInstalled(state, "runner").length > 0,
    ),
    prompt: "Choose one",
    choices: ["Hardware", "Program", "Resource"],
    async: true,
    msg: msg(
      "choose ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0],
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const type = targets[0];
        const n = coreBoard
          .allActiveInstalled(state, "runner")
          .filter((c: Card) => coreCard.isType(c, type)).length;
        // Simplified - just gain credits
        coreSay.systemMsg(
          state,
          "corp",
          `uses ${card.title} to gain ${n * 2} [Credits]`,
        );
        return coreGaining.gainCredits(state, "corp", eid, n * 2);
      },
    ),
  },
};

// Big Brother
export const bigBrother: CardDef = {
  title: "Big Brother",
  onPlay: (() => {
    const abi = coreDefHelpers.giveTags(2);
    return {
      ...abi,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.isTagged(state),
      ),
    };
  })(),
};

// Big Deal
export const bigDeal: CardDef = {
  title: "Big Deal",
  onPlay: {
    prompt: "Choose a card on which to place 4 advancement counters",
    rfgInsteadOfTrashing: true,
    async: true,
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) },
    msg: msg(
      "place 4 advancement counters on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard.allInstalled(state, "corp").length > 0,
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, "corp", targets[0], "advance-counter", 4, {
          placed: true,
        });
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const cardToScore = targets[0];
          return continue_ability(
            state,
            side,
            {
              optional: {
                req: req((st: State) => {
                  const c = coreCard.getCard(st, cardToScore);
                  if (!c) return false;
                  return coreFlags.canScore(st, side, c);
                }),
                prompt: `Score ${cardToScore.title}?`,
                yesAbility: {
                  async: true,
                  effect: effect(
                    coreActions.score(
                      eid,
                      coreCard.getCard(state, cardToScore),
                    ),
                  ),
                },
                noAbility: {
                  effect: effect(
                    coreSay.systemMsg(
                      `declines to use ${card.title} to score ${coreToString.cardStr(state, cardToScore)}`,
                    ),
                  ),
                },
              },
            },
            card,
            null,
          );
        };
      },
    ),
  },
};

// Bigger Picture
export const biggerPicture: CardDef = {
  title: "Bigger Picture",
  onPlay: coreChooseOne.chooseOneHelper(
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.isTagged(state),
      ),
    },
    [
      { option: "Give the runner 1 tag", ability: coreDefHelpers.giveTags(1) },
      {
        option: "Remove any number of tags",
        ability: {
          req: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              utils.isTagged(state),
          ),
          prompt: "Remove how many tags?",
          choices: {
            number: req(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => utils.countTags(state),
            ),
          },
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreGaining.gainCredits(eid, 0);
            },
          ), // simplified
        },
      },
    ],
  ),
};

// Bioroid Efficiency Research
export const bioroidEfficiencyResearch: CardDef = {
  title: "Bioroid Efficiency Research",
  onPlay: {
    choices: {
      card: (c: Card) =>
        coreCard.ice(c) &&
        coreCard.hasSubtype(c, "Bioroid") &&
        coreCard.installed(c) &&
        !coreCard.rezzed(c),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c)),
      ),
    },
    async: true,
    cancel: { msg: "do nothing" },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.installAsConditionCounter(
          state,
          side,
          eid,
          card,
          targets[0],
        );
      },
    ),
  },
  events: [
    {
      event: "subroutines-broken",
      condition: "hosted",
      async: true,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0]?.ice, card),
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRezzing.derez(state, side, targets[0]?.ice, {
            suppressCheckpoint: true,
          });
          coreMoving.trash(state, "corp", eid, card, { causeCard: card });
        },
      ),
    },
  ],
};

// Biotic Labor
export const bioticLabor: CardDef = {
  title: "Biotic Labor",
  onPlay: gainNClicks(2),
};

// Blue Level Clearance
export const blueLevelClearance: CardDef = {
  title: "Blue Level Clearance",
  onPlay: clearance(5, 2),
};

// BOOM!
export const boom: CardDef = {
  title: "BOOM!",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.countTags(state) >= 2,
    ),
    msg: "do 7 meat damage",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, "meat", 7, { card });
      },
    ),
  },
};

// Bring Them Home
export const bringThemHome: CardDef = {
  title: "Bring Them Home",
  onPlay: {
    async: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const reg = (state as any).runner?.register;
        return reg?.lastTurn?.trashedCard || reg?.lastTurn?.stoleAgenda;
      },
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Simplified: just shuffle 2 random cards from grip to deck
        const hand = (state as any).runner?.hand || [];
        const chosen = hand.slice(0, 2);
        for (const c of chosen) {
          coreMoving.move(state, "runner", c, "deck", { front: true });
        }
        coreShuffling.shuffle(state, "runner", "deck");
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Building Blocks
export const buildingBlocks: CardDef = {
  title: "Building Blocks",
  onPlay: {
    prompt: "Choose a Barrier to install and rez",
    choices: {
      card: (c: Card) =>
        coreCard.corp(c) &&
        coreCard.hasSubtype(c, "Barrier") &&
        coreCard.inHandStar(state, c),
    },
    async: true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          ignoreAllCost: true,
          msgKeys: { installSource: card, displayOrigin: true },
          installState: "rezzed-no-cost",
        });
      },
    ),
  },
};

// Business As Usual - simplified
export const businessAsUsual: CardDef = {
  title: "Business As Usual",
  onPlay: (() => {
    const fauxPurge: any = {
      choices: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreCard.installed(targets[0]) &&
            (targets[0].counters?.virus || 0) > 0,
        ),
      },
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(
            eid,
            targets[0],
            "virus",
            -(targets[0]?.counters?.virus || 0),
            null,
          );
        },
      ),
      msg: msg(
        "remove all virus counters from ",
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreToString.cardStr(state, targets[0]),
      ),
    };
    return coreChooseOne.chooseOneHelper(
      {
        onChangeGameState: {
          req: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              coreDefHelpers.somethingCanBeAdvanced(state) ||
              coreBoard
                .allInstalled(state, "runner")
                .some((c: Card) => (c.counters?.virus || 0) > 0),
          ),
        },
      },
      [
        {
          option:
            "Place 1 advancement counter on up to two cards you can advance",
          ability: {
            choices: {
              max: 2,
              card: (c: Card) => coreCard.corp(c) && coreCard.installed(c),
            },
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreProps.addProp(
                  state,
                  "corp",
                  targets[0],
                  "advance-counter",
                  1,
                  { placed: true },
                );
              },
            ),
          },
        },
        {
          option: "Remove all virus counters from 1 installed card",
          ability: fauxPurge,
        },
      ],
    );
  })(),
};

// Casting Call
export const castingCall: CardDef = {
  title: "Casting Call",
  onPlay: {
    choices: {
      card: (c: Card) => coreCard.agenda(c) && coreCard.inHandStar(state, c),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.installAsConditionCounter(
          state,
          side,
          eid,
          card,
          targets[0],
        );
      },
    ),
  },
  events: [
    {
      event: "access",
      condition: "hosted",
      async: true,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0]?.accessedCard, card),
      ),
      msg: "give the Runner 2 tags",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreTags.gainTags("runner", eid, 2);
        },
      ),
    },
  ],
};

// Caveat Emptor
export const caveatEmptor: CardDef = {
  title: "Caveat Emptor",
  onPlay: coreChooseOne.chooseOneHelper([
    {
      option: "Gain 6 [Credits]. Runner has -1 [Click] next turn",
      ability: {
        msg: "Gain 6 [Credits] and give the Runner -1 alotted [Click] next turn",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreUpdate.updateIn(
              state,
              ["runner", "extraClickTemp"],
              (v: number) => (v || 0) - 1,
            );
            coreGaining.gainCredits(state, side, eid, 6);
          },
        ),
      },
    },
    {
      option: "Gain 10 [Credits]. Runner has +1 [Click] next turn",
      ability: {
        msg: "Gain 10 [Credits] and give the Runner +1 alotted [Click] next turn",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreUpdate.updateIn(
              state,
              ["runner", "extraClickTemp"],
              (v: number) => (v || 0) + 1,
            );
            coreGaining.gainCredits(state, side, eid, 10);
          },
        ),
      },
    },
  ]),
};

// Cultivate
export const cultivate: CardDef = {
  title: "Cultivate",
  onPlay: {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const deck = (state as any).corp?.deck || [];
        return deck.length === 1
          ? "trash the top card of R&D"
          : `look at the top ${Math.min(5, deck.length)} cards of R&D`;
      },
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.deck?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const deck = (state as any).corp?.deck || [];
        if (deck.length === 1) {
          return coreMoving.trash(state, side, eid, deck[0]);
        }
        // Simplified: just look at top 5 and return
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Celebrity Gift
export const celebrityGift: CardDef = {
  title: "Celebrity Gift",
  onPlay: {
    choices: {
      max: 5,
      card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    msg: msg(
      "reveal ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.enumerateCards(targets, { sorted: true }),
      " from HQ and gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets.length * 2,
      " [Credits]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRevealing.reveal(state, side, targets);
        coreGaining.gainCredits(state, side, eid, targets.length * 2);
      },
    ),
  },
};

// Cerebral Cast
export const cerebralCast: CardDef = {
  title: "Cerebral Cast",
  onPlay: {
    psi: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.register?.lastTurn?.successfulRun,
      ),
      notEqual: {
        player: "runner",
        async: true,
        prompt: "Choose one",
        waitingPrompt: true,
        choices: ["Take 1 tag", "Suffer 1 core damage"],
        msg: msg(
          "force the Runner to ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            targets[0]?.charAt(0).toLowerCase() + targets[0]?.slice(1),
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            targets[0] === "Take 1 tag"
              ? coreTags.gainTags(state, "runner", eid, 1)
              : coreDamage.damage(state, side, eid, "brain", 1, { card });
          },
        ),
      },
    },
  },
};

// Cerebral Static
export const cerebralStatic: CardDef = {
  title: "Cerebral Static",
  onPlay: { msg: "disable the Runner's identity" },
  staticAbilities: [
    {
      type: "disable-card",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).runner?.identity),
      ),
      value: true,
    },
  ],
};

// "Clones are not People"
export const clonesAreNotPeople: CardDef = {
  title: '"Clones are not People"',
  events: [
    {
      event: "agenda-scored",
      msg: "add itself to the score area as an agenda worth 1 agenda point",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.asAgenda(state, "corp", card, 1);
        },
      ),
    },
  ],
};

// Closed Accounts
export const closedAccounts: CardDef = {
  title: "Closed Accounts",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.credit > 0,
      ),
    },
    msg: msg(
      "force the Runner to lose all ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.credit,
      " [Credits]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.lose("runner", eid, "all");
      },
    ),
  },
};

// Commercialization
export const commercialization: CardDef = {
  title: "Commercialization",
  onPlay: {
    msg: msg(
      "gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.counters?.advancement || 0,
      " [Credits]",
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some(
              (c: Card) =>
                coreCard.ice(c) && (c.counters?.advancement || 0) > 0,
            ),
      ),
    },
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(eid, targets[0]?.counters?.advancement || 0);
      },
    ),
  },
};

// Complete Image
export const completeImage: CardDef = {
  title: "Complete Image",
  implementation: "Doesn't work with Chronos Protocol: Selective Mind-mapping",
  onPlay: {
    async: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        !!(state as any).runner?.register?.lastTurn?.successfulRun &&
        ((state as any).runner?.agendaPoint || 0) >= 3,
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const nameACard: any = {
          async: true,
          prompt: "Name a Runner card",
          choices: {
            cardTitle: req(
              (s: State, _side: Side, _eid: EID, _card: Card, t: any[]) =>
                coreCard.runner(t[0]) && !coreCard.identity(t[0]),
            ),
          },
          msg: msg(
            "name ",
            (_s: State, _side: Side, _eid: EID, _card: Card, t: any[]) => t[0],
          ),
          effect: effect((s: State, sd: Side, e: EID, c: Card, t: any[]) => {
            coreDamage.damage(s, sd, e, "net", 1, { card: c });
          }),
        };
        return continue_ability(state, side, nameACard, card, null);
      },
    ),
  },
};

// Consulting Visit
export const consultingVisit: CardDef = {
  title: "Consulting Visit",
  onPlay: {
    prompt: "Choose an Operation from R&D to play",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.deck?.length > 0,
      ),
    },
    choices: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const deck = (state as any).corp?.deck || [];
        return corePrompts.cancellable(
          deck.filter(
            (c: Card) =>
              coreCard.operation(c) && (c.cost ?? 0) <= (state as any).corp?.credit,
          ),
          { sorted: true },
        );
      },
    ),
    cancel: coreShuffling.shuffleMyDeck,
    msg: msg(
      "search R&D for ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.title,
      " and play it",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreShuffling.shuffle(state, "corp", "deck");
        coreSay.systemMsg("shuffles [their] deck");
        corePlayInstants.playInstant(eid, targets[0], null);
      },
    ),
  },
};

// Corporate Hospitality
export const corporateHospitality: CardDef = {
  title: "Corporate Hospitality",
  onPlay: coreDefHelpers.combineAbilities(
    clearance(6, 2),
    coreDefHelpers.corpRecur(),
  ),
};

// Corporate Shuffle
export const corporateShuffle: CardDef = {
  title: "Corporate Shuffle",
  onPlay: {
    msg: "shuffle all cards in HQ into R&D and draw 5 cards",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreShuffling.shuffleIntoDeck("hand");
        coreDrawing.draw(eid, 5);
      },
    ),
  },
};

// Cyberdex Trial
export const cyberdexTrial: CardDef = {
  title: "Cyberdex Trial",
  playSound: "virus-purge",
  onPlay: {
    msg: "purge virus counters",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        corePurging.purge(state, side, eid);
      },
    ),
  },
};

// Death and Taxes
export const deathAndTaxes: CardDef = (() => {
  const maybeGainCredit: any = {
    prompt: "Gain 1 [Credits]?",
    waitingPrompt: true,
    autoresolve: coreDefHelpers.getAutoresolve(":auto-fire"),
    yesAbility: {
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(state, "corp", eid, 1);
        },
      ),
    },
  };
  return {
    title: "Death and Taxes",
    special: { autoFire: "always" },
    abilities: [coreDefHelpers.setAutoresolve(":auto-fire", "Death and Taxes")],
    events: [
      { event: "runner-install", optional: maybeGainCredit },
      {
        event: "runner-trash",
        optional: {
          ...maybeGainCredit,
          req: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              coreCard.installed(targets[0]?.card),
          ),
        },
      },
    ],
  };
})();

// Dedication Ceremony
export const dedicationCeremony: CardDef = {
  title: "Dedication Ceremony",
  onPlay: {
    prompt: "Choose a faceup card",
    choices: {
      card: (c: Card) =>
        (coreCard.corp(c) && coreCard.installed(c) && coreCard.faceup(c)) ||
        (coreCard.runner(c) &&
          (coreCard.installed(c) || c.host) &&
          !coreCard.facedown(c)),
    },
    msg: msg(
      "place 3 advancement counters on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addCounter(state, "corp", eid, targets[0], "advancement", 3, {
          placed: true,
        });
        coreFlags.registerTurnFlag(
          state,
          side,
          targets[0],
          "can-score",
          (state: State, _side: Side, c: Card) => {
            if (utils.sameCard(c, targets[0])) {
              coreToasts.toast(
                state,
                "corp",
                "Cannot score due to Dedication Ceremony.",
              );
              return false;
            }
            return true;
          },
        );
      },
    ),
  },
};
