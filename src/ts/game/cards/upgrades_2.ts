//
/**
 * Upgrade Cards
 * Ported from Clojure cards/upgrades.clj to TypeScript
 *
 * Contains ~118 card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Server, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCostFns from "../core/cost_fns";
import * as coreCosts from "../core/costs";
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
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePlayInstants from "../core/play_instants";
import * as corePrompts from "../core/prompts";
import * as coreProps from "../core/props";
import * as corePurging from "../core/purging";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import { canSmartPurge, mobileSysopEventFn } from "./upgrades_1";

// Cayambe Grid
export const cayambeGrid: CardDef = {
  title: "Cayambe Grid",
  events: [
    {
      event: ":corp-turn-begins",
      interactive: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const allInstalled = coreBoard.allInstalled(state, ":corp");
          const count = allInstalled.filter(
            (c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c),
          ).length;
          return count > 0;
        },
      ),
      label: "place 1 advancement counter (start of turn)",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const allInstalled = coreBoard.allInstalled(state, ":corp");
        const count = allInstalled.filter(
          (c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c),
        ).length;
        if (count > 0) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(
                state,
                side,
                {
                  prompt: `Place 1 advancement counter on an ice protecting ${coreServers.zoneToName((card as any).zone?.[1])}`,
                  choices: {
                    card: (c: Card) =>
                      coreCard.ice(c) && coreServers.sameServer(c, card),
                  },
                  msg: msg(
                    (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ) => {
                      const target: any = (targets as any[])?.[0];
                      return `place 1 advancement counter on ${coreToString.cardStr(state, target)}`;
                    },
                  ),
                  async: true,
                  effect: effect(
                    coreProps.addProp(eid, target, ":advance-counter", 1, {
                      placed: true,
                    }),
                  ),
                },
                card,
                null,
              ),
            ],
            [],
          );
        }
      }),
    },
    {
      event: ":approach-server",
      interactive: req(() => true),
      req: req(forms.thisServer),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const runIces = coreIce.getRunIces(state);
        const cost =
          (runIces ?? []).filter(
            (c: Card) => coreCard.getCounters(c, ":advancement") > 0,
          ).length * 2;
        const choices: string[] = [];
        if (
          corePayment.canPay(state, ":runner", eid, card, null, [
            corePayment.toC("credit", cost),
          ])
        ) {
          choices.push(`Pay ${cost} [Credits]`);
        }
        choices.push("End the run");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                async: true,
                player: ":runner",
                "waiting-prompt": true,
                prompt: "Choose one",
                choices,
                msg: msg(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) =>
                    target === "End the run"
                      ? target.toLowerCase()
                      : `force the Runner to ${target.toLowerCase()}`,
                ),
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  eid2: EID,
                  c2: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  if (target === "End the run") {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreRuns.endRun(s, sd, eid2, c2),
                      ],
                      [],
                    );
                  } else {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreEngine.pay(
                          s,
                          ":runner",
                          coreEid.makeEid(s, eid),
                          card,
                          corePayment.toC("credit", cost),
                        ),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreSay.systemMsg(
                          s,
                          ":runner",
                          (forms.context(s, c2, t) as any)?.msg || "",
                        ),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreEffects.effectCompleted(s, sd, eid2),
                      ],
                      [],
                    );
                  }
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
  abilities: [
    {
      interactive: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const allInstalled = coreBoard.allInstalled(state, ":corp");
          const count = allInstalled.filter(
            (c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c),
          ).length;
          return count > 0;
        },
      ),
      label: "place 1 advancement counter (start of turn)",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const allInstalled = coreBoard.allInstalled(state, ":corp");
        const count = allInstalled.filter(
          (c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c),
        ).length;
        if (count > 0) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(
                state,
                side,
                {
                  prompt: `Place 1 advancement counter on an ice protecting ${coreServers.zoneToName((card as any).zone?.[1])}`,
                  choices: {
                    card: (c: Card) =>
                      coreCard.ice(c) && coreServers.sameServer(c, card),
                  },
                  msg: msg(
                    (
                      state: State,
                      side: Side,
                      eid: EID,
                      card: Card,
                      targets: any[],
                    ) => {
                      const target: any = (targets as any[])?.[0];
                      return `place 1 advancement counter on ${coreToString.cardStr(state, target)}`;
                    },
                  ),
                  async: true,
                  effect: effect(
                    coreProps.addProp(eid, target, ":advance-counter", 1, {
                      placed: true,
                    }),
                  ),
                },
                card,
                null,
              ),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// ChiLo City Grid
export const chiloCityGrid: CardDef = {
  title: "ChiLo City Grid",
  events: [
    {
      ...coreDefHelpers.giveTags(1),
      event: ":successful-trace",
      req: req(forms.thisServer),
    },
  ],
};

// Code Replicator
export const codeReplicator: CardDef = {
  title: "Code Replicator",
  abilities: [
    {
      label: "Force the runner to approach the passed piece of ice again",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          if (!forms.thisServer(state, card)) return false;
          const position = forms.runPosition(state);
          if (position === undefined) return false;
          if (position >= coreIce.getRunIces(state).length) return false;
          const server = coreBoard.cardToServer(state, card);
          const ices = server?.ices;
          if (!ices) return false;
          const passedIce = ices[position];
          return coreCard.rezzed(passedIce);
        },
      ),
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
            coreMoving.trash(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              card,
              { causeCard: card },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreUpdate.updateIn(
              state,
              ["run", "position"],
              (n: number) => n + 1,
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRuns.setNextPhase(state, ":approach-ice"),
          ],
          [],
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreIce.updateAllIce(state, side)],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreIce.updateAllIcebreakers(state, side),
          ],
          [],
        );
        const server = coreBoard.cardToServer(state, card);
        const ices = server?.ices;
        const pos = (forms.runPosition(state) as number) || 0;
        if (ices) {
          const passedIce = ices[pos];
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreSay.systemMsg(
                state,
                ":corp",
                `trashes ${card.title} to make the runner approach ${passedIce?.title || "ice"} again`,
              ),
            ],
            [],
          );
        }
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              ":runner",
              coreEid.makeEid(state, eid),
              coreDefHelpers.offerJackOut(),
              card,
              null,
            ),
          ],
          [],
        );
        const endRun = (state as any).endRun;
        if (!endRun?.ended) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreRuns.startNextPhase(state, side, eid),
            ],
            [],
          );
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEffects.effectCompleted(state, side, eid),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Cold Site Server
export const coldSiteServer: CardDef = {
  title: "Cold Site Server",
  "static-abilities": [
    {
      type: ":run-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const server = (targets[1] as string[] | undefined)?.[0];
          return server === coreServers.unknownToKw(coreCard.getZone(card));
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const count = coreCard.getCounters(card, ":power");
          return Array(count)
            .fill(null)
            .map(() => [
              corePayment.toC("credit", 1),
              corePayment.toC("click", 1),
            ]);
        },
      ),
    },
  ],
  events: [
    {
      event: ":corp-turn-begins",
      automatic: ":last",
      interactive: req(() => true),
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.getCounters(card, ":power") > 0,
      ),
      msg: "remove all hosted power counters",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(
            eid,
            card,
            ":power",
            -coreCard.getCounters(card, ":power"),
            null,
          );
        },
      ),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1)],
      "keep-menu-open": ":while-clicks-left",
      msg: "place 1 power counter on itself",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(eid, card, ":power", 1, null);
        },
      ),
    },
  ],
};

// Corporate Troubleshooter
export const corporateTroubleshooter: CardDef = {
  title: "Corporate Troubleshooter",
  abilities: [
    {
      label: "Add strength to a rezzed piece of ice protecting this server",
      cost: [corePayment.toC("trash-can"), corePayment.toC("x-credits")],
      choices: {
        all: true,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            return (
              t &&
              coreCard.ice(t) &&
              coreCard.rezzed(t) &&
              coreServers.protectingSameServer(card, t)
            );
          },
        ),
      },
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          return `add ${corePayment.costValue(eid, ":x-credits")} strength to ${target.title}`;
        },
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          coreIce.pumpIce(
            target,
            corePayment.costValue(eid, ":x-credits"),
            ":end-of-turn",
          );
        },
      ),
    },
  ],
};

// Crisium Grid
export const crisiumGrid: CardDef = {
  title: "Crisium Grid",
  "static-abilities": [
    {
      type: ":block-successful-run",
      req: req(forms.thisServer),
      value: true,
    },
  ],
};

// Cyberdex Virus Suite
export const cyberdexVirusSuite: CardDef = {
  title: "Cyberdex Virus Suite",
  flags: { "rd-reveal": req(() => true) },
  poison: true,
  "on-access": {
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (canSmartPurge(state)) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                msg: "purge virus counters",
                async: true,
                effect: effect(corePurging.purge(eid)),
              },
              card,
              null,
            ),
          ],
          [],
        );
      } else {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                optional: {
                  "waiting-prompt": true,
                  prompt: "Purge virus counters?",
                  "yes-ability": {
                    async: true,
                    effect: effect(corePurging.purge(eid)),
                  },
                },
              },
              card,
              null,
            ),
          ],
          [],
        );
      }
    }),
  },
  abilities: [
    {
      label: "Purge virus counters",
      msg: "purge virus counters",
      cost: [corePayment.toC("trash-can")],
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          corePurging.purge(eid);
        },
      ),
    },
  ],
};

// Daniela Jorge Inácio
export const danielaJorgeInácio: CardDef = {
  title: "Daniela Jorge Inácio",
  "static-abilities": [
    {
      type: ":steal-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            (coreServers.inSameServer(card, t) ||
              coreServers.fromSameServer(card, t))
          );
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          corePayment.toC("add-random-from-hand-to-bottom-of-deck", 2),
      ),
    },
  ],
  events: [
    {
      event: ":pre-access-card",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = forms.context(state, card, targets) || {};
          return (
            coreCard.rezzed(card) &&
            coreCard.sameCard(ctx["accessed-card"], card)
          );
        },
      ),
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
            coreFlags.registerRunFlag(
              state,
              side,
              card,
              ":can-trash",
              (s: State, _s2: Side, c2: Card) => {
                const ctx = forms.context(s, card, targets) || {};
                if (!coreCard.sameCard(ctx["accessed-card"], c2)) return true;
                return corePayment.canPay(s, ":runner", eid, card, null, [
                  corePayment.toC("add-random-from-hand-to-bottom-of-deck", 2),
                ]);
              },
            ),
          ],
          [],
        );
      }),
    },
  ],
  "on-trash": {
    async: true,
    interactive: req(() => true),
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        forms.run(state) && side === ":runner",
    ),
    msg: "force the Runner to add 2 random cards from the grip to the bottom of the stack as additional cost to trash it",
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
          coreEngine.pay(state, ":runner", coreEid.makeEid(state, eid), card, [
            corePayment.toC("add-random-from-hand-to-bottom-of-deck", 2),
          ]),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreSay.systemMsg(
            state,
            ":runner",
            (forms.context(state, card, targets) as any)?.msg || "",
          ),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEffects.registerLingeringEffect(state, side, card, {
            type: ":steal-additional-cost",
            req: req((s: State, sd: Side, eid2: EID, c2: Card, t: any[]) => {
              const tgt = t[0];
              return (
                tgt &&
                ((c2 as any).previousZone === coreCard.getZone(tgt) ||
                  coreServers.centralToZone(coreCard.getZone(tgt)) ===
                    ((c2 as any).previousZone as string[]).slice(0, -1))
              );
            }),
            value: req(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => corePayment.toC("add-random-from-hand-to-bottom-of-deck", 2),
            ),
            duration: ":end-of-run",
          }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEffects.effectCompleted(state, side, eid),
        ],
        [],
      );
    }),
  },
};

// Daruma
export const daruma: CardDef = {
  title: "Daruma",
  events: [
    {
      event: ":approach-server",
      interactive: req(() => true),
      req: req(forms.thisServer),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        const chooseSwap = (toSwap: Card) => ({
          prompt: `Choose a card to swap with ${toSwap.title}`,
          choices: {
            "not-self": true,
            card: (c: Card) =>
              coreCard.corp(c) &&
              !coreCard.operation(c) &&
              !coreCard.ice(c) &&
              (coreCard.inHand(c) || coreCard.installed(c)),
          },
          cost: [corePayment.toC("trash-can")],
          msg: msg(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const target: any = (targets as any[])?.[0];
              return `swap ${coreToString.cardStr(state, toSwap)} with ${coreToString.cardStr(state, target)}`;
            },
          ),
          async: true,
          effect: effect(coreInstalling.swapCardsAsync(eid, toSwap, target)),
        });
        const ability = {
          optional: {
            "waiting-prompt": true,
            prompt: msg(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => `Trash ${card.title} to swap a card in this server?`,
            ),
            "yes-ability": {
              async: true,
              prompt: "Choose a card in this server to swap",
              choices: {
                req: req(
                  (s: State, sd: Side, eid2: EID, c2: Card, t: any[]) => {
                    const tgt = t[0];
                    return (
                      tgt &&
                      coreCard.installed(tgt) &&
                      coreServers.inSameServer(card, tgt)
                    );
                  },
                ),
                "not-self": true,
              },
              effect: effect(
                continue_ability(state, side, chooseSwap(target), card, null),
              ),
            },
            "no-ability": {
              effect: effect(corePrompts.clearWaitPrompt(":runner")),
            },
          },
        };
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              ability,
              card,
              null,
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              ":runner",
              coreDefHelpers.offerJackOut(),
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// Dedicated Technician Team
export const dedicatedTechnicianTeam: CardDef = {
  title: "Dedicated Technician Team",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (eid as any)["source-type"] === ":corp-install" &&
          (card as any).zone?.[1] ===
            coreServers.unknownToKw(
              (forms.context(state, card, targets) as any)?.server,
            ),
      ),
      type: ":recurring",
    },
  },
};

// Defense Construct
export const defenseConstruct: CardDef = {
  title: "Defense Construct",
  advanceable: ":always",
  abilities: [
    {
      label: "Add cards from Archives to HQ",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const run = forms.run(state);
          return (
            run &&
            (run as any).server === ":archives" &&
            coreCard.getCounters(card, ":advancement") > 0
          );
        },
      ),
      cost: [corePayment.toC("trash-can")],
      "show-discard": true,
      choices: {
        max: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreCard.getCounters(card, ":advancement"),
        ),
        card: (c: Card) =>
          coreCard.corp(c) && !(c as any).seen && coreCard.inDiscard(c),
      },
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `add ${utils.quantify(targets?.length || 0, "facedown card")} in Archives to HQ`,
      ),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        for (const c of targets || []) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.move(state, side, c, "hand"),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Disposable HQ
export const disposableHQ: CardDef = {
  title: "Disposable HQ",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    optional: {
      "waiting-prompt": true,
      prompt: "Add cards from HQ to the bottom of R&D?",
      "yes-ability": {
        async: true,
        msg: "add cards in HQ to the bottom of R&D",
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = (targets as any[])?.[0];
          const corp = (state as any).corp;
          const hand = corp?.hand || [];
          const dhq = (i: number, n: number) => ({
            req: req((s: State) => n > 0),
            prompt: "Choose a card in HQ to add to the bottom of R&D",
            choices: {
              card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
            },
            async: true,
            msg: "add a card to the bottom of R&D",
            effect: effect(function* (
              s: State,
              sd: Side,
              eid2: EID,
              c2: Card,
              t: any[],
            ): Generator<any, any, any> {
              yield wait_for(
                s,
                [
                  { asyncResult: "result" },
                  coreMoving.move(s, sd, target, "deck"),
                ],
                [],
              );
              if (i < n) {
                yield wait_for(
                  s,
                  [
                    { asyncResult: "result" },
                    continue_ability(s, sd, dhq(i + 1, n), c2, null),
                  ],
                  [],
                );
              }
            }),
          });
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(state, side, dhq(1, hand.length), card, null),
            ],
            [],
          );
        }),
      },
    },
  },
};

// Djupstad Grid
export const djupstadGrid: CardDef = {
  title: "Djupstad Grid",
  events: [
    {
      event: ":agenda-scored",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = forms.context(state, card, targets) || {};
          const cardCtx = ctx.card;
          return (
            cardCtx && (cardCtx as any).previousZone === (card as any).zone
          );
        },
      ),
      interactive: req(() => true),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(eid, ":brain", 1, { card });
        },
      ),
    },
  ],
};

// Drone Screen
export const droneScreen: CardDef = {
  title: "Drone Screen",
  events: [
    {
      event: ":run",
      async: true,
      trace: {
        base: 3,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            forms.thisServer(state, card) && forms.tagged(state),
        ),
        successful: {
          msg: "do 1 meat damage",
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreDamage.damage(eid, ":meat", 1, {
                card,
                unpreventable: true,
              });
            },
          ),
        },
      },
    },
  ],
};

// Embolus
export const embolus: CardDef = {
  title: "Embolus",
  "derezzed-events": [{ event: ":runner-turn-ends" }],
  events: [
    {
      event: ":corp-turn-begins",
      once: ":per-turn",
      async: true,
      label: "Place 1 power counter (start of turn)",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          continue_ability(
            {
              optional: {
                prompt: msg(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) =>
                    `Pay 1 [Credit] to place 1 power counter on ${card.title}?`,
                ),
                "yes-ability": {
                  effect: effect(
                    coreProps.addCounter(eid, card, ":power", 1, null),
                  ),
                  async: true,
                  cost: [corePayment.toC("credit", 1)],
                  msg: "place 1 power counter on itself",
                },
              },
            },
            card,
            null,
          );
        },
      ),
    },
    {
      event: ":successful-run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.getCounters(card, ":power") > 0,
      ),
      msg: "remove 1 power counter from itself",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(eid, card, ":power", -1, null);
        },
      ),
    },
  ],
  abilities: [
    {
      once: ":per-turn",
      async: true,
      label: "Place 1 power counter (start of turn)",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          continue_ability(
            {
              optional: {
                prompt: msg(
                  (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ) =>
                    `Pay 1 [Credit] to place 1 power counter on ${card.title}?`,
                ),
                "yes-ability": {
                  effect: effect(
                    coreProps.addCounter(eid, card, ":power", 1, null),
                  ),
                  async: true,
                  cost: [corePayment.toC("credit", 1)],
                  msg: "place 1 power counter on itself",
                },
              },
            },
            card,
            null,
          );
        },
      ),
    },
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) && forms.run(state),
      ),
      cost: [corePayment.toC("power", 1)],
      msg: "end the run",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRuns.endRun(eid, card);
        },
      ),
    },
  ],
};

// Experiential Data
export const experientialData: CardDef = {
  title: "Experiential Data",
  "static-abilities": [
    {
      type: ":ice-strength",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreServers.protectingSameServer(card, targets[0]),
      ),
      value: 1,
    },
  ],
};

// Expo Grid
export const expoGrid: CardDef = {
  title: "Expo Grid",
  "derezzed-events": [{ event: ":runner-turn-ends" }],
  events: [
    {
      event: ":corp-turn-begins",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const corp = (state as any).corp;
          const zone = (card as any).zone;
          const zoneCards = zone ? coreBoard.getCardInZone(corp, zone) : [];
          return zoneCards.some(
            (c: Card) => coreCard.asset(c) && coreCard.rezzed(c),
          );
        },
      ),
      msg: "gain 1 [Credits]",
      once: ":per-turn",
      automatic: ":gain-credits",
      label: "Gain 1 [Credits] (start of turn)",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, 1);
        },
      ),
    },
  ],
  abilities: [
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const corp = (state as any).corp;
          const zone = (card as any).zone;
          const zoneCards = zone ? coreBoard.getCardInZone(corp, zone) : [];
          return zoneCards.some(
            (c: Card) => coreCard.asset(c) && coreCard.rezzed(c),
          );
        },
      ),
      msg: "gain 1 [Credits]",
      once: ":per-turn",
      automatic: ":gain-credits",
      label: "Gain 1 [Credits] (start of turn)",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.gainCredits(eid, 1);
        },
      ),
    },
  ],
};

// Forced Connection
export const forcedConnection: CardDef = {
  title: "Forced Connection",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    interactive: req(() => true),
    trace: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !coreCard.inDiscard(card),
      ),
      base: 3,
      successful: coreDefHelpers.giveTags(2),
    },
  },
};

// Heinlein Grid
export const heinleinGrid: CardDef = {
  title: "Heinlein Grid",
  abilities: [
    {
      req: req(forms.thisServer),
      label:
        "Force the Runner to lose all [Credits] from spending or losing a [Click]",
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `force the Runner to lose all ${(state as any).runner?.credit ?? 0} [Credits]`,
      ),
      once: ":per-run",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.loseCredits(state, ":runner", eid, ":all" as any);
        },
      ),
    },
  ],
};

// Hokusai Grid
export const hokusaiGrid: CardDef = {
  title: "Hokusai Grid",
  events: [
    {
      ...coreDefHelpers.doNetDamage(1),
      event: ":successful-run",
      req: req(forms.thisServer),
    },
  ],
};

// Oaktown Grid
export const oaktownGrid: CardDef = {
  title: "Oaktown Grid",
  "static-abilities": [
    {
      type: ":trash-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreServers.inSameServer(card, t);
        },
      ),
      value: 3,
    },
  ],
};

// Red Herrings
export const redHerrings: CardDef = {
  title: "Red Herrings",
  "on-trash": {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        side === ":runner" && !!forms.run(state),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEffects.registerLingeringEffect(card, {
          type: ":steal-additional-cost",
          duration: ":end-of-run",
          req: req(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const t = targets[0];
              if (!t) return false;
              const tZone = coreCard.getZone(t);
              const prev = (card as any).previousZone as string[] | undefined;
              if (!prev) return false;
              if (tZone === prev) return true;
              const central = coreServers.centralToZone(tZone);
              return (
                JSON.stringify(central) === JSON.stringify(prev.slice(0, -1))
              );
            },
          ),
          value: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              corePayment.toC("credit", 5),
          ),
        });
      },
    ),
  },
  "static-abilities": [
    {
      type: ":steal-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            (coreServers.inSameServer(card, t) ||
              coreServers.fromSameServer(card, t))
          );
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          corePayment.toC("credit", 5),
      ),
    },
  ],
};

// Research Station
export const researchStation: CardDef = {
  title: "Research Station",
  "install-req": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter((t: any) => t === "HQ"),
  ),
  "static-abilities": [coreHandSize.corpHandSizePlus(2)],
};

// Ruhr Valley
export const ruhrValley: CardDef = {
  title: "Ruhr Valley",
  "static-abilities": [
    {
      type: ":run-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const server = (targets[1] as any)?.server;
          return server === coreServers.unknownToKw(coreCard.getZone(card));
        },
      ),
      value: [corePayment.toC("click", 1)],
    },
  ],
};

// Rutherford Grid
export const rutherfordGrid: CardDef = {
  title: "Rutherford Grid",
  "static-abilities": [
    {
      type: ":trace-base-strength",
      req: req(forms.thisServer),
      value: 2,
    },
  ],
};

// SanSan City Grid
export const sanSanCityGrid: CardDef = {
  title: "SanSan City Grid",
  "static-abilities": [
    {
      type: ":advancement-requirement",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreServers.inSameServer(card, t);
        },
      ),
      value: -1,
    },
  ],
};

// Simone Diego
export const simoneDiego: CardDef = {
  title: "Simone Diego",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const abTargets = (eid as any)["ability-targets"];
          const abTarget = abTargets?.card;
          if (!abTarget || !coreServers.sameServer(card, abTarget))
            return false;
          const sourceType = (eid as any)["source-type"];
          if (sourceType === ":advance") return true;
          return (forms as any).isBasicAdvanceAction?.(state, eid) === true;
        },
      ),
      type: ":recurring",
    },
  },
};

// Strongbox
export const strongbox: CardDef = {
  title: "Strongbox",
  "on-trash": {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        side === ":runner" && !!forms.run(state),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEffects.registerLingeringEffect(card, {
          type: ":steal-additional-cost",
          duration: ":end-of-run",
          req: req(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const t = targets[0];
              if (!t) return false;
              const tZone = coreCard.getZone(t);
              const prev = (card as any).previousZone as string[] | undefined;
              if (!prev) return false;
              if (tZone === prev) return true;
              const central = coreServers.centralToZone(tZone);
              return (
                JSON.stringify(central) === JSON.stringify(prev.slice(0, -1))
              );
            },
          ),
          value: req(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              corePayment.toC("click", 1),
          ),
        });
      },
    ),
  },
  "static-abilities": [
    {
      type: ":steal-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            (coreServers.inSameServer(card, t) ||
              coreServers.fromSameServer(card, t))
          );
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          corePayment.toC("click", 1),
      ),
    },
  ],
};

// Underway Grid
export const underwayGrid: CardDef = {
  title: "Underway Grid",
  "static-abilities": [
    {
      type: ":cannot-be-exposed",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreServers.sameServer(card, t);
        },
      ),
      value: true,
    },
    {
      type: ":bypass-ice",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreServers.sameServer(card, t);
        },
      ),
      value: false,
    },
  ],
};

// Valley Grid
export const valleyGrid: CardDef = {
  title: "Valley Grid",
  events: [
    {
      event: ":subroutines-broken",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return forms.thisServer(state, card) && !!ctx?.["all-subs-broken"];
        },
      ),
      msg: "reduce the Runner's maximum hand size by 1 until the start of the next Corp turn",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEffects.registerLingeringEffect(card, {
            type: ":hand-size",
            duration: ":until-corp-turn-begins",
            req: req(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => side === ":runner",
            ),
            value: -1,
          });
        },
      ),
    },
  ],
};

// Fractal Threat Matrix
export const fractalThreatMatrix: CardDef = {
  title: "Fractal Threat Matrix",
  events: [
    {
      event: ":subroutines-broken",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return (
            !!ctx?.["all-subs-broken"] &&
            ctx?.ice &&
            coreServers.protectingSameServer(card, ctx.ice)
          );
        },
      ),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const deck = (state as any).runner?.deck || [];
          if (deck.length > 0) {
            const top = deck
              .slice(0, 2)
              .map((c: Card) => c.title)
              .join(", ");
            return `trash ${top} from the stack`;
          }
          return "trash no cards from the stack (it is empty)";
        },
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.mill(state, ":corp", eid, ":runner", 2);
        },
      ),
    },
  ],
};

// Georgia Emelyov
export const georgiaEmelyov: CardDef = {
  title: "Georgia Emelyov",
  events: [
    {
      event: ":unsuccessful-run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          const zone = coreCard.getZone(card) as string[] | undefined;
          return coreServers.targetServer({ server: t?.server }) === zone?.[1];
        },
      ),
      async: true,
      msg: "do 1 net damage",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(state, side, eid, ":net", 1, { card });
        },
      ),
    },
  ],
  abilities: [
    {
      cost: [corePayment.toC("credit", 2)],
      label: "Move to another server",
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
            continue_ability(
              state,
              side,
              {
                prompt: "Choose a server",
                choices: coreBoard.serverList(state),
                msg: msg(
                  (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                    `move to ${ts?.[0]}`,
                ),
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  ts: any[],
                ): Generator<any, any, any> {
                  const target: any = ts?.[0];
                  const newZone = [
                    ...(coreServers.serverToZone(s, target) || []),
                    "content",
                  ];
                  const moved = yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      (coreMoving as any).move(s, sd, c, newZone),
                    ],
                    [],
                  );
                  yield wait_for(
                    s,
                    [{ asyncResult: "result" }, coreEngine.unregisterEvents(c)],
                    [],
                  );
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreEngine.registerDefaultEvents(s, sd, moved),
                    ],
                    [],
                  );
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// K. P. Lynn
export const kpLynn: CardDef = {
  title: "K. P. Lynn",
  events: [
    {
      event: ":pass-all-ice",
      req: req(forms.thisServer),
      player: ":runner",
      "waiting-prompt": true,
      prompt: "Choose one",
      choices: ["Take 1 tag", "End the run"],
      async: true,
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          return target === "End the run"
            ? "end the run"
            : `force the Runner to ${String(target).toLowerCase()}`;
        },
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          if (target === "Take 1 tag") {
            coreTags.gainTags(state, ":runner", eid, 1);
          } else {
            coreRuns.endRun(state, side, eid, card);
          }
        },
      ),
    },
  ],
};

// Keegan Lane
export const keeganLane: CardDef = {
  title: "Keegan Lane",
  abilities: [
    {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          if (!forms.thisServer(state, card)) return false;
          const installed =
            coreBoard.allActiveInstalled(state, ":runner") || [];
          return installed.some((c: Card) => coreCard.program(c));
        },
      ),
      prompt: "Choose a program to trash",
      label: "Trash a program",
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          return `trash ${target?.title}`;
        },
      ),
      choices: {
        card: (c: Card) => coreCard.installed(c) && coreCard.program(c),
      },
      cost: [corePayment.toC("tag", 1), corePayment.toC("trash-can")],
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          coreMoving.trash(state, side, eid, target, { causeCard: card });
        },
      ),
    },
  ],
};

// Khondi Plaza
export const khondiPlaza: CardDef = {
  title: "Khondi Plaza",
  "x-fn": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreBoard.getRemotes(state).length,
  ),
  recurring: req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreBoard.getRemotes(state).length,
  ),
  interactions: {
    "pay-credits": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const sourceType = (eid as any)["source-type"];
          const t = targets[0];
          return (
            sourceType === ":rez" &&
            t &&
            coreCard.ice(t) &&
            coreServers.sameServer(card, t)
          );
        },
      ),
      type: ":recurring",
    },
  },
};

// Manta Grid
export const mantaGrid: CardDef = {
  title: "Manta Grid",
  events: [
    {
      event: ":run-ends",
      msg: "gain a [Click] next turn",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          const zone = coreCard.getZone(card) as string[] | undefined;
          const runner = (state as any).runner;
          return (
            !!t?.successful &&
            coreServers.targetServer({ server: t?.server }) === zone?.[1] &&
            ((runner?.credit ?? 0) < 6 || (runner?.click ?? 0) === 0)
          );
        },
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const s: any = state;
          s.corp = s.corp || {};
          s.corp["extra-click-temp"] = (s.corp["extra-click-temp"] || 0) + 1;
        },
      ),
    },
  ],
};

// Mason Bellamy
export const masonBellamy: CardDef = {
  title: "Mason Bellamy",
  events: [
    {
      event: ":end-of-encounter",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          if (!forms.thisServer(state, card)) return false;
          const ctx = targets[0];
          const subs = ctx?.ice?.subroutines || [];
          return subs.some((s: any) => s?.broken);
        },
      ),
      msg: "force the Runner to lose [Click]",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreGaining.loseClicks(state, ":runner", 1);
        },
      ),
    },
  ],
};

// Midway Station Grid
export const midwayStationGrid: CardDef = {
  title: "Midway Station Grid",
  "static-abilities": [
    {
      type: ":break-sub-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          const c = ctx?.card;
          const ability = ctx?.ability;
          return (
            c &&
            coreCard.hasSubtype(c, "Icebreaker") &&
            ability &&
            "break" in ability &&
            (ability["broken-subs"]?.length ?? 0) > 0 &&
            forms.thisServer(state, card)
          );
        },
      ),
      value: corePayment.toC("credit", 1),
    },
  ],
};

// Navi Mumbai City Grid
export const naviMumbaiCityGrid: CardDef = {
  title: "Navi Mumbai City Grid",
  "static-abilities": [
    {
      type: ":prevent-paid-ability",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const tc = targets[0];
          const run = forms.run(state) as any;
          const zone = coreCard.getZone(card) as string[] | undefined;
          return (
            !!run &&
            tc?.side === "Runner" &&
            coreServers.targetServer({ server: run.server }) === zone?.[1] &&
            !coreCard.hasSubtype(tc, "Icebreaker")
          );
        },
      ),
      value: true,
    },
  ],
};

// NeoTokyo Grid
export const neoTokyoGrid: CardDef = (() => {
  const onlyEv = (
    state: State,
    side: Side,
    ev: string,
    noEv: string,
    card: Card,
  ): boolean => {
    const inSame = (ts: any[]) =>
      ts?.[0]?.card && coreServers.inSameServer(card, ts[0].card);
    return (
      coreEvents.firstEvent(state, side, ev, inSame) &&
      !coreEvents.firstEvent(state, side, noEv, inSame)
    );
  };
  const ngReq = req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const ctx = targets[0];
      return (
        ctx?.card &&
        coreServers.inSameServer(card, ctx.card) &&
        (onlyEv(state, side, ":advance", ":advancement-placed", card) ||
          onlyEv(state, side, ":advancement-placed", ":advance", card))
      );
    },
  );
  const ngEffect = effect(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      coreGaining.gainCredits(state, side, eid, 1);
    },
  );
  const ng = {
    req: ngReq,
    msg: "gain 1 [Credits]",
    async: true,
    effect: ngEffect,
  };
  return {
    title: "NeoTokyo Grid",
    events: [
      { ...ng, event: ":advance" },
      { ...ng, event: ":advancement-placed" },
    ],
  };
})();

// Panic Button
export const panicButton: CardDef = {
  title: "Panic Button",
  "install-req": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter((t: any) => t === "HQ"),
  ),
  abilities: [
    coreDefHelpers.drawAbility(1, null, {
      cost: [corePayment.toC("credit", 1)],
      "keep-menu-open": ":while-credits-left",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const run = forms.run(state) as any;
          return (
            !!run && coreServers.targetServer({ server: run.server }) === ":hq"
          );
        },
      ),
    }),
  ],
};

// Prisec
export const prisec: CardDef = coreDefHelpers.installedAccessTrigger(2, {
  "waiting-prompt": true,
  msg: "do 1 meat damage and give the Runner 1 tag",
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
        coreDamage.damage(state, side, eid, ":meat", 1, { card }),
      ],
      [],
    );
    yield wait_for(
      state,
      [{ asyncResult: "result" }, coreTags.gainTags(state, ":corp", eid, 1)],
      [],
    );
  }),
});
(prisec as any).title = "Prisec";

// Product Placement
export const productPlacement: CardDef = {
  title: "Product Placement",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        !coreCard.inDiscard(card),
    ),
    msg: "gain 2 [Credits]",
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, ":corp", eid, 2);
      },
    ),
  },
};

// Ryon Knight
export const ryonKnight: CardDef = {
  title: "Ryon Knight",
  abilities: [
    {
      label: "Do 1 core damage",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) &&
          ((state as any).runner?.click ?? 0) === 0,
      ),
      cost: [corePayment.toC("trash-can")],
      msg: "do 1 core damage",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreDamage.damage(state, side, eid, ":brain", 1, { card });
        },
      ),
    },
  ],
};

// Tyr's Hand
export const tyrsHand: CardDef = {
  title: "Tyr's Hand",
  abilities: [
    {
      label: "Prevent a subroutine on a piece of Bioroid ice from being broken",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const currentIce =
            (state as any).encounters?.[0]?.ice ||
            (state as any).run?.["current-ice"];
          const cardZone = coreCard.getZone(card) as string[] | undefined;
          const iceZone =
            currentIce &&
            (coreCard.getZone(currentIce) as string[] | undefined);
          if (!cardZone || !iceZone) return false;
          const sameServer =
            JSON.stringify(cardZone.slice(0, -1)) ===
            JSON.stringify(iceZone.slice(0, -1));
          return sameServer && coreCard.hasSubtype(currentIce, "Bioroid");
        },
      ),
      cost: [corePayment.toC("trash-can")],
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const currentIce =
            (state as any).encounters?.[0]?.ice ||
            (state as any).run?.["current-ice"];
          return `prevent a subroutine on ${currentIce?.title} from being broken`;
        },
      ),
    },
  ],
};

// Traffic Analyzer
export const trafficAnalyzer: CardDef = {
  title: "Traffic Analyzer",
  events: [
    {
      event: ":rez",
      interactive: req(() => true),
      trace: {
        base: 2,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            return (
              ctx?.card &&
              coreServers.protectingSameServer(card, ctx.card) &&
              coreCard.ice(ctx.card)
            );
          },
        ),
        successful: {
          msg: "gain 1 [Credits]",
          async: true,
          effect: effect(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              coreGaining.gainCredits(state, side, eid, 1);
            },
          ),
        },
      },
    },
  ],
};

// Yakov Erikovich Avdakov
export const yakovErikovichAvdakov: CardDef = (() => {
  const validTarget = (ctx: any, card: Card): boolean =>
    !!ctx?.card &&
    coreServers.sameServer(card, ctx.card) &&
    coreCard.corp(ctx.card) &&
    coreCard.installed(ctx.card);
  return {
    title: "Yakov Erikovich Avdakov",
    events: [
      {
        event: ":runner-trash",
        async: true,
        "once-per-instance": false,
        interactive: req(() => true),
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            validTarget(targets[0], card),
        ),
        msg: "gain 2 [Credits]",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreGaining.gainCredits(state, side, eid, 2);
          },
        ),
      },
      {
        event: ":corp-trash",
        interactive: req(() => true),
        "once-per-instance": false,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            const cause = ctx?.cause;
            const causeCard = ctx?.["cause-card"];
            const sourceType = (eid as any)["source-type"];
            const sourceCard = (eid as any).source;
            return (
              sourceType !== ":corp-install" &&
              (coreCard.corp(sourceCard) ||
                cause === ":ability-cost" ||
                cause === ":subroutine" ||
                (causeCard &&
                  coreCard.corp(causeCard) &&
                  cause !== ":opponent-trashes") ||
                (causeCard &&
                  coreCard.runner(causeCard) &&
                  cause === ":forced-to-trash")) &&
              validTarget(ctx, card)
            );
          },
        ),
        async: true,
        msg: "gain 2 [Credits]",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreGaining.gainCredits(state, side, eid, 2);
          },
        ),
      },
    ],
  };
})();

// Helheim Servers
export const helheimServers: CardDef = {
  title: "Helheim Servers",
  abilities: [
    {
      label:
        "All ice protecting this server has +2 strength until the end of the run",
      msg: "increase the strength of all ice protecting this server until the end of the run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) &&
          !!forms.run(state) &&
          ((state as any).corp?.hand?.length ?? 0) > 0,
      ),
      cost: [corePayment.toC("trash-from-hand", 1)],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEffects.registerLingeringEffect(card, {
            type: ":ice-strength",
            duration: ":end-of-run",
            req: req(
              (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                ts[0] && coreServers.protectingSameServer(c, ts[0]),
            ),
            value: 2,
          });
          (coreIce as any).updateAllIce(state, side);
        },
      ),
      "keep-menu-open": ":while-cards-in-hand",
    },
  ],
};

// Increased Drop Rates
export const increasedDropRates: CardDef = {
  title: "Increased Drop Rates",
  flags: { "rd-reveal": req(() => true) },
  poison: true,
  "on-access": {
    interactive: req(() => true),
    player: ":runner",
    async: true,
    "waiting-prompt": true,
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        return target === "The Corp removes 1 bad publicity"
          ? "remove 1 bad publicity"
          : `force the Runner to ${String(target).toLowerCase()}`;
      },
    ),
    prompt: "Choose one",
    choices: ["Take 1 tag", "The Corp removes 1 bad publicity"],
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const target: any = (targets as any[])?.[0];
        if (target === "Take 1 tag") {
          coreTags.gainTags(state, side, eid, 1, { unpreventable: true });
        } else {
          coreBadPublicity.loseBadPublicity(state, ":corp", 1);
          coreEffects.effectCompleted(state, side, eid);
        }
      },
    ),
  },
};

// Mr. Hendrik
export const mrHendrik: CardDef = coreDefHelpers.installedAccessTrigger(2, {
  async: true,
  msg: "force the Runner to suffer a core damage or lose all remaining [Click]",
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
        continue_ability(
          state,
          side,
          {
            player: ":runner",
            prompt: "Choose one",
            "waiting-prompt": true,
            choices: req((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
              const clicks = (s as any).runner?.click ?? 0;
              return [
                "Suffer 1 core damage",
                ...(clicks > 0 ? ["Lose all remaining [Click]"] : []),
              ];
            }),
            async: true,
            msg: msg((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
              const target: any = ts?.[0];
              return target === "Suffer 1 core damage"
                ? "do 1 core damage"
                : `force the Runner to ${String(target).toLowerCase()}`;
            }),
            effect: effect((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
              const target: any = ts?.[0];
              if (target === "Suffer 1 core damage") {
                coreDamage.damage(s, ":corp", e, ":brain", 1, { card: c });
              } else {
                coreGaining.loseClicks(
                  s,
                  ":runner",
                  (s as any).runner?.click ?? 0,
                );
                coreEffects.effectCompleted(s, sd, e);
              }
            }),
          },
          card,
          null,
        ),
      ],
      [],
    );
  }),
});
(mrHendrik as any).title = "Mr. Hendrik";

// Mumbad Virtual Tour
export const mumbadVirtualTour: CardDef = {
  title: "Mumbad Virtual Tour",
  flags: {
    "must-trash": req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreCard.installed(card),
    ),
  },
};

// Oberth Protocol
export const oberthProtocol: CardDef = {
  title: "Oberth Protocol",
  "additional-cost": [corePayment.toC("forfeit")],
  events: [
    {
      event: ":advance",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          if (!ctx?.card || !coreServers.sameServer(card, ctx.card))
            return false;
          const cardZone = (
            coreCard.getZone(card) as string[] | undefined
          )?.[1];
          const turnEvents =
            (coreEvents as any).turnEvents?.(state, side, ":advance") || [];
          const matching = turnEvents.filter((ev: any) => {
            const evCard = ev?.[0]?.card;
            return (
              evCard &&
              (coreCard.getZone(evCard) as string[] | undefined)?.[1] ===
                cardZone
            );
          });
          return matching.length === 1;
        },
      ),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 1 additional advancement counter on ${coreToString.cardStr(state, targets[0]?.card)}`,
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addProp(
            state,
            ":corp",
            eid,
            targets[0]?.card,
            ":advance-counter",
            1,
            { placed: true },
          );
        },
      ),
    },
  ],
};

// Off the Grid
export const offTheGrid: CardDef = {
  title: "Off the Grid",
  "install-req": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter(
        (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
      ),
  ),
  "static-abilities": [
    {
      type: ":cannot-run-on-server",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreCard.rezzed(card),
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          (coreCard.getZone(card) as string[] | undefined)?.[1],
      ),
    },
  ],
  events: [
    {
      event: ":successful-run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return coreServers.targetServer({ server: ctx?.server }) === ":hq";
        },
      ),
      async: true,
      msg: "trash itself",
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreMoving.trash(state, ":corp", eid, card, { causeCard: card });
        },
      ),
    },
  ],
};

// Old Hollywood Grid
export const oldHollywoodGrid: CardDef = (() => {
  const fromOrInSameServerReq = req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      if (!t) return false;
      const scored = (state as any).runner?.scored || [];
      const notInScored = !scored.some((s: Card) => s.title === t.title);
      return (
        notInScored &&
        (coreServers.inSameServer(card, t) ||
          coreServers.fromSameServer(card, t))
      );
    },
  );
  const fromPrevServerReq = req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      if (!t) return false;
      const scored = (state as any).runner?.scored || [];
      if (scored.some((s: Card) => s.title === t.title)) return false;
      const tZone = coreCard.getZone(t);
      const prev = (card as any).previousZone as string[] | undefined;
      if (!prev) return false;
      if (tZone === prev) return true;
      const central = coreServers.centralToZone(tZone);
      return JSON.stringify(central) === JSON.stringify(prev.slice(0, -1));
    },
  );
  return {
    title: "Old Hollywood Grid",
    "on-trash": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          side === ":runner" && !!forms.run(state),
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreEffects.registerLingeringEffect(card, {
            type: ":cannot-steal",
            duration: ":end-of-run",
            req: fromPrevServerReq,
            value: true,
          });
        },
      ),
    },
    "static-abilities": [
      {
        type: ":cannot-steal",
        duration: ":end-of-run",
        req: fromOrInSameServerReq,
        value: true,
      },
    ],
  };
})();

// Satellite Grid
export const satelliteGrid: CardDef = {
  title: "Satellite Grid",
  "on-rez": {
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const server = coreBoard.cardToServer(state, card);
        const ices = (server as any)?.ices || [];
        for (const c of ices) {
          coreProps.setProp(state, side, c, ":extra-advance-counter", 1);
        }
        (coreIce as any).updateAllIce(state, side);
      },
    ),
  },
  events: [
    {
      event: ":corp-install",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return (
            ctx?.card &&
            coreCard.ice(ctx.card) &&
            coreServers.protectingSameServer(card, ctx.card)
          );
        },
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.setProp(
            state,
            side,
            targets[0].card,
            ":extra-advance-counter",
            1,
          );
        },
      ),
    },
  ],
  "leave-play": effect(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const server = coreBoard.cardToServer(state, card);
      const ices = (server as any)?.ices || [];
      for (const c of ices) {
        const updated: any = { ...c };
        delete updated[":extra-advance-counter"];
        (coreUpdate as any).update?.(state, side, updated);
      }
      (coreIce as any).updateAllIce(state, side);
    },
  ),
};

// Shackleton Grid
export const shackletonGrid: CardDef = (() => {
  const ev = {
    optional: {
      prompt: "Do 4 meat damage?",
      "waiting-prompt": true,
      once: ":per-turn",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            !!forms.run(state) &&
            forms.thisServer(state, card) &&
            (!t?.card || coreCard.runner(t.card))
          );
        },
      ),
      "yes-ability": {
        async: true,
        msg: "do 4 meat damage",
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreDamage.damage(state, side, eid, ":meat", 4);
          },
        ),
      },
    },
  };
  return {
    title: "Shackleton Grid",
    events: [
      { ...ev, event: ":bad-publicity-spent" },
      { ...ev, event: ":spent-credits-from-card" },
    ],
  };
})();

// Shell Corporation
export const shellCorporation: CardDef = {
  title: "Shell Corporation",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1)],
      msg: "place 3 [Credits]",
      once: ":per-turn",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(state, side, eid, card, ":credit", 3, null);
        },
      ),
    },
    coreDefHelpers.takeAllCreditsAbility({
      cost: [corePayment.toC("click", 1)],
      action: true,
      once: ":per-turn",
    }),
  ],
};

// Signal Jamming
export const signalJamming: CardDef = {
  title: "Signal Jamming",
  abilities: [
    {
      label: "Cards cannot be installed until the end of the run",
      msg: "prevent cards being installed until the end of the run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) && !!forms.run(state),
      ),
      cost: [corePayment.toC("trash-can")],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreFlags.registerRunFlag(
            state,
            side,
            card,
            ":corp-lock-install",
            () => true,
          );
          coreFlags.registerRunFlag(
            state,
            side,
            card,
            ":runner-lock-install",
            () => true,
          );
          coreToasts.toast(
            state,
            ":runner",
            "Cannot install until the end of the run",
          );
          coreToasts.toast(
            state,
            ":corp",
            "Cannot install until the end of the run",
          );
        },
      ),
    },
  ],
};

// Henry Phillips
export const henryPhillips: CardDef = {
  title: "Henry Phillips",
  events: [
    {
      event: ":subroutines-broken",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) && !!(forms as any).tagged?.(state),
      ),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return `gain ${2 * (ctx?.["broken-subs"]?.length ?? 0)} [Credits]`;
        },
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets[0];
        const n = ctx?.["broken-subs"]?.length ?? 0;
        for (let i = 0; i < n; i++) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, ":corp", eid, 2),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Hype Machine
export const hypeMachine: CardDef = {
  title: "Hype Machine",
  "rez-cost-bonus": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const noAS = coreEvents.noEvent(state, side, ":agenda-scored");
      const noAStolen = coreEvents.noEvent(state, side, ":agenda-stolen");
      return noAS && noAStolen ? 0 : -6;
    },
  ),
  abilities: [
    {
      label: "Place 1 advancement token on a card in this server",
      async: true,
      prompt: "Choose a card in this server",
      choices: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            return t && coreServers.inSameServer(card, t);
          },
        ),
      },
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place an advancement token on ${coreToString.cardStr(state, targets[0])}`,
      ),
      cost: [corePayment.toC("trash-can")],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addProp(
            state,
            side,
            eid,
            targets[0],
            ":advance-counter",
            1,
            { placed: true },
          );
        },
      ),
    },
  ],
};

// Port Anson Grid
export const portAnsonGrid: CardDef = {
  title: "Port Anson Grid",
  "on-rez": {
    msg: "prevent the Runner from jacking out unless they trash an installed program",
  },
  "static-abilities": [
    {
      type: ":jack-out-additional-cost",
      duration: ":end-of-run",
      req: req(forms.thisServer),
      value: [corePayment.toC("program", 1)],
    },
  ],
  events: [
    {
      event: ":run",
      req: req(forms.thisServer),
      msg: "prevent the Runner from jacking out unless they trash an installed program",
    },
  ],
};

// Reduced Service
export const reducedService: CardDef = {
  title: "Reduced Service",
  "static-abilities": [
    {
      type: ":run-additional-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const server = (targets[1] as any)?.server;
          return server === coreServers.unknownToKw(coreCard.getZone(card));
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const n = coreCard.getCounters(card, ":power");
          return Array(n)
            .fill(null)
            .map(() => [corePayment.toC("credit", 2)]);
        },
      ),
    },
  ],
  events: [
    {
      event: ":successful-run",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          return (
            coreCard.getCounters(card, ":power") > 0 &&
            coreServers.isCentral(ctx?.server)
          );
        },
      ),
      msg: "remove 1 hosted power counter",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(state, side, eid, card, ":power", -1, null);
        },
      ),
    },
  ],
  "on-rez": {
    "waiting-prompt": true,
    prompt: "How many credits do you want to pay?",
    choices: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const max = Math.min(4, (state as any).corp?.credit ?? 0);
        return Array.from({ length: max + 1 }, (_, i) => String(i));
      },
    ),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const spent = parseInt((targets as any[])?.[0] ?? "0", 10);
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreProps.addCounter(
            state,
            ":corp",
            eid,
            card,
            ":power",
            spent,
            null,
          ),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreSay.systemMsg(
            state,
            ":corp",
            `uses ${card.title} to place ${utils.quantify(spent, "power counter")} on itself`,
          ),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.loseCredits(state, ":corp", eid, spent),
        ],
        [],
      );
    }),
  },
};

// Tempus
export const tempus: CardDef = {
  title: "Tempus",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    interactive: req(() => true),
    trace: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !coreCard.inDiscard(card),
      ),
      base: 3,
      successful: {
        "waiting-prompt": true,
        prompt: "Choose one",
        player: ":runner",
        choices: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const clicks = (state as any).runner?.click ?? 0;
            return [
              ...(clicks >= 2 ? ["Lose [Click][Click]"] : []),
              "Suffer 1 core damage",
            ];
          },
        ),
        async: true,
        msg: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const target: any = (targets as any[])?.[0];
            return `force the Runner to ${String(target).toLowerCase()}`;
          },
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const target: any = (targets as any[])?.[0];
            const clicks = (state as any).runner?.click ?? 0;
            if (target === "Lose [Click][Click]" && clicks >= 2) {
              coreGaining.loseClicks(state, ":runner", 2);
              coreEffects.effectCompleted(state, side, eid);
            } else {
              coreDamage.damage(state, side, eid, ":brain", 1, { card });
            }
          },
        ),
      },
    },
  },
};

// The Red Room
export const theRedRoom: CardDef = {
  title: "The Red Room",
  "legal-zones": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter(
        (t: any) => t === "R&D" || t === "HQ" || t === "Archives",
      ),
  ),
  events: [
    {
      event: ":agenda-stolen",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(state, side, eid, card, ":power", 1, null);
        },
      ),
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreEvents.firstEvent(state, side, ":agenda-stolen") &&
          coreEvents.noEvent(state, side, ":agenda-scored"),
      ),
    },
    {
      event: ":agenda-scored",
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(state, side, eid, card, ":power", 1, null);
        },
      ),
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          coreEvents.firstEvent(state, side, ":agenda-scored") &&
          coreEvents.noEvent(state, side, ":agenda-stolen"),
      ),
    },
  ],
  abilities: [
    {
      cost: [corePayment.toC("power", 1)],
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !!forms.run(state) && !forms.thisServer(state, card),
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreRuns.endRun(state, side, eid, card);
        },
      ),
      msg: "End the run",
    },
  ],
};

// The Twins
export const theTwins: CardDef = {
  title: "The Twins",
  events: [
    {
      event: ":pass-ice",
      optional: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            const ice = ctx?.ice;
            if (!ice || !coreCard.rezzed(ice) || !forms.thisServer(state, card))
              return false;
            const hand = (state as any).corp?.hand || [];
            return hand.some((c: Card) => c.title === ice.title);
          },
        ),
        prompt: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const current = coreIce.getCurrentIce(state);
            return `Force the runner to encounter ${current?.title} again?`;
          },
        ),
        "yes-ability": {
          async: true,
          prompt: msg(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const current = coreIce.getCurrentIce(state);
              return `Choose a copy of ${current?.title} in HQ`;
            },
          ),
          choices: {
            req: req(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                const t = targets[0];
                const current = coreIce.getCurrentIce(state);
                return (
                  t &&
                  coreCard.inHand(t) &&
                  coreCard.ice(t) &&
                  current &&
                  t.title === current.title
                );
              },
            ),
          },
          msg: msg(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const t = targets[0];
              return `reveal a copy of ${t?.title} from HQ, trash it and force the Runner to encounter it again`;
            },
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = targets[0];
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRevealing.reveal(state, side, target),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreMoving.trash(
                  state,
                  side,
                  coreEid.makeEid(state, eid),
                  { ...target, seen: true },
                  { causeCard: card },
                ),
              ],
              [],
            );
            const current = coreIce.getCurrentIce(state);
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRuns.forceIceEncounter(state, side, eid, current),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Tori Hanzō
export const toriHanzō: CardDef = {
  title: "Tori Hanzō",
  prevention: [
    {
      prevents: ":damage",
      type: ":event",
      "max-uses": 1,
      prompt: "Pay 2 [Credits] to do 1 core damage instead?",
      ability: {
        cost: [corePayment.toC("credit", 2)],
        msg: "instead do 1 core damage",
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            return (
              ctx?.type === ":net" &&
              ctx?.["source-player"] === ":corp" &&
              coreEvents.firstRunEvent(
                state,
                side,
                ":pre-damage-flag",
                (ts: any[]) => ts?.[0]?.type === ":net",
              ) &&
              (ctx?.remaining ?? 0) > 0
            );
          },
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const s: any = state;
            s.prevent = s.prevent || {};
            s.prevent.damage = {
              ...(s.prevent.damage || {}),
              type: ":brain",
              prevented: 0,
              count: 1,
              remaining: 1,
              "source-card": card,
            };
          },
        ),
      },
    },
  ],
};

// Vladisibirsk City Grid
export const vladisibirskCityGrid: CardDef = {
  title: "Vladisibirsk City Grid",
  advanceable: ":always",
  abilities: [
    {
      cost: [corePayment.toC("advancement", 2)],
      once: ":per-turn",
      prompt: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const zone = coreCard.getZone(card) as string[] | undefined;
          return `Choose an advanceable card in ${coreServers.zoneToName(zone?.[1])}`;
        },
      ),
      label: "Place 2 advancement counters (once per turn)",
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 2 advancement counters on ${coreToString.cardStr(state, targets[0])}`,
      ),
      choices: {
        "not-self": true,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            return (
              t &&
              coreCard.installed(t) &&
              (coreCard as any).canBeAdvanced?.(state, t) !== false &&
              coreServers.inSameServer(card, t)
            );
          },
        ),
      },
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addProp(
            state,
            side,
            eid,
            targets[0],
            ":advance-counter",
            2,
            { placed: true },
          );
        },
      ),
    },
  ],
};

// Vovô Ozetti
export const vovôOzetti: CardDef = {
  title: "Vovô Ozetti",
  "static-abilities": [
    {
      type: ":rez-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          if (!t) return false;
          const isIceOrThreat =
            coreCard.ice(t) || coreThreat.threatLevel(4, state);
          const sameSrv =
            JSON.stringify(coreBoard.cardToServer(state, card)) ===
            JSON.stringify(coreBoard.cardToServer(state, t));
          return isIceOrThreat && sameSrv;
        },
      ),
      value: -2,
    },
  ],
  events: [mobileSysopEventFn()],
};

// Will-o'-the-Wisp
export const willOTheWisp: CardDef = {
  title: "Will-o'-the-Wisp",
  implementation: "Doesn't restrict icebreaker selection",
  events: [
    {
      event: ":successful-run",
      interactive: req(() => true),
      optional: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            if (!forms.thisServer(state, card)) return false;
            const installed =
              coreBoard.allActiveInstalled(state, ":runner") || [];
            return installed.some((c: Card) =>
              coreCard.hasSubtype(c, "Icebreaker"),
            );
          },
        ),
        "waiting-prompt": true,
        prompt: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            `Trash ${card.title} to choose an icebreaker?`,
        ),
        "yes-ability": {
          async: true,
          prompt:
            "Choose an icebreaker used to break at least 1 subroutine during this run",
          choices: { card: (c: Card) => coreCard.hasSubtype(c, "Icebreaker") },
          msg: msg(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `add ${targets[0]?.title} to the bottom of the stack`,
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = targets[0];
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreMoving.trash(
                  state,
                  side,
                  coreEid.makeEid(state, eid),
                  card,
                  { causeCard: card },
                ),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                (coreMoving as any).move(state, ":runner", target, "deck"),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreEffects.effectCompleted(state, side, eid),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Giordano Memorial Field
export const giordanoMemorialField: CardDef = {
  title: "Giordano Memorial Field",
  events: [
    {
      event: ":successful-run",
      interactive: req(() => true),
      async: true,
      req: req(forms.thisServer),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const scored = (state as any).runner?.scored || [];
        const creditCost = 2 * scored.length;
        const canPay = corePayment.canPay(state, ":runner", eid, card, null, [
          corePayment.toC("credit", creditCost),
        ]);
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                player: ":runner",
                async: true,
                "waiting-prompt": true,
                prompt: "Choose one",
                choices: [
                  ...(canPay ? [`Pay ${creditCost} [Credits]`] : []),
                  "End the run",
                ],
                msg: msg((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                  const target: any = ts?.[0];
                  return target === "End the run"
                    ? "end the run"
                    : `force the runner to ${String(target).toLowerCase()}`;
                }),
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  ts: any[],
                ): Generator<any, any, any> {
                  const target: any = ts?.[0];
                  if (target === "End the run") {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreRuns.endRun(s, ":corp", e, c),
                      ],
                      [],
                    );
                  } else {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        corePayment.pay(
                          s,
                          ":runner",
                          coreEid.makeEid(s, e),
                          c,
                          [corePayment.toC("credit", creditCost)],
                        ),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreEffects.effectCompleted(s, sd, e),
                      ],
                      [],
                    );
                  }
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// Jinja City Grid
export const jinjaCityGrid: CardDef = (() => {
  const installIce = (
    ice: Card,
    ices: Card[],
    grids: Card[],
    server: string,
  ): any => {
    const remaining = ices.filter((c: Card) => !coreCard.sameCard(c, ice));
    return {
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (server === "None") {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(
                state,
                side,
                chooseIce(remaining, grids),
                card,
                null,
              ),
            ],
            [],
          );
        } else {
          yield wait_for(
            state,
            [{ asyncResult: "result" }, coreRevealing.reveal(state, side, ice)],
            [],
          );
          coreSay.systemMsg(state, side, `reveals that they drew ${ice.title}`);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              (coreInstalling as any).corpInstall?.(
                state,
                side,
                coreEid.makeEid(state, eid),
                ice,
                server,
                {
                  "cost-bonus": -4,
                  "msg-keys": {
                    "install-source": card,
                    known: true,
                    "display-origin": true,
                  },
                },
              ),
            ],
            [],
          );
          (coreDrawing as any).removeFromCurrentlyDrawing?.(state, side, ice);
          if (ices.length !== 1) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  chooseIce(remaining, grids),
                  card,
                  null,
                ),
              ],
              [],
            );
          }
        }
      }),
    };
  };
  const chooseGrid = (ice: Card, ices: Card[], grids: Card[]): any => {
    if (grids.length === 1) {
      const zone = (grids[0] as any).zone as string[] | undefined;
      return installIce(
        ice,
        ices,
        grids,
        coreServers.zoneToName(zone?.[1]) ?? "",
      );
    }
    return {
      async: true,
      prompt: `Choose a server to install ${ice.title}`,
      choices: [
        ...grids.map((g) => {
          const z = (g as any).zone as string[] | undefined;
          return coreServers.zoneToName(z?.[1]) ?? "";
        }),
        "None",
      ],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = targets[0];
          continue_ability(
            state,
            side,
            installIce(ice, ices, grids, target),
            card,
            null,
          );
        },
      ),
    };
  };
  const chooseIce = (ices: Card[], grids: Card[]): any => {
    if (ices.length === 0) return null;
    return {
      async: true,
      prompt: "Choose an ice to reveal and install",
      choices: [...ices.map((i) => i.title), "None"],
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = targets[0];
          if (target !== "None") {
            const picked = ices.find((i) => i.title === target);
            if (picked) {
              continue_ability(
                state,
                side,
                chooseGrid(picked, ices, grids),
                card,
                null,
              );
            }
          }
        },
      ),
    };
  };
  return {
    title: "Jinja City Grid",
    events: [
      {
        event: ":corp-draw",
        once: ":per-turn",
        "once-key": ":jinja-city-grid-draw",
        async: true,
        "waiting-prompt": true,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const trashList: any = (state as any).trash?.["trash-list"] || {};
            const cids = Object.values(trashList)
              .flat()
              .map((c: any) => c?.cid);
            return !cids.includes(card.cid);
          },
        ),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const drawing: any[] =
            (state as any).corp?.["currently-drawing"] || [];
          const someIce = drawing.some((c: Card) => coreCard.ice(c));
          if (someIce) {
            const ices = drawing.filter(
              (c: Card) =>
                coreCard.ice(c) && (coreEngine as any).getCard?.(state, c),
            );
            const installed =
              coreBoard.allActiveInstalled(state, ":corp") || [];
            const grids = installed.filter((c: Card) => c.title === card.title);
            if (ices.length > 0) {
              yield wait_for(
                state,
                [
                  { asyncResult: "result" },
                  continue_ability(
                    state,
                    side,
                    chooseIce(ices, grids),
                    card,
                    null,
                  ),
                ],
                [],
              );
            }
          } else {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  ":corp",
                  {
                    prompt: "You did not draw any ice",
                    choices: ["Carry on!"],
                    "prompt-type": ":bogus",
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          }
        }),
      },
      {
        event: ":post-corp-draw",
        effect: effect((state: State) => {
          const s: any = state;
          if (s["per-turn"]) delete s["per-turn"][":jinja-city-grid-draw"];
        }),
      },
    ],
  };
})();

// Tucana
export const tucana: CardDef = (() => {
  const ability: any = {
    optional: {
      prompt: "Search R&D for an ice?",
      "waiting-prompt": true,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          JSON.stringify(targets[0]?.card?.previousZone) ===
          JSON.stringify(coreCard.getZone(card)),
      ),
      "yes-ability": {
        async: true,
        prompt: "Choose a piece of ice to install and rez",
        "waiting-prompt": true,
        interactive: req(() => true),
        choices: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            ((state as any).corp?.deck || []).filter((c: Card) =>
              coreCard.ice(c),
            ),
        ),
        msg: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            `install and rez ${coreToString.cardStr(state, targets[0])}, paying a total of 3 [Credits] less`,
        ),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const target: any = targets[0];
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              (coreInstalling as any).corpInstall?.(
                state,
                side,
                coreEid.makeEid(state, eid),
                target,
                null,
                {
                  "install-state": ":rezzed",
                  "combined-credit-discount": 3,
                  "msg-keys": {
                    "install-source": card,
                    "display-origin": true,
                  },
                },
              ),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreShuffling.shuffle(state, ":corp", ":deck"),
            ],
            [],
          );
          coreSay.systemMsg(state, side, "shuffles R&D");
          coreEffects.effectCompleted(state, side, eid);
        }),
        cancel: coreMoving.shuffleMyDeck,
      },
    },
  };
  return {
    title: "Tucana",
    "legal-zones": req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets as any[]).filter(
          (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
        ),
    ),
    events: [
      { ...ability, event: ":agenda-stolen" },
      { ...ability, event: ":agenda-scored" },
    ],
    "on-trash": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !!forms.run(state) && side === ":runner",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const lingering: any = {
            ...ability,
            event: ":agenda-stolen",
            duration: ":end-of-run",
            optional: {
              ...ability.optional,
              req: req(
                (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                  JSON.stringify((c as any).previousZone) ===
                  JSON.stringify(ts[0]?.card?.previousZone),
              ),
            },
          };
          coreEngine.registerEvents(card, [lingering]);
        },
      ),
    },
  };
})();

// Warroid Tracker
export const warroidTracker: CardDef = (() => {
  const wt = (n: number): any => ({
    "waiting-prompt": true,
    prompt: "Choose an installed card to trash",
    async: true,
    interactive: req(() => true),
    player: ":runner",
    choices: {
      all: true,
      max: n,
      card: (c: Card) => coreCard.runner(c) && coreCard.installed(c),
    },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `force the Runner to trash ${
          (coreCard as any).enumerateCards?.(targets) ??
          targets.map((t: any) => t?.title).join(", ")
        }`,
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreMoving.trashCards(state, ":runner", eid, targets, {
          unpreventable: true,
          causeCard: card,
          cause: ":forced-to-trash",
        });
      },
    ),
  });
  const ability = (): any => ({
    trace: {
      base: 4,
      successful: {
        async: true,
        msg: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const n = Math.min(
              2,
              (coreBoard.allInstalled(state, ":runner") || []).length,
            );
            return `force the runner to trash ${utils.quantify(n, "installed card")}${n === 0 ? "but there are no installed cards to trash" : ""}`;
          },
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const n = Math.min(
              2,
              (coreBoard.allInstalled(state, ":runner") || []).length,
            );
            if (n > 0) {
              continue_ability(state, side, wt(n), card, null);
            }
          },
        ),
      },
    },
  });
  return {
    title: "Warroid Tracker",
    events: [
      {
        event: ":runner-trash",
        async: true,
        "once-per-instance": true,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            (targets as any[]).some((t: any) => {
              if (!coreCard.corp(t?.card)) return false;
              const tZone = coreCard.getZone(t.card);
              const central = coreServers.centralToZone(tZone);
              const resolvedZone: any = central || tZone;
              const warroidZone = coreCard.getZone(card) as
                | string[]
                | undefined;
              return warroidZone?.[1] === resolvedZone?.[1];
            }),
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            continue_ability(state, side, ability(), card, null);
          },
        ),
      },
    ],
  };
})();

// ZATO City Grid
export const zatoCityGrid: CardDef = {
  title: "ZATO City Grid",
  "legal-zones": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter(
        (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
      ),
  ),
  "static-abilities": [
    {
      type: ":gain-encounter-ability",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            coreServers.protectingSameServer(card, t) &&
            !(t as any).disabled
          );
        },
      ),
      value: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ({
          async: true,
          "ability-name": "ZATO City Grid",
          interactive: req(() => true),
          optional: {
            "waiting-prompt": true,
            prompt: "Trash ice to fire a (printed) subroutine?",
            "yes-ability": {
              async: true,
              effect: effect(function* (
                s: State,
                sd: Side,
                e: EID,
                c: Card,
                ts: any[],
              ): Generator<any, any, any> {
                const ctx = ts[0];
                const targetIce: any = ctx?.ice;
                const printedSubs = (targetIce?.subroutines || []).filter(
                  (sb: any) => sb?.printed,
                );
                yield wait_for(
                  s,
                  [
                    { asyncResult: "result" },
                    continue_ability(
                      s,
                      sd,
                      printedSubs.length > 0
                        ? {
                            prompt: "Choose a subroutine to resolve",
                            choices: req(
                              (s2: State) =>
                                (coreIce as any).unbrokenSubroutinesChoice?.(
                                  targetIce,
                                ) || [],
                            ),
                            cost: [corePayment.toC("trash-can")],
                            msg: msg(
                              (
                                s2: State,
                                sd2: Side,
                                e2: EID,
                                c2: Card,
                                ts2: any[],
                              ) => `resolve ("[Subroutine] ${ts2[0]}")`,
                            ),
                            async: true,
                            effect: effect(function* (
                              s2: State,
                              sd2: Side,
                              e2: EID,
                              c2: Card,
                              ts2: any[],
                            ): Generator<any, any, any> {
                              const sub = (targetIce?.subroutines || []).find(
                                (sb: any) =>
                                  ts2[0] ===
                                  ((coreIce as any).makeLabel?.(
                                    sb?.["sub-effect"],
                                  ) ?? ""),
                              );
                              if (sub) {
                                yield wait_for(
                                  s2,
                                  [
                                    { asyncResult: "result" },
                                    (coreIce as any).resolveSubroutine?.(
                                      s2,
                                      sd2,
                                      e2,
                                      targetIce,
                                      { ...sub, "external-trigger": true },
                                    ),
                                  ],
                                  [],
                                );
                              }
                            }),
                          }
                        : {
                            cost: [corePayment.toC("trash-can")],
                            "change-in-game-state": { req: req(() => false) },
                          },
                      c,
                      null,
                    ),
                  ],
                  [],
                );
              }),
            },
          },
        }),
      ),
    },
  ],
};

// Tranquility Home Grid
export const tranquilityHomeGrid: CardDef = {
  title: "Tranquility Home Grid",
  "legal-zones": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter(
        (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
      ),
  ),
  events: [
    {
      event: ":corp-install",
      interactive: req(() => true),
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          const c = ctx?.card;
          if (!c) return false;
          const isAAU =
            coreCard.asset(c) || coreCard.agenda(c) || coreCard.upgrade(c);
          if (!isAAU || !coreServers.inSameServer(card, c)) return false;
          return coreEvents.firstEvent(
            state,
            ":corp",
            ":corp-install",
            (ts: any[]) =>
              ts?.[0]?.card && coreServers.inSameServer(card, ts[0].card),
          );
        },
      ),
      prompt: "Choose one",
      "waiting-prompt": true,
      choices: ["Gain 2 [Credits]", "Draw 1 card"],
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          return String(target).toLowerCase();
        },
      ),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const target: any = (targets as any[])?.[0];
          if (target === "Gain 2 [Credits]") {
            coreGaining.gainCredits(state, side, eid, 2);
          } else {
            coreDrawing.draw(state, side, eid, 1);
          }
        },
      ),
    },
  ],
};

// La Costa Grid
export const laCostaGrid: CardDef = (() => {
  const ability: any = {
    prompt: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const zone = coreCard.getZone(card) as string[] | undefined;
        return `Choose a card in ${coreServers.zoneToName(zone?.[1])}`;
      },
    ),
    label: "Place 1 advancement counter (start of turn)",
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`,
    ),
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t && coreCard.installed(t) && coreServers.inSameServer(card, t)
          );
        },
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, side, eid, targets[0], ":advance-counter", 1, {
          placed: true,
        });
      },
    ),
  };
  return {
    title: "La Costa Grid",
    "legal-zones": req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets as any[]).filter(
          (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
        ),
    ),
    flags: { "corp-phase-12": req(() => true) },
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// Letheia Nisei
export const letheiaNisei: CardDef = {
  title: "Letheia Nisei",
  events: [
    {
      event: ":approach-server",
      interactive: req(() => true),
      psi: {
        req: req(forms.thisServer),
        once: ":per-run",
        "not-equal": {
          optional: {
            "waiting-prompt": true,
            prompt: msg(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) =>
                `Trash ${card.title} to force the Runner to approach the outermost piece of ice?`,
            ),
            autoresolve: coreEngine.getAutoresolve(":auto-fire"),
            "yes-ability": {
              async: true,
              msg: "force the Runner to approach the outermost piece of ice",
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
                    coreMoving.trash(
                      state,
                      side,
                      coreEid.makeEid(state, eid),
                      card,
                      { unpreventable: true, causeCard: card },
                    ),
                  ],
                  [],
                );
                const zone = coreCard.getZone(card) as string[] | undefined;
                coreRuns.redirectRun(
                  state,
                  side,
                  coreServers.zoneToName(zone?.[1]) ?? "",
                  ":approach-ice",
                );
                yield wait_for(
                  state,
                  [
                    { asyncResult: "result" },
                    continue_ability(
                      state,
                      ":runner",
                      coreDefHelpers.offerJackOut(),
                      card,
                      null,
                    ),
                  ],
                  [],
                );
              }),
            },
          },
        },
      },
    },
  ],
  abilities: [coreDefHelpers.setAutoresolve(":auto-fire", "Letheia Nisei")],
};

// Mahkota Langit Grid
export const mahkotaLangitGrid: CardDef = {
  title: "Mahkota Langit Grid",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          const sourceType = (eid as any)["source-type"];
          return (
            sourceType === ":rez" &&
            t &&
            (coreCard.ice(t) || coreCard.asset(t)) &&
            coreServers.sameServer(card, t)
          );
        },
      ),
      type: ":recurring",
    },
  },
  "static-abilities": [
    {
      type: ":trash-cost",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            coreCard.installed(t) &&
            coreCard.asset(t) &&
            coreServers.sameServer(card, t)
          );
        },
      ),
      value: 2,
    },
  ],
  "on-trash": {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        side === ":runner" && !!forms.run(state),
    ),
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreEffects.registerLingeringEffect(card, {
          type: ":trash-cost",
          duration: ":end-of-run",
          req: req((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
            const t = ts[0];
            if (!t || !coreCard.asset(t)) return false;
            const tZone = coreCard.getZone(t);
            const prev = (c as any).previousZone as string[] | undefined;
            if (!prev) return false;
            if (tZone === prev) return true;
            const central = coreServers.centralToZone(tZone);
            return (
              JSON.stringify(central) === JSON.stringify(prev.slice(0, -1))
            );
          }),
          value: 2,
        });
      },
    ),
  },
};

// Malapert Data Vault
export const malapertDataVault: CardDef = {
  title: "Malapert Data Vault",
  events: [
    {
      event: ":agenda-scored",
      interactive: req(() => true),
      optional: {
        prompt: "Search R&D for non-agenda card?",
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            return (
              JSON.stringify(ctx?.card?.previousZone) ===
              JSON.stringify(coreCard.getZone(card))
            );
          },
        ),
        "yes-ability": {
          prompt: "Choose a card",
          choices: req(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const deck = (state as any).corp?.deck || [];
              return deck.filter((c: Card) => !coreCard.agenda(c));
            },
          ),
          msg: msg(
            (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `reveal ${targets[0]?.title} from R&D and add it to HQ`,
          ),
          async: true,
          cancel: coreMoving.shuffleMyDeck,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = targets[0];
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreRevealing.reveal(state, side, target),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreShuffling.shuffle(state, side, ":deck"),
              ],
              [],
            );
            (coreMoving as any).move(state, side, target, "hand");
            coreEffects.effectCompleted(state, side, eid);
          }),
        },
      },
    },
  ],
};

// Manegarm Skunkworks
export const manegarmSkunkworks: CardDef = {
  title: "Manegarm Skunkworks",
  events: [
    {
      event: ":approach-server",
      interactive: req(() => true),
      player: ":runner",
      prompt: "Choose one",
      "waiting-prompt": true,
      req: req(forms.thisServer),
      choices: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const opts: string[] = [];
          if (
            corePayment.canPay(state, ":runner", eid, card, null, [
              corePayment.toC("click", 2),
            ])
          ) {
            opts.push("Spend [Click][Click]");
          }
          if (
            corePayment.canPay(state, ":runner", eid, card, null, [
              corePayment.toC("credit", 5),
            ])
          ) {
            opts.push("Pay 5 [Credits]");
          }
          opts.push("End the run");
          return opts;
        },
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = (targets as any[])?.[0];
        if (
          target === "Spend [Click][Click]" &&
          corePayment.canPay(state, ":runner", eid, card, null, [
            corePayment.toC("click", 2),
          ])
        ) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [
                corePayment.toC("click", 2),
              ]),
            ],
            [],
          );
          coreEffects.effectCompleted(state, ":runner", eid);
        } else if (
          target === "Pay 5 [Credits]" &&
          corePayment.canPay(state, ":runner", eid, card, null, [
            corePayment.toC("credit", 5),
          ])
        ) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [
                corePayment.toC("credit", 5),
              ]),
            ],
            [],
          );
          coreEffects.effectCompleted(state, ":runner", eid);
        } else {
          coreSay.systemMsg(
            state,
            ":corp",
            `uses ${card.title} to end the run`,
          );
          coreRuns.endRun(state, ":corp", eid, card);
        }
      }),
    },
  ],
};

// Mavirus
export const mavirus: CardDef = (() => {
  const resolvePurge = {
    msg: "purge virus counters",
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
        [{ asyncResult: "result" }, corePurging.purge(state, side, eid)],
        [],
      );
      if (coreCard.rezzed(card)) {
        coreSay.systemMsg(state, side, `uses ${card.title} to do 1 net damage`);
        coreDamage.damage(state, side, eid, ":net", 1, { card });
      } else {
        coreEffects.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: "Mavirus",
    flags: { "rd-reveal": req(() => true) },
    poison: true,
    "on-access": {
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (canSmartPurge(state)) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(state, side, resolvePurge, card, null),
            ],
            [],
          );
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(
                state,
                side,
                {
                  optional: {
                    "waiting-prompt": true,
                    prompt: "Purge virus counters?",
                    "yes-ability": resolvePurge,
                    "no-ability": {
                      async: true,
                      effect: effect(function* (
                        s: State,
                        sd: Side,
                        e: EID,
                        c: Card,
                        ts: any[],
                      ): Generator<any, any, any> {
                        coreSay.systemMsg(
                          s,
                          ":corp",
                          `declines to use ${c.title}`,
                        );
                        if (coreCard.rezzed(c)) {
                          coreSay.systemMsg(
                            s,
                            sd,
                            `uses ${c.title} to do 1 net damage`,
                          );
                          coreDamage.damage(s, sd, e, ":net", 1, { card: c });
                        } else {
                          coreEffects.effectCompleted(s, sd, e);
                        }
                      }),
                    },
                  },
                },
                card,
                null,
              ),
            ],
            [],
          );
        }
      }),
    },
    abilities: [
      {
        label: "Purge virus counters",
        msg: "purge virus counters",
        cost: [corePayment.toC("trash-can")],
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            corePurging.purge(state, side, eid);
          },
        ),
      },
    ],
  };
})();

// Midori
export const midori: CardDef = {
  title: "Midori",
  events: [
    {
      event: ":approach-ice",
      "change-in-game-state": {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            ((state as any).corp?.hand?.length ?? 0) > 0,
        ),
      },
      optional: {
        req: req(forms.thisServer),
        once: ":per-run",
        prompt:
          "Swap the piece of ice being approached with a piece of ice from HQ?",
        "yes-ability": {
          async: true,
          prompt: "Choose a piece of ice",
          choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
          msg: msg(
            (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ) => {
              const cur = coreIce.getCurrentIce(state);
              return `swap ${coreToString.cardStr(state, cur)} with a piece of ice from HQ`;
            },
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const target: any = targets[0];
            const cur = coreIce.getCurrentIce(state);
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                (coreCard as any).swapCardsAsync?.(state, ":corp", cur, target),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  ":runner",
                  coreDefHelpers.offerJackOut(),
                  card,
                  null,
                ),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Mitra Aman
export const mitraAman: CardDef = {
  title: "Mitra Aman",
  events: [
    {
      event: ":approach-ice",
      skippable: true,
      interactive: req(() => true),
      optional: {
        req: req(forms.thisServer),
        prompt: "Trash Mitra Aman to gain 3 [Credits]?",
        "waiting-prompt": true,
        "yes-ability": {
          cost: [corePayment.toC("trash-can", 1)],
          msg: "gain 3 [Credits]",
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
                coreGaining.gainCredits(state, side, eid, 3),
              ],
              [],
            );
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  {
                    async: true,
                    "show-discard": true,
                    prompt: "Swap the approached ice with another ice?",
                    choices: {
                      card: (c: Card) =>
                        coreCard.ice(c) &&
                        (coreCard.inHand(c) || coreCard.inDiscard(c)),
                    },
                    msg: msg(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        const cur = coreIce.getCurrentIce(s);
                        return `swap ${coreToString.cardStr(s, cur)} with ${coreToString.cardStr(s, ts[0])}`;
                      },
                    ),
                    effect: effect(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        const cur = coreIce.getCurrentIce(s);
                        (coreCard as any).swapCardsAsync?.(
                          s,
                          sd,
                          e,
                          cur,
                          ts[0],
                        );
                      },
                    ),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Mumbad City Grid
export const mumbadCityGrid: CardDef = {
  title: "Mumbad City Grid",
  events: [
    {
      event: ":pass-ice",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          forms.thisServer(state, card) &&
          (coreIce.getRunIces(state)?.length ?? 0) >= 2,
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = targets[0];
        const passedIce = ctx?.ice;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                prompt: msg(
                  (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                    `Choose a piece of ice to swap with ${passedIce?.title}`,
                ),
                choices: {
                  req: req((s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                    const t = ts[0];
                    const run = forms.run(s) as any;
                    const tZone = coreCard.getZone(t) as string[] | undefined;
                    return (
                      t &&
                      coreCard.installed(t) &&
                      coreCard.ice(t) &&
                      coreServers.targetServer({ server: run?.server }) ===
                        tZone?.[1] &&
                      !coreCard.sameCard(t, passedIce)
                    );
                  }),
                },
                effect: effect(
                  (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                    coreIce.swapIce(s, sd, ts[0], passedIce);
                  },
                ),
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// Intake
export const intake: CardDef = {
  title: "Intake",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    interactive: req(() => true),
    trace: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !coreCard.inDiscard(card),
      ),
      base: 4,
      label: "add an installed program or virtual resource to the Grip",
      successful: {
        "waiting-prompt": true,
        prompt: "Choose a program or virtual resource",
        choices: {
          card: (c: Card) =>
            coreCard.installed(c) &&
            (coreCard.program(c) ||
              (coreCard.resource(c) && coreCard.hasSubtype(c, "Virtual"))),
        },
        msg: msg(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            `move ${targets[0]?.title} to the Grip`,
        ),
        async: true,
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            (coreMoving as any).move(state, ":runner", targets[0], "hand");
            coreEffects.effectCompleted(state, side, eid);
          },
        ),
      },
    },
  },
};

// Self-destruct
export const selfDestruct: CardDef = {
  title: "Self-destruct",
  "install-req": req(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).filter(
        (t: any) => t !== "HQ" && t !== "R&D" && t !== "Archives",
      ),
  ),
  abilities: [
    {
      async: true,
      req: req(forms.thisServer),
      cost: [corePayment.toC("trash-can")],
      label: "Trace X - Do 3 net damage",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const serv: any = coreBoard.cardToServer(state, card);
        const cards = [...(serv?.ices || []), ...(serv?.content || [])];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trashCards(
              state,
              side,
              coreEid.makeEid(state, eid),
              cards,
              { causeCard: card },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                trace: {
                  base: cards.length,
                  successful: {
                    async: true,
                    msg: "do 3 net damage",
                    effect: effect(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        coreDamage.damage(s, sd, e, ":net", 3, { card: c });
                      },
                    ),
                  },
                },
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// Hired Help
export const hiredHelp: CardDef = (() => {
  const promptToTrashOrEtr: any = {
    prompt: "Choose one",
    "waiting-prompt": true,
    player: ":runner",
    choices: ["Trash 1 scored agenda", "End the run"],
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const target: any = targets[0];
      if (target === "End the run") {
        coreSay.systemMsg(
          state,
          ":runner",
          `declines to pay the additional cost from ${card.title}`,
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRuns.endRun(state, side, eid, card)],
          [],
        );
      } else {
        const scored = (state as any).runner?.scored || [];
        if (scored.length > 0) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              continue_ability(
                state,
                ":runner",
                {
                  prompt: "Choose an Agenda to trash",
                  async: true,
                  choices: {
                    max: 1,
                    card: (c: Card) => coreCard.inScored?.(c),
                  },
                  effect: effect(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                    ts: any[],
                  ): Generator<any, any, any> {
                    const t: any = ts[0];
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreMoving.trash(s, sd, e, t, {
                          unpreventable: true,
                          causeCard: c,
                          cause: ":forced-to-trash",
                        }),
                      ],
                      [],
                    );
                    coreSay.systemMsg(
                      s,
                      ":runner",
                      `trashes ${t?.title} as an additional cost to initiate a run`,
                    );
                    coreEffects.effectCompleted(s, sd, e);
                  }),
                },
                card,
                null,
              ),
            ],
            [],
          );
        } else {
          coreSay.systemMsg(
            state,
            ":runner",
            `cannot pay the additional cost from ${card.title}`,
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreRuns.endRun(state, side, eid, card),
            ],
            [],
          );
        }
      }
    }),
  };
  return {
    title: "Hired Help",
    events: [
      {
        event: ":run",
        async: true,
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const reg =
              (state as any).runner?.["runner-reg"]?.["successful-run"] || [];
            return forms.thisServer(state, card) && !reg.includes(":hq");
          },
        ),
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            continue_ability(state, ":runner", promptToTrashOrEtr, card, null);
          },
        ),
      },
    ],
  };
})();

// Marcus Batty
export const marcusBatty: CardDef = {
  title: "Marcus Batty",
  abilities: [
    {
      label: "Start a Psi game to resolve a subroutine",
      cost: [corePayment.toC("trash-can")],
      psi: {
        req: req(forms.thisServer),
        "not-equal": {
          prompt: "Choose a piece of ice",
          choices: {
            card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c),
            all: true,
          },
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const ice: any = targets[0];
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  {
                    prompt: "Choose a subroutine",
                    choices: req(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                        (coreIce as any).unbrokenSubroutinesChoice?.(ice) || [],
                    ),
                    msg: msg(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                        `resolve the subroutine ("[subroutine] ${ts[0]}") from ${ice?.title}`,
                    ),
                    async: true,
                    effect: effect(function* (
                      s: State,
                      sd: Side,
                      e: EID,
                      c: Card,
                      ts: any[],
                    ): Generator<any, any, any> {
                      const subs = ice?.subroutines || [];
                      const sub = subs.find(
                        (sb: any) =>
                          ts[0] ===
                          ((coreIce as any).makeLabel?.(sb?.["sub-effect"]) ??
                            ""),
                      );
                      if (sub) {
                        yield wait_for(
                          s,
                          [
                            { asyncResult: "result" },
                            (coreIce as any).resolveSubroutine?.(
                              s,
                              sd,
                              e,
                              ice,
                              { ...sub, "external-trigger": true },
                            ),
                          ],
                          [],
                        );
                      }
                    }),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Perfect Recall
export const perfectRecall: CardDef = (() => {
  const ab: any = {
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        !!forms.run(state),
    ),
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreCard.corp(t) && coreCard.inHand(t);
        },
      ),
    },
    label: "Reveal a card and prevent it being trashed or stolen this run",
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `reveal ${targets[0]?.title} from HQ and prevent the runner from stealing or trashing any copies of it this run`,
    ),
    async: true,
    "waiting-prompt": true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const revealed: any = targets[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreRevealing.reveal(state, side, revealed),
        ],
        [],
      );
      coreEffects.registerLingeringEffect(card, {
        type: ":cannot-steal",
        req: req(
          (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
            ts[0]?.title === revealed?.title,
        ),
        value: true,
        duration: ":end-of-run",
      });
      coreEffects.registerLingeringEffect(card, {
        type: ":cannot-be-trashed",
        req: req(
          (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
            ts[0]?.title === revealed?.title && sd === ":runner",
        ),
        value: true,
        duration: ":end-of-run",
      });
      coreEffects.effectCompleted(state, side, eid);
    }),
  };
  const counterEv = {
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addCounter(state, side, eid, card, ":power", 1, null);
      },
    ),
  };
  return {
    title: "Perfect Recall",
    events: [
      {
        ...counterEv,
        event: ":agenda-stolen",
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            JSON.stringify(targets[0]?.card?.previousZone) ===
            JSON.stringify(coreCard.getZone(card)),
        ),
      },
      {
        ...counterEv,
        event: ":agenda-scored",
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            JSON.stringify(targets[0]?.card?.previousZone) ===
            JSON.stringify(coreCard.getZone(card)),
        ),
      },
    ],
    "on-rez": {
      silent: req(() => true),
      async: true,
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          coreProps.addCounter(state, side, eid, card, ":power", 1, null);
        },
      ),
    },
    abilities: [{ ...ab, cost: [corePayment.toC("power", 1)] }],
  };
})();

// Isaac Liberdade
export const isaacLiberdade: CardDef = (() => {
  const ability: any = {
    interactive: req(() => true),
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const installed = coreBoard.allInstalled(state, ":corp") || [];
        return installed.some(
          (c: Card) =>
            coreCard.ice(c) &&
            coreCard.getCounters(c, ":advancement") === 0 &&
            coreServers.sameServer(card, c),
        );
      },
    ),
    prompt: "Choose a piece of ice protecting this server",
    "waiting-prompt": true,
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return (
            t &&
            coreCard.ice(t) &&
            coreCard.getCounters(t, ":advancement") === 0 &&
            coreServers.sameServer(t, card)
          );
        },
      ),
    },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`,
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreProps.addProp(state, side, eid, targets[0], ":advance-counter", 1, {
          placed: true,
        });
      },
    ),
  };
  return {
    title: "Isaac Liberdade",
    "static-abilities": [
      {
        type: ":ice-strength",
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            return (
              t &&
              coreCard.ice(t) &&
              JSON.stringify(coreBoard.cardToServer(state, card)) ===
                JSON.stringify(coreBoard.cardToServer(state, t))
            );
          },
        ),
        value: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            coreCard.getCounters(targets[0], ":advancement") > 0 ? 2 : 0,
        ),
      },
    ],
    events: [mobileSysopEventFn(":corp-turn-ends", ability)],
  };
})();

// Nanisivik Grid
export const nanisivikGrid: CardDef = {
  title: "Nanisivik Grid",
  events: [
    {
      event: ":approach-server",
      interactive: req(() => true),
      prompt: "Choose a facedown piece of ice in Archives",
      "waiting-prompt": true,
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const discard = (state as any).corp?.discard || [];
          return (
            forms.thisServer(state, card) &&
            discard.some((c: Card) => !(c as any).seen)
          );
        },
      ),
      "show-discard": true,
      choices: {
        card: (c: Card) =>
          coreCard.ice(c) && coreCard.inDiscard(c) && !(c as any).seen,
      },
      async: true,
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `reveal ${targets[0]?.title} from Archives`,
      ),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = targets[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreRevealing.reveal(state, side, target),
          ],
          [],
        );
        (coreUpdate as any).update?.(state, side, { ...target, seen: true });
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            continue_ability(
              state,
              side,
              {
                async: true,
                prompt: "Choose a subroutine to resolve",
                choices: req(
                  (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                    (coreIce as any).unbrokenSubroutinesChoice?.(target) || [],
                ),
                msg: msg(
                  (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                    `resolve the subroutine ("[subroutine] ${ts[0]}") from ${coreToString.cardStr(s, target)}`,
                ),
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  ts: any[],
                ): Generator<any, any, any> {
                  const subs = target?.subroutines || [];
                  const sub = subs.find(
                    (sb: any) =>
                      ts[0] ===
                      ((coreIce as any).makeLabel?.(sb?.["sub-effect"]) ?? ""),
                  );
                  if (sub?.["sub-effect"]) {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        continue_ability(
                          s,
                          sd,
                          sub["sub-effect"],
                          target,
                          null,
                        ),
                      ],
                      [],
                    );
                  }
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// The Holo Man
export const theHoloMan: CardDef = (() => {
  const isBoosted = (state: State, side: Side): boolean =>
    coreEvents.noEvent(
      state,
      side,
      ":corp-install",
      (ts: any[]) =>
        JSON.stringify(ts?.[0]?.card?.previousZone) ===
        JSON.stringify(["hand"]),
    );
  const abi: any = {
    action: true,
    cost: [corePayment.toC("click"), corePayment.toC("credit", 4)],
    label: "Place advancement counters on a card in or protecting this server",
    once: ":per-turn",
    choices: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0];
          return t && coreServers.sameServer(card, t);
        },
      ),
    },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const n = isBoosted(state, side) ? 3 : 2;
        return `place ${n} advancement counters on ${coreToString.cardStr(state, targets[0])}`;
      },
    ),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const n = isBoosted(state, side) ? 3 : 2;
        coreProps.addProp(state, side, eid, targets[0], ":advance-counter", n, {
          placed: true,
        });
      },
    ),
  };
  return {
    title: "The Holo Man",
    abilities: [abi],
    events: [mobileSysopEventFn(":corp-turn-begins")],
  };
})();

// Flagship
export const flagship: CardDef = (() => {
  const otherCardsAccessed = (state: State, card: Card): string[] => {
    const runEvents: any[] =
      (coreEvents as any).runEvents?.(state, ":runner", ":access") || [];
    return runEvents
      .flat()
      .filter((e: any) => e?.["accessed-card"]?.cid !== card.cid)
      .map((e: any) => e?.["accessed-card"]?.cid);
  };
  const preventRandom: any = {
    type: ":disable-random-accesses",
    value: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        !!forms.run(state) &&
        forms.thisServer(state, card) &&
        otherCardsAccessed(state, card).length > 0,
    ),
  };
  const preventInstalled: any = {
    type: ":disable-access-candidacy",
    value: true,
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const t = targets[0];
        return (
          !!forms.run(state) &&
          forms.thisServer(state, card) &&
          !coreCard.sameCard(card, t) &&
          otherCardsAccessed(state, card).length > 0
        );
      },
    ),
  };
  return {
    title: "Flagship",
    "static-abilities": [
      {
        type: ":block-successful-run",
        req: req(forms.thisServer),
        value: true,
      },
      preventRandom,
      preventInstalled,
    ],
    "legal-zones": req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets as any[]).filter((t: any) => t === "R&D" || t === "HQ"),
    ),
    "on-trash": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !!forms.run(state) && side === ":runner",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const ctx = targets[0];
          const c = ctx?.card || card;
          coreEffects.registerLingeringEffect(c, {
            type: ":disable-random-accesses",
            value: true,
            duration: ":end-of-run",
            req: req((s: State) => {
              const run: any = forms.run(s);
              const zone = coreCard.getZone(c) as string[] | undefined;
              return (
                !!run &&
                JSON.stringify(run?.server) === JSON.stringify([zone?.[1]]) &&
                otherCardsAccessed(s, c).length > 0
              );
            }),
          });
          coreEffects.registerLingeringEffect(c, {
            type: ":disable-access-candidacy",
            value: true,
            duration: ":end-of-run",
            req: req((s: State) => {
              const run: any = forms.run(s);
              const zone = coreCard.getZone(c) as string[] | undefined;
              return (
                !!run &&
                JSON.stringify(run?.server) === JSON.stringify([zone?.[1]]) &&
                otherCardsAccessed(s, c).length > 0
              );
            }),
          });
        },
      ),
    },
  };
})();

// Ganked!
export const ganked: CardDef = {
  title: "Ganked!",
  flags: { "rd-reveal": req(() => true) },
  "on-access": {
    optional: {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          !coreCard.inDiscard(card),
      ),
      "waiting-prompt": true,
      prompt: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `Trash ${card.title} to force the Runner to encounter a piece of ice?`,
      ),
      "yes-ability": {
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const installed = coreBoard.allActiveInstalled(state, ":corp") || [];
          const hasIce = installed.some(
            (c: Card) =>
              coreCard.ice(c) &&
              coreCard.rezzed(c) &&
              coreServers.protectingSameServer(card, c),
          );
          if (hasIce) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  {
                    async: true,
                    choices: {
                      req: req(
                        (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                          const t = ts[0];
                          return (
                            t &&
                            coreCard.ice(t) &&
                            coreCard.installed(t) &&
                            coreCard.rezzed(t) &&
                            coreServers.protectingSameServer(c, t)
                          );
                        },
                      ),
                    },
                    msg: msg(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                        `force the Runner to encounter ${coreToString.cardStr(s, ts[0])}`,
                    ),
                    effect: effect(function* (
                      s: State,
                      sd: Side,
                      e: EID,
                      c: Card,
                      ts: any[],
                    ): Generator<any, any, any> {
                      const targetCard: any = ts[0];
                      coreEngine.registerEvents(c, [
                        {
                          event: ":post-access-card",
                          duration: ":end-of-run",
                          "unregister-once-resolved": true,
                          async: true,
                          effect: effect(
                            (
                              s2: State,
                              sd2: Side,
                              e2: EID,
                              c2: Card,
                              ts2: any[],
                            ) => {
                              coreRuns.forceIceEncounter(
                                s2,
                                sd2,
                                e2,
                                targetCard,
                              );
                            },
                          ),
                        },
                      ]);
                      yield wait_for(
                        s,
                        [
                          { asyncResult: "result" },
                          coreMoving.trash(
                            s,
                            sd,
                            e,
                            { ...c, seen: true },
                            { unpreventable: true, causeCard: c },
                          ),
                        ],
                        [],
                      );
                    }),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          } else {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  {
                    async: true,
                    msg: "trash itself",
                    effect: effect(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        coreMoving.trash(
                          s,
                          sd,
                          e,
                          { ...c, seen: true },
                          { unpreventable: true, causeCard: c },
                        );
                      },
                    ),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          }
        }),
      },
      "no-ability": {
        effect: effect(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            coreSay.systemMsg(state, side, `declines to use ${card.title}`);
          },
        ),
      },
    },
  },
};

// Mercia B4LL4RD
export const merciaB4ll4Rd: CardDef = {
  title: "Mercia B4LL4RD",
  events: [
    {
      event: ":corp-action-phase-ends",
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          ((state as any).corp?.hand?.length ?? 0) > 0,
      ),
      prompt: "Install an ice, paying 1 [Credits] less",
      "waiting-prompt": true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target: any = targets[0];
        const movedCard: any = yield wait_for(
          state,
          [
            { asyncResult: "result" },
            (coreInstalling as any).corpInstall?.(
              state,
              side,
              coreEid.makeEid(state, eid),
              target,
              null,
              { "cost-bonus": -1, "msg-keys": { "install-source": card } },
            ),
          ],
          [],
        );
        (coreHandSize as any).updateHandSize?.(state, ":corp");
        if (movedCard) {
          const targetServer = (movedCard.zone as string[] | undefined)?.[1];
          const targetZone = ["servers", targetServer, "content"];
          const targetName = coreServers.zoneToName(targetServer);
          if (!coreServers.sameServer(movedCard, card)) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                continue_ability(
                  state,
                  side,
                  {
                    msg: `move itself to ${targetName}`,
                    effect: effect(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        coreEngine.unregisterEvents(c);
                        const moved = (coreMoving as any).move(
                          s,
                          sd,
                          c,
                          targetZone,
                        );
                        coreEngine.registerDefaultEvents(s, sd, moved);
                      },
                    ),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          } else {
            coreEffects.effectCompleted(state, side, eid);
          }
        } else {
          coreEffects.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Mwanza City Grid
export const mwanzaCityGrid: CardDef = (() => {
  const mwanzaGainCreds: any = {
    event: ":end-breach-server",
    duration: ":end-of-run",
    silent: req(() => true),
    async: true,
    "unregister-once-resolved": true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const ctx = targets[0];
      const accessedMap = ctx?.["cards-accessed"] || {};
      const totalAccessed = (Object.values(accessedMap) as number[]).reduce(
        (a, b) => a + b,
        0,
      );
      if (totalAccessed > 0) {
        coreSay.systemMsg(
          state,
          ":corp",
          `gains ${2 * totalAccessed} [Credits] from ${card.title}`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, 2 * totalAccessed),
          ],
          [],
        );
      } else {
        coreEffects.effectCompleted(state, side, eid);
      }
    }),
  };
  const unboostAccess = (bonusServer: string): any => ({
    event: ":end-breach-server",
    duration: ":end-of-run",
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.["from-server"] === bonusServer,
    ),
    "unregister-once-resolved": true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreAccess as any).accessBonus?.(state, ":runner", bonusServer, -3);
      },
    ),
  });
  const boostAccessWhenTrashed = (bonusServer: string): any => ({
    event: ":breach-server",
    duration: ":end-of-run",
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        targets[0]?.server === bonusServer,
    ),
    msg: "force the runner to access 3 additional cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        (coreAccess as any).accessBonus?.(state, ":runner", bonusServer, 3);
        coreEngine.registerEvents(card, [
          mwanzaGainCreds,
          unboostAccess(bonusServer),
        ]);
      },
    ),
  });
  const boostAccessBy3: any = {
    event: ":breach-server",
    req: req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const zone = coreCard.getZone(card) as string[] | undefined;
        return targets[0]?.server === zone?.[1];
      },
    ),
    msg: "force the Runner to access 3 additional cards",
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const zone = coreCard.getZone(card) as string[] | undefined;
        const bonusServer = zone?.[1];
        if (bonusServer) {
          (coreAccess as any).accessBonus?.(state, ":runner", bonusServer, 3);
          coreEngine.registerEvents(card, [
            mwanzaGainCreds,
            unboostAccess(bonusServer),
          ]);
        }
      },
    ),
  };
  return {
    title: "Mwanza City Grid",
    "install-req": req(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (targets as any[]).filter((t: any) => t === "HQ" || t === "R&D"),
    ),
    events: [boostAccessBy3],
    "on-trash": {
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          side === ":runner" && !!forms.run(state),
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const prev = (card as any).previousZone as string[] | undefined;
          const bonusServer = prev?.[1];
          if (bonusServer) {
            coreEngine.registerEvents(card, [
              boostAccessWhenTrashed(bonusServer),
            ]);
          }
        },
      ),
    },
  };
})();

// Nihongai Grid
export const nihongaiGrid: CardDef = {
  title: "Nihongai Grid",
  events: [
    {
      event: ":successful-run",
      interactive: req(() => true),
      skippable: true,
      optional: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            if (!forms.thisServer(state, card)) return false;
            const runnerCreds =
              (corePayment as any).totalAvailableCredits?.(
                state,
                ":runner",
                eid,
                card,
              ) ?? 0;
            const runnerHand = (state as any).runner?.hand?.length ?? 0;
            const corpHand = (state as any).corp?.hand || [];
            const top5 = ((state as any).corp?.deck || []).slice(0, 5);
            return (
              (runnerCreds < 6 || runnerHand < 2) &&
              corpHand.length > 0 &&
              top5.length > 0
            );
          },
        ),
        prompt: "Look at the top 5 cards of R&D?",
        "yes-ability": {
          async: true,
          msg: "look at the top 5 cards of R&D",
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
                continue_ability(
                  state,
                  side,
                  {
                    async: true,
                    prompt: "Choose a card in R&D",
                    choices: req(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                        ((s as any).corp?.deck || []).slice(0, 5),
                    ),
                    effect: effect(
                      (s: State, sd: Side, e: EID, c: Card, ts: any[]) => {
                        const rdc: any = ts[0];
                        if (rdc) {
                          continue_ability(
                            s,
                            sd,
                            {
                              prompt: "Choose a card in HQ",
                              choices: {
                                card: (cc: Card) => coreCard.inHand(cc),
                              },
                              msg: "swap a card from the top 5 of R&D with a card in HQ",
                              effect: effect(
                                (
                                  s2: State,
                                  sd2: Side,
                                  e2: EID,
                                  c2: Card,
                                  ts2: any[],
                                ) => {
                                  const hq: any = ts2[0];
                                  (coreMoving as any).move(
                                    s2,
                                    sd2,
                                    rdc,
                                    "hand",
                                  );
                                  (coreMoving as any).move(
                                    s2,
                                    sd2,
                                    hq,
                                    "deck",
                                    { index: rdc?.index },
                                  );
                                },
                              ),
                            },
                            c,
                            null,
                          );
                        }
                      },
                    ),
                  },
                  card,
                  null,
                ),
              ],
              [],
            );
          }),
        },
      },
    },
  ],
};

// Overseer Matrix
export const overseerMatrix: CardDef = (() => {
  const ability: any = {
    event: ":runner-trash",
    "once-per-instance": true,
    interactive: req(() => true),
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (targets as any[]).some(
        (t: any) =>
          coreCard.corp(t?.card) &&
          (coreServers.inSameServer(card, t.card) ||
            coreServers.fromSameServer(card, t.card)),
      ),
    ),
    "waiting-prompt": true,
    prompt: "How many credits do you want to pay?",
    choices: {
      number: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const prev = (card as any).previousZone;
          const matches = (targets as any[]).filter(
            (t: any) =>
              coreServers.inSameServer(card, t?.card) ||
              coreServers.fromSameServer(card, t?.card) ||
              coreServers.inSameServer({ ...card, zone: prev } as any, t?.card),
          );
          const totalCreds =
            (corePayment as any).totalAvailableCredits?.(
              state,
              ":corp",
              eid,
              card,
            ) ?? 0;
          return Math.min(matches.length, totalCreds);
        },
      ),
    },
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const n: number = (targets as any[])?.[0] ?? 0;
        continue_ability(
          state,
          side,
          {
            ...coreDefHelpers.giveTags(n),
            cost: [corePayment.toC("credit", n)],
          } as any,
          card,
          null,
        );
      },
    ),
  };
  return {
    title: "Overseer Matrix",
    "on-trash": {
      silent: req(() => true),
      req: req(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          side === ":runner",
      ),
      effect: effect(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          if (forms.run(state)) {
            coreEngine.registerEvents(card, [
              { ...ability, duration: ":end-of-run" },
            ]);
          }
        },
      ),
    },
    events: [ability],
  };
})();

// Surat City Grid
export const suratCityGrid: CardDef = {
  title: "Surat City Grid",
  events: [
    {
      event: ":rez",
      interactive: req(() => true),
      optional: {
        req: req(
          (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const ctx = targets[0];
            const t = ctx?.card;
            if (
              !t ||
              !coreServers.sameServer(card, t) ||
              coreCard.sameCard(t, card)
            )
              return false;
            const installed = coreBoard.allInstalled(state, ":corp") || [];
            return installed.some(
              (c: Card) =>
                !coreCard.rezzed(c) &&
                !coreCard.agenda(c) &&
                coreCard.corp(c) &&
                coreRezzing.canPayToRez(
                  state,
                  side,
                  { ...eid, source: card },
                  c,
                  { "cost-bonus": -2 },
                ),
            );
          },
        ),
        prompt: "Rez another card paying 2 [Credits] less?",
        "yes-ability": {
          prompt: "Choose a card to rez",
          choices: {
            req: req(
              (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ) => {
                const t = targets[0];
                return (
                  t &&
                  !coreCard.rezzed(t) &&
                  !coreCard.agenda(t) &&
                  coreCard.corp(t) &&
                  coreCard.installed(t) &&
                  coreRezzing.canPayToRez(
                    state,
                    side,
                    { ...eid, source: card },
                    t,
                    { "cost-bonus": -2 },
                  )
                );
              },
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
              coreRezzing.rez(
                state,
                side,
                { ...eid, source: card },
                targets[0],
                { "cost-bonus": -2 },
              );
            },
          ),
        },
      },
    },
  ],
};
