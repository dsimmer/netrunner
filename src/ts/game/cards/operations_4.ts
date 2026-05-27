//
/**
 * Corp Operations - Card definitions for corp operations
 * Ported from Clojure cards/operations.clj to TypeScript
 *
 * This file contains ~219 corp operation card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State, Subroutine } from "../../types";
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
import { clearance, lockdown, trashType } from "./operations_1";

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
const eid: any = undefined as any;
const card: any = undefined as any;
const ctx: any = undefined as any;
const asyncResult: any = undefined as any;
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;
const side: any = undefined as any;

// Restructure
export const restructure: CardDef = {
  title: "Restructure",
  onPlay: coreDefHelpers.gainCreditsAbility(15),
};

// Retirement Plan
export const retirementPlan: CardDef = {
  title: "Retirement Plan",
  onPlay: {
    prompt: "Install an Asset, Ice or Agenda from Archives",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.discard?.some(
            (c: Card) =>
              coreCard.asset(c) ||
              coreCard.ice(c) ||
              coreCard.agenda(c) ||
              !c.seen,
          ),
      ),
    },
    showDiscard: true,
    notDistinct: true,
    choices: {
      card: (c: Card) =>
        (coreCard.ice(c) || coreCard.asset(c) || coreCard.agenda(c)) &&
        coreCard.corp(c) &&
        coreCard.inDiscard(c),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.corpInstall(eid, targets[0], null, {
          msgKeys: { installSource: card, displayOrigin: true },
        });
      },
    ),
  },
};

// Retribution
export const retribution: CardDef = {
  title: "Retribution",
  onPlay: trashType(
    "program of piece of hardware",
    (c: Card) => coreCard.program(c) || coreCard.hardware(c),
    true,
    1,
    null,
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.isTagged(state),
      ),
    },
  ),
};

// Reuse
export const reuse: CardDef = {
  title: "Reuse",
  onPlay: {
    prompt: msg(
      "Choose up to ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.quantify((state as any).corp?.hand?.length, "card"),
      " in HQ to trash",
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    choices: {
      max: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length || 0,
      ),
      card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c),
    },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${targets.length} card${targets.length !== 1 ? "s" : ""} and gain ${targets.length * 2} [Credits]`,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trashCards(state, side, targets, {
          unpreventable: true,
          causeCard: card,
        });
        coreGaining.gainCredits(state, side, eid, targets.length * 2);
      },
    ),
  },
};

// Reverse Infection
export const reverseInfection: CardDef = {
  title: "Reverse Infection",
  onPlay: {
    prompt: "Choose one",
    waitingPrompt: true,
    choices: ["Purge virus counters", "Gain 2 [Credits]"],
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Rework
export const rework: CardDef = {
  title: "Rework",
  onPlay: {
    prompt: "Choose a card from HQ to shuffle into R&D",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c),
    },
    msg: "shuffle a card from HQ into R&D",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.move(state, side, targets[0], "deck");
        coreShuffling.shuffle(state, side, "deck");
      },
    ),
  },
};

// Riot Suppression
export const riotSuppression: CardDef = {
  title: "Riot Suppression",
  onPlay: {
    rfgInsteadOfTrashing: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.register?.lastTurn?.trashedCard,
    ),
    player: "runner",
    async: true,
    waitingPrompt: true,
    prompt: "Choose one",
    msg: msg(
      "force the Runner to ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.charAt(0).toLowerCase() + targets[0]?.slice(1),
    ),
    choices: ["Suffer 1 core damage", "Get 3 fewer [Click] on the next turn"],
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        if (targets[0] === "Suffer 1 core damage")
          return corePayment.pay(state, "runner", eid, card, [
            corePayment.toC("brain", 1),
          ]);
        coreUpdate.updateIn(
          state,
          ["runner", "extraClickTemp"],
          (v: number) => (v || 0) - 3,
        );
        return coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Rolling Brownout
export const rollingBrownout: CardDef = {
  title: "Rolling Brownout",
  onPlay: {
    msg: "increase the play cost of operations and events by 1 [Credits]",
  },
  staticAbilities: [{ type: "play-cost", value: 1 }],
  events: [
    {
      event: "play-event",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreEvents.firstEvent(state, side, "play-event"),
      ),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits("corp", eid, 1);
        },
      ),
    },
  ],
};

// Rover Algorithm
export const roverAlgorithm: CardDef = {
  title: "Rover Algorithm",
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c)),
      ),
    },
    msg: msg(
      "host itself as a condition counter on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.installAsConditionCounter(eid, card, targets[0]);
      },
    ),
  },
  staticAbilities: [
    {
      type: "ice-strength",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).context?.host),
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          card.counters?.power || 0,
      ),
    },
  ],
  events: [
    {
      event: "pass-ice",
      condition: "hosted",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0]?.ice, card),
      ),
      msg: "place 1 power counter on itself",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(eid, card, "power", 1, null);
        },
      ),
    },
  ],
};

// Sacrifice
export const sacrifice: CardDef = {
  title: "Sacrifice",
  onPlay: {
    additionalCost: [corePayment.toC("forfeit")],
    async: true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBadPublicity.hasBadPub(state),
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Salem's Hospitality
export const salemsHospitality: CardDef = {
  title: "Salem's Hospitality",
  onPlay: {
    prompt: "Name a Runner card",
    choices: {
      cardTitle: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.runner(targets[0]) && !coreCard.identity(targets[0]),
      ),
    },
    async: true,
    msg: msg(
      "reveal ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.enumerateCards((state as any).runner?.hand || [], {
          sorted: true,
        }),
      " from the grip and trash any copies of ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0],
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Scapegoat
export const scapegoat: CardDef = {
  title: "Scapegoat",
  onPlay: coreChooseOne.chooseOneHelper({ player: "runner" }, [
    {
      option: "Corp removes 2 bad publicity",
      ability: {
        async: true,
        displaySide: "corp",
        msg: "remove 2 bad publicity",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreBadPublicity.loseBadPublicity(state, "corp", eid, 2);
          },
        ),
      },
    },
    {
      option: "Corp shuffles 1 Runner card into the Stack",
      ability: {
        onChangeGameState: {
          req: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              coreBoard.allInstalled(state, "runner").length > 0,
          ),
        },
        player: "corp",
        prompt: "Shuffle an installed Runner card into the stack",
        choices: {
          max: 1,
          card: (c: Card) => coreCard.runner(c) && coreCard.installed(c),
          all: true,
        },
        displaySide: "corp",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            targets.forEach((t: Card) =>
              coreMoving.move(state, "runner", t, "deck"),
            );
            coreShuffling.shuffle(state, "runner", "deck");
          },
        ),
      },
    },
  ]),
};

// Scapenet
export const scapenet: CardDef = {
  title: "Scapenet",
  onPlay: {
    trace: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.register?.lastTurn?.successfulRun,
      ),
      base: 7,
      successful: {
        prompt: "Choose an installed virtual or chip card to remove from game",
        choices: {
          card: (c: Card) =>
            coreCard.installed(c) &&
            (coreCard.hasSubtype(c, "Virtual") ||
              coreCard.hasSubtype(c, "Chip")),
        },
        msg: msg(
          "remove ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreToString.cardStr(state, targets[0]),
          " from game",
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreMoving.move("runner", targets[0], "rfg");
          },
        ),
      },
    },
  },
};

// Scarcity of Resources
export const scarcityOfResources: CardDef = {
  title: "Scarcity of Resources",
  onPlay: { msg: "increase the install cost of resources by 2" },
  staticAbilities: [
    {
      type: "install-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.resource(targets[0]),
      ),
      value: 2,
    },
  ],
};

// Scorched Earth
export const scorchedEarth: CardDef = {
  title: "Scorched Earth",
  onPlay: (() => {
    const abi = coreDefHelpers.doMeatDamage(4);
    return {
      ...abi,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.isTagged(state),
      ),
    };
  })(),
};

// SEA Source
export const seaSource: CardDef = {
  title: "SEA Source",
  onPlay: {
    trace: {
      base: 3,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.register?.lastTurn?.successfulRun,
      ),
      label: "Trace 3 - Give the Runner 1 tag",
      successful: coreDefHelpers.giveTags(1),
    },
  },
};

// Seamless Launch
export const seamlessLaunch: CardDef = {
  title: "Seamless Launch",
  onPlay: (() => {
    const abi = coreDefHelpers.placeAdvancementCounter(
      null,
      2,
      "an installed card",
      (c: Card) => coreCard.installed(c),
    );
    return {
      ...abi,
      onChangeGameState: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreBoard
              .allInstalled(state, "corp")
              .some(
                (c: Card) =>
                  coreCard.corp(c) && coreCard.installed(c),
              ),
        ),
      },
    };
  })(),
};

// Secure and Protect - simplified
export const secureAndProtect: CardDef = {
  title: "Secure and Protect",
  onPlay: {
    interactive: () => true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.deck?.length > 0,
      ),
    },
    waitingPrompt: true,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Self-Growth Program
export const selfGrowthProgram: CardDef = {
  title: "Self-Growth Program",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    prompt: "Choose 2 installed Runner cards",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard.allInstalled(state, "runner").length > 0,
      ),
    },
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.runner(c),
      max: 2,
    },
    msg: msg(
      "move ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.enumerateCards(targets),
      " to the grip",
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        targets.forEach((c: Card) =>
          coreMoving.move(state, "runner", c, "hand"),
        );
      },
    ),
  },
};

// Service Outage
export const serviceOutage: CardDef = {
  title: "Service Outage",
  onPlay: {
    msg: "add a cost of 1 [Credit] for the Runner to make the first run each turn",
  },
  staticAbilities: [
    {
      type: "run-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreEvents.noEvent(state, side, "run"),
      ),
      value: [corePayment.toC("credit", 1)],
    },
  ],
};

// Shipment from Kaguya
export const shipmentFromKaguya: CardDef = {
  title: "Shipment from Kaguya",
  onPlay: {
    choices: {
      max: 2,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          targets.every(
            (t: Card) =>
              coreCard.corp(t) &&
              coreCard.installed(t) &&
              coreCard.canBeAdvanced(state, t),
          ),
      ),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreDefHelpers.somethingCanBeAdvanced(state),
      ),
    },
    msg: msg(
      "place 1 advancement counters on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.quantify(targets.length, "card"),
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, "corp", targets[0], "advance-counter", 1, {
          placed: true,
        });
      },
    ),
  },
};

// Shipment from MirrorMorph
export const shipmentFromMirrorMorph: CardDef = {
  title: "Shipment from MirrorMorph",
  onPlay: coreDefHelpers.corpInstallUpToN(3),
};

// Shipment from SanSan
export const shipmentFromSanSan: CardDef = {
  title: "Shipment from SanSan",
  onPlay: {
    choices: ["0", "1", "2"],
    prompt: "How many advancement counters do you want to place?",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreDefHelpers.somethingCanBeAdvanced(state),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Shipment from Tennin
export const shipmentFromTennin: CardDef = {
  title: "Shipment from Tennin",
  onPlay: (() => {
    const abi = coreDefHelpers.placeAdvancementCounter(null, 2);
    return {
      ...abi,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !coreEvents.lastTurn(state, "runner", "successful-run"),
      ),
    };
  })(),
};

// Shipment from Vladisibirsk - simplified
export const shipmentFromVladisibirsk: CardDef = {
  title: "Shipment from Vladisibirsk",
  onPlay: {
    async: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.countTags(state) >= 2,
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreDefHelpers.somethingCanBeAdvanced(state),
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Shoot the Moon
export const shootTheMoon: CardDef = {
  title: "Shoot the Moon",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c)),
      ),
    },
    choices: {
      card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c),
      max: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          Math.min(
            utils.countTags(state),
            coreBoard
              .allInstalled(state, "corp")
              .filter((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c))
              .length,
          ),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRezzing.rezMultipleCards(state, side, eid, targets, {
          ignoreCost: "all-costs",
        });
      },
    ),
  },
};

// Simulation Reset
export const simulationReset: CardDef = {
  title: "Simulation Reset",
  onPlay: {
    rfgInsteadOfTrashing: true,
    prompt: "Choose up to 5 cards in HQ to trash",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    waitingPrompt: true,
    choices: {
      max: 5,
      card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c),
    },
    async: true,
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.quantify(targets.length, "card"),
      " from HQ",
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trashCards(state, side, targets, {
          unpreventable: true,
          causeCard: card,
        });
        coreShuffling.shuffleIntoRdEffect(
          state,
          side,
          eid,
          card,
          targets.length,
          true,
        );
        coreDrawing.draw(eid, targets.length);
      },
    ),
  },
};

// Snatch and Grab - simplified
export const snatchAndGrab: CardDef = {
  title: "Snatch and Grab",
  onPlay: {
    trace: {
      base: 3,
      successful: {
        waitingPrompt: true,
        msg: "trash a connection",
        choices: { card: (c: Card) => coreCard.hasSubtype(c, "Connection") },
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreMoving.trash("corp", eid, targets[0], { causeCard: card });
          },
        ),
      },
    },
  },
};

// Special Report
export const specialReport: CardDef = {
  title: "Special Report",
  onPlay: {
    prompt: "Choose any number of cards in HQ to shuffle into R&D",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    choices: {
      max: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length || 0,
      ),
      card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c),
    },
    msg: msg(
      "shuffle ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.quantify(targets.length, "card"),
      " in HQ into R&D and draw ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.quantify(targets.length, "card"),
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        targets.forEach((c: Card) => coreMoving.move(state, side, c, "deck"));
        coreShuffling.shuffle(state, side, "deck");
        coreDrawing.draw(state, side, eid, targets.length);
      },
    ),
  },
};

// Sprint
export const sprint: CardDef = {
  title: "Sprint",
  onPlay: {
    async: true,
    msg: "draw 3 cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(state, side, 3);
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          return continue_ability(
            state,
            side,
            {
              prompt: "Choose 2 cards in HQ to shuffle into R&D",
              choices: {
                max: 2,
                all: true,
                card: (c: Card) =>
                  coreCard.corp(c) && coreCard.inHandStar(state, c),
              },
              msg: msg(
                "shuffle ",
                (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ) => utils.quantify(targets.length, "card"),
                " from HQ into R&D",
              ),
              effect: effect(
                targets.forEach((c: Card) =>
                  coreMoving.move(state, side, c, "deck"),
                ),
                coreShuffling.shuffle(state, side, "deck"),
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

// Standard Procedure
export const standardProcedure: CardDef = {
  title: "Standard Procedure",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.register?.lastTurn?.successfulRun,
    ),
    prompt: "Choose one",
    choices: ["Event", "Hardware", "Program", "Resource"],
    msg: msg(
      "name ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0],
      ", reveal ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.enumerateCards((state as any).runner?.hand || [], {
          sorted: true,
        }),
      " from the grip, and gain ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        ((state as any).runner?.hand || []).filter((c: Card) =>
          coreCard.isType(c, targets[0]),
        ).length * 2,
      " [Credits]",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreRevealing.reveal(state, side, (state as any).runner?.hand || []);
        coreGaining.gainCredits(
          state,
          "corp",
          eid,
          ((state as any).runner?.hand || []).filter((c: Card) =>
            coreCard.isType(c, targets[0]),
          ).length * 2,
        );
      },
    ),
  },
};

// Stock Buy-Back
export const stockBuyBack: CardDef = {
  title: "Stock Buy-Back",
  onPlay: {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${(state as any).runner?.scored?.length * 3 || 0} [Credits]`,
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.scored?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(
          eid,
          (state as any).runner?.scored?.length * 3 || 0,
        );
      },
    ),
  },
};

// Sub Boost
export const subBoost: CardDef = {
  title: "Sub Boost",
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c)),
      ),
    },
    msg: msg(
      "make ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
      ' gain Barrier and "[Subroutine] End the run"',
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target = coreCard.getCard(state, targets[0]);
        if (target) {
          coreInstalling.installAsConditionCounter(
            state,
            side,
            eid,
            card,
            target,
          );
        }
      },
    ),
  },
  staticAbilities: [
    {
      type: "gain-subtype",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).context?.host) &&
          coreCard.rezzed(targets[0]),
      ),
      value: "Barrier",
    },
    {
      type: "additional-subroutines",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).context?.host) &&
          coreCard.rezzed(targets[0]),
      ),
      value: {
        subroutines: [
          {
            label: "[Sub Boost] End the run",
            msg: "end the run",
            async: true,
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreRuns.endRun(eid, card);
              },
            ),
          },
        ],
      },
    },
  ],
};

// Subcontract
export const subcontract: CardDef = {
  title: "Subcontract",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Subliminal Messaging
export const subliminalMessaging: CardDef = {
  title: "Subliminal Messaging",
  onPlay: {
    msg: "gain 1 [Credits]",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, side, 1);
      },
    ),
  },
  events: [
    {
      event: "corp-phase-12",
      location: "discard",
      optional: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            !coreEvents.lastTurn(state, "runner", "made-run"),
        ),
        prompt: msg(
          "Add ",
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            card.title,
          " to HQ?",
        ),
        yesAbility: {
          msg: "reveal and add itself to HQ",
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreRevealing.reveal(state, side, card);
              coreMoving.move(state, side, card, "hand");
              coreEid.effectCompleted(state, side, eid);
            },
          ),
        },
      },
    },
  ],
};

// Success - simplified
export const success: CardDef = {
  title: "Success",
  onPlay: {
    additionalCost: [corePayment.toC("forfeit")],
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.canBeAdvanced(state, targets[0]),
      ),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreDefHelpers.somethingCanBeAdvanced(state),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Sudden Commandment
export const suddenCommandment: CardDef = (() => {
  const playInstantSecond: any = {
    optional: {
      prompt: "Pay 3 [Credits] to gain [Click]?",
      waitingPrompt: true,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreThreat.threatLevel(3, state),
      ),
      yesAbility: {
        cost: [corePayment.toC("credit", 3)],
        msg: "gain [Click]",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreGaining.gainClicks(state, side, 1);
          },
        ),
      },
    },
  };
  const playInstantFirst: any = {
    prompt: "Choose a non-terminal operation",
    choices: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const hand = (state as any).corp?.hand || [];
        const ops = hand.filter(
          (c: Card) =>
            coreCard.operation(c) && !coreCard.hasSubtype(c, "Terminal"),
        );
        return [...ops, "Done"];
      },
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const isFirstMandate = coreEvents.firstEvent(
          state,
          side,
          "play-operation",
          (t: any[]) => coreCard.hasSubtype(t[0]?.card, "Mandate"),
        );
        if (targets[0] === "Done") {
          return continue_ability(
            state,
            side,
            isFirstMandate ? playInstantSecond : null,
            card,
            null,
          );
        }
        corePlayInstants.playInstant(
          state,
          side,
          coreEid.makeEid(state, eid),
          targets[0],
          null,
        );
        return continue_ability(
          state,
          side,
          isFirstMandate ? playInstantSecond : null,
          card,
          null,
        );
      },
    ),
  };
  return {
    title: "Sudden Commandment",
    onPlay: {
      msg: "draw 2 cards",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDrawing.draw(state, side, coreEid.makeEid(state, eid), 2);
          return continue_ability(state, side, playInstantFirst, card, null);
        },
      ),
    },
  };
})();

// Successful Demonstration
export const successfulDemonstration: CardDef = {
  title: "Successful Demonstration",
  onPlay: (() => {
    const abi = coreDefHelpers.gainCreditsAbility(7);
    return {
      ...abi,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.register?.lastTurn?.unsuccessfulRun,
      ),
    };
  })(),
};

// Sunset - simplified
export const sunset: CardDef = {
  title: "Sunset",
  onPlay: {
    prompt: "Choose a server",
    choices: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreServers.zonesToSortedNames(coreBoard.getZones(state)),
    ),
    msg: msg(
      "rearrange ice protecting ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0],
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Surveillance Sweep
export const surveillanceSweep: CardDef = {
  title: "Surveillance Sweep",
  staticAbilities: [
    {
      type: "trace-runner-spends-first",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).run,
      ),
      value: true,
    },
  ],
};

// Sweeps Week
export const sweepsWeek: CardDef = {
  title: "Sweeps Week",
  onPlay: {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${(state as any).runner?.hand?.length || 0} [Credits]`,
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.hand?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(eid, (state as any).runner?.hand?.length || 0);
      },
    ),
  },
};

// SYNC Rerouting
export const syncRerouting: CardDef = lockdown({
  title: "SYNC Rerouting",
  events: [
    coreChooseOne.chooseOneHelper({ event: "run", player: "runner" }, [
      {
        option: "Take 1 tag",
        ability: {
          async: true,
          displaySide: "corp",
          msg: "give the runner 1 tag",
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreTags.gainTags(state, "corp", eid, 1);
            },
          ),
        },
      },
      coreChooseOne.costOption([corePayment.toC("credit", 4)], "runner"),
    ]),
  ],
});

// Targeted Marketing - simplified
export const targetedMarketing: CardDef = {
  title: "Targeted Marketing",
  onPlay: {
    prompt: "Name a Runner card",
    choices: {
      cardTitle: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.runner(targets[0]) && !coreCard.identity(targets[0]),
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreSay.systemMsg(`uses ${card.title} to name ${targets[0]}`);
      },
    ),
  },
  events: [
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.cardTarget,
      ),
      msg: "gain 10 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits("corp", eid, 10);
        },
      ),
    },
  ],
};

// The All-Seeing I
export const theAllSeeingI: CardDef = {
  title: "The All-Seeing I",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard.allActiveInstalled(state, "runner").some(coreCard.resource),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Threat Assessment
export const threatAssessment: CardDef = {
  title: "Threat Assessment",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.register?.lastTurn?.trashedCard,
    ),
    prompt: "Choose an installed Runner card",
    choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Threat Level Alpha
export const threatLevelAlpha: CardDef = {
  title: "Threat Level Alpha",
  onPlay: {
    trace: {
      base: 1,
      successful: {
        label: "Give the Runner X tags",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const tags = Math.max(1, utils.countTags(state));
            return coreTags.gainTags(state, "corp", eid, tags);
          },
        ),
      },
    },
  },
};

// Too Big to Fail
export const tooBigToFail: CardDef = {
  title: "Too Big to Fail",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).corp?.credit < 10,
    ),
    msg: "gain 7 [Credits] and take 1 bad publicity",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, side, 7, { suppressCheckpoint: true });
        coreBadPublicity.gainBadPublicity(state, "corp", eid, 1);
      },
    ),
  },
};

// Top-Down Solutions
export const topDownSolutions: CardDef = {
  title: "Top-Down Solutions",
  onPlay: {
    async: true,
    msg: "draw 2 cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDrawing.draw(state, side, 2);
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Traffic Accident
export const trafficAccident: CardDef = {
  title: "Traffic Accident",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        utils.countTags(state) >= 2,
    ),
    msg: "do 2 meat damage",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, "meat", 2, { card });
      },
    ),
  },
};

// Transparency Initiative - simplified
export const transparencyInitiative: CardDef = {
  title: "Transparency Initiative",
  onPlay: {
    choices: {
      card: (c: Card) =>
        coreCard.agenda(c) && coreCard.installed(c) && !coreCard.faceup(c),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => !coreCard.faceup(c) && !coreCard.ice(c)),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreInstalling.installAsConditionCounter(state, side, eid, card, targets[0]);
      },
    ),
  },
  staticAbilities: [
    {
      type: "gain-subtype",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).context?.host) &&
          coreCard.rezzed(targets[0]),
      ),
      value: "Public",
    },
  ],
};

// Trick of Light - simplified
export const trickOfLight: CardDef = {
  title: "Trick of Light",
  onPlay: {
    prompt: "Choose an installed card you can advance",
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.canBeAdvanced(state, targets[0]) &&
          coreCard.installed(targets[0]),
      ),
    },
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreDefHelpers.somethingCanBeAdvanced(state),
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Trojan Horse - simplified
export const trojanHorse: CardDef = {
  title: "Trojan Horse",
  onPlay: {
    trace: {
      base: 4,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.register?.lastTurn?.accessedCards,
      ),
      label: "Trace 4 - Trash a program",
      successful: effect(coreEid.effectCompleted(state, side, eid)),
    },
  },
};

// Trust Operation
export const trustOperation: CardDef = {
  title: "Trust Operation",
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.isTagged(state),
    ),
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.title,
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allActiveInstalled(state, "runner")
            .some(coreCard.resource) ||
          (state as any).corp?.discard?.some(
            (c: Card) => !coreCard.operation(c) || !c.seen,
          ),
      ),
    },
    prompt: "Choose a resource to trash",
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.resource(c),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trash(state, side, targets[0], { causeCard: card });
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Touch-ups - simplified
export const touchUps: CardDef = {
  title: "Touch-ups",
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some(
              (c: Card) =>
                !coreCard.rezzed(c) || coreCard.canBeAdvanced(state, c),
            ),
      ),
    },
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.canBeAdvanced(state, targets[0]),
      ),
    },
    msg: msg(
      "place 2 advancement counters on ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, side, targets[0], "advance-counter", 2, {
          placed: true,
        });
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Ultraviolet Clearance - simplified
export const ultravioletClearance: CardDef = {
  title: "Ultraviolet Clearance",
  onPlay: {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Under the Bus
export const underTheBus: CardDef = {
  title: "Under the Bus",
  onPlay: {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.register?.lastTurn?.accessedCards,
    ),
    prompt: "Choose a connection to trash",
    choices: {
      card: (c: Card) =>
        coreCard.runner(c) &&
        coreCard.resource(c) &&
        coreCard.hasSubtype(c, "Connection") &&
        coreCard.installed(c),
    },
    msg: msg(
      "trash ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.title,
      " and take 1 bad publicity",
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trash(state, side, targets[0], {
          causeCard: card,
          suppressCheckpoint: true,
        });
        coreBadPublicity.gainBadPublicity(state, "corp", eid, 1);
      },
    ),
  },
};

// Unleash - simplified
export const unleash: CardDef = {
  title: "Unleash",
  onPlay: {
    additionalCost: [corePayment.toC("tag", 1)],
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c)),
      ),
    },
    choices: {
      card: (c: Card) =>
        coreCard.ice(c) && coreCard.installed(c) && !coreCard.rezzed(c),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEid.effectCompleted(state, side, eid);
      },
    ),
  },
};

// Violet Level Clearance
export const violetLevelClearance: CardDef = {
  title: "Violet Level Clearance",
  onPlay: clearance(8, 4),
};

// Voter Intimidation
export const voterIntimidation: CardDef = {
  title: "Voter Intimidation",
  onPlay: {
    psi: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).runner?.scored?.length > 0,
      ),
      notEqual: trashType("resource", coreCard.resource, true),
    },
  },
};

// Vulture Fund
export const vultureFund: CardDef = {
  title: "Vulture Fund",
  onPlay: {
    msg: "gain 14 [Credits] and take 1 bad publicity",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, side, 14, { suppressCheckpoint: true });
        coreBadPublicity.gainBadPublicity(state, side, eid, 1);
      },
    ),
  },
};

// Wake Up Call
export const wakeUpCall: CardDef = {
  title: "Wake Up Call",
  onPlay: {
    rfgInsteadOfTrashing: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (state as any).runner?.register?.lastTurn?.trashedCard,
    ),
    prompt: "Choose a piece of hardware or non-virtual resource",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allActiveInstalled(state, "runner")
            .some(
              (c: Card) =>
                coreCard.hardware(c) ||
                (coreCard.resource(c) && !coreCard.hasSubtype(c, "Virtual")),
            ),
      ),
    },
    choices: {
      card: (c: Card) =>
        coreCard.hardware(c) ||
        (coreCard.resource(c) && !coreCard.hasSubtype(c, "Virtual")),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEid.effectCompleted(state, side, eid),
    ),
  },
};

// Wetwork Refit
export const wetworkRefit: CardDef = {
  title: "Wetwork Refit",
  onPlay: {
    choices: {
      card: (c: Card) =>
        coreCard.ice(c) &&
        coreCard.hasSubtype(c, "Bioroid") &&
        coreCard.rezzed(c),
    },
    msg: msg(
      "give ",
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreToString.cardStr(state, targets[0]),
      ' "[Subroutine] Do 1 core damage" before all its other subroutines',
    ),
    async: true,
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBoard
            .allInstalled(state, "corp")
            .some(
              (c: Card) =>
                coreCard.ice(c) &&
                coreCard.rezzed(c) &&
                coreCard.hasSubtype(c, "Bioroid"),
            ),
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target = coreCard.getCard(state, targets[0]);
        if (target) {
          coreInstalling.installAsConditionCounter(
            state,
            side,
            eid,
            card,
            target,
          );
        }
      },
    ),
  },
  staticAbilities: [
    {
      type: "additional-subroutines",
      duration: "end-of-run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          utils.sameCard(targets[0], (state as any).context?.host) &&
          coreCard.rezzed(targets[0]),
      ),
      value: {
        position: "front",
        subroutines: [
          {
            ...coreDefHelpers.doBrainDamage(1),
            label: "[Wetwork Refit] Do 1 core damage",
          },
        ],
      },
    },
  ],
};

// Witness Tampering
export const witnessTampering: CardDef = {
  title: "Witness Tampering",
  onPlay: {
    msg: "remove 2 bad publicity",
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreBadPublicity.hasBadPub(state),
      ),
    },
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreBadPublicity.loseBadPublicity(2);
      },
    ),
  },
};

// Your Digital Life
export const yourDigitalLife: CardDef = {
  title: "Your Digital Life",
  onPlay: {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${(state as any).corp?.hand?.length || 0} [Credits]`,
    ),
    onChangeGameState: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (state as any).corp?.hand?.length > 0,
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(
          "corp",
          eid,
          (state as any).corp?.hand?.length || 0,
        );
      },
    ),
  },
};
