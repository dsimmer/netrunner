//
/**
 * Agenda Cards
 * Ported from Clojure cards/agendas.clj to TypeScript
 *
 * Contains ~181 card definitions with their abilities and events.
 * Each card has properties like on-score, on-access, events, static-abilities, etc.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAgendas from "../core/agendas";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
import * as coreChooseOne from "../core/choose_one";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInitializing from "../core/initializing";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePrevention from "../core/prevention";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as corePurging from "../core/purging";
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
import * as coreWinning from "../core/winning";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import { installAbility, iceBoostAgenda } from "./_helpers";
import { addAgendaPointCounters, agendaCounters } from "./agendas_1";
import * as coreBadPublicity from "../core/bad_publicity";

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const state: any = undefined as any;
const target: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function projectAgenda(_args?: any): any {
  return {};
}

// Corporate Oversight A
export const corporateOversightA: CardDef = {
  title: "Corporate Oversight A",
  "on-score": {
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    optional: {
      prompt:
        "Search R&D for a piece of ice to install protecting a remote server?",
      "yes-ability": {
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) =>
            coreCard.ice(c),
          );
          if (deckIces.length > 0) {
            continue_ability(
              state,
              side,
              {
                async: true,
                prompt: "Choose a piece of ice",
                choices: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const corp = (state as any).corp;
                  return (corp?.deck || []).filter((c: Card) =>
                    coreCard.ice(c),
                  );
                }),
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const chosenIce = target;
                  continue_ability(
                    state,
                    side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard
                        .installableServers(state, chosenIce)
                        .filter(
                          (s: string) => !["HQ", "Archives", "R&D"].includes(s),
                        ),
                      effect: effect(
                        coreShuffling.shuffle(state, ":deck"),
                        coreInstalling.corpInstall(eid, chosenIce, target, {
                          ignoreAllCost: true,
                          "install-state": ":rezzed-no-cost",
                        }),
                      ),
                    },
                    card,
                    null,
                  );
                }),
              },
              card,
              null,
            );
          } else {
            continue_ability(
              state,
              side,
              {
                prompt: "You have no ice in R&D",
                choices: ["Carry on!"],
                "prompt-type": ":bogus",
                msg: "shuffle R&D",
                effect: effect(coreShuffling.shuffle(state, ":deck")),
              },
              card,
              null,
            );
          }
        }),
      },
    },
  },
};

// Corporate Oversight B
export const corporateOversightB: CardDef = {
  title: "Corporate Oversight B",
  "on-score": {
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    optional: {
      prompt:
        "Search R&D for a piece of ice to install protecting a central server?",
      "yes-ability": {
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) =>
            coreCard.ice(c),
          );
          if (deckIces.length > 0) {
            continue_ability(
              state,
              side,
              {
                async: true,
                prompt: "Choose a piece of ice",
                choices: req(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const corp = (state as any).corp;
                  return (corp?.deck || []).filter((c: Card) =>
                    coreCard.ice(c),
                  );
                }),
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const chosenIce = target;
                  continue_ability(
                    state,
                    side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard
                        .installableServers(state, chosenIce)
                        .filter((s: string) =>
                          ["HQ", "Archives", "R&D"].includes(s),
                        ),
                      effect: effect(
                        coreShuffling.shuffle(state, ":deck"),
                        coreInstalling.corpInstall(eid, chosenIce, target, {
                          ignoreAllCost: true,
                          "install-state": ":rezzed-no-cost",
                        }),
                      ),
                    },
                    card,
                    null,
                  );
                }),
              },
              card,
              null,
            );
          } else {
            continue_ability(
              state,
              side,
              {
                prompt: "You have no ice in R&D",
                choices: ["Carry on!"],
                "prompt-type": ":bogus",
                msg: "shuffle R&D",
                effect: effect(coreShuffling.shuffle(state, ":deck")),
              },
              card,
              null,
            );
          }
        }),
      },
    },
  },
};

// Corporate Sales Team
export const corporateSalesTeam: CardDef = {
  title: "Corporate Sales Team",
  "on-score": agendaCounters(10, ":credit"),
  events: [
    {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return card && (coreCard.getCounters(card, ":credit") || 0) > 0;
      }),
      msg: "gain 1 [Credits]",
      automatic: ":gain-credits",
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.takeCredits(state, side, eid, card, ":credit", 1),
          ],
          [],
        );
      }),
    },
  ].map((e) => ({ ...e, event: "runner-turn-begins" })),
};

// Corporate War
export const corporateWar: CardDef = {
  title: "Corporate War",
  "on-score": {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (state as any).corp?.credit > 6 ? "gain 7 [Credits]" : "lose all credits",
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const corp = (state as any).corp;
      if (corp?.credit > 6) {
        coreGaining.gainCredits(state, side, 7);
      } else {
        coreGaining.loseCredits(state, side, ":all");
      }
    }),
  },
};

// Crisis Management
export const crisisManagement: CardDef = {
  title: "Crisis Management",
  events: [
    {
      event: "corp-turn-begins",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return forms.tagged(state);
      }),
      async: true,
      label: "Do 1 meat damage (start of turn)",
      automatic: ":corp-damage",
      once: ":per-turn",
      msg: "do 1 meat damage",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(eid, ":meat", 1, { card: card });
        },
      ),
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
        return forms.tagged(state);
      }),
      async: true,
      label: "Do 1 meat damage (start of turn)",
      automatic: ":corp-damage",
      once: ":per-turn",
      msg: "do 1 meat damage",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(eid, ":meat", 1, { card: card });
        },
      ),
    },
  ],
};

// Cyberdex Sandbox
export const cyberdexSandbox: CardDef = {
  title: "Cyberdex Sandbox",
  "on-score": {
    optional: {
      prompt: "Purge virus counters?",
      "yes-ability": {
        msg: "purge virus counters",
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            corePurging.purge(state, side, eid);
          },
        ),
      },
    },
  },
  events: [
    {
      event: "purge",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreEvents.firstEvent(state, side, "purge");
      }),
      msg: "gain 4 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, 4),
          ],
          [],
        );
      }),
    },
  ],
};

// Dedicated Neural Net
export const dedicatedNeuralNet: CardDef = {
  title: "Dedicated Neural Net",
  events: [
    {
      event: "successful-run",
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      psi: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const ctx = forms.context(state, card, targets) || {};
          return (
            forms.target(state, card, targets) === "hq" &&
            coreEvents.firstEvent(state, side, "successful-run", (t: any[]) => {
              const first = t[0];
              return first && coreServers.targetServer(first) === "hq";
            })
          );
        }),
        "not-equal": {
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreEffects.registerLingeringEffect(card, {
                type: ":corp-choose-hq-access",
                duration: ":end-of-run",
                value: true,
              });
              coreEid.effectCompleted(eid);
            },
          ),
        },
      },
    },
  ],
};

// Degree Mill
export const degreeMill: CardDef = {
  title: "Degree Mill",
  "steal-cost-bonus": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return [corePayment.toC("shuffle-installed-to-stack", 2)];
  }),
};

// Director Haas' Pet Project
export const directorsPetProject: CardDef = {
  title: "Director Haas' Pet Project",
  "on-score": {
    optional: {
      prompt: "Install cards in a new remote server?",
      "yes-ability": {
        async: true,
        prompt: "Choose a card to install",
        choices: {
          card: (c: Card) =>
            coreCard.corp(c) &&
            !coreCard.operation(c) &&
            (coreCard.inHand(c) || coreCard.inDiscard(c)),
        },
        "show-discard": true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const remoteNames = coreBoard.getRemoteNames(state);
          const server =
            remoteNames.length > 0
              ? remoteNames[remoteNames.length - 1]
              : "New remote";
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreInstalling.corpInstall(state, side, target, server, {
                ignoreAllCost: true,
                msgKeys: { installSource: card, displayOrigin: true },
              }),
            ],
            [],
          );
          continue_ability(state, side, installAbility(server, 0), card, null);
        }),
      },
    },
  },
};

// Divested Trust
export const divestedTrust: CardDef = {
  title: "Divested Trust",
  events: [
    {
      event: "agenda-stolen",
      async: true,
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const winner = state.winner;
        if (winner) {
          coreEid.effectCompleted(state, side, eid);
          return;
        }
        const foundCard = coreFinding.findLatest(state, card);
        const stolenAgenda = coreFinding.findLatest(
          state,
          (forms.context(state, card, targets) || {}).card,
        );
        if (!foundCard || !stolenAgenda) {
          coreEid.effectCompleted(state, side, eid);
          return;
        }
        const title = stolenAgenda.title || "";
        const inScored = coreFlags.inRunnerScored(state, side, foundCard);
        const cardSide = inScored ? ":runner" : ":corp";
        const prompt = `Forfeit Divested Trust to add ${title} to HQ and gain 5 [Credits]?`;
        const message = `add ${title} to HQ and gain 5 [Credits]`;
        continue_ability(
          state,
          side,
          {
            optional: {
              "waiting-prompt": true,
              prompt: prompt,
              "yes-ability": {
                msg: message,
                async: true,
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  eid2: EID,
                  c: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  yield wait_for(
                    state,
                    [
                      { asyncResult: "result" },
                      coreMoving.forfeit(
                        state,
                        cardSide,
                        coreEid.makeEid(state, eid),
                        foundCard,
                      ),
                    ],
                    [],
                  );
                  yield wait_for(
                    state,
                    [
                      { asyncResult: "result" },
                      coreMoving.move(state, side, stolenAgenda, "hand"),
                    ],
                    [],
                  );
                  coreAgendas.updateAllAgendaPoints(state, side);
                  yield wait_for(
                    state,
                    [
                      { asyncResult: "result" },
                      coreGaining.gainCredits(state, side, eid2, 5),
                    ],
                    [],
                  );
                }),
              },
            },
          },
          foundCard,
          null,
        );
      }),
    },
  ],
};

// Domestic Sleepers
export const domesticSleepers: CardDef = {
  title: "Domestic Sleepers",
  "agendapoints-corp": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return (coreCard.getCounters(card, ":agenda") || 0) > 0 ? 1 : 0;
  }),
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 3)],
      msg: "place 1 agenda counter on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        addAgendaPointCounters(state, side, eid, card, 1);
      }),
    },
  ],
};

// Élivágar Bifurcation
export const elivagarBifurcation: CardDef = {
  title: "Élivágar Bifurcation",
  "on-score": {
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    "waiting-prompt": true,
    prompt: "Choose a card to derez",
    choices: { card: (c: Card) => coreCard.rezzed(c) },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        coreRezzing.derez(state, side, eid, target);
      },
    ),
  },
};

// Eden Fragment
export const edenFragment: CardDef = {
  title: "Eden Fragment",
  "static-abilities": [
    {
      type: ":ignore-install-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return (
          t &&
          coreCard.ice(t) &&
          coreEvents
            .turnEvents(state, side, ":corp-install")
            .map((e: any) => e.card)
            .filter((c: any) => coreCard.ice(c)).length === 0
        );
      }),
      value: true,
    },
  ],
  events: [
    {
      event: "corp-install",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return (
          t &&
          coreCard.ice(t) &&
          coreEvents
            .turnEvents(state, side, ":corp-install")
            .map((e: any) => e.card)
            .filter((c: any) => coreCard.ice(c)).length === 0
        );
      }),
      msg: "ignore the install cost of the first piece of ice this turn",
    },
  ],
};

// Efficiency Committee
export const efficiencyCommittee: CardDef = {
  title: "Efficiency Committee",
  "on-score": agendaCounters(3),
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("agenda", 1)],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainClicks(2);
          coreFlags.registerTurnFlag!(card, ":can-advance", () => false);
        },
      ),
      "keep-menu-open": ":while-agenda-tokens-left",
      msg: "gain [Click][Click]",
    },
  ],
};

// Elective Upgrade
export const electiveUpgrade: CardDef = {
  title: "Elective Upgrade",
  "on-score": agendaCounters(2),
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("agenda", 1)],
      once: ":per-turn",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainClicks(2);
        },
      ),
      msg: "gain [Click][Click]",
    },
  ],
};

// Embedded Reporting
export const embeddedReporting: CardDef = {
  title: "Embedded Reporting",
  ...projectAgenda({ quantity: 2, mode: "computed" }),
  events: [
    {
      event: "corp-turn-ends",
      interactive: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      skippable: true,
      optional: {
        prompt: "Search R&D for an Operation?",
        "waiting-prompt": true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            (coreCard.getCounters(card, ":agenda") || 0) > 0 &&
            (state as any).corp?.deck?.length > 0
          );
        }),
        "yes-ability": {
          choices: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const corp = (state as any).corp;
            return corePrompts.cancellable(
              (corp?.deck || [])
                .filter((c: Card) => coreCard.operation(c))
                .sort((a: Card, b: Card) =>
                  (a.title || "").localeCompare(b.title || ""),
                ),
              { sorted: true },
            );
          }),
          prompt: "Move an operation to the top of R&D",
          async: true,
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
              return `reveal ${target.title} from R&D, shuffle R&D, and place it ontop`;
            })();
          },
          cost: [corePayment.toC("agenda", 1)],
          effect: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = (targets as any[])?.[0];
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRevealing.reveal(state, side, target),
              ],
              [],
            );
            const setAside = coreSetAside.setAsideForMe(state, side, eid, [
              target,
            ]);
            const c = setAside[0] || target;
            coreShuffling.shuffle(state, side, ":deck");
            coreMoving.move(state, side, c, "deck", { front: true });
            coreEid.effectCompleted(state, side, eid);
          }),
          cancel: {
            msg: "shuffle R&D",
            cost: [corePayment.toC("agenda", 1)],
            effect: effect(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                coreShuffling.shuffle(state, side, ":deck");
              },
            ),
          },
        },
      },
    },
  ],
};

// Eminent Domain
export const eminentDomain: CardDef = {
  title: "Eminent Domain",
  "on-score": {
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    optional: {
      prompt: "Search R&D for 1 card to install and rez, ignoring all costs?",
      "yes-ability": {
        async: true,
        prompt: "Choose a card to install",
        choices: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corp = (state as any).corp;
          const deck = corp?.deck || [];
          const installable = deck
            .filter((c: Card) => coreCard.corpInstallableType(c))
            .sort((a: Card, b: Card) =>
              (a.title || "").localeCompare(b.title || ""),
            );
          return [...installable.map((c: Card) => c), "Cancel"];
        }),
        cancel: coreShuffling.shuffleMyDeck!,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          coreShuffling.shuffle(state, side, ":deck");
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreInstalling.corpInstall(state, side, target, null, {
                "install-state": ":rezzed-no-cost",
                msgKeys: { installSource: card, displayOrigin: true },
                ignoreAllCost: true,
              }),
            ],
            [],
          );
        }),
      },
    },
  },
  expend: {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const corp = (state as any).corp;
      return (corp?.hand || []).some((c: Card) =>
        coreCard.corpInstallableType(c),
      );
    }),
    cost: [corePayment.toC("credit", 1)],
    prompt: "Choose 1 card to install and rez, paying 5 [Credits] less",
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
          coreCard.inHand(target) &&
          coreCard.corpInstallableType(target) &&
          !coreCard.sameCard(card, target)
        );
      }),
    },
    msg: "install and rez 1 card from HQ, paying 5 [Credits] less",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const target: any = (targets as any[])?.[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreInstalling.corpInstall(state, side, target, null, {
            "install-state": ":rezzed",
            msgKeys: { installSource: card, displayOrigin: true },
            combinedCreditDiscount: 5,
          }),
        ],
        [],
      );
    }),
  },
};

// Encrypted Portals
export const encryptedPortals: CardDef = {
  title: "Encrypted Portals",
  ...iceBoostAgenda("Code Gate"),
};

// Escalate Vitriol
export const escalateVitriol: CardDef = {
  title: "Escalate Vitriol",
  abilities: [
    {
      action: true,
      label: "Gain 1 [Credit] for each Runner tag",
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return forms.tagged(state);
        }),
      },
      cost: [corePayment.toC("click", 1)],
      once: ":per-turn",
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${utils.countTags(state)} [Credits]`,
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, utils.countTags(state));
        },
      ),
    },
  ],
};

// Executive Retreat
export const executiveRetreat: CardDef = {
  title: "Executive Retreat",
  "on-score": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      coreShuffling.shuffleIntoDeck(state, side, ":hand");
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreProps.addCounter(state, side, eid, card, ":agenda", 1, null),
        ],
        [],
      );
    }),
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  abilities: [
    coreDefHelpers.drawAbi(5, null, {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("agenda", 1)],
      "keep-menu-open": ":while-agenda-tokens-left",
    }),
  ],
};

// Explode-a-palooza
export const explodeAPalooza: CardDef = {
  title: "Explode-a-palooza",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "on-access": {
    optional: {
      "waiting-prompt": true,
      prompt: "Gain 5 [Credits]?",
      "yes-ability": coreDefHelpers.gainCreditsAbility(5),
    },
  },
};

// Evidence Collection
export const evidenceCollection: CardDef = {
  title: "Evidence Collection",
  events: [
    {
      event: "win",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return state.winner === ":corp";
      }),
      msg: "reveal set 2",
    },
  ],
};

// Evidence Collection 2
export const evidenceCollection2: CardDef = {
  title: "Evidence Collection 2",
  events: [
    {
      event: "win",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return state.winner === ":corp";
      }),
      msg: "reveal set 5",
    },
  ],
};

// Evidence Collection 3
export const evidenceCollection3: CardDef = {
  title: "Evidence Collection 3",
  events: [
    {
      event: "win",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return state.winner === ":corp";
      }),
      msg: "reveal set 8",
    },
  ],
};

// Evidence Collection 4
export const evidenceCollection4: CardDef = {
  title: "Evidence Collection 4",
  "agendapoints-runner": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return 1;
  }),
};

// False Lead
export const falseLead: CardDef = {
  title: "False Lead",
  events: [
    {
      event: "post-runner-turn-begins",
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const askWhen = card.special?.["ask-when-runner-turn-starts"];
          return (
            askWhen === "Always" ||
            (askWhen === "When tagged" && forms.tagged(state))
          );
        }),
        prompt: "Fire False Lead?",
        "waiting-prompt": true,
        "yes-ability": {
          "change-in-game-state": {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).runner?.click >= 2;
            }),
          },
          label: "runner loses [Click][Click]",
          msg: "force the Runner to lose [Click][Click]",
          cost: [corePayment.toC("forfeit-self")],
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreGaining.loseClicks(":runner", 2);
            },
          ),
        },
      },
    },
  ],
  abilities: [
    {
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (state as any).runner?.click >= 2;
        }),
      },
      label: "runner loses [Click][Click]",
      msg: "force the Runner to lose [Click][Click]",
      cost: [corePayment.toC("forfeit-self")],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.loseClicks(":runner", 2);
        },
      ),
    },
    {
      label: "Ask when runner turn begins?",
      prompt: "Ask to use False Lead after the Runner turn begins?",
      choices: ["Always", "Never", "When tagged"],
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreUpdate.updateIn(state, side, card, (c: any) => ({
              ...c,
              special: {
                ...c.special,
                "ask-when-runner-turn-starts": forms.target(
                  state,
                  card,
                  targets,
                ),
              },
            })),
          ],
          [],
        );
        coreToasts.toast(
          state,
          ":corp",
          `False Lead prompt set to: ${forms.target(state, card, targets)}`,
          "warning",
        );
      }),
    },
  ],
};

// Fetal AI
export const fetalAI: CardDef = {
  title: "Fetal AI",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "on-access": {
    ...coreDefHelpers.doNetDamage(2),
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return !coreCard.inDiscard(card);
    }),
  },
  "steal-cost-bonus": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return [corePayment.toC("credit", 2)];
  }),
};

// Firmware Updates
export const firmwareUpdates: CardDef = {
  title: "Firmware Updates",
  "on-score": agendaCounters(3),
  abilities: [
    {
      cost: [corePayment.toC("agenda", 1)],
      label: "Place 1 advancement counter",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const t = targets[0];
          return t && coreCard.ice(t) && coreCard.canBeAdvanced(state, t);
        }),
      },
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (coreCard.getCounters(card, ":agenda") || 0) > 0;
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return `place 1 advancement counter on ${coreToString.cardStr(state, target)}`;
      },
      once: ":per-turn",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          coreProps.addProp(eid, target, ":advance-counter", 1, {
            placed: true,
          });
        },
      ),
    },
  ],
};

// Flower Sermon
export const flowerSermon: CardDef = {
  title: "Flower Sermon",
  "on-score": agendaCounters(5),
  abilities: [
    {
      cost: [corePayment.toC("agenda", 1)],
      label: "Reveal the top card of R&D and draw 2 cards",
      once: ":per-turn",
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `reveal ${(state as any).corp?.deck?.[0]?.title} and draw 2 cards`,
      async: true,
      "waiting-prompt": true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const corp = (state as any).corp;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRevealing.reveal(state, side, corp?.deck?.[0]),
          ],
          [],
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 2)],
          [],
        );
        continue_ability(
          state,
          side,
          {
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return (state as any).corp?.hand?.length > 0;
            }),
            prompt: "Choose a card in HQ to move to the top of R&D",
            msg: {
              public: "add 1 card in HQ to the top of R&D",
              corp: (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                const target: any = (targets as any[])?.[0];
                return `add facedown ${target.title} to the top of R&D`;
              },
            },
            choices: {
              card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c),
            },
            effect: effect(coreMoving.move(target, "deck", { front: true })),
          },
          card,
          null,
        );
      }),
    },
  ],
};

// Fly on the Wall
export const flyOnTheWall: CardDef = {
  title: "Fly on the Wall",
  "on-score": coreDefHelpers.giveTags(1),
};

// Freedom of Information
export const freedomOfInformation: CardDef = {
  title: "Freedom of Information",
  "advancement-requirement": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return -(utils.countTags(state) || 0);
  }),
};

// Fujii Asset Retrieval
export const fujiiAssetRetrieval: CardDef = {
  title: "Fujii Asset Retrieval",
  stolen: {
    async: true,
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    msg: "do 2 net damage",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, ":net", 2, { card: card });
      },
    ),
  },
  "on-score": {
    async: true,
    interactive: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    msg: "do 2 net damage",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreDamage.damage(eid, ":net", 2, { card: card });
      },
    ),
  },
};

// Genetic Resequencing
export const geneticResequencing: CardDef = {
  title: "Genetic Resequencing",
  "on-score": {
    choices: { card: (c: Card) => coreCard.inScored(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const target: any = (targets as any[])?.[0];
      return ((): string => {
        const target: any = (targets as any[])?.[0];
        return `place 1 agenda counter on ${target.title}`;
      })();
    },
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const target: any = (targets as any[])?.[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreProps.addCounter(state, side, target, ":agenda", 1, null),
        ],
        [],
      );
      coreAgendas.updateAllAgendaPoints(state);
      coreEid.effectCompleted(state, side, eid);
    }),
    silent: true,
  },
};

// Geothermal Fracking
export const geothermalFracking: CardDef = {
  title: "Geothermal Fracking",
  "on-score": agendaCounters(2),
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("agenda", 1)],
      msg: "gain 7 [Credits] and take 1 bad publicity",
      async: true,
      "keep-menu-open": ":while-agenda-tokens-left",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreGaining.gainCredits(state, side, 7)],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreBadPublicity.gainBadPublicity(state, side, eid, 1),
          ],
          [],
        );
      }),
    },
  ],
};

// Gila Hands Arcology
export const gilaHandsArcology: CardDef = {
  title: "Gila Hands Arcology",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 2)],
      msg: "gain 3 [Credits]",
      async: true,
      "keep-menu-open": ":while-2-clicks-left",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, 3);
        },
      ),
    },
  ],
};

// Glenn Station
export const glennStation: CardDef = {
  title: "Glenn Station",
  abilities: [
    {
      action: true,
      label: "Host a card from HQ",
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            (state as any).corp?.hand?.length > 0 &&
            !(card.hosted || []).some((c: Card) => coreCard.corp(c))
          );
        }),
      },
      cost: [corePayment.toC("click", 1)],
      msg: "host a card from HQ",
      prompt: "Choose a card to host",
      choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          coreHosting.host(card, target, { facedown: true });
        },
      ),
    },
    {
      action: true,
      label: "Add a hosted card to HQ",
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (card.hosted || []).some((c: Card) => coreCard.corp(c));
        }),
      },
      cost: [corePayment.toC("click", 1)],
      msg: "add a hosted card to HQ",
      prompt: "Choose a hosted card",
      choices: {
        all: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const hostedCorpCards = (card.hosted || [])
            .filter((c: Card) => coreCard.corp(c))
            .map((c: Card) => c.cid);
          const targetCid = target.cid;
          return targetCid && hostedCorpCards.includes(targetCid);
        }),
      },
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          coreMoving.move(state, side, target, "hand");
        },
      ),
    },
  ],
};

// Global Food Initiative
export const globalFoodInitiative: CardDef = {
  title: "Global Food Initiative",
  "agendapoints-runner": req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return 2;
  }),
};

// Government Contracts
export const governmentContracts: CardDef = {
  title: "Government Contracts",
  abilities: [
    {
      ...coreDefHelpers.gainCreditsAbility(4),
      action: true,
      cost: [corePayment.toC("click", 2)],
      "keep-menu-open": ":while-2-clicks-left",
    },
  ],
};

// Government Takeover
export const governmentTakeover: CardDef = {
  title: "Government Takeover",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1)],
      async: true,
      "keep-menu-open": ":while-clicks-left",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, 3);
        },
      ),
      msg: "gain 3 [Credits]",
    },
  ],
};

// Graft
export const graft: CardDef = {
  title: "Graft",
  "on-score": {
    async: true,
    msg: "add up to 3 cards from R&D to HQ",
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const graftFn = (n: number) => ({
        prompt: "Choose a card to add to HQ",
        async: true,
        choices: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).slice(), {
            sorted: true,
          });
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
            return `add ${target.title} to HQ from R&D`;
          })();
        },
        cancel: coreShuffling.shuffleMyDeck!,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, side, target, "hand"),
            ],
            [],
          );
          if (n < 3) {
            continue_ability(state, side, graftFn(n + 1), card, null);
          } else {
            coreShuffling.shuffle(state, side, ":deck");
            coreSay.systemMsg(state, side, "shuffles R&D");
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      });
      continue_ability(state, side, graftFn(1), card, null);
    }),
  },
};
