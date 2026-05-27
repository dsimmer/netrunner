//
import type { Card, CardDef, EID, Server, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreActions from "../core/actions";
import * as coreAgendas from "../core/agendas";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCardDefs from "../core/card_defs";
import * as coreCheckpoint from "../core/checkpoint";
import * as coreChooseOne from "../core/choose_one";
import * as coreCostFns from "../core/cost_fns";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpend from "../core/expend";
import * as coreExpose from "../core/expose";
import * as coreFinding from "../core/finding";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreHosting from "../core/hosting";
import * as coreIce from "../core/ice";
import * as coreInitializing from "../core/initializing";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMoving from "../core/moving";
import * as coreOptional from "../core/optional";
import * as corePayment from "../core/payment";
import * as corePrevention from "../core/prevention";
import * as coreProps from "../core/props";
import * as corePrompts from "../core/prompts";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreSetAside from "../core/set_aside";
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as coreWinning from "../core/winning";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import {
  advanceAmbush,
  executiveTrashEffect,
  gainPowerCounter,
} from "./assets_1";

// Calvin B4L3Y
export const calvinB4L3Y: CardDef = {
  title: "Calvin B4L3Y",
  abilities: [
    coreDefHelpers.drawAbi(2, null, {
      action: true,
      cost: [corePayment.toC("click", 1)],
      once: ":per-turn",
    }),
  ],
  "on-trash": {
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
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return side === ":runner";
      }),
      "waiting-prompt": true,
      prompt: "Draw 2 cards?",
      "yes-ability": coreDefHelpers.drawAbi(2),
    },
  },
};

// Capital Investors
export const capitalInvestors: CardDef = {
  title: "Capital Investors",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1)],
      msg: "gain 2 [Credits]",
      "keep-menu-open": ":while-clicks-left",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, side, eid, 2),
          ],
          [],
        );
      }),
    },
  ],
};

// Cerebral Overwriter
export const cerebralOverwriter: CardDef = {
  title: "Cerebral Overwriter",
  ...advanceAmbush(3, {
    async: true,
    "waiting-prompt": true,
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        coreCard.getCounters(coreCard.getCard(state, card), ":advancement") > 0
      );
    }),
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card) =>
        `do ${coreCard.getCounters(coreCard.getCard(state, card), ":advancement")} core damage`,
    ),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const n = coreCard.getCounters(
        coreCard.getCard(state, card),
        ":advancement",
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreDamage.damage(state, side, eid, ":brain", n, { card }),
        ],
        [],
      );
    }),
  }),
};

// Chairman Hiro
export const chairmanHiro: CardDef = {
  title: "Chairman Hiro",
  "static-abilities": [coreHandSize.runnerHandSizePlus(-2)],
  "on-trash": executiveTrashEffect,
};

// Charlotte Caçador
export const charlotteCacador: CardDef = (() => {
  const choiceAbi: any = {
    label: "Gain 4 [Credits] and draw 1 card",
    optional: {
      once: ":per-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          coreCard.getCounters(card, ":advancement") > 0 &&
          !!(state as any).corpPhase12
        );
      }),
      prompt:
        "Remove 1 hosted advancement counter to gain 4 [Credits] and draw 1 card?",
      "yes-ability": {
        msg: "remove 1 hosted advancement counter from itself to gain 4 [Credits] and draw 1 card",
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreProps.addProp(
                state,
                ":corp",
                card,
                ":advance-counter",
                -1,
                null,
              ),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, side, 4),
            ],
            [],
          );
          yield wait_for(
            state,
            [{ asyncResult: "result" }, coreDrawing.draw(state, side, eid, 1)],
            [],
          );
        }),
      },
    },
  };
  const queueAbility: any = {
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    skippable: true,
    event: ":corp-turn-begins",
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        !coreEngine.usedOnce(state, { once: ":per-turn" }, card) &&
        !!(state as any).corpPhase12
      );
    }),
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(state, side, choiceAbi, card, null),
        ],
        [],
      );
    }),
  };
  const trashAb: any = {
    cost: [corePayment.toC("advancement", 1), corePayment.toC("trash-can", 1)],
    label: "Gain 3 [Credits]",
    msg: "gain 3 [Credits]",
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, ":corp", eid, 3),
        ],
        [],
      );
    }),
  };
  return {
    title: "Charlotte Caçador",
    advanceable: ":always",
    flags: {
      "corp-phase-12": req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
    },
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [queueAbility],
    abilities: [choiceAbi, trashAb],
  };
})();

// Chekist Scion
export const chekistScion: CardDef = {
  title: "Chekist Scion",
  ...advanceAmbush(0, {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card) =>
        `give the Runner ${utils.quantify(1 + coreCard.getCounters(coreCard.getCard(state, card), ":advancement"), "tag")}`,
    ),
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const n =
        1 + coreCard.getCounters(coreCard.getCard(state, card), ":advancement");
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreTags.gainTags(state, ":corp", eid, n)],
        [],
      );
    }),
  }),
};

// Chief Slee
export const chiefSlee: CardDef = {
  title: "Chief Slee",
  events: [
    {
      event: ":end-of-encounter",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        return (
          (ctx.ice?.subroutines || []).filter((s: any) => !s.broken).length > 0
        );
      }),
      msg: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        const n = (ctx.ice?.subroutines || []).filter(
          (s: any) => !s.broken,
        ).length;
        return `place ${utils.quantify(n, "power counter")} on itself`;
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        const n = (ctx.ice?.subroutines || []).filter(
          (s: any) => !s.broken,
        ).length;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreProps.addCounter(state, ":corp", eid, card, ":power", n, null),
          ],
          [],
        );
      }),
    },
  ],
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("power", 5)],
      "keep-menu-open": ":while-5-power-tokens-left",
      async: true,
      msg: "do 5 meat damage",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":meat", 5, { card }),
          ],
          [],
        );
      }),
    },
  ],
};

// City Surveillance
export const citySurveillance: CardDef = {
  title: "City Surveillance",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  flags: {
    "runner-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  events: [
    {
      event: ":runner-turn-begins",
      player: ":runner",
      prompt: "Choose one",
      "waiting-prompt": true,
      choices: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const opts: string[] = [];
        if (
          corePayment.canPay(state, ":runner", eid, card, null, [
            corePayment.toC("credit", 1),
          ])
        ) {
          opts.push("Pay 1 [Credits]");
        }
        opts.push("Take 1 tag");
        return opts;
      }),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          targets[0] === "Take 1 tag"
            ? "give the runner 1 tag"
            : `force the runner to ${utils.decapitalize(targets[0] || "")}`,
      ),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Pay 1 [Credits]") {
          const result: any = yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.pay(
                state,
                ":runner",
                coreEid.makeEid(state, eid),
                card,
                corePayment.toC("credit", 1),
              ),
            ],
            [],
          );
          coreSay.systemMsg(state, ":runner", result?.msg || "");
          coreEid.effectCompleted(state, side, eid);
        } else {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreTags.gainTags(state, ":corp", eid, 1),
            ],
            [],
          );
        }
      }),
    },
  ],
};

// Clearinghouse
export const clearinghouse: CardDef = (() => {
  const ability: any = {
    once: ":per-turn",
    async: true,
    label:
      "Trash this asset to do 1 meat damage for each hosted advancement counter (start of turn)",
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    req: req(function* (state: State): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(
            state,
            side,
            {
              optional: {
                prompt: msg(
                  (s: State, sd: Side, e: EID, c: Card) =>
                    `Trash this asset to do ${coreCard.getCounters(c, ":advancement")} meat damage?`,
                ),
                "yes-ability": {
                  async: true,
                  msg: "do 1 meat damage for each hosted advancement counter",
                  effect: req(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                  ): Generator<any, any, any> {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreMoving.trash(s, sd, e, c, { causeCard: c }),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreDamage.damage(
                          s,
                          sd,
                          e,
                          ":meat",
                          coreCard.getCounters(c, ":advancement"),
                          { card: c },
                        ),
                      ],
                      [],
                    );
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
    }),
  };
  return {
    title: "Clearinghouse",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    flags: {
      "corp-phase-12": req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
    },
    events: [{ ...ability, event: ":corp-turn-begins" }],
    advanceable: ":always",
    abilities: [ability],
  };
})();

// Clone Suffrage Movement
export const cloneSuffrageMovement: CardDef = {
  title: "Clone Suffrage Movement",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  flags: {
    "corp-phase-12": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        (state as any).corp?.discard?.some((c: Card) =>
          coreCard.operation(c),
        ) && coreFlags.unprotected(state, side, card)
      );
    }),
  },
  abilities: [
    {
      ...coreDefHelpers.corpRecur((c: Card) => coreCard.operation(c)),
      label: "Add 1 operation from Archives to HQ",
      "waiting-prompt": true,
      prompt: "Choose an operation in Archives to add to HQ",
      once: ":per-turn",
    },
  ],
};

// Cohort Guidance Program
export const cohortGuidanceProgram: CardDef = {
  title: "Cohort Guidance Program",
  flags: {
    "corp-phase-12": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "derezzed-events": [coreDefHelpers.corpRezToast],
  events: [
    {
      event: ":corp-turn-begins",
      skippable: true,
      prompt: "Choose one",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      choices: req(function* (state: State): Generator<any, any, any> {
        const opts: string[] = [];
        if ((state as any).corp?.hand?.length) {
          opts.push("Trash 1 card from HQ to gain 2 [Credits] and draw 1 card");
        }
        if (
          ((state as any).corp?.discard || []).some(
            (c: Card) => !(c as any).seen,
          )
        ) {
          opts.push(
            "Turn 1 facedown card in Archives faceup to place 1 advancement counter on an installed card",
          );
        }
        opts.push("Done");
        return opts;
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const choice = targets[0];
        if (choice === "Done") {
          coreEid.effectCompleted(state, side, eid);
        } else if (
          choice === "Trash 1 card from HQ to gain 2 [Credits] and draw 1 card"
        ) {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                state,
                side,
                {
                  prompt: "Choose a card to trash",
                  msg: "trash a card from HQ to gain 2 [Credits] and draw 1 card",
                  choices: {
                    max: 1,
                    all: true,
                    card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
                  },
                  async: true,
                  effect: req(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                    t: any[],
                  ): Generator<any, any, any> {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreMoving.trashCards(s, sd, e, t, { causeCard: c }),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreGaining.gainCredits(s, sd, e, 2),
                      ],
                      [],
                    );
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreDrawing.draw(s, sd, e, 1),
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
              coreEngine.resolveAbility(
                state,
                side,
                {
                  prompt: "Choose a card to turn faceup",
                  choices: {
                    card: (c: Card) =>
                      coreCard.inDiscard(c) &&
                      coreCard.corp(c) &&
                      !(c as any).seen,
                  },
                  msg: msg(
                    (s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                      `turn ${(t[0] as any)?.title} in Archives faceup`,
                  ),
                  "show-discard": true,
                  async: true,
                  effect: req(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                    t: any[],
                  ): Generator<any, any, any> {
                    coreUpdate.update(s, sd, { ...t[0], seen: true });
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreEngine.resolveAbility(
                          s,
                          sd,
                          {
                            prompt: "Choose an installed card",
                            choices: {
                              card: (ic: Card) =>
                                coreCard.corp(ic) && coreCard.installed(ic),
                            },
                            msg: msg(
                              (ss: State) =>
                                `place 1 advancement counter on ${coreToString.cardStr(ss, t[0])}`,
                            ),
                            async: true,
                            effect: effect(function* (
                              ss: State,
                              ssd: Side,
                              ee: EID,
                              cc: Card,
                              tt: any[],
                            ): Generator<any, any, any> {
                              yield wait_for(
                                ss,
                                [
                                  { asyncResult: "result" },
                                  coreProps.addProp(
                                    ss,
                                    ssd,
                                    ee,
                                    tt[0],
                                    ":advance-counter",
                                    1,
                                    { placed: true },
                                  ),
                                ],
                                [],
                              );
                            }),
                          },
                          c,
                          null,
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
        }
      }),
    },
  ],
};

// Commercial Bankers Group
export const commercialBankersGroup: CardDef = (() => {
  const ability: any = {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return coreFlags.unprotected(state, side, card);
    }),
    automatic: ":gain-credits",
    label: "Gain 3 [Credits] (start of turn)",
    once: ":per-turn",
    msg: "gain 3 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, side, eid, 3),
        ],
        [],
      );
    }),
  };
  return {
    title: "Commercial Bankers Group",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// Constellation Protocol
export const constellationProtocol: CardDef = {
  title: "Constellation Protocol",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  flags: {
    "corp-phase-12": req(function* (state: State): Generator<any, any, any> {
      const installed = coreBoard.allInstalled(state, ":corp") || [];
      const iceWithTokens = installed.filter(
        (c: Card) =>
          coreCard.ice(c) && coreCard.getCounters(c, ":advancement") > 0,
      );
      const advanceable = installed.filter(
        (c: Card) => coreCard.ice(c) && coreCard.canBeAdvanced(state, c),
      );
      if (!iceWithTokens.length) return false;
      const aTokenTitle = (iceWithTokens[0] as any)?.title;
      const others = advanceable.filter(
        (c: Card) => (c as any)?.title !== aTokenTitle,
      );
      return others.length > 0;
    }),
  },
  abilities: [
    {
      label: "Move an advancement counter between 2 pieces of ice",
      once: ":per-turn",
      "waiting-prompt": true,
      choices: {
        card: (c: Card) =>
          coreCard.ice(c) && coreCard.getCounters(c, ":advancement") > 0,
      },
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const fromIce = targets[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                prompt: "Choose a piece of ice that can be advanced",
                choices: {
                  req: req(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                    t: any[],
                  ): Generator<any, any, any> {
                    return (
                      coreCard.ice(t[0]) &&
                      !coreCard.sameCard(fromIce, t[0]) &&
                      coreCard.canBeAdvanced(s, t[0])
                    );
                  }),
                },
                msg: msg(
                  (s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                    `move an advancement counter from ${coreToString.cardStr(s, fromIce)} to ${coreToString.cardStr(s, t[0])}`,
                ),
                async: true,
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreProps.addProp(
                        s,
                        ":corp",
                        t[0],
                        ":advance-counter",
                        1,
                        { placed: true },
                      ),
                    ],
                    [],
                  );
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreProps.addProp(
                        s,
                        ":corp",
                        e,
                        fromIce,
                        ":advance-counter",
                        -1,
                        null,
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
      }),
    },
  ],
};

// Contract Killer
export const contractKiller: CardDef = {
  title: "Contract Killer",
  advanceable: ":always",
  abilities: [
    {
      action: true,
      label: "Trash a connection",
      async: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("trash-can", 1)],
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.getCounters(card, ":advancement") >= 2;
      }),
      choices: { card: (c: Card) => coreCard.hasSubtype(c, "Connection") },
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `trash ${(targets[0] as any)?.title}`,
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
            coreMoving.trash(state, side, eid, targets[0], { causeCard: card }),
          ],
          [],
        );
      }),
    },
    {
      action: true,
      label: "Do 2 meat damage",
      async: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("trash-can", 1)],
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.getCounters(card, ":advancement") >= 2;
      }),
      msg: "do 2 meat damage",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":meat", 2, { card }),
          ],
          [],
        );
      }),
    },
  ],
};

// Corporate Town
export const corporateTown: CardDef = (() => {
  const ability: any = {
    label: "Trash a resource",
    once: ":per-turn",
    async: true,
    prompt: "Choose a resource to trash",
    choices: { card: (c: Card) => coreCard.resource(c) },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${(targets[0] as any)?.title}`,
    ),
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    req: req(function* (state: State): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, ":runner") || []).some((c: Card) =>
        coreCard.resource(c),
      );
    }),
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
          coreMoving.trash(state, side, eid, targets[0], {
            unpreventable: true,
            causeCard: card,
          }),
        ],
        [],
      );
    }),
  };
  return {
    title: "Corporate Town",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    "additional-cost": [corePayment.toC("forfeit", 1)],
    flags: {
      "corp-phase-12": req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          coreCard.rezzed(card) &&
          (coreBoard.allActiveInstalled(state, ":runner") || []).filter(
            (c: Card) => coreCard.resource(c),
          ).length > 0
        );
      }),
    },
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// CPC Generator
export const cpcGenerator: CardDef = {
  title: "CPC Generator",
  events: [
    {
      event: ":runner-credit-gain",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        const isClickCredit = ctx.action === ":runner-click-credit";
        return (
          isClickCredit &&
          coreEvents.firstEvent(
            state,
            side,
            ":runner-credit-gain",
            (t: any[]) => (t[0] || {}).action === ":runner-click-credit",
          )
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, 1),
          ],
          [],
        );
      }),
    },
  ],
};

// CSR Campaign
export const csrCampaign: CardDef = (() => {
  const ability: any = {
    once: ":per-turn",
    async: true,
    label: "Draw 1 card (start of turn)",
    automatic: ":draw-cards",
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(
            state,
            side,
            {
              optional: {
                prompt: "Draw 1 card?",
                autoresolve: coreOptional.getAutoresolve(":auto-fire"),
                "yes-ability": coreDefHelpers.drawAbi(1),
              },
            },
            card,
            null,
          ),
        ],
        [],
      );
    }),
  };
  return {
    title: "CSR Campaign",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    flags: {
      "corp-phase-12": req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
    },
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [
      ability,
      coreOptional.setAutoresolve(":auto-fire", "CSR Campaign"),
    ],
  };
})();

// Cybernetics Court
export const cyberneticsCourt: CardDef = {
  title: "Cybernetics Court",
  "static-abilities": [coreHandSize.corpHandSizePlus(4)],
};

// Cybersand Harvester
export const cybersandHarvester: CardDef = {
  title: "Cybersand Harvester",
  events: [
    {
      event: ":rez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreCard.ice((targets as any)[0]?.card);
      }),
      msg: "place 2 [Credits] on itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreProps.addCounter(state, ":corp", eid, card, ":credit", 2, null),
          ],
          [],
        );
      }),
    },
  ],
  abilities: [
    {
      label: "Take all hosted credits",
      cost: [corePayment.toC("trash-can", 1)],
      "change-in-game-state": {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return coreCard.getCounters(card, ":credit") > 0;
        }),
      },
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card) =>
          `gain ${coreCard.getCounters(card, ":credit")} [Credits]`,
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(
              state,
              side,
              eid,
              coreCard.getCounters(card, ":credit"),
            ),
          ],
          [],
        );
      }),
    },
    {
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDefHelpers.spendCredits(state, side, eid, card, ":credit", 1),
          ],
          [],
        );
      }),
      label: "Take 1 hosted [Credits] (manual)",
      msg: "take 1 hosted [Credits]",
    },
  ],
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
      ): Generator<any, any, any> {
        return (eid as any)?.sourceType === ":corp-install";
      }),
      type: ":credit",
    },
  },
};

// Daily Business Show
export const dailyBusinessShow: CardDef = {
  title: "Daily Business Show",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  events: [
    coreDrawing.firstTimeDrawBonus(":corp", 1),
    {
      event: ":corp-draw",
      req: req(function* (state: State, side: Side): Generator<any, any, any> {
        return coreEvents.firstEvent(state, side, ":corp-draw");
      }),
      once: ":per-turn",
      "once-key": ":daily-business-show-put-bottom",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
      ): Generator<any, any, any> {
        return true;
      }),
      silent: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const dbs = (coreBoard.allInstalled(state, ":corp") || []).filter(
          (c: Card) =>
            (c as any)?.title === "Daily Business Show" && coreCard.rezzed(c),
        );
        return card !== dbs[0];
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const dbs = (coreBoard.allInstalled(state, ":corp") || []).filter(
          (c: Card) =>
            (c as any)?.title === "Daily Business Show" && coreCard.rezzed(c),
        );
        const drawn = (state as any).corpCurrentlyDrawing || [];
        if (!drawn.length) return coreEid.effectCompleted(state, side, eid);
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                "waiting-prompt": true,
                prompt: `Choose ${utils.quantify(dbs.length, "card")} to add to the bottom of R&D`,
                choices: {
                  max: Math.min(dbs.length, drawn.length),
                  card: (c: Card) =>
                    drawn.some((d: Card) => coreCard.sameCard(d, c)),
                  all: true,
                },
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  for (const dc of [...t].reverse()) {
                    const idx = drawn.findIndex((d: Card) =>
                      coreCard.sameCard(d, dc),
                    );
                    coreSay.systemMsg(
                      s,
                      sd,
                      `uses ${(c as any)?.title} to add the ${utils.ordinal(idx + 1)} card drawn to the bottom of R&D`,
                    );
                    coreMoving.move(s, sd, dc, ":deck", null);
                    coreMoving.removeFromCurrentlyDrawing(s, sd, dc);
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

// Daily Quest
export const dailyQuest: CardDef = (() => {
  const ability: any = {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const zone = coreCard.getZone(card);
      const hostZone = coreCard.getZone((card as any).host);
      const serverKey = zone?.[1] || hostZone?.[1];
      const lastReg = (state as any).runner?.registerLast || {};
      return !(lastReg.successfulRun || []).includes(serverKey);
    }),
    label: "gain 3 [Credits] (start of turn)",
    automatic: ":gain-credits",
    msg: "gain 3 [Credits]",
    async: true,
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreGaining.gainCredits(state, ":corp", eid, 3),
        ],
        [],
      );
    }),
  };
  return {
    title: "Daily Quest",
    "rez-req": req(function* (state: State): Generator<any, any, any> {
      return state.activePlayer === ":corp";
    }),
    events: [
      {
        event: ":successful-run",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return !!(targets as any)[0]?.context?.thisServer;
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreSay.systemMsg(
            state,
            ":runner",
            "gains 2 [Credits] for a successful run on the Daily Quest server",
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, ":runner", eid, 2),
            ],
            [],
          );
        }),
      },
      { ...ability, event: ":corp-turn-begins" },
    ],
    abilities: [ability],
  };
})();

// Dedicated Response Team
export const dedicatedResponseTeam: CardDef = {
  title: "Dedicated Response Team",
  events: [
    {
      ...coreDefHelpers.doMeatDamage(2),
      event: ":run-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreFlags.tagged(state) && !!(targets as any)[0]?.successful;
      }),
    },
  ],
};

// Dedicated Server
export const dedicatedServer: CardDef = {
  title: "Dedicated Server",
  recurring: 2,
  interactions: {
    "pay-credits": {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (eid as any)?.sourceType === ":rez" && coreCard.ice(targets[0]);
      }),
      type: ":recurring",
    },
  },
};

// Director Haas
export const directorHaas: CardDef = {
  title: "Director Haas",
  "in-play": [":click-per-turn", 1],
  "on-trash": executiveTrashEffect,
};

// Docklands Crackdown
export const docklandsCrackdown: CardDef = {
  title: "Docklands Crackdown",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 2)],
      "keep-menu-open": ":while-2-clicks-left",
      msg: "place 1 power counter in itself",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreProps.addCounter(state, side, eid, card, ":power", 1, null),
          ],
          [],
        );
      }),
    },
  ],
  "static-abilities": [
    {
      type: ":install-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreCard.runner(targets[0]) &&
          coreEvents.noEvent(state, ":runner", ":runner-install")
        );
      }),
      value: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.getCounters(card, ":power");
      }),
    },
  ],
  events: [
    {
      event: ":runner-install",
      silent: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreCard.getCounters(card, ":power") > 0 &&
          coreEvents.noEvent(state, ":runner", ":runner-install")
        );
      }),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `increase the install cost of ${((targets as any)[0]?.card as any)?.title} by ${coreCard.getCounters(card, ":power")} [Credits]`,
      ),
    },
  ],
};

// Dr. Vientiane Keeling
export const drVientianeKeeling: CardDef = {
  title: "Dr. Vientiane Keeling",
  "static-abilities": [
    coreHandSize.runnerHandSizePlus(
      req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return -coreCard.getCounters(card, ":power");
      }),
    ),
  ],
  "on-rez": gainPowerCounter,
  events: [{ ...gainPowerCounter, event: ":corp-turn-begins" }],
};

// Drago Ivanov
export const dragoIvanov: CardDef = {
  title: "Drago Ivanov",
  advanceable: ":always",
  abilities: [
    {
      cost: [corePayment.toC("advancement", 2)],
      req: req(function* (state: State): Generator<any, any, any> {
        return state.activePlayer === ":corp";
      }),
      msg: "give the runner a tag",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreTags.gainTags(state, ":corp", eid, 1),
          ],
          [],
        );
      }),
    },
  ],
};

// Drudge Work
export const drudgeWork: CardDef = {
  title: "Drudge Work",
  data: { counter: { power: 3 } },
  events: [coreDefHelpers.trashOnEmpty(":power")],
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("power", 1)],
      choices: {
        card: (c: Card) =>
          coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
      },
      label: "Reveal an agenda from HQ or Archives",
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const t = targets[0] as any;
          const zoneName = coreServers.zoneToName(coreCard.getZone(t));
          const pts = coreCard.getAgendaPoints(t);
          return `reveal ${t?.title} from ${zoneName}, gain ${pts} [Credits], and shuffle it into R&D`;
        },
      ),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRevealing.reveal(state, side, t)],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(
              state,
              ":corp",
              eid,
              coreCard.getAgendaPoints(t),
            ),
          ],
          [],
        );
        coreMoving.move(state, ":corp", t, ":deck", null);
        coreShuffling.shuffle(state, ":corp", ":deck");
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

// Early Premiere
export const earlyPremiere: CardDef = {
  title: "Early Premiere",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  flags: {
    "corp-phase-12": req(function* (state: State): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, ":corp") || []).some(
        (c: Card) => coreCard.canBeAdvanced(state, c) && coreCard.inServer(c),
      );
    }),
  },
  abilities: [
    {
      cost: [corePayment.toC("credit", 1)],
      label:
        "Place 1 advancement counter on a card that can be advanced in a server",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            coreCard.canBeAdvanced(state, targets[0]) &&
            coreCard.installed(targets[0]) &&
            coreCard.inServer(targets[0])
          );
        }),
      },
      once: ":per-turn",
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`,
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
            coreProps.addProp(
              state,
              side,
              eid,
              targets[0],
              ":advance-counter",
              1,
              { placed: true },
            ),
          ],
          [],
        );
      }),
    },
  ],
};
