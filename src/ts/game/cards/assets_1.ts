//
import type { Card, CardDef, EID, Side, State } from "../../types";
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
// ============================================================================
// Helper functions
// ============================================================================

export function advanceAmbush(
  cost: number,
  ability: any,
  prompt?: string,
): any {
  const base = coreDefHelpers.installedAccessTrigger(cost, ability, prompt);
  return { ...base, advanceable: ":always" };
}

export function takeNCreditsStartOfTurn(
  n: number,
  counterType: string = ":credit",
): any {
  const numCounters = (card: Card) =>
    Math.min(n, coreCard.getCounters(card, counterType));
  return {
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card) =>
        `gain ${numCounters(card)} [Credits]`,
    ),
    once: ":per-turn",
    automatic: ":gain-credits",
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        !!(state as any).corpPhase12 &&
        coreCard.getCounters(card, counterType) > 0
      );
    }),
    label: `Gain ${n} [Credits] (start of turn)`,
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
          coreDefHelpers.takeCredits(state, side, eid, card, counterType, n),
        ],
        [],
      );
    }),
  };
}

export function campaign(
  counters: number,
  perTurn: number,
  counterType: string = ":credit",
): any {
  const ability = takeNCreditsStartOfTurn(perTurn, counterType);
  return {
    data: { counter: { [counterType.replace(":", "")]: counters } },
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [
      coreDefHelpers.trashOnEmpty(counterType),
      { ...ability, event: ":corp-turn-begins" },
    ],
    abilities: [ability],
  };
}

export function credsOnRoundStart(perTurn: number): any {
  const ability: any = {
    msg: `gain ${perTurn} [Credits]`,
    label: `Gain ${perTurn} [Credits] (start of turn)`,
    once: ":per-turn",
    async: true,
    automatic: ":gain-credits",
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
          coreGaining.gainCredits(state, side, eid, perTurn),
        ],
        [],
      );
    }),
  };
  return {
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
}

export const executiveTrashEffect: any = {
  "when-inactive": true,
  req: req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
    targets: any[],
  ): Generator<any, any, any> {
    return side === ":runner" && !!(targets as any)?.[0]?.accessed;
  }),
  msg: "add itself to the Runner's score area as an agenda worth 2 agenda points",
  effect: effect(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
  ): Generator<any, any, any> {
    coreMoving.asAgenda(state, ":runner", card, 2);
  }),
};

function returnToTop(setAsideCards: Card[], reveal: boolean = false): any {
  return {
    prompt: "Choose a card to put on top of R&D",
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return setAsideCards.length > 0;
    }),
    choices: {
      min: 1,
      max: 1,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return setAsideCards.some((c: Card) => coreCard.sameCard(c, t));
      }),
    },
    async: true,
    "waiting-prompt": true,
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const t = targets[0];
        return `place ${reveal ? (t as any)?.title : "a card"} on top of R&D`;
      },
    ),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const t = targets[0];
      coreMoving.move(state, ":corp", t, ":deck", { front: true });
      const rem = setAsideCards.filter((c: Card) => !coreCard.sameCard(c, t));
      if (rem.length > 0) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              returnToTop(rem, reveal),
              card,
              null,
            ),
          ],
          [],
        );
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

export const gainPowerCounter: any = {
  async: true,
  msg: "add 1 power counter to itself",
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
        coreProps.addCounter(state, side, eid, card, ":power", 1, {
          placed: true,
        }),
      ],
      [],
    );
  }),
};

// ============================================================================
// Card definitions
// ============================================================================

// Adonis Campaign
export const adonisCampaign: CardDef = {
  title: "Adonis Campaign",
  ...campaign(12, 3),
};

// Advanced Assembly Lines
export const advancedAssemblyLines: CardDef = {
  title: "Advanced Assembly Lines",
  "on-rez": {
    async: true,
    msg: "gain 3 [Credits]",
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
  },
  abilities: [
    {
      label: "Install a non-agenda card from HQ",
      async: true,
      prompt: "Choose a non-agenda card to install from HQ",
      "change-in-game-state": {
        req: req(function* (state: State): Generator<any, any, any> {
          return !!(state as any).corp?.hand?.length;
        }),
      },
      req: req(function* (state: State): Generator<any, any, any> {
        return !(state as any).run;
      }),
      choices: {
        card: (c: Card) =>
          coreCard.corpInstallableType(c) &&
          !coreCard.agenda(c) &&
          coreCard.inHand(c) &&
          coreCard.corp(c),
      },
      cost: [corePayment.toC("trash-can", 1)],
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
            coreInstalling.corpInstall(state, side, eid, targets[0], null, {
              msgKeys: { installSource: card, displayOrigin: true },
            }),
          ],
          [],
        );
      }),
    },
  ],
};

// Aggressive Secretary
export const aggressiveSecretary: CardDef = {
  title: "Aggressive Secretary",
  ...advanceAmbush(2, {
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
    "waiting-prompt": true,
    prompt: msg(
      (state: State, side: Side, eid: EID, card: Card) =>
        `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ":advancement"), "program")} to trash`,
    ),
    choices: {
      max: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.getCounters(
          coreCard.getCard(state, card),
          ":advancement",
        );
      }),
      card: (c: Card) => coreCard.installed(c) && coreCard.program(c),
    },
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${utils.enumerateCards(targets)}`,
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
          coreMoving.trashCards(state, side, eid, targets, { causeCard: card }),
        ],
        [],
      );
    }),
  }),
};

// Alexa Belsky
export const alexaBelsky: CardDef = {
  title: "Alexa Belsky",
  abilities: [
    {
      label: "Shuffle all cards in HQ into R&D",
      async: true,
      cost: [corePayment.toC("trash-can", 1)],
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
            coreEngine.resolveAbility(
              state,
              side,
              {
                "waiting-prompt": true,
                prompt: "How many credits do you want to pay?",
                choices: ":credit",
                player: ":runner",
                msg: msg(
                  (s: State, sd: Side, e: EID, c: Card, targets: any[]) => {
                    const paid = targets[0] || 0;
                    const hand = (s as any).corp?.hand || [];
                    const prevented = Math.floor(paid / 2);
                    const unprevented = Math.max(0, hand.length - prevented);
                    return `shuffle ${utils.quantify(unprevented, "card")} in HQ into R&D`;
                  },
                ),
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  const paid = targets[0] || 0;
                  const prevented = Math.floor(paid / 2);
                  const hand = (s as any).corp?.hand || [];
                  if (prevented > 0) {
                    const unprevented = hand.length - prevented;
                    const shuffled = [...hand]
                      .sort(() => Math.random() - 0.5)
                      .slice(0, Math.max(0, unprevented));
                    for (const hCard of shuffled) {
                      coreMoving.move(s, ":corp", hCard, ":deck", null);
                    }
                    if (shuffled.length > 0)
                      coreShuffling.shuffle(s, ":corp", ":deck");
                    coreSay.systemMsg(
                      s,
                      ":runner",
                      `pays ${paid} [Credits] to prevent ${utils.quantify(prevented, "random card")} in HQ from being shuffled into R&D`,
                    );
                  } else {
                    coreShuffling.shuffleIntoDeck(s, ":corp", ":hand");
                  }
                  coreEid.effectCompleted(s, sd, e);
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

// Alix T4LB07
export const alixT4LB07: CardDef = {
  title: "Alix T4LB07",
  events: [
    {
      event: ":corp-install",
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
  abilities: [
    {
      action: true,
      label: "Gain 2 [Credits] for each counter on Alix T4LB07",
      cost: [corePayment.toC("click", 1), corePayment.toC("trash-can", 1)],
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card) =>
          `gain ${2 * coreCard.getCounters(card, ":power")} [Credits]`,
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
              2 * coreCard.getCounters(card, ":power"),
            ),
          ],
          [],
        );
      }),
    },
  ],
};

// Allele Repression
export const alleleRepression: CardDef = {
  title: "Allele Repression",
  advanceable: ":always",
  abilities: [
    {
      label: "Swap 1 card in HQ and Archives for each advancement counter",
      cost: [corePayment.toC("trash-can", 1)],
      msg: msg((state: State, side: Side, eid: EID, card: Card) => {
        const corp = (state as any).corp;
        const total = Math.min(
          corp?.discard?.length || 0,
          corp?.hand?.length || 0,
          coreCard.getCounters(card, ":advancement"),
        );
        return `swap ${utils.quantify(total, "card")} in HQ and Archives`;
      }),
      async: true,
      "waiting-prompt": true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const corp = (state as any).corp;
        const total = Math.min(
          corp?.discard?.length || 0,
          corp?.hand?.length || 0,
          coreCard.getCounters(card, ":advancement"),
        );
        const hqCards: any[] = yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                async: true,
                prompt: `Choose ${utils.quantify(total, "card")} from HQ`,
                choices: {
                  card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
                  max: total,
                  all: true,
                },
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  coreEid.completeWithResult(s, sd, e, t);
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
        const archivesCards: any[] = yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                async: true,
                "show-discard": true,
                prompt: `Choose ${utils.quantify(total, "card")} from Archives`,
                choices: {
                  card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
                  max: total,
                  all: true,
                },
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  t: any[],
                ): Generator<any, any, any> {
                  coreEid.completeWithResult(s, sd, e, t);
                }),
              },
              card,
              null,
            ),
          ],
          [],
        );
        for (
          let i = 0;
          i < Math.min(hqCards.length, archivesCards.length);
          i++
        ) {
          coreMoving.swapCards(state, side, hqCards[i], archivesCards[i]);
        }
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

// Amani Senai
export const amaniSenai: CardDef = {
  title: "Amani Senai",
  events: [
    {
      event: ":agenda-scored",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
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
        const ctx = (targets as any)[0] || {};
        const agenda = ctx.card;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
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
                  prompt: "Initiate a trace?",
                  autoresolve: coreOptional.getAutoresolve(":auto-fire"),
                  "yes-ability": {
                    trace: {
                      base: coreCard.getAdvancementRequirement(agenda),
                      successful: {
                        choices: {
                          card: (c: Card) =>
                            coreCard.installed(c) && coreCard.runner(c),
                        },
                        label: "add 1 installed card to the grip",
                        msg: msg(
                          (s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                            `add ${(t[0] as any)?.title} to the grip`,
                        ),
                        effect: effect(function* (
                          s: State,
                          sd: Side,
                          e: EID,
                          c: Card,
                          t: any[],
                        ): Generator<any, any, any> {
                          coreMoving.move(s, ":runner", t[0], ":hand", null);
                        }),
                      },
                    },
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
    {
      event: ":agenda-stolen",
      interactive: req(function* (
        state: State,
        side?: Side,
        eid?: EID,
        card?: Card,
        targets?: any[],
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
        const ctx = (targets as any)[0] || {};
        const agenda = ctx.card;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
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
                  prompt: "Initiate a trace?",
                  autoresolve: coreOptional.getAutoresolve(":auto-fire"),
                  "yes-ability": {
                    trace: {
                      base: coreCard.getAdvancementRequirement(agenda),
                      successful: {
                        choices: {
                          card: (c: Card) =>
                            coreCard.installed(c) && coreCard.runner(c),
                        },
                        label: "add 1 installed card to the grip",
                        msg: msg(
                          (s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                            `add ${(t[0] as any)?.title} to the grip`,
                        ),
                        effect: effect(function* (
                          s: State,
                          sd: Side,
                          e: EID,
                          c: Card,
                          t: any[],
                        ): Generator<any, any, any> {
                          coreMoving.move(s, ":runner", t[0], ":hand", null);
                        }),
                      },
                    },
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
  abilities: [coreOptional.setAutoresolve(":auto-fire", "Amani Senai")],
};

// Anson Rose
export const ansonRose: CardDef = (() => {
  const ability: any = {
    label: "Place 1 advancement counter (start of turn)",
    once: ":per-turn",
    msg: "place 1 advancement counter on itself",
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
          coreProps.addProp(state, side, eid, card, ":advance-counter", 1, {
            placed: true,
          }),
        ],
        [],
      );
    }),
  };
  return {
    title: "Anson Rose",
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
    events: [
      { ...ability, event: ":corp-turn-begins" },
      {
        event: ":rez",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = (targets as any)[0] || {};
          return (
            coreCard.ice(ctx.card) &&
            coreCard.getCounters(card, ":advancement") > 0
          );
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
          const ice = coreCard.getCard(state, ctx.card);
          const iceName = (ice as any)?.title;
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                state,
                side,
                {
                  optional: {
                    "waiting-prompt": true,
                    prompt: `Move advancement counters to ${iceName}?`,
                    "yes-ability": {
                      prompt:
                        "How many advancement counters do you want to move?",
                      choices: {
                        number: req(function* (
                          s: State,
                          sd: Side,
                          e: EID,
                          c: Card,
                        ): Generator<any, any, any> {
                          return coreCard.getCounters(c, ":advancement");
                        }),
                      },
                      async: true,
                      effect: req(function* (
                        s: State,
                        sd: Side,
                        e: EID,
                        c: Card,
                        t: any[],
                      ): Generator<any, any, any> {
                        const n = t[0] || 0;
                        yield wait_for(
                          s,
                          [
                            { asyncResult: "result" },
                            coreProps.addProp(
                              s,
                              ":corp",
                              ice as Card,
                              ":advance-counter",
                              n,
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
                              c,
                              ":advance-counter",
                              -n,
                              { placed: true },
                            ),
                          ],
                          [],
                        );
                        coreSay.systemMsg(
                          s,
                          side,
                          `uses ${(c as any)?.title} to move ${utils.quantify(n, "advancement counter")} to ${coreToString.cardStr(s, ice as Card)}`,
                        );
                        coreEid.effectCompleted(s, sd, e);
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
      },
    ],
    abilities: [ability],
  };
})();

// Anthill Excavation Contract
export const anthillExcavationContract: CardDef = (() => {
  const ability: any = {
    once: ":per-turn",
    label: "Take 4 [Credits] and draw a card (start of turn)",
    req: req(function* (state: State): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card) =>
        `gain ${Math.min(4, coreCard.getCounters(card, ":credit"))} [Credits] and draw a card`,
    ),
    async: true,
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
          coreDrawing.draw(state, side, 1, { suppressCheckpoint: true }),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreDefHelpers.takeCredits(state, side, eid, card, ":credit", 4),
        ],
        [],
      );
    }),
  };
  return {
    title: "Anthill Excavation Contract",
    data: { counter: { credit: 8 } },
    flags: { "drip-economy": true },
    abilities: [ability],
    events: [
      { ...ability, event: ":corp-turn-begins" },
      coreDefHelpers.trashOnEmpty(":credit"),
    ],
  };
})();

// API-S Keeper Isobel
export const apiSKeeperIsobel: CardDef = {
  title: "API-S Keeper Isobel",
  flags: {
    "corp-phase-12": req(function* (state: State): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, ":corp") || []).some(
        (c: Card) => coreCard.getCounters(c, ":advancement") > 0,
      );
    }),
  },
  abilities: [
    {
      req: req(function* (state: State): Generator<any, any, any> {
        return (
          !!(state as any).corpPhase12 &&
          (coreBoard.allInstalled(state, ":corp") || []).some(
            (c: Card) => coreCard.getCounters(c, ":advancement") > 0,
          )
        );
      }),
      once: ":per-turn",
      label: "Remove an advancement counter (start of turn)",
      prompt: "Choose a card to remove an advancement counter from",
      choices: {
        card: (c: Card) =>
          coreCard.getCounters(c, ":advancement") > 0 && coreCard.installed(c),
      },
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target = targets[0];
        const cnt = coreCard.getCounters(target, ":advancement");
        coreProps.setProp(state, side, target, ":advance-counter", cnt - 1);
        coreSay.systemMsg(
          state,
          ":corp",
          `uses ${(card as any)?.title} to remove 1 advancement counter from ${coreToString.cardStr(state, target)} and gains 3 [Credits]`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, 3),
          ],
          [],
        );
      }),
    },
  ],
};

// Aryabhata Tech
export const aryabhataTech: CardDef = {
  title: "Aryabhata Tech",
  events: [
    {
      event: ":successful-trace",
      msg: "gain 1 [Credit] and force the Runner to lose 1 [Credit]",
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
            coreGaining.gainCredits(state, side, eid, 1),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.loseCredits(state, ":runner", eid, 1),
          ],
          [],
        );
      }),
    },
  ],
};

// B-1001
export const b1001: CardDef = {
  title: "B-1001",
  abilities: [
    {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !!(state as any).run &&
          (state as any).run?.server !== coreCard.getZone(card)?.[1]
        );
      }),
      async: true,
      cost: [corePayment.toC("tag", 1)],
      msg: "end the run",
      label: "End the run on another server",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRuns.endRun(state, side, eid, card)],
          [],
        );
      }),
    },
  ],
};

// Balanced Coverage
export const balancedCoverage: CardDef = (() => {
  const nameAbi: any = {
    prompt: "Choose a card type",
    "waiting-prompt": true,
    choices: ["Operation", "Asset", "Upgrade", "ICE", "Agenda"],
    async: true,
    msg: msg(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `choose ${targets[0]}`,
    ),
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      const namedType = targets[0];
      const topCard = (state as any).corp?.deck?.[0];
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreEngine.resolveAbility(
            state,
            side,
            {
              async: true,
              prompt: `The top card of R&D is: ${(topCard as any)?.title}`,
              "waiting-prompt": true,
              choices: ["OK"],
            },
            card,
            null,
          ),
        ],
        [],
      );
      if ((topCard as any)?.type === namedType) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                optional: {
                  prompt: "Reveal it to gain 2 [Credits]?",
                  "waiting-prompt": true,
                  "yes-ability": {
                    async: true,
                    msg: msg(
                      (s: State, sd: Side, e: EID, c: Card) =>
                        `reveal ${(topCard as any)?.title} from the top of R&D and gain 2 [Credits]`,
                    ),
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
                          coreRevealing.reveal(
                            s,
                            sd,
                            coreEid.makeEid(s, e),
                            topCard as Card,
                          ),
                        ],
                        [],
                      );
                      yield wait_for(
                        s,
                        [
                          { asyncResult: "result" },
                          coreGaining.gainCredits(s, ":corp", e, 2),
                        ],
                        [],
                      );
                    }),
                  },
                  "no-ability": {
                    effect: effect(function* (
                      s: State,
                      sd: Side,
                      e: EID,
                      c: Card,
                    ): Generator<any, any, any> {
                      coreSay.systemMsg(
                        s,
                        sd,
                        `declines to use ${(c as any)?.title} to reveal the top card of R&D`,
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
      } else {
        coreSay.systemMsg(
          state,
          side,
          `declines to use ${(card as any)?.title} to reveal the top card of R&D`,
        );
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  const ability: any = {
    label: "Look at the top card of R&D (start of turn)",
    once: ":per-turn",
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
          coreEngine.resolveAbility(state, side, nameAbi, card, null),
        ],
        [],
      );
    }),
  };
  return {
    title: "Balanced Coverage",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// Bass CH1R180G4
export const bassCH1R180G4: CardDef = {
  title: "Bass CH1R180G4",
  abilities: [
    {
      action: true,
      cost: [corePayment.toC("click", 1), corePayment.toC("trash-can", 1)],
      msg: "gain [Click][Click]",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        coreGaining.gainClicks(state, side, 2);
      }),
    },
  ],
};

// Behold!
export const behold: CardDef = {
  title: "Behold!",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "on-access": {
    optional: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return !coreCard.inDiscard(card);
      }),
      "waiting-prompt": true,
      prompt: msg(
        (state: State, side: Side, eid: EID, card: Card) =>
          `Pay 4 [Credits] to use ${(card as any)?.title} ability?`,
      ),
      "no-ability": {
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreSay.systemMsg(
            state,
            side,
            `declines to use ${(card as any)?.title}`,
          );
        }),
      },
      "yes-ability": {
        ...coreDefHelpers.giveTags(2),
        cost: [corePayment.toC("credit", 4)],
      },
    },
  },
};

// Bio-Ethics Association
export const bioEthicsAssociation: CardDef = (() => {
  const ability: any = {
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return coreFlags.unprotected(state, side, card);
    }),
    automatic: ":corp-damage",
    async: true,
    label: "Do 1 net damage (start of turn)",
    once: ":per-turn",
    msg: "do 1 net damage",
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
          coreDamage.damage(state, side, eid, ":net", 1, { card }),
        ],
        [],
      );
    }),
  };
  return {
    title: "Bio-Ethics Association",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// Bioroid Work Crew
export const bioraidWorkCrew: CardDef = {
  title: "Bioroid Work Crew",
  implementation: "Timing restriction of ability use not enforced",
  abilities: [
    {
      label: "Install 1 card, paying all costs",
      req: req(function* (state: State): Generator<any, any, any> {
        return state.activePlayer === ":corp";
      }),
      "change-in-game-state": {
        req: req(function* (state: State): Generator<any, any, any> {
          return !!(state as any).corp?.hand?.length;
        }),
      },
      prompt: "Choose a card in HQ to install",
      choices: {
        card: (c: Card) =>
          !coreCard.operation(c) && coreCard.inHand(c) && coreCard.corp(c),
      },
      cost: [corePayment.toC("trash-can", 1)],
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
            coreInstalling.corpInstall(state, side, eid, targets[0], null, {
              msgKeys: { installSource: card, displayOrigin: true },
            }),
          ],
          [],
        );
      }),
    },
  ],
};

// Blacklist
export const blacklist: CardDef = {
  title: "Blacklist",
  "on-rez": {
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      coreFlags.lockZone(state, (card as any).cid, ":runner", ":discard");
    }),
  },
  "leave-play": effect(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
  ): Generator<any, any, any> {
    coreFlags.releaseZone(state, (card as any).cid, ":runner", ":discard");
  }),
};

// Bladderwort
export const bladderwort: CardDef = (() => {
  const ability: any = {
    msg: "gain 1 [Credits]",
    label: "Gain 1 [Credits] (start of turn)",
    once: ":per-turn",
    automatic: ":pre-gain-credits",
    interactive: req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
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
          coreGaining.gainCredits(state, side, eid, 1),
        ],
        [],
      );
      if (((state as any).corp?.credit || 0) <= 4) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                msg: "do 1 net damage",
                async: true,
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                ): Generator<any, any, any> {
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreDamage.damage(s, sd, e, ":net", 1, { card: c }),
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
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: "Bladderwort",
    "derezzed-events": [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ":corp-turn-begins" }],
    abilities: [ability],
  };
})();

// Brain-Taping Warehouse
export const brainTapingWarehouse: CardDef = {
  title: "Brain-Taping Warehouse",
  "static-abilities": [
    {
      type: ":rez-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreCard.ice(targets[0]) && coreCard.hasSubtype(targets[0], "Bioroid")
        );
      }),
      value: req(function* (state: State): Generator<any, any, any> {
        return -((state as any).runner?.click || 0);
      }),
    },
  ],
};

// Breached Dome
export const breachedDome: CardDef = {
  title: "Breached Dome",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  poison: true,
  "on-access": {
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      const c = (state as any).runner?.deck?.[0];
      coreSay.systemMsg(
        state,
        ":corp",
        `uses ${(card as any)?.title} to do 1 meat damage and to trash ${(c as any)?.title} from the top of the stack`,
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreMoving.mill(state, ":corp", ":runner", 1),
        ],
        [],
      );
      yield wait_for(
        state,
        [
          { asyncResult: "result" },
          coreDamage.damage(state, side, eid, ":meat", 1, { card }),
        ],
        [],
      );
    }),
  },
};

// Broadcast Square
export const broadcastSquare: CardDef = {
  title: "Broadcast Square",
  prevention: [
    {
      prevents: ":bad-publicity",
      type: ":event",
      "max-uses": 1,
      mandatory: true,
      ability: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return corePrevention.preventable(targets[0]);
        }),
        trace: {
          base: 3,
          successful: {
            msg: "prevent all bad publicity",
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
                  corePrevention.preventBadPublicity(state, side, eid, "all"),
                ],
                [],
              );
            }),
          },
        },
      },
    },
  ],
};

// Byte!
export const byte: CardDef = {
  title: "Byte!",
  flags: {
    "rd-reveal": req(function* (
      state: State,
      side?: Side,
      eid?: EID,
      card?: Card,
      targets?: any[],
    ): Generator<any, any, any> {
      return true;
    }),
  },
  "on-access": {
    optional: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (
          !coreCard.inDiscard(card) &&
          corePayment.canPay(state, ":corp", eid, card, null, [
            corePayment.toC("credit", 4),
          ])
        );
      }),
      "waiting-prompt": true,
      prompt: msg(
        (state: State, side: Side, eid: EID, card: Card) =>
          `Pay 4 [Credits] to use ${(card as any)?.title} ability?`,
      ),
      "no-ability": {
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreSay.systemMsg(
            state,
            side,
            `declines to use ${(card as any)?.title}`,
          );
        }),
      },
      "yes-ability": {
        async: true,
        cost: [corePayment.toC("credit", 4)],
        msg: "give the Runner 1 tag and do 3 net damage",
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
              coreTags.gainTags(state, ":corp", 1, {
                suppressCheckpoint: true,
              }),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreDamage.damage(state, side, eid, ":net", 3, { card }),
            ],
            [],
          );
        }),
      },
    },
  },
};

// C.I. Fund
export const ciFund: CardDef = {
  title: "C.I. Fund",
  "derezzed-events": [coreDefHelpers.corpRezToast],
  flags: {
    "corp-phase-12": req(function* (state: State): Generator<any, any, any> {
      return ((state as any).corp?.credit || 0) > 0;
    }),
  },
  abilities: [
    {
      label: "Store up to 3 [Credit] (start of turn)",
      prompt: "How many credits do you want to store?",
      once: ":per-turn",
      choices: {
        number: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return Math.min((state as any).corp?.credit || 0, 3);
        }),
      },
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const n = targets[0] || 0;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreProps.addCounter(state, side, eid, card, ":credit", n, null),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.loseCredits(state, side, eid, n),
          ],
          [],
        );
      }),
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `store ${targets[0] || 0} [Credit]`,
      ),
    },
    {
      label: "Take all hosted credits",
      cost: [corePayment.toC("credit", 2), corePayment.toC("trash-can", 1)],
      msg: msg(
        (state: State, side: Side, eid: EID, card: Card) =>
          `trash it and gain ${coreCard.getCounters(card, ":credit")} [Credits]`,
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
  ],
  events: [
    {
      event: ":corp-turn-begins",
      msg: "place 2 [Credits] on itself",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.getCounters(card, ":credit") >= 6;
      }),
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
            coreProps.addCounter(state, side, eid, card, ":credit", 2, null),
          ],
          [],
        );
      }),
    },
  ],
};
