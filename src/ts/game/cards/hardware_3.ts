//
/**
 * Hardware Cards
 * Ported from Clojure cards/hardware.clj to TypeScript
 *
 * Contains all Runner hardware card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreActions from "../core/actions";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMemory from "../core/memory";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreVirus from "../core/virus";
import * as coreWinning from "../core/winning";
import * as coreSetAsideModule from "../core/set_aside";
import * as coreSabotage from "../core/sabotage";
import * as coreMark from "../core/mark";
import * as utils from "../utils";
import * as jintekiUtils from "../../jinteki/utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import { targetFn, autoIcebreakerFn } from "./_helpers";
import {
  accessBonusFn,
  accessCardFn,
  addCounterFn,
  allActiveInstalledFn,
  allInstalledFn,
  anySubsBrokenFn,
  breachAccessBonus,
  breakSubFn,
  caissaMuPlusFn,
  canTrashFn,
  cardStr,
  corpFn,
  decapitalize,
  derezFn,
  drawAbility,
  drawFn,
  effectCompletedFn,
  enumerateCards,
  eventFn,
  firstEventFn,
  gainCreditsFn,
  getCardFn,
  getCounters,
  hasSubtypeFn,
  hostFn,
  iceFn,
  inDiscardFn,
  inHandFn,
  installedFn,
  linkPlusFn,
  loseTagsFn,
  makeRunFn,
  muPlusFn,
  noEventFn,
  notUsedOnceFn,
  playAbilityFn,
  playInstantFn,
  preventTagFn,
  programFn,
  pumpFn,
  quantify,
  registerEventsFn,
  registerLingeringEffectFn,
  registerOnceFn,
  registerRunFlagFn,
  reorderChoice,
  revealFn,
  rezzedFn,
  runAnyServerAbilityFn,
  runnableServersFn,
  runnerCanPayAndInstallFn,
  runnerFn,
  runnerInstallFn,
  sameCard,
  successfulRunReplaceBreach,
  systemMsg,
  toC,
  trashCardsFn,
  trashFn,
  trashOnEmptyFn,
  unregisterFloatingEventsFn,
  unregisterLingeringEffectsFn,
  updateAllIceFn,
  updateAllIcebreakersFn,
  updateFn,
} from "./hardware_1";

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const state: any = undefined as any;
const target: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function countRealTagsFn(state: any): number {
  return (state as any)?.runner?.tag?.base || 0;
}
function runFn(_server?: any, _opts?: any): any {
  return {};
}

// Capstone
export const capstone: CardDef = {
  title: "Capstone",
  abilities: [
    {
      action: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (runnerFn(state)?.hand?.length ?? 0) > 0;
      }),
      label: "trash and install cards",
      cost: [toC("click", 1)],
      async: true,
      prompt: "Choose any number of cards to trash from the grip",
      choices: {
        max: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return runnerFn(state)?.hand?.length ?? 0;
        }),
        card: (c: Card) => runnerFn(c) && inHandFn(c),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const trashedCardNames = targets.map((t: any) => t.title || t);
        const installedCards = allActiveInstalledFn(state, ":runner");
        const installedNames = installedCards.map((c: Card) => c.title);
        const overlapSet = new Set(
          trashedCardNames.filter((n: string) => installedNames.includes(n)),
        );

        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trashCardsFn(state, side, eid, targets, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
        const trashedCards = (state as any).async_result;
        const drawCount = Array.from(overlapSet).length;
        yield wait_for(
          state,
          [{ asyncResult: "result" }, drawFn(state, side, drawCount)],
          [],
        );
        systemMsg(
          state,
          side,
          `uses ${cardObj.title} to trash ${enumerateCards(trashedCards)} from the grip and draw ${quantify(drawCount, "card")}`,
        );
        effectCompletedFn(state, side, eid);
      }),
    },
  ],
};

// Capybara
export const capybara: CardDef = {
  title: "Capybara",
  events: [
    {
      event: "bypassed-ice",
      async: true,
      optional: {
        req: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return true;
        }),
        prompt: (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ) => {
          const target: any = (targets as any[])?.[0];
          return `Remove this hardware from the game to derez ${target?.title || "the encountered ice"}?`;
        },
        "waiting-prompt": true,
        "yes-ability": {
          async: true,
          cost: [toC(":remove-from-game")],
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = (targets as any[])?.[0];
            derezFn(state, side, eid, target, {
              "msg-keys": { "include-cost-from-eid": eid },
            });
          }),
        },
      },
    },
  ],
};

// Carnivore
export const carnivore: CardDef = {
  title: "Carnivore",
  "static-abilities": [muPlusFn(1)],
  interactions: {
    "access-ability": {
      label: "Trash card",
      "trash?": true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const cardObj = getCardFn(state, card);
        const runner = runnerFn(state);
        return (
          canTrashFn(state, ":runner", target) &&
          !inDiscardFn(target) &&
          !(state as any)["per-turn"]?.[cardObj.cid] &&
          (runner?.hand?.length ?? 0) >= 2
        );
      }),
      cost: [toC(":trash-from-hand", 2)],
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `trash ${target.title} at no cost`;
        })();
      },
      once: ":per-turn",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          trashFn(
            eid,
            { ...target, seen: true },
            { accessed: true, causeCard: card },
          );
        },
      ),
    },
  },
};

// Cataloguer
export const cataloguer: CardDef = {
  title: "Cataloguer",
  data: { counter: { power: 2 } },
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC("power", 1)],
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const runner = runnerFn(state);
        return (runner?.reg?.successfulRun || []).some(
          (s: any) => s === ":rd" || s === "rd",
        );
      }),
      label: "Breach R&D",
      msg: "breach R&D",
      "keep-menu-open": ":while-power-tokens-left",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          accessBonusFn(state, ":runner", ":rd", 1);
        },
      ),
    },
  ],
  events: [
    trashOnEmptyFn("power"),
    successfulRunReplaceBreach({
      targetServer: ":rd",
      mandatory: false,
      ability: {
        async: true,
        msg: "rearrange the top 4 cards of R&D",
        cost: [toC("power", 1)],
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return getCounters(card, "power") > 0;
        }),
        "waiting-prompt": true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corp = corpFn(state as unknown as State);
          const deckCards = corp?.deck?.slice(0, 4) || [];
          if (deckCards.length > 0) {
            continue_ability(
              state,
              side,
              reorderChoice(
                ":corp",
                ":corp",
                deckCards,
                0,
                deckCards.length,
                deckCards,
              ),
              card,
              null,
            );
          }
        }),
      },
    }),
  ],
};

// Chop Bot 3000
export const chopBot: CardDef = {
  title: "Chop Bot 3000",
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (allInstalledFn(state, ":runner").length ?? 0) >= 2;
    }),
  },
  events: [
    {
      event: "runner-turn-begins",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (allInstalledFn(state, ":runner").length ?? 0) >= 2;
      }),
      once: ":per-turn",
      prompt: "Trash another installed card to draw 1 card or remove 1 tag",
      choices: {
        card: (c: Card) => runnerFn(c) && installedFn(c),
        "not-self": true,
      },
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const trashedCard = target;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trashFn(state, ":runner", trashedCard, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
        const tags = countRealTagsFn(state);
        continue_ability(
          state,
          side,
          {
            prompt: "Choose one",
            "waiting-prompt": true,
            choices: [
              "Draw 1 card",
              ...(tags > 0 ? ["Remove 1 tag"] : []),
              "Done",
            ],
            async: true,
            msg: (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              return `trash ${cardStr(state, trashedCard)} and ${decapitalize(target)}`;
            },
            effect: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              if (target === "Draw 1 card") {
                drawFn(state, ":runner", eid, 1);
              } else if (target === "Remove 1 tag") {
                loseTagsFn(state, ":runner", eid, 1);
              } else {
                effectCompletedFn(state, ":runner", eid);
              }
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
  abilities: [
    {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (allInstalledFn(state, ":runner").length ?? 0) >= 2;
      }),
      label: "Trash another installed card to draw 1 card or remove 1 tag",
      choices: {
        card: (c: Card) => runnerFn(c) && installedFn(c),
        "not-self": true,
      },
      once: ":per-turn",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const trashedCard = target;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            trashFn(state, ":runner", trashedCard, {
              unpreventable: true,
              causeCard: card,
            }),
          ],
          [],
        );
        const tags = countRealTagsFn(state);
        continue_ability(
          state,
          side,
          {
            prompt: "Choose one",
            "waiting-prompt": true,
            choices: [
              "Draw 1 card",
              ...(tags > 0 ? ["Remove 1 tag"] : []),
              "Done",
            ],
            async: true,
            msg: (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              return `trash ${cardStr(state, trashedCard)} and ${decapitalize(target)}`;
            },
            effect: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              if (target === "Draw 1 card") {
                drawFn(state, ":runner", eid, 1);
              } else if (target === "Remove 1 tag") {
                loseTagsFn(state, ":runner", eid, 1);
              } else {
                effectCompletedFn(state, ":runner", eid);
              }
            }),
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Clone Chip
export const cloneChip: CardDef = {
  title: "Clone Chip",
  abilities: [
    {
      prompt: "Choose a program to install",
      label: "Install program from the heap",
      "show-discard": true,
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const runner = runnerFn(state);
          const discard = runner?.discard || [];
          return discard.some(
            (c: Card) =>
              programFn(c) &&
              runnerCanPayAndInstallFn(
                state,
                side,
                { ...eid, source: card, "source-type": ":runner-install" },
                c,
                { "no-toast": true },
              ),
          );
        }),
      },
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          return (
            programFn(target) &&
            inDiscardFn(target) &&
            runnerCanPayAndInstallFn(
              state,
              side,
              { ...eid, source: card },
              target,
            )
          );
        }),
      },
      cost: [toC(":trash-can")],
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          runnerInstallFn(
            { ...eid, source: card, "source-type": ":runner-install" },
            target,
            {
              "msg-keys": {
                installSource: card,
                displayOrigin: true,
                "include-cost-from-eid": eid,
              },
            },
          );
        },
      ),
    },
  ],
};

// Comet
export const comet: CardDef = {
  title: "Comet",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "play-event",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return firstEventFn(state, side, "play-event");
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        systemMsg(
          state,
          ":runner",
          `can play another event without spending a [Click] by clicking on Comet`,
        );
        updateFn(state, side, { ...card, "comet-event": true });
      }),
    },
  ],
  abilities: [
    {
      async: true,
      label: "Play an event in the grip twice",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        return cardObj?.["comet-event"];
      }),
      prompt: "Choose an event to play",
      choices: { card: (c: Card) => eventFn(c) && inHandFn(c) },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `play ${target?.title || ""}`;
        })();
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const newEid = { ...eid, "source-type": ":play" };
        updateFn(state, ":runner", {
          ...getCardFn(state, card),
          "comet-event": false,
        });
        playInstantFn(state, side, newEid, target, null);
      }),
    },
  ],
};

// Cortez Chip
export const cortezChip: CardDef = {
  title: "Cortez Chip",
  abilities: [
    {
      prompt: "Choose a piece of ice",
      label: "increase rez cost of ice",
      choices: { card: (c: Card) => iceFn(c) && !rezzedFn(c) },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return `increase the rez cost of ${cardStr(state, target)} by 2 [Credits] until the end of the turn`;
      },
      cost: [toC(":trash-can")],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          registerLingeringEffectFn(card, {
            type: ":rez-additional-cost",
            duration: ":end-of-turn",
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              const target: any = (targets as any[])?.[0];
              const ice = target;
              return sameCard(targets[0], ice);
            }),
            value: [toC("credit", 2)],
          });
        },
      ),
    },
  ],
};

// Cyberdelia
export const cyberdelia: CardDef = {
  title: "Cyberdelia",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "subroutines-broken",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return !!(
          ctx.allSubsBroken &&
          firstEventFn(
            state,
            side,
            "subroutines-broken",
            (t: any[]) => t[0] && t[0].allSubsBroken,
          )
        );
      }),
      msg: "gain 1 [Credits] for breaking all subroutines on a piece of ice",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          gainCreditsFn(eid, 1);
        },
      ),
    },
  ],
};

// Cyberfeeder
export const cyberfeeder: CardDef = {
  title: "Cyberfeeder",
  recurring: 1,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const t = target;
        const srcType = eid["source-type"];
        return (
          ((srcType === ":runner-install" || srcType === "runner-install") &&
            hasSubtypeFn(t, "Virus") &&
            programFn(t)) ||
          ((srcType === ":ability" || srcType === "ability") &&
            hasSubtypeFn(t, "Icebreaker"))
        );
      }),
      type: ":recurring",
    },
  },
};

// CyberSolutions Mem Chip
export const cyberSolutionsMemChip: CardDef = {
  title: "CyberSolutions Mem Chip",
  "static-abilities": [muPlusFn(2)],
};

// Cybsoft MacroDrive
export const cybsoftMacroDrive: CardDef = {
  title: "Cybsoft MacroDrive",
  recurring: 1,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const t = target;
        return eid["source-type"] === ":ability" && programFn(t);
      }),
      type: ":recurring",
    },
  },
};

// Daredevil
export const daredevil: CardDef = {
  title: "Daredevil",
  "static-abilities": [muPlusFn(2)],
  events: [
    drawAbility(2, null, {
      event: "run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const pos = (targetFn(state, card, targets) as { position?: number } | undefined)?.position ?? 0;
        return (
          pos <= 2 &&
          firstEventFn(
            state,
            side,
            "run",
            (t: any[]) => (t[0]?.position ?? 0) <= 2,
          )
        );
      }),
    }),
  ],
};

// Dedicated Processor
export const dedicatedProcessor: CardDef = {
  title: "Dedicated Processor",
  implementation: "Click Dedicated Processor to use ability",
  req: req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    const allActiveInstalled = allActiveInstalledFn(state, ":runner");
    return allActiveInstalled.some((c: Card) => hasSubtypeFn(c, "Icebreaker"));
  }),
  hosting: {
    card: (c: Card) =>
      hasSubtypeFn(c, "Icebreaker") && !hasSubtypeFn(c, "AI") && installedFn(c),
  },
  abilities: [
    {
      cost: [toC("credit", 2)],
      label: "add 4 strength for the remainder of the run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return !!runFn(state);
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const host = forms.host?.(state, card);
        const hostCard = getCardFn(state, host);
        if (hostCard) {
          pumpFn(hostCard, 4);
        }
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `pump the strength of ${forms.host?.(state, card)?.title || ""} by 4`,
    },
  ],
};

// Deep Red
export const deepRed: CardDef = {
  title: "Deep Red",
  "static-abilities": [caissaMuPlusFn(3)],
  events: [
    {
      event: "runner-install",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return hasSubtypeFn(ctx.card, "Caissa");
        }),
        prompt:
          "Trigger the [Click] ability of the just-installed Caissa program?",
        "yes-ability": {
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              playAbilityFn(eid, {
                card: (forms.context(state, card, targets) as any)?.card,
                ability: 0,
                "ignore-cost": true,
              });
            },
          ),
        },
      },
    },
  ],
};

// Demolisher
export const demolisher: CardDef = {
  title: "Demolisher",
  "static-abilities": [muPlusFn(1), { type: ":trash-cost", value: -1 }],
  events: [
    {
      event: "runner-trash",
      "once-per-instance": true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (
          corpFn(ctx.card) &&
          firstEventFn(state, side, "runner-trash", (t: any[]) =>
            t.some((x: any) => corpFn(x.card)),
          )
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          gainCreditsFn(":runner", eid, 1);
        },
      ),
    },
  ],
};

// Desperado
export const desperado: CardDef = {
  title: "Desperado",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "successful-run",
      automatic: ":gain-credits",
      silent: true,
      async: true,
      msg: "gain 1 [Credits]",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          gainCreditsFn(eid, 1);
        },
      ),
    },
  ],
};

// Detente
export const detente: CardDef = {
  title: "Detente",
  abilities: [
    {
      action: true,
      cost: [toC("click", 1), toC(":hosted-to-hq", 2)],
      label: "Runner may access 1 card from HQ",
      msg: ":cost",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        continue_ability(
          state,
          ":runner",
          {
            optional: {
              prompt: "Access 1 card from HQ?",
              "waiting-prompt": true,
              "yes-ability": {
                msg: "access 1 card from HQ",
                async: true,
                effect: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const corp = corpFn(state);
                  const hand = corp?.hand || [];
                  if (hand.length > 0) {
                    const shuffled = [...hand].sort(() => Math.random() - 0.5);
                    const cardToAccess = shuffled[0];
                    accessCardFn(state, ":runner", eid, cardToAccess);
                  }
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "successful-run",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          const validCtx = (c: any) =>
            c.server?.[0] === ":hq" || c.server?.[0] === "hq";
          return (
            validCtx(ctx) &&
            firstEventFn(
              state,
              side,
              "successful-run",
              (t: any[]) => t[0] && validCtx(t[0]),
            ) &&
            !!corpFn(state)?.hand?.length
          );
        }),
        "waiting-prompt": true,
        prompt: "Reveal and host a card from HQ (at random)",
        "yes-ability": {
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const corp = corpFn(state);
            const hand = corp?.hand || [];
            const targetCard =
              hand.length > 0
                ? hand[Math.floor(Math.random() * hand.length)]
                : null;
            if (targetCard) {
              systemMsg(
                state,
                side,
                `uses Detente to reveal and host ${targetCard.title} from HQ`,
              );
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  revealFn(state, ":runner", targetCard),
                ],
                [],
              );
              hostFn(state, side, card, { ...targetCard, seen: true });
              effectCompletedFn(state, side, eid);
            }
          }),
          async: true,
        },
      },
    },
  ],
  "corp-abilities": [
    {
      action: true,
      player: ":corp",
      "display-side": ":corp",
      cost: [toC("click", 1), toC(":hosted-to-hq", 2)],
      label: "Runner may access 1 card from HQ",
      msg: ":cost",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        continue_ability(
          state,
          ":runner",
          {
            optional: {
              prompt: "Access 1 card from HQ?",
              "waiting-prompt": true,
              "yes-ability": {
                msg: "access 1 card from HQ",
                async: true,
                effect: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const corp = corpFn(state);
                  const hand = corp?.hand || [];
                  if (hand.length > 0) {
                    const shuffled = [...hand].sort(() => Math.random() - 0.5);
                    const cardToAccess = shuffled[0];
                    accessCardFn(state, ":runner", eid, cardToAccess);
                  }
                }),
              },
            },
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Devil Charm
export const devilCharm: CardDef = {
  title: "Devil Charm",
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      optional: {
        prompt:
          "Remove Devil Charm from the game to give encountered ice -6 strength?",
        "yes-ability": {
          msg: (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ) =>
            `give -6 strength to ${(forms.context(state, card, targets) as any)?.ice?.title || "the encountered ice"} for the remainder of the run`,
          cost: [toC(":remove-from-game")],
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              registerLingeringEffectFn(card, {
                type: ":ice-strength",
                duration: ":end-of-run",
                req: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const ctx = forms.context(state, card, targets) || {};
                  const ice = ctx.ice;
                  return ice && sameCard(targets[0], ice);
                }),
                value: -6,
              });
              updateAllIceFn(state);
            },
          ),
        },
      },
    },
  ],
};

// Dinosaurus
export const dinosaurus: CardDef = {
  title: "Dinosaurus",
  "static-abilities": [
    {
      type: ":can-host",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return (
          programFn(target) &&
          hasSubtypeFn(target, "Icebreaker") &&
          !hasSubtypeFn(target, "AI")
        );
      }),
      "max-cards": 1,
      "no-mu": true,
    },
    {
      type: ":breaker-strength",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return hosted && hosted.length > 0 && sameCard(targets[0], hosted[0]);
      }),
      value: 2,
    },
  ],
};

// Docklands Pass
export const docklandsPass: CardDef = {
  title: "Docklands Pass",
  events: [
    breachAccessBonus(":hq", 1, {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (
          ctx.server === ":hq" &&
          firstEventFn(
            state,
            side,
            "breach-server",
            (t: any[]) => t[0] && t[0].server === ":hq",
          )
        );
      }),
      msg: "access 1 additional card from HQ",
    }),
  ],
};

// Doppelgänger
export const doppelganger: CardDef = {
  title: "Doppelgänger",
  "static-abilities": [muPlusFn(1)],
  events: [
    {
      event: "run-ends",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      "change-in-game-state": {
        silent: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return notUsedOnceFn(state, { once: ":per-turn" }, card);
        }),
      },
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return !!(
            ctx.successful && notUsedOnceFn(state, { once: ":per-turn" }, card)
          );
        }),
        prompt: "Make another run?",
        "yes-ability": {
          prompt: "Choose a server",
          once: ":per-turn",
          async: true,
          choices: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return runnableServersFn(state, side, eid, card);
          }),
          msg: (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ) => {
            const target: any = (targets as any[])?.[0];
            return ((): string => {
              const target: any = (targets as any[])?.[0];
              return `make a run on ${target}`;
            })();
          },
          "makes-run": true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              unregisterLingeringEffectsFn(":end-of-run");
              unregisterFloatingEventsFn(":end-of-run");
              registerOnceFn(state, side, { once: ":per-turn" }, card);
              updateAllIcebreakersFn(state, side);
              updateAllIceFn(state);
              coreIce.resetAllIce?.(state, side);
              corePrompts.clearWaitPrompt?.(":corp");
              makeRunFn(eid, target, getCardFn(state, card));
            },
          ),
        },
      },
    },
  ],
};

// Dorm Computer
export const dormComputer: CardDef = {
  title: "Dorm Computer",
  data: { counter: { power: 4 } },
  "static-abilities": [
    {
      type: ":forced-to-avoid-tag",
      value: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        // this-card-is-run-source check
        const run = forms.run(state);
        const sourceCard = run?.sourceCard;
        return sourceCard && sameCard(card, sourceCard);
      }),
    },
  ],
  events: [
    {
      event: "tag-interrupt",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const run = forms.run(state);
        const sourceCard = run?.sourceCard;
        return sourceCard && sameCard(sourceCard, card);
      }),
      async: true,
      msg: "avoid all tags",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        preventTagFn(state, ":runner", "all");
      }),
    },
  ],
  abilities: [
    runAnyServerAbilityFn({
      action: true,
      cost: [toC("click", 1), toC("power", 1)],
      msg: "make a run and avoid all tags for the remainder of the run",
    }),
  ],
};

// Dyson Fractal Generator
export const dysonFractalGenerator: CardDef = {
  title: "Dyson Fractal Generator",
  recurring: 1,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const t = target;
        return (
          eid["source-type"] === ":ability" &&
          hasSubtypeFn(t, "Fracter") &&
          hasSubtypeFn(t, "Icebreaker")
        );
      }),
      type: ":recurring",
    },
  },
};

// Dyson Mem Chip
export const dysonMemChip: CardDef = {
  title: "Dyson Mem Chip",
  "static-abilities": [muPlusFn(1), linkPlusFn(1)],
};

// DZMZ Optimizer
export const dzmzOptimizer: CardDef = {
  title: "DZMZ Optimizer",
  "static-abilities": [
    muPlusFn(1),
    {
      type: ":install-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return (
          programFn(target) &&
          noEventFn(state, ":runner", "runner-install", (t: any[]) =>
            programFn((t[0] || {}).card),
          )
        );
      }),
      value: -1,
    },
  ],
  events: [
    {
      event: "runner-install",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        return (
          programFn(target) &&
          firstEventFn(state, ":runner", "runner-install", (t: any[]) =>
            programFn((t[0] || {}).card),
          )
        );
      }),
      silent: true,
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return ((): string => {
          const target: any = (targets as any[])?.[0];
          return `reduce the install cost of ${target.title} by 1 [Credits]`;
        })();
      },
    },
  ],
};

// e3 Feedback Implants
export const e3FeedbackImplants: CardDef = {
  title: "e3 Feedback Implants",
  ...autoIcebreakerFn({
    abilities: [
      {
        ...breakSubFn(1, 1, "All", {
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            return anySubsBrokenFn(forms.currentIce?.(state));
          }),
        }),
      },
    ],
  }),
};

// Ekomind
export const ekomind: CardDef = {
  title: "Ekomind",
  effect: req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    // Update base mu to match hand size
    const handSize = (runnerFn(state)?.hand || []).length;
    // Add watch to update on hand change
    addWatchFn(
      state,
      "ekomind",
      (k: string, ref: any, oldVal: any, newVal: any) => {
        const newHandSize = (newVal?.runner?.hand || []).length;
        if (newHandSize !== (oldVal?.runner?.hand || []).length) {
          // Update base mu
          const base = newVal.runner?.memory?.base;
          if (base !== newHandSize) {
            coreUpdate.updateIn(
              ref,
              ["runner", "memory", "base"],
              () => newHandSize,
            );
          }
        }
      },
    );
  }),
  "leave-play": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    removeWatchFn(state, "ekomind");
  }),
};

// EMP Device
export const empDevice: CardDef = {
  title: "EMP Device",
  abilities: [
    {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return !!runFn(state);
      }),
      msg: "prevent the Corp from rezzing more than 1 piece of ice for the remainder of the run",
      cost: [toC(":trash-can")],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          registerEventsFn(card, [
            {
              event: "rez",
              duration: ":end-of-run",
              "unregister-once-resolved": true,
              req: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                return iceFn(
                  (forms.context(state, card, targets) as any)?.card,
                );
              }),
              effect: effect(
                registerRunFlagFn(
                  card,
                  ":can-rez",
                  (s: State, _side: Side, card: Card) =>
                    iceFn(card)
                      ? (() => {
                          toastFn(
                            state,
                            ":corp",
                            "Cannot rez ice the rest of this run due to EMP Device",
                          );
                          return false;
                        })()
                      : true,
                ),
              ),
            },
          ]);
        },
      ),
    },
  ],
};

function toastFn(...args: any[]): void {
  (coreToasts.toast as any)?.(...args);
}

function addWatchFn(state: any, key: string, fn: any): void {
  state.addWatch?.(key, fn);
}

function removeWatchFn(state: any, key: string): void {
  state.removeWatch?.(key);
}

// Endurance
export const endurance: CardDef = {
  title: "Endurance",
  ...autoIcebreakerFn({
    data: { counter: { power: 3 } },
    "static-abilities": [muPlusFn(2)],
    events: [
      {
        event: "successful-run",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return firstEventFn(state, ":runner", "successful-run");
        }),
        msg: "place 1 power counter on itself",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            addCounterFn(eid, card, "power", 1);
          },
        ),
      },
    ],
    abilities: [breakSubFn(toC("power", 2), 2, "All")],
  }),
};
