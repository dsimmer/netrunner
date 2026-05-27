//
/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreCardDefs from "../core/card_defs";
import * as coreCheckpoint from "../core/checkpoint";
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
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreMoving from "../core/moving";
import * as corePayment from "../core/payment";
import * as coreProps from "../core/props";
import * as coreRevealing from "../core/revealing";
import * as coreRezzing from "../core/rezzing";
import * as coreRuns from "../core/runs";
import * as coreSay from "../core/say";
import * as coreServers from "../core/servers";
import * as coreTags from "../core/tags";
import * as coreThreat from "../core/threat";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";
import { morphIce } from "./_helpers";
import {
  addRunnerCardToGrip,
  bioraidBreak,
  corpsGainsAndRunnerLosesCredits,
  doPsi,
  endTheRun,
  forcedToAvoidTags,
  gainCreditsSub,
  installFromHqOrArchivesSub,
  runnerTrashProgramSub,
  takeBadPub,
  traceAbility,
  trashProgramSub,
  trashTypeOrEndTheRun,
} from "./ice_1";

// Stub helpers (to be ported from clj cards/*.clj)
function spaceIce(..._args: any[]): any {
  return {};
}
function variableSubsIce(_count?: any, _sub?: any): any {
  return {};
}

// Aimor
export const aimor: CardDef = {
  title: "Aimor",
  subroutines: [
    {
      async: true,
      label: "Trash the top 3 cards of the stack",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const top3 = ((state as any).runner?.deck || []).slice(0, 3);
        coreSay.systemMsg(
          state,
          ":corp",
          `uses ${(card as any).title} to trash ${utils.enumerateCards(top3)} from the top of the stack and trash itself`,
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.mill(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              ":runner",
              3,
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.trash(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              card,
              { cause: ":subroutine" },
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [{ asyncResult: "result" }, coreRuns.encounterEnds(state, side, eid)],
          [],
        );
      }),
    },
  ],
};

// Akhet
export const akhet: CardDef = (() => {
  const breakableFn = req(function* (
    state: State,
    side: Side,
    eid: EID,
    card: Card,
  ): Generator<any, any, any> {
    if (
      coreCard.getCounters(card, ":advancement") >= 3 &&
      (card as any).title === "Akhet" &&
      !coreEffects.isDisabledReg(state, card)
    ) {
      return ((card as any).subroutines || []).some(
        (s: any) => s.broken && s.printed,
      )
        ? ":unrestricted"
        : true;
    }
    return ":unrestricted";
  });
  return {
    title: "Akhet",
    advanceable: ":always",
    subroutines: [
      {
        label: "Gain 1 [Credit]. Place 1 advancement counter",
        breakable: breakableFn,
        msg: {
          public: msg(function (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ) {
            return `gain 1 [Credit] and place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`;
          }),
          corp: msg(function (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ) {
            return `gain 1 [Credit] and place 1 advancement counter on ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`;
          }),
        },
        prompt: "Choose an installed card",
        choices: { card: (c: Card) => coreCard.installed(c) },
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
              coreProps.addProp(
                state,
                side,
                coreEid.makeEid(state, eid),
                targets[0],
                ":advance-counter",
                1,
                { placed: true },
              ),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreGaining.gainCredits(state, side, eid, 1),
            ],
            [],
          );
        }),
      },
      Object.assign({}, endTheRun, { breakable: breakableFn }),
    ],
    "static-abilities": [
      coreIce.iceStrengthBonus(
        req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return coreCard.getCounters(card, ":advancement") >= 3;
        }),
        3,
      ),
    ],
  };
})();

// Anansi
export const anansi: CardDef = (() => {
  const runnerDraw: any = {
    player: ":runner",
    optional: {
      "waiting-prompt": true,
      prompt: "Pay 2 [Credits] to draw 1 card?",
      "yes-ability": {
        async: true,
        cost: [corePayment.toC("credit", 2)],
        msg: "draw 1 card",
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
        ): Generator<any, any, any> {
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreDrawing.draw(state, ":runner", eid, 1),
            ],
            [],
          );
        }),
      },
      "no-ability": { msg: "does not draw 1 card" },
    },
  };
  return {
    title: "Anansi",
    subroutines: [
      {
        msg: "rearrange the top 5 cards of R&D",
        "change-in-game-state": {
          silent: true,
          req: req(function* (state: State): Generator<any, any, any> {
            return ((state as any).corp?.deck?.length ?? 0) > 0;
          }),
        },
        async: true,
        "waiting-prompt": true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          const from = ((state as any).corp?.deck || []).slice(0, 5);
          if (from.length > 0) {
            yield wait_for(
              state,
              [
                { asyncResult: "result" },
                coreEngine.resolveAbility(
                  state,
                  side,
                  coreDefHelpers.reorderChoice(
                    ":corp",
                    ":runner",
                    from,
                    [],
                    from.length,
                    from,
                  ),
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
      },
      {
        label: "Draw 1 card, runner draws 1 card",
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
              coreDrawing.maybeDraw(
                state,
                side,
                coreEid.makeEid(state, eid),
                card,
                1,
              ),
            ],
            [],
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreEngine.resolveAbility(
                state,
                ":runner",
                runnerDraw,
                card,
                null,
              ),
            ],
            [],
          );
        }),
      },
      coreDefHelpers.doNetDamage(1),
    ],
    events: [
      Object.assign({}, coreDefHelpers.doNetDamage(3), {
        event: ":end-of-encounter",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const ctx = targets[0];
          return (
            coreCard.sameCard(ctx?.ice, card) &&
            ((ctx?.ice as any)?.subroutines || []).some((s: any) => !s.broken)
          );
        }),
      }),
    ],
  };
})();

// Archangel
export const archangel: CardDef = {
  title: "Archangel",
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
      prompt: msg(function (state: State, side: Side, eid: EID, card: Card) {
        return `Pay 3 [Credits] to force Runner to encounter ${(card as any).title}?`;
      }),
      "yes-ability": {
        cost: [corePayment.toC("credit", 3)],
        async: true,
        msg: "force the Runner to encounter it",
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
              coreRuns.forceIceEncounter(state, side, eid, card),
            ],
            [],
          );
        }),
      },
      "no-ability": {
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreSay.systemMsg(
            state,
            ":corp",
            `declines to use ${(card as any).title}`,
          );
        }),
      },
    },
  },
  subroutines: [traceAbility(6, addRunnerCardToGrip)],
};

// Archer
export const archer: CardDef = {
  title: "Archer",
  "additional-cost": [corePayment.toC("forfeit", 1)],
  "rez-sound": "archer",
  subroutines: [gainCreditsSub(2), trashProgramSub, trashProgramSub, endTheRun],
};

// Architect
export const architect: CardDef = {
  title: "Architect",
  "static-abilities": [
    {
      type: ":cannot-be-trashed",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]);
      }),
      value: true,
    },
  ],
  subroutines: [
    {
      async: true,
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.deck?.length ?? 0) > 0;
        }),
      },
      label: "Look at the top 5 cards of R&D",
      msg: "look at the top 5 cards of R&D",
      prompt: msg(function (state: State) {
        const top5 = ((state as any).corp?.deck || []).slice(0, 5);
        return `The top cards of R&D are (top->bottom) ${utils.enumerateCards(top5)}`;
      }),
      "waiting-prompt": true,
      choices: ["OK"],
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).corp?.deck?.length ?? 0) > 0;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const top5 = ((state as any).corp?.deck || []).slice(0, 5);
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                prompt: "Choose a card to install",
                choices: coreRuns.cancellable(
                  top5.filter((c: Card) => coreCard.corpInstallableType(c)),
                ),
                async: true,
                "waiting-prompt": true,
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  tgts: any[],
                ): Generator<any, any, any> {
                  const target = tgts[0];
                  const idx = top5.findIndex((x: Card) =>
                    coreCard.sameCard(x, target),
                  );
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreInstalling.corpInstall(s, sd, e, target, null, {
                        ignoreAllCost: true,
                        msgKeys: {
                          installSource: card,
                          originIndex: idx,
                          displayOrigin: true,
                        },
                      }),
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
    installFromHqOrArchivesSub(),
  ],
};

// Ashigaru
export const ashigaru: CardDef = {
  title: "Ashigaru",
  ...variableSubsIce(
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      (state as any).corp?.hand?.length ?? 0,
    endTheRun,
  ),
};

// Assassin
export const assassin: CardDef = {
  title: "Assassin",
  subroutines: [
    traceAbility(5, coreDefHelpers.doNetDamage(3)),
    traceAbility(4, trashProgramSub),
  ],
};

// Asteroid Belt
export const asteroidBelt: CardDef = {
  title: "Asteroid Belt",
  ...spaceIce(endTheRun),
};

// Attini
export const attini: CardDef = (() => {
  const sub: any = {
    label: "Do 1 net damage unless the Runner pays 2 [Credits]",
    async: true,
    effect: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      if (
        coreThreat.threatLevel(3, state) &&
        !coreEffects.isDisabledReg(state, card)
      ) {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":net", 1, { card }),
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
                prompt: "Choose one",
                "waiting-prompt": true,
                player: ":runner",
                async: true,
                choices: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                ): Generator<any, any, any> {
                  return [
                    "Take 1 net damage",
                    corePayment.canPay(
                      s,
                      ":runner",
                      Object.assign({}, e, {
                        source: card,
                        sourceType: ":ability",
                      }),
                      card,
                      null,
                      [corePayment.toC("credit", 2)],
                    )
                      ? "Pay 2 [Credits]"
                      : null,
                  ].filter(Boolean);
                }),
                msg: msg(function (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  tgts: any[],
                ) {
                  return tgts[0] === "Take 1 net damage"
                    ? "do 1 net damage"
                    : `force the runner to ${utils.decapitalize(tgts[0])}`;
                }),
                effect: req(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  tgts: any[],
                ): Generator<any, any, any> {
                  if (tgts[0] === "Take 1 net damage") {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        coreDamage.damage(s, ":corp", e, ":net", 1, {
                          card: c,
                        }),
                      ],
                      [],
                    );
                  } else {
                    yield wait_for(
                      s,
                      [
                        { asyncResult: "result" },
                        corePayment.pay(s, ":runner", e, card, [
                          corePayment.toC("credit", 2),
                        ]),
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
      }
    }),
  };
  return {
    title: "Attini",
    events: [
      {
        event: ":pre-resolve-subroutine",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            coreThreat.threatLevel(3, state) &&
            coreCard.sameCard((targets[0] as any)?.ice, card)
          );
        }),
        silent: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreEffects.registerLingeringEffect(state, side, card, {
            type: ":cannot-pay-credit",
            req: req(function* (s: State, sd: Side): Generator<any, any, any> {
              return sd === ":runner";
            }),
            value: true,
            duration: ":subroutine-currently-resolving",
          });
        }),
      },
    ],
    subroutines: [sub, sub, sub],
  };
})();

// Authenticator
export const authenticator: CardDef = {
  title: "Authenticator",
  "on-encounter": {
    optional: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return !(state as any).run?.bypass && !forcedToAvoidTags(state, side);
      }),
      player: ":runner",
      prompt: "Take 1 tag to bypass Authenticator?",
      "yes-ability": {
        async: true,
        effect: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          coreSay.systemMsg(
            state,
            ":runner",
            "takes 1 tag on encountering Authenticator to bypass it",
          );
          coreRuns.bypassIce(state);
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreTags.gainTags(state, ":runner", eid, 1, {
                unpreventable: true,
              }),
            ],
            [],
          );
        }),
      },
    },
  },
  subroutines: [gainCreditsSub(2), endTheRun],
};

// Bailiff
export const bailiff: CardDef = (() => {
  function bailiffGainCredits(
    state: State,
    side: Side,
    eid: EID,
    n: number,
  ): void {
    if (n > 0) {
      const innerEid = coreEid.makeEid(state, eid);
      coreGaining.gainCredits(state, ":corp", innerEid, 1);
      // recursive: will call itself via effect completion in real engine
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }
  return {
    title: "Bailiff",
    "on-break-subs": {
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        const n = (targets[0]?.brokenSubs || []).length;
        return `gain ${n} [Credits] from the runner breaking subs`;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const n = (targets[0]?.brokenSubs || []).length;
        bailiffGainCredits(state, side, eid, n);
      }),
    },
    subroutines: [endTheRun],
  };
})();

// Ballista
export const ballista: CardDef = {
  title: "Ballista",
  subroutines: [
    trashTypeOrEndTheRun(
      "program",
      (c: Card) => coreCard.program(c),
      trashProgramSub,
    ),
  ],
};

// Bandwidth
export const bandwidth: CardDef = {
  title: "Bandwidth",
  subroutines: [
    {
      msg: "give the Runner 1 tag",
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
            coreTags.gainTags(state, ":corp", coreEid.makeEid(state, eid), 1),
          ],
          [],
        );
        coreEngine.registerEvents(state, side, card, [
          {
            event: ":successful-run",
            automatic: ":corp-lose-tag",
            duration: ":end-of-run",
            "unregister-once-resolved": true,
            async: true,
            msg: "make the Runner lose 1 tag",
            effect: effect(function* (
              s: State,
              sd: Side,
              e: EID,
            ): Generator<any, any, any> {
              yield wait_for(
                s,
                [
                  { asyncResult: "result" },
                  coreTags.loseTags(s, ":corp", e, 1),
                ],
                [],
              );
            }),
          },
        ]);
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

// Bastion
export const bastion: CardDef = { title: "Bastion", subroutines: [endTheRun] };

// Bathynomus
export const bathynomus: CardDef = {
  title: "Bathynomus",
  subroutines: [coreDefHelpers.doNetDamage(3)],
  "static-abilities": [
    coreIce.iceStrengthBonus(
      req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.protectingArchives(card) ? 3 : 0;
      }),
    ),
  ],
};

// Battlement
export const battlement: CardDef = {
  title: "Battlement",
  subroutines: [endTheRun, endTheRun],
};

// Blockchain
export const blockchain: CardDef = (() => {
  const subCount = (state: State) =>
    Math.floor(
      ((state as any).corp?.discard || []).filter(
        (c: Card) =>
          coreCard.isType(c, "Operation") &&
          coreCard.hasSubtype(c, "Transaction") &&
          coreCard.faceup(c),
      ).length / 2,
    );
  const sub = corpsGainsAndRunnerLosesCredits(1, 1);
  return {
    title: "Blockchain",
    "static-abilities": [
      {
        type: ":additional-subroutines",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return coreCard.sameCard(card, targets[0]);
        }),
        value: req(function* (state: State): Generator<any, any, any> {
          return {
            position: ":front",
            subroutines: Array(subCount(state)).fill(sub),
          };
        }),
      },
    ],
    subroutines: [sub, endTheRun],
  };
})();

// Bloodletter
export const bloodletter: CardDef = {
  title: "Bloodletter",
  subroutines: [
    {
      async: true,
      label: "Runner trashes 1 program or top 2 cards of the stack",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const hasPrograms = coreBoard
          .allActiveInstalled(state, ":runner")
          .some((c: Card) => coreCard.program(c));
        if (!hasPrograms) {
          coreSay.systemMsg(
            state,
            ":runner",
            "trashes the top 2 cards of the stack",
          );
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              coreMoving.mill(state, ":runner", eid, ":runner", 2),
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
                ":runner",
                {
                  "waiting-prompt": true,
                  prompt: "Choose one",
                  async: true,
                  choices: req(function* (s: State): Generator<any, any, any> {
                    return [
                      coreBoard
                        .allActiveInstalled(s, ":runner")
                        .some((c: Card) => coreCard.program(c))
                        ? "Trash 1 program"
                        : null,
                      ((s as any).runner?.deck?.length ?? 0) >= 1
                        ? "Trash the top 2 cards of the stack"
                        : null,
                    ].filter(Boolean);
                  }),
                  effect: req(function* (
                    s: State,
                    sd: Side,
                    e: EID,
                    c: Card,
                    tgts: any[],
                  ): Generator<any, any, any> {
                    if (tgts[0] === "Trash 1 program") {
                      yield wait_for(
                        s,
                        [
                          { asyncResult: "result" },
                          coreEngine.resolveAbility(
                            s,
                            ":runner",
                            trashProgramSub,
                            card,
                            null,
                          ),
                        ],
                        [],
                      );
                    } else {
                      coreSay.systemMsg(
                        s,
                        ":runner",
                        "trashes the top 2 cards of the stack",
                      );
                      yield wait_for(
                        s,
                        [
                          { asyncResult: "result" },
                          coreMoving.mill(s, ":runner", e, ":runner", 2),
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
        }
      }),
    },
  ],
};

// Bloom
export const bloom: CardDef = {
  title: "Bloom",
  subroutines: [
    {
      label:
        "Install a piece of ice from HQ protecting another server, ignoring all costs",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.hand?.length ?? 0) > 0;
        }),
      },
      prompt: "Choose a piece of ice to install from HQ in another server",
      async: true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const thisServer = coreServers.zoneName(
          (coreCard.getZone(card) as string[])?.[1],
        );
        const nice = targets[0];
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              {
                prompt: `Choose a location to install ${(nice as any).title}`,
                choices: req(function* (s: State): Generator<any, any, any> {
                  return coreInstalling
                    .installableServers(s, nice)
                    .filter((srv: string) => srv !== thisServer);
                }),
                async: true,
                effect: effect(function* (
                  s: State,
                  sd: Side,
                  e: EID,
                  c: Card,
                  tgts: any[],
                ): Generator<any, any, any> {
                  yield wait_for(
                    s,
                    [
                      { asyncResult: "result" },
                      coreInstalling.corpInstall(s, sd, e, nice, tgts[0], {
                        ignoreAllCost: true,
                        msgKeys: { installSource: card, displayOrigin: true },
                      }),
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
    {
      label:
        "Install a piece of ice from HQ in the next innermost position, protecting this server, ignoring all costs",
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.hand?.length ?? 0) > 0;
        }),
      },
      prompt: "Choose a piece of ice to install from HQ in this server",
      async: true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const run = (state as any).run;
        const server = coreServers.zoneName(coreRuns.targetServer(run));
        const pos = Math.max(((state as any).run?.position ?? 1) - 1, 0);
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreInstalling.corpInstall(state, side, eid, targets[0], server, {
              ignoreAllCost: true,
              msgKeys: { installSource: card, displayOrigin: true },
              index: pos,
            }),
          ],
          [],
        );
      }),
    },
  ],
};

// Bloop
export const bloop: CardDef = {
  title: "Bloop",
  "additional-cost": [corePayment.toC("derez-other-harmonic", 1)],
  "rez-sound": "bloop",
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    trashProgramSub,
    trashProgramSub,
  ],
};

// Border Control
export const borderControl: CardDef = {
  title: "Border Control",
  abilities: [
    {
      label: "End the run",
      msg: "end the run",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return forms.thisServer(state, card) && !!(state as any).run;
      }),
      cost: [corePayment.toC("trash-can", 1)],
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
  subroutines: [
    {
      label: "Gain 1 [Credits] for each ice protecting this server",
      msg: msg(function (state: State, side: Side, eid: EID, card: Card) {
        return `gain ${(coreBoard.cardToServer(state, card)?.ices || []).length} [Credits]`;
      }),
      async: true,
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const n = (coreBoard.cardToServer(state, card)?.ices || []).length;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, n),
          ],
          [],
        );
      }),
    },
    endTheRun,
  ],
};

// Boto
export const boto: CardDef = (() => {
  const discardSub: any = {
    label: "Trash 1 card from HQ to end the run",
    "change-in-game-state": {
      silent: true,
      req: req(function* (state: State): Generator<any, any, any> {
        return ((state as any).corp?.hand?.length ?? 0) > 0;
      }),
    },
    optional: {
      prompt: "Trash 1 card from HQ to end the run?",
      "yes-ability": {
        cost: [corePayment.toC("trash-from-hand", 1)],
        msg: "end the run",
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
              coreRuns.endRun(state, side, eid, card),
            ],
            [],
          );
        }),
      },
    },
  };
  return {
    title: "Boto",
    "static-abilities": [
      coreIce.iceStrengthBonus(
        req(function* (state: State): Generator<any, any, any> {
          return coreThreat.threatLevel(4, state) ? 2 : 0;
        }),
      ),
    ],
    subroutines: [coreDefHelpers.doNetDamage(2), discardSub, discardSub],
  };
})();

// Brainstorm
export const brainstorm: CardDef = {
  title: "Brainstorm",
  "on-encounter": {
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
      const subCount = (state as any).runner?.hand?.length ?? 0;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ":additional-subroutines",
        req: req(function* (
          s: State,
          sd: Side,
          e: EID,
          c: Card,
          tgts: any[],
        ): Generator<any, any, any> {
          return coreCard.sameCard(card, tgts[0]);
        }),
        duration: ":end-of-run",
        value: req(function* (
          state: State,
          side?: Side,
          eid?: EID,
          card?: Card,
          targets?: any[],
        ): Generator<any, any, any> {
          return {
            subroutines: Array(subCount).fill(coreDefHelpers.doBrainDamage(1)),
          };
        }),
      });
    }),
  },
};

// Builder
export const builder: CardDef = (() => {
  const sub: any = {
    label:
      "Place 1 advancement counter on a piece of ice that can be advanced protecting this server",
    msg: msg(function (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) {
      return `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`;
    }),
    choices: {
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.ice(t) && coreCard.canBeAdvanced(state, t);
      }),
    },
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
  };
  return {
    title: "Builder",
    abilities: [
      {
        action: true,
        label: "Move this ice to the outermost position of any server",
        cost: [corePayment.toC("click", 1)],
        prompt: "Choose a server",
        choices: req(function* (state: State): Generator<any, any, any> {
          return forms.servers(state);
        }),
        msg: msg(function (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ) {
          return `move itself to the outermost position of ${targets[0]}`;
        }),
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const zone = [
            ...coreServers.serverToZone(state, targets[0]),
            ":ices",
          ];
          coreMoving.move(state, side, card, zone);
        }),
      },
    ],
    subroutines: [sub, sub],
  };
})();

// Bumi 1.0
export const bumi10: CardDef = {
  title: "Bumi 1.0",
  subroutines: [trashProgramSub, coreDefHelpers.doBrainDamage(1)],
  "runner-abilities": [bioraidBreak(1, 1)],
  "on-rez": {
    prompt: "Trash a trojan program",
    choices: {
      card: (c: Card) =>
        coreCard.installed(c) &&
        coreCard.program(c) &&
        coreCard.hasSubtype(c, "Trojan"),
    },
    req: req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
    ): Generator<any, any, any> {
      return (
        !!(state as any).run &&
        forms.thisServer(state, card) &&
        coreBoard
          .allInstalled(state, ":runner")
          .some((c: Card) => coreCard.hasSubtype(c, "Trojan"))
      );
    }),
    msg: msg(function (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) {
      return `trash ${(targets[0] as any)?.title}`;
    }),
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
          coreMoving.trash(state, side, eid, targets[0], { causeCard: card }),
        ],
        [],
      );
    }),
  },
};

// Brân 1.0
export const bran10: CardDef = {
  title: "Brân 1.0",
  subroutines: [
    {
      async: true,
      label: "Install an ice from HQ or Archives",
      prompt: "Choose an ice to install from Archives or HQ",
      "show-discard": true,
      "waiting-prompt": true,
      choices: {
        card: (c: Card) =>
          coreCard.ice(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
      },
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const serverName = coreServers.zoneName(
          (coreCard.getZone(card) as string[])?.[1],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreInstalling.corpInstall(
              state,
              ":corp",
              coreEid.makeEid(state, eid),
              targets[0],
              serverName,
              {
                ignoreInstallCost: true,
                msgKeys: { installSource: card, displayOrigin: true },
                index: (card as any).index,
              },
            ),
          ],
          [],
        );
        coreEid.effectCompleted(state, side, eid);
      }),
    },
    endTheRun,
    endTheRun,
  ],
  "runner-abilities": [bioraidBreak(1, 1)],
};

// Bullfrog
export const bullfrog: CardDef = {
  title: "Bullfrog",
  subroutines: [
    doPsi({
      label: "Move this ice to another server",
      prompt: "Choose a server",
      choices: req(function* (state: State): Generator<any, any, any> {
        return forms.servers(state);
      }),
      "change-in-game-state": {
        silent: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
        ): Generator<any, any, any> {
          return coreCard.installed(card);
        }),
      },
      msg: msg(function (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ) {
        return `move itself to the outermost position of ${targets[0]}`;
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const zone = [...coreServers.serverToZone(state, targets[0]), ":ices"];
        coreMoving.move(state, side, card, zone);
        coreRuns.redirectRun(state, side, targets[0]);
        coreEid.effectCompleted(state, side, eid);
      }),
    }),
  ],
};

// Bulwark
export const bulwark: CardDef = (() => {
  const sub: any = {
    msg: "gain 2 [Credits] and end the run",
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
          coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), 2),
        ],
        [],
      );
      yield wait_for(
        state,
        [{ asyncResult: "result" }, coreRuns.endRun(state, side, eid, card)],
        [],
      );
    }),
  };
  return {
    title: "Bulwark",
    "on-rez": takeBadPub,
    "on-encounter": {
      req: req(function* (state: State): Generator<any, any, any> {
        return coreBoard
          .allActiveInstalled(state, ":runner")
          .some((c: Card) => coreCard.hasSubtype(c, "AI"));
      }),
      msg: "gain 2 [Credits] if there is an installed AI",
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
    subroutines: [runnerTrashProgramSub, sub, sub],
  };
})();

// Burke Bugs
export const burkeBugs: CardDef = {
  title: "Burke Bugs",
  subroutines: [traceAbility(0, runnerTrashProgramSub)],
};

// Caduceus
export const caduceus: CardDef = {
  title: "Caduceus",
  subroutines: [traceAbility(3, gainCreditsSub(3)), traceAbility(2, endTheRun)],
};

// Capacitor
export const capacitor: CardDef = {
  title: "Capacitor",
  "static-abilities": [
    coreIce.iceStrengthBonus(
      req(function* (state: State): Generator<any, any, any> {
        return utils.isTagged(state) ? 2 : 0;
      }),
    ),
  ],
  subroutines: [
    {
      label: "Gain 1 [Credits] for each tag the Runner has",
      async: true,
      "change-in-game-state": {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return utils.isTagged(state);
        }),
      },
      msg: msg(function (state: State) {
        return `gain ${utils.countTags(state)} [Credits]`;
      }),
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
              ":corp",
              eid,
              utils.countTags(state),
            ),
          ],
          [],
        );
      }),
    },
    endTheRun,
  ],
};

// Cell Portal
export const cellPortal: CardDef = {
  title: "Cell Portal",
  subroutines: [
    {
      async: true,
      msg: "make the Runner approach the outermost piece of ice",
      effect: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const server = coreServers.zoneName(coreRuns.targetServer(state));
        coreRuns.redirectRun(state, side, server, ":approach-ice");
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              ":runner",
              coreEid.makeEid(state, eid),
              coreRuns.offerJackOut(),
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
            coreRezzing.derez(state, side, eid, card),
          ],
          [],
        );
        coreRuns.encounterEnds(state, side, eid);
      }),
    },
  ],
};

// Changeling
export const changeling: CardDef = {
  title: "Changeling",
  ...morphIce("Barrier", "Sentry", endTheRun),
};

// Checkpoint
export const checkpoint: CardDef = {
  title: "Checkpoint",
  "on-rez": takeBadPub,
  subroutines: [
    traceAbility(5, {
      label: "Do 3 meat damage when this run is successful",
      msg: "do 3 meat damage when this run is successful",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        coreEvents.registerEvents(state, side, card, [
          {
            event: ":successful-run",
            automatic: ":corp-damage",
            duration: ":end-of-run",
            async: true,
            msg: "do 3 meat damage",
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
                  coreDamage.damage(s, sd, e, ":meat", 3, { card: c }),
                ],
                [],
              );
            }),
          },
        ]);
      }),
    }),
  ],
};

// Chetana
export const chetana: CardDef = {
  title: "Chetana",
  subroutines: [
    {
      msg: "make each player gain 2 [Credits]",
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
            coreGaining.gainCredits(
              state,
              ":runner",
              coreEid.makeEid(state, eid),
              2,
            ),
          ],
          [],
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreGaining.gainCredits(state, ":corp", eid, 2),
          ],
          [],
        );
      }),
    },
    doPsi({
      label: "Do 1 net damage for each card in the grip",
      async: true,
      msg: msg(function (state: State) {
        return `do ${(state as any).runner?.hand?.length ?? 0} net damage`;
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        const n = (state as any).runner?.hand?.length ?? 0;
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreDamage.damage(state, side, eid, ":net", n, { card }),
          ],
          [],
        );
      }),
    }),
  ],
};

// Chimera
export const chimera: CardDef = {
  title: "Chimera",
  "on-rez": {
    prompt: "Choose one subtype",
    choices: ["Barrier", "Code Gate", "Sentry"],
    msg: msg(function (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ) {
      return `make itself gain ${targets[0]}`;
    }),
    effect: effect(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      coreCard.updateCard(
        state,
        side,
        Object.assign({}, card, { subtypeTarget: targets[0] }),
      );
    }),
  },
  "static-abilities": [
    {
      type: ":gain-subtype",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreCard.sameCard(card, targets[0]) && !!(card as any).subtypeTarget
        );
      }),
      value: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return (card as any).subtypeTarget;
      }),
    },
  ],
  events: [
    {
      event: ":runner-turn-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.rezzed(card);
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
            coreRezzing.derez(state, side, eid, card),
          ],
          [],
        );
      }),
    },
    {
      event: ":corp-turn-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
      ): Generator<any, any, any> {
        return coreCard.rezzed(card);
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
            coreRezzing.derez(state, side, eid, card),
          ],
          [],
        );
      }),
    },
  ],
  subroutines: [endTheRun],
};

// Chiyashi
export const chiyashi: CardDef = (() => {
  function chiyashiAutoTrash(
    state: State,
    side: Side,
    eid: EID,
    n: number,
  ): any {
    if (n > 0) {
      return (function* (): Generator<any, any, any> {
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreMoving.mill(state, ":corp", ":runner", 2),
          ],
          [],
        );
        coreSay.systemMsg(
          state,
          side,
          "uses Chiyashi to trash the top 2 cards of the Stack",
        );
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            chiyashiAutoTrash(state, side, eid, n - 1),
          ],
          [],
        );
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: "Chiyashi",
    events: [
      {
        event: ":subroutines-broken",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const context = targets[0];
          return (
            coreCard.sameCard(card, context?.ice) &&
            coreBoard
              .allActiveInstalled(state, ":runner")
              .some((c: Card) => coreCard.hasSubtype(c, "AI"))
          );
        }),
        async: true,
        effect: effect(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const context = targets[0];
          yield wait_for(
            state,
            [
              { asyncResult: "result" },
              chiyashiAutoTrash(
                state,
                side,
                eid,
                (context?.brokenSubs ?? context?.["broken-subs"] ?? []).length,
              ),
            ],
            [],
          );
        }),
      },
    ],
    subroutines: [
      coreDefHelpers.doNetDamage(2),
      coreDefHelpers.doNetDamage(2),
      endTheRun,
    ],
  };
})();
