//
import type { Card, CardDef, EID, Side, State } from "../../types";
import * as coreAccess from "../core/access";
import * as coreBadPublicity from "../core/bad_publicity";
import * as coreBoard from "../core/board";
import * as coreCard from "../core/card";
import * as coreChooseOne from "../core/choose_one";
import * as coreCostFns from "../core/cost_fns";
import * as coreDamage from "../core/damage";
import * as coreDefHelpers from "../core/def_helpers";
import * as coreDrawing from "../core/drawing";
import * as coreEffects from "../core/effects";
import * as coreEid from "../core/eid";
import * as coreEngine from "../core/engine";
import * as coreEvents from "../core/events";
import * as coreExpose from "../core/expose";
import * as coreFlags from "../core/flags";
import * as coreGaining from "../core/gaining";
import * as coreHandSize from "../core/hand_size";
import * as coreIce from "../core/ice";
import * as coreInstalling from "../core/installing";
import * as coreLink from "../core/link";
import * as coreMark from "../core/mark";
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
import * as coreShuffling from "../core/shuffling";
import * as coreTags from "../core/tags";
import * as coreToString from "../core/to_string";
import * as coreToasts from "../core/toasts";
import * as coreUpdate from "../core/update";
import * as utils from "../utils";
import { req, effect, msg, wait_for, continue_ability, forms } from "../macros";

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;

function draftPointsTarget(state: State): void {
  const s: any = state as any;
  if (s?.runner?.agendaPointReq === 7) s.runner.agendaPointReq = 6;
  if (s?.corp?.agendaPointReq === 7) s.corp.agendaPointReq = 6;
}

function hasMostFaction(state: State, side: Side, faction: string): boolean {
  const cards = coreBoard.allActiveInstalled(state, side) || [];
  const counts: Record<string, number> = {};
  for (const c of cards) {
    const f = (c as any)?.faction;
    if (typeof f === "string") counts[f] = (counts[f] || 0) + 1;
  }
  let max = 0;
  let best: string | null = null;
  let tied = false;
  for (const [f, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      best = f;
      tied = false;
    } else if (n === max) {
      tied = true;
    }
  }
  if (tied) best = null;
  return best === faction;
}

/** Méliès U: Only the Brightest */
export const card_MeliesU_OnlyTheBrightest: CardDef = {
  title: "Méliès U: Only the Brightest",
  abilities: [
    {
      label: "Check chosen flip identity",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const target = card["melies-target"];
        if (target === "HQ")
          coreToasts.toast(state, "corp", "Tenure Floors (HQ)", "info");
        else if (target === "R&D")
          coreToasts.toast(state, "corp", "Subsurface Labs (R&D)", "info");
        else if (target === "Archives")
          coreToasts.toast(
            state,
            "corp",
            "Disposal Grounds (Archives)",
            "info",
          );
        else
          coreToasts.toast(state, "corp", "No flip identity specified", "info");
      }),
    },
  ],
  events: [
    {
      event: "pre-first-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return side === "corp";
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const options = ["HQ", "R&D", "Archives"];
        const shuffled = options.sort(() => Math.random() - 0.5);
        coreUpdate.update!(state, side, {
          ...card,
          face: "front",
          "melies-target": shuffled[0],
        });
        coreSay.systemMsg(
          "reveals that the three hidden faces of Méliès U: Only the Brightest are: Tenure Floors: Méliès U, Subsurface Labs: Méliès U, and Disposal Grounds: Méliès U",
        );
      }),
    },
    {
      event: "corp-turn-ends",
      prompt: "Choose a server",
      interactive: true,
      waitingPrompt: true,
      choices: ["HQ", "R&D", "Archives"],
      msg: {
        public: "secretly choose a server",
        corp: msg("secretly choose ", (t: string) => {
          const faces: Record<string, string> = {
            HQ: "Tenure Floors: Méliès U",
            "R&D": "Subsurface Labs: Méliès U",
            Archives: "Disposal Grounds: Méliès U",
          };
          return `${faces[t] || t} (${t})`;
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          "melies-target": targets[0],
        });
      }),
    },
    {
      event: "runner-turn-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return card.face === "front";
      }),
      msg: "gain 1 [Credit]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits(state, side, eid, 1);
      }),
    },
    {
      event: "corp-turn-begins",
      silent: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, face: "front" });
      }),
    },
    {
      event: "successful-run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return (
          card.face === "front" && coreServers.isCentral(context.server || "")
        );
      }),
      msg: msg("flip to ", (c: Card) => {
        const faces: Record<string, string> = {
          HQ: "Tenure Floors: Méliès U",
          "R&D": "Subsurface Labs: Méliès U",
          Archives: "Disposal Grounds: Méliès U",
        };
        return faces[c["melies-target"]] || "this shouldn't occur";
      }),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const target = card["melies-target"];
        let targetZone: string, face: string;
        if (target === "HQ") {
          targetZone = "hq";
          face = "tenure";
        } else if (target === "R&D") {
          targetZone = "rd";
          face = "subsurface";
        } else if (target === "Archives") {
          targetZone = "archives";
          face = "disposal";
        } else {
          targetZone = "hq";
          face = "tenure";
        }
        coreUpdate.update!(state, side, { ...card, face });
        const corp = (state as any).corp;
        if (
          context.server &&
          Array.isArray(context.server) &&
          context.server[0] === targetZone &&
          corp?.deck?.length > 0
        ) {
          continue_ability(
            state,
            side,
            {
              optional: {
                prompt: msg(
                  "The top card of R&D is ",
                  (c: Card) => c.title || "",
                  ". Trash it?",
                ),
                waitingPrompt: true,
                changeInGameState: {
                  silent: true,
                  req: req(function* (state: State): Generator<any, any, any> {
                    return ((state as any).corp?.deck || []).length > 0;
                  }),
                },
                yesAbility: {
                  cost: [corePayment.toC("trash-from-deck", 1)],
                  once: "per-turn",
                  msg: "add 1 card from Archives to HQ",
                  async: true,
                  effect: effect(function* (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ): Generator<any, any, any> {
                    continue_ability(
                      state,
                      side,
                      coreDefHelpers.corpRecur,
                      card,
                      null,
                    );
                  }),
                },
              },
            },
            card,
            null,
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

/** Mercury: Chrome Libertador */
export const card_Mercury_ChromeLibertador: CardDef = {
  title: "Mercury: Chrome Libertador",
  events: [
    {
      event: "breach-server",
      automatic: "pre-breach",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return (
          (state as any).run &&
          (coreEvents.runEvents(state, side, "subroutines-broken") || [])
            .length === 0 &&
          ["hq", "rd"].includes(context.server || "")
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
        const context = (targets as any)[0]?.context || {};
        const breachedServer = context.server;
        continue_ability(
          state,
          side,
          {
            optional: {
              prompt: "Access 1 additional card?",
              waitingPrompt: true,
              once: "per-turn",
              yesAbility: {
                msg: msg("access 1 additional card"),
                async: true,
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  coreAccess.accessBonus(
                    state,
                    side,
                    breachedServer,
                    1,
                    "end-of-access",
                  );
                  return coreEid.effectCompleted(state, side, eid);
                }),
              },
              noAbility: {
                effect: effect(function* (
                  state: State,
                  side: Side,
                  eid: EID,
                  card: Card,
                  targets: any[],
                ): Generator<any, any, any> {
                  coreSay.systemMsg(
                    `declines to use ${card.title} to access 1 additional card`,
                  );
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

/** MirrorMorph: Endless Iteration */
export const card_MirrorMorph_EndlessIteration: CardDef = {
  title: "MirrorMorph: Endless Iteration",
  implementation: "Does not work with terminal Operations",
  abilities: [
    {
      prompt: "Choose one",
      choices: ["Gain [Click]", "Gain 1 [Credits]"],
      msg: msg(function* (t: any): Generator<any, any, any> {
        return (t || "").charAt(0).toLowerCase() + (t || "").slice(1);
      }),
      once: "per-turn",
      label: "Manually trigger ability",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Gain [Click]") {
          coreGaining.gainClicks(state, side, 1);
          coreUpdate.update!(state, side, {
            ...coreCard.getCard(state, card),
            special: { ...(card as any).special, "mm-click": true },
          });
          return coreEid.effectCompleted(state, side, eid);
        }
        coreGaining.gainCredits(state, side, eid, 1);
      }),
    },
    {
      label: "Manually fix Mirrormorph",
      prompt: "Manually fix Mirrormorph",
      msg: "manually clear Mirrormorph flags",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          special: { ...(card as any).special, "mm-actions": [] },
        });
        coreUpdate.update!(state, side, {
          ...coreCard.getCard(state, card),
          special: { ...(card as any).special, "mm-click": false },
        });
      }),
    },
  ],
  events: [
    {
      event: "action-resolved",
      async: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return side === "corp";
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const ctxKeys = { cid: context.card?.cid, idx: context["ability-idx"] };
        const prevActions = (card as any)?.special?.["mm-actions"] || [];
        const actions = [...prevActions, ctxKeys];
        coreUpdate.update!(state, side, {
          ...card,
          special: { ...(card as any).special, "mm-actions": actions },
        });
        coreUpdate.update!(state, side, {
          ...coreCard.getCard(state, card),
          special: { ...(card as any).special, "mm-click": false },
        });
        if (actions.length === 3 && new Set(actions).size === 3) {
          continue_ability(
            state,
            side,
            {
              prompt: "Choose one",
              choices: ["Gain [Click]", "Gain 1 [Credits]"],
              msg: msg(function* (t: any): Generator<any, any, any> {
                return (t || "").charAt(0).toLowerCase() + (t || "").slice(1);
              }),
              once: "per-turn",
              label: "Manually trigger ability",
              async: true,
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                if (targets[0] === "Gain [Click]") {
                  coreGaining.gainClicks(state, side, 1);
                  return coreEid.effectCompleted(state, side, eid);
                }
                coreGaining.gainCredits(state, side, eid, 1);
              }),
            },
            coreCard.getCard(state, card),
            null,
          );
        }
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
    {
      event: "runner-turn-begins",
      silent: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          special: { ...(card as any).special, "mm-actions": [] },
        });
        coreUpdate.update!(state, side, {
          ...coreCard.getCard(state, card),
          special: { ...(card as any).special, "mm-click": false },
        });
      }),
    },
    {
      event: "corp-turn-ends",
      silent: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          special: { ...(card as any).special, "mm-actions": [] },
        });
        coreUpdate.update!(state, side, {
          ...coreCard.getCard(state, card),
          special: { ...(card as any).special, "mm-click": false },
        });
      }),
    },
  ],
  staticAbilities: [
    {
      type: "prevent-paid-ability",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const prevClick = (card as any)?.special?.["mm-click"];
        if (!prevClick) return false;
        const ctx = {
          cid: targets[0]?.cid,
          idx: targets.length > 2 ? targets[2] : undefined,
        };
        const prevActions = (card as any)?.special?.["mm-actions"] || [];
        const actions = [...prevActions, ctx];
        return !(
          actions.length === 4 &&
          new Set(actions.map((a: any) => `${a.cid}:${a.idx}`)).size === 4
        );
      }),
      value: true,
    },
  ],
};

/** Mti Mwekundu: Life Improved */
export const card_MtiMwekundu_LifeImproved: CardDef = {
  title: "Mti Mwekundu: Life Improved",
  events: [
    {
      event: "approach-server",
      async: true,
      interactive: true,
      waiting: "Corp to make a decision",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const corp = (state as any).corp;
        if ((corp?.hand || []).length === 0) return false;
        return !utils.usedThisTurn(state, card.cid);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const corp = (state as any).corp;
        const hasIce = (corp?.hand || []).some((c: Card) => coreCard.ice(c));
        if (hasIce) {
          continue_ability(
            state,
            side,
            {
              optional: {
                prompt: "Install a piece of ice?",
                once: "per-turn",
                yesAbility: {
                  prompt: "Choose a piece of ice to install from HQ",
                  choices: {
                    card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c),
                  },
                  async: true,
                  msg: "install a piece of ice from HQ at the innermost position of this server. Runner is now approaching that piece of ice",
                  effect: effect(function* (
                    state: State,
                    side: Side,
                    eid: EID,
                    card: Card,
                    targets: any[],
                  ): Generator<any, any, any> {
                    const run = (state as any).run;
                    const targetServer = run?.server
                      ? coreServers.centralToName(run.server)
                      : "hq";
                    yield wait_for(
                      state,
                      [
                        { asyncResult: "result" },
                        coreInstalling.corpInstall(
                          state,
                          side,
                          targets[0],
                          targetServer,
                          { "ignore-all-cost": true, front: true },
                        ),
                      ],
                      [],
                    );
                    (state as any).run.position = 1;
                    coreRuns.setNextPhase(state, "approach-ice");
                    coreIce.updateAllIce(state, side);
                    coreIce.updateAllIcebreakers(state, side);
                    continue_ability(
                      state,
                      side,
                      coreDefHelpers.offerJackOut({
                        req: req(function* (
                          state: State,
                        ): Generator<any, any, any> {
                          return (state as any).run?.["approached-ice?"];
                        }),
                      }),
                      card,
                      null,
                    );
                  }),
                },
              },
            },
            card,
            null,
          );
        } else {
          continue_ability(
            state,
            "corp",
            {
              async: true,
              prompt: "You have no piece of ice to install",
              choices: ["Carry on!"],
              promptType: "bogus",
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                return coreEid.effectCompleted(eid);
              }),
            },
            card,
            null,
          );
        }
      }),
    },
  ],
};

/** MuslihaT: Multifarious Marketeer */
export const card_MuslihaT_MultifariousMarketeer: CardDef = {
  title: "MuslihaT: Multifarious Marketeer",
  events: [
    {
      event: "runner-turn-begins",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return ((state as any).runner?.deck || []).length > 0;
      }),
      msg: {
        public: "look at the top card of the stack",
        runner: msg(
          "look at ",
          (r: any) => r.deck?.[0]?.title || "" || "the top card",
          " on the top of the stack",
        ),
      },
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const run = (state as any).runner;
        const topCard = run.deck?.[0];
        const isRunOrIcebreaker =
          topCard &&
          ((coreCard.event(topCard) && coreCard.hasSubtype(topCard, "Run")) ||
            (coreCard.program(topCard) &&
              coreCard.hasSubtype(topCard, "Icebreaker")));
        if (isRunOrIcebreaker) {
          continue_ability(
            state,
            side,
            {
              optional: {
                prompt: `Add ${topCard.title} to the grip?`,
                waitingPrompt: true,
                yesAbility: {
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
                        coreRevealing.revealLoud(
                          state,
                          side,
                          card,
                          " and add it to the grip",
                          topCard,
                        ),
                      ],
                      [],
                    );
                    coreMoving.move(state, side, topCard, "hand");
                    return coreEid.effectCompleted(state, side, eid);
                  }),
                },
              },
            },
            card,
            null,
          );
        } else {
          continue_ability(
            state,
            side,
            {
              prompt: `The top card of the stack is ${topCard?.title || ""}`,
              choices: ["OK"],
              waitingPrompt: true,
              async: true,
            },
            card,
            null,
          );
        }
      }),
    },
  ],
};

/** Nasir Meidan: Cyber Explorer */
export const card_NasirMeidan_CyberExplorer: CardDef = {
  title: "Nasir Meidan: Cyber Explorer",
  events: [
    {
      event: "approach-ice",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextIce = context.ice
          ? coreCard.getCard(state, context.ice)
          : null;
        return contextIce && !coreCard.rezzed(contextIce);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
        const cost = coreCostFns.rezCost(state, side, ice);
        coreEngine.registerEvents(card, [
          {
            event: "encounter-ice",
            duration: "end-of-encounter",
            unregisterOnceResolved: true,
            req: req(function* (
              state: State,
              side: Side,
              eid: EID,
              card: Card,
              targets: any[],
            ): Generator<any, any, any> {
              return coreCard.sameCard(
                ice,
                context.ice ? coreCard.getCard(state, context.ice) : null,
              );
            }),
            msg: msg(
              "lose all credits and gain ",
              (n: number) => n,
              " [Credits] from the rez of ",
              (c: Card) => c.title || "",
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
                  coreGaining.loseCredits(
                    state,
                    "runner",
                    coreEid.makeEid(state, eid),
                    "all",
                  ),
                ],
                [],
              );
              coreGaining.gainCredits(state, "runner", eid, cost);
            }),
          },
        ]);
      }),
    },
  ],
};

/** Nathaniel "Gnat" Hall: One-of-a-Kind */
export const card_NathanielGnatHall_OneofaKind: CardDef = {
  title: 'Nathaniel "Gnat" Hall: One-of-a-Kind',
  flags: {
    "drip-economy": true,
    "runner-phase-12": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      if (card.disabled || coreEffects.isDisabled(state, side, card))
        return false;
      const allActive = coreBoard.allActiveInstalled(state, "runner") || [];
      return allActive.some(
        (c: Card) => coreFlags.cardFlag?.(c, "runner-turn-draw") === true,
      );
    }),
  },
  abilities: [
    {
      label: "Gain 1 [Credits] (start of turn)",
      once: "per-turn",
      interactive: true,
      async: true,
      automatic: "pre-draw-cards",
      changeInGameState: {
        silent: true,
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return ((state as any).runner?.hand || []).length < 3;
        }),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits(state, "runner", eid, 1);
      }),
      msg: "gain 1 [Credits]",
    },
  ],
  events: [
    {
      event: "runner-turn-begins",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreGaining.gainCredits(state, "runner", eid, 1);
      }),
    },
  ],
};

/** NBN: Controlling the Message */
export const card_NBN_ControllingTheMessage: CardDef = {
  title: "NBN: Controlling the Message",
  events: [
    {
      event: "runner-trash",
      interactive: true,
      oncePerInstance: true,
      optional: {
        player: "corp",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const hasCorpInstalled = (targets as any[]).some((t: any) => {
            const context = t.context || {};
            const ctxCard = context.card
              ? coreCard.getCard(state, context.card)
              : null;
            return (
              ctxCard && coreCard.corp(ctxCard) && coreCard.installed(ctxCard)
            );
          });
          if (!hasCorpInstalled) return false;
          return coreEvents.firstEvent(
            state,
            side,
            "runner-trash",
            (ctx: any) => {
              return ctx.some((t: any) => {
                const c = t.context?.card
                  ? coreCard.getCard(state, t.context.card)
                  : null;
                return c && coreCard.installed(c) && coreCard.corp(c);
              });
            },
          );
        }),
        waitingPrompt: true,
        prompt: "Initiate a trace with strength 4?",
        autoResolve: coreOptional.getAutoresolve("auto-fire"),
        yesAbility: {
          trace: {
            base: 4,
            successful: {
              msg: "give the Runner 1 tag",
              async: true,
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                coreTags.gainTags("corp", eid, 1, { unpreventable: true });
              }),
            },
          },
        },
      },
    },
  ],
  abilities: [
    {
      effect: effect(function* (state: State): Generator<any, any, any> {
        coreOptional.setAutoresolve(
          "auto-fire",
          "NBN: Controlling the Message",
        );
      }),
    },
  ],
};

/** NBN: Making News */
export const card_NBN_MakingNews: CardDef = {
  title: "NBN: Making News",
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
        return coreEid.sourceType(eid) === "trace";
      }),
      type: "recurring",
    },
  },
};

/** NBN: Reality Plus */
export const card_NBN_RealityPlus: CardDef = {
  title: "NBN: Reality Plus",
  events: [
    {
      event: "runner-gain-tag",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreEvents.firstEvent(state, "runner", "runner-gain-tag");
      }),
      player: "corp",
      async: true,
      waitingPrompt: true,
      prompt: "Choose one",
      choices: ["Gain 2 [Credits]", "Draw 2 cards"],
      msg: msg(function* (t: any): Generator<any, any, any> {
        return (t || "").charAt(0).toLowerCase() + (t || "").slice(1);
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (targets[0] === "Gain 2 [Credits]")
          coreGaining.gainCredits(state, "corp", eid, 2);
        else coreDrawing.draw(state, "corp", eid, 2);
      }),
    },
  ],
};

/** NBN: The World is Yours* */
export const card_NBN_TheWorldIsYours: CardDef = {
  title: "NBN: The World is Yours*",
  staticAbilities: [coreHandSize.corpHandSizePlus(1)],
};

/** Near-Earth Hub: Broadcast Center */
export const card_NearEarthHub_BroadcastCenter: CardDef = {
  title: "Near-Earth Hub: Broadcast Center",
  events: [
    {
      event: "server-created",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreEvents.firstEvent(state, "corp", "server-created");
      }),
      async: true,
      msg: "draw 1 card",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreDrawing.draw("corp", eid, 1);
      }),
    },
  ],
};

/** Nebula Talent Management: Making Stars */
export const card_NebulaTalentManagement_MakingStars: CardDef = {
  title: "Nebula Talent Management: Making Stars",
  abilities: [
    {
      label: "Manually flip identity",
      msg: "Manually flip identity",
      forceMenu: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (card.flipped)
          coreUpdate.update!(state, side, {
            ...card,
            flipped: false,
            face: "front",
            code: (card.code || "").substring(0, 5),
          });
        else
          coreUpdate.update!(state, side, {
            ...card,
            flipped: true,
            face: "back",
            code: (card.code || "").substring(0, 5) + "flip",
          });
      }),
    },
  ],
  events: [
    {
      event: "pre-first-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return side === "corp";
      }),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          flipped: false,
          face: "front",
        });
      }),
    },
    {
      event: "corp-turn-ends",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          !coreEvents.eventCount(state, side, "play-operation") && !card.flipped
        );
      }),
      msg: msg(
        "flip [their] identity to Gemilang Arena: Burning Bright and gain 1 [Credits]",
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
          [{ asyncResult: "result" }, coreGaining.gainCredits(state, side, 1)],
          [],
        );
        coreUpdate.update!(state, side, {
          ...card,
          flipped: true,
          face: "back",
          code: (card.code || "").substring(0, 5) + "flip",
        });
      }),
    },
    {
      event: "successful-run",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const server = context.targetServer;
        return (server === "rd" || server === "hq") && card.flipped;
      }),
      msg: msg(
        "flip [their] identity to Nebula Talent Management: Making Stars",
      ),
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreUpdate.update!(state, side, {
          ...card,
          flipped: false,
          face: "front",
          code: (card.code || "").substring(0, 5),
        });
      }),
    },
    {
      event: "play-operation-resolved",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        return (
          coreEvents.firstEvent(state, side, "play-operation-resolved") &&
          !coreCard.hasSubtype(contextCard, "Terminal") &&
          card.flipped
        );
      }),
      interactive: true,
      msg: msg("gain [click]"),
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainClicks(state, "corp", 1);
      }),
    },
  ],
};

/** Nero Severn: Information Broker */
export const card_NeroSevern_InformationBroker: CardDef = {
  title: "Nero Severn: Information Broker",
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      optional: coreDefHelpers.offerJackOut({
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const context = (targets as any)[0]?.context || {};
          const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
          return ice && coreCard.hasSubtype(ice, "Sentry");
        }),
        once: "per-turn",
      }),
    },
  ],
};

/** New Angeles Sol: Your News */
export const card_NewAngelesSol_YourNews: CardDef = {
  title: "New Angeles Sol: Your News",
  events: [
    {
      event: "agenda-scored",
      optional: {
        prompt: "Play a Current?",
        player: "corp",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corp = (state as any).corp;
          return [
            ...(corp?.hand || []),
            ...(corp?.discard || []),
            ...(corp?.current || []),
          ].some((c: Card) => coreCard.hasSubtype(c, "Current"));
        }),
        yesAbility: {
          prompt: "Choose a Current to play from HQ or Archives",
          showDiscard: true,
          async: true,
          choices: {
            card: (c: Card) =>
              coreCard.hasSubtype(c, "Current") &&
              coreCard.corp(c) &&
              (coreCard.inHand(c) || coreCard.inDiscard(c)),
          },
          msg: msg(
            "play a current from ",
            (c: Card) =>
              coreServers.nameZone("Corp", coreCard.getZone(c)) || "",
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            corePlayInstants.playInstant(eid, targets[0]);
          }),
        },
      },
    },
    {
      event: "agenda-stolen",
      optional: {
        prompt: "Play a Current?",
        player: "corp",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          const corp = (state as any).corp;
          return [
            ...(corp?.hand || []),
            ...(corp?.discard || []),
            ...(corp?.current || []),
          ].some((c: Card) => coreCard.hasSubtype(c, "Current"));
        }),
        yesAbility: {
          prompt: "Choose a Current to play from HQ or Archives",
          showDiscard: true,
          async: true,
          choices: {
            card: (c: Card) =>
              coreCard.hasSubtype(c, "Current") &&
              coreCard.corp(c) &&
              (coreCard.inHand(c) || coreCard.inDiscard(c)),
          },
          msg: msg(
            "play a current from ",
            (c: Card) =>
              coreServers.nameZone("Corp", coreCard.getZone(c)) || "",
          ),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            corePlayInstants.playInstant(eid, targets[0]);
          }),
        },
      },
    },
  ],
};

/** NEXT Design: Guarding the Net */
export const card_NEXTDesign_GuardingTheNet: CardDef = {
  title: "NEXT Design: Guarding the Net",
  events: [
    {
      event: "pre-first-turn",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return side === "corp";
      }),
      msg: "install up to 3 pieces of ice and draw back up to 5 cards",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const ndHelper = function (n: number, st: State) {
          return {
            prompt: msg(
              "When finished, click ",
              (c: Card) => c.title || "",
              " to draw back up to 5 cards in HQ. Choose a piece of ice in HQ to install",
            ),
            choices: {
              card: (c: Card) =>
                coreCard.corp(c) && coreCard.ice(c) && coreCard.inHand(c),
            },
            async: true,
            effect: effect(function* (
              st2: any,
              s2: any,
              e2: any,
              c2: any,
              t2: any,
            ): Generator<any, any, any> {
              yield wait_for(
                st2,
                [
                  { asyncResult: "result" },
                  coreInstalling.corpInstall(st2, s2, e2, t2[0], null, {
                    msgKeys: { "install-source": c2, "display-origin": true },
                  }),
                ],
                [],
              );
              if (n < 3)
                continue_ability(st2, s2, ndHelper(n + 1, st2), c2, null);
            }),
          };
        };
        yield wait_for(
          state,
          [
            { asyncResult: "result" },
            coreEngine.resolveAbility(
              state,
              side,
              ndHelper(1, state),
              card,
              null,
            ),
          ],
          [],
        );
        coreUpdate.update!(state, side, { ...card, "fill-hq": true });
        return coreEid.effectCompleted(state, side, eid);
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
        return card["fill-hq"];
      }),
      label: "draw remaining cards",
      msg: msg("draw ", (n: number) =>
        utils.quantify(5 - ((state as any).corp?.hand || []).length, "card"),
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
            coreDrawing.draw(
              state,
              side,
              5 - ((state as any).corp?.hand || []).length,
              { suppressEvent: true },
            ),
          ],
          [],
        );
        coreUpdate.update!(state, side, { ...card, "fill-hq": undefined });
        (state as any).turnEvents = null;
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

/** Nisei Division: The Next Generation */
export const card_NiseiDivision_TheNextGeneration: CardDef = {
  title: "Nisei Division: The Next Generation",
  events: [
    {
      event: "reveal-spent-credits",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return (
          context["corp-credits"] != null && context["runner-credits"] != null
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits("corp", eid, 1);
      }),
    },
  ],
};

/** Noise: Hacker Extraordinaire */
export const card_Noise_HackerExtraordinaire: CardDef = {
  title: "Noise: Hacker Extraordinaire",
  events: [
    {
      event: "runner-install",
      async: true,
      interactive: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        return contextCard && coreCard.hasSubtype(contextCard, "Virus");
      }),
      msg: "force the Corp to trash the top card of R&D",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreMoving.mill("corp", eid, "corp", 1);
      }),
    },
  ],
};

/** Null: Whistleblower */
export const card_Null_Whistleblower: CardDef = {
  title: "Null: Whistleblower",
  events: [
    {
      event: "encounter-ice",
      skippable: true,
      optional: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return ((state as any).runner?.hand || []).length > 0;
        }),
        prompt:
          "Trash a card in the grip to lower the strength of encountered ice by 2?",
        once: "per-turn",
        yesAbility: {
          prompt: "Choose a card to trash",
          choices: { card: (c: Card) => coreCard.inHand(c) },
          msg: msg(
            "trash ",
            (c: Card) => c.title || "",
            " from the grip to lower the strength of ",
            (c: Card) => c.title || "",
            " by 2 for the remainder of the run",
          ),
          async: true,
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const currentIce = coreIce.getCurrentIce(state);
            coreEffects.registerLingeringEffect(card, {
              type: "ice-strength",
              duration: "end-of-run",
              req: req(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                return coreCard.sameCard(currentIce, targets[0]);
              }),
              value: -2,
            });
            coreIce.updateAllIce();
            coreMoving.trash(eid, targets[0], { unpreventable: true });
          }),
        },
      },
    },
  ],
};

/** Nuvem SA: Law of the Land */
export const card_NuvemSA_LawOfTheLand: CardDef = {
  title: "Nuvem SA: Law of the Land",
  events: [
    {
      event: "expend-resolved",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          state.activePlayer === "corp" &&
          (targets as any)[0]?.zone?.[0] === "deck" &&
          coreEvents.firstEvent(state, side, "corp-trash", (ctx: any) => {
            const c = ctx[0]?.card
              ? coreCard.getCard(state, ctx[0].card)
              : null;
            return c && c.zone?.[0] === "deck";
          })
        );
      }),
      msg: "gain 2 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits("corp", eid, 2);
      }),
    },
    {
      event: "play-operation-resolved",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          state.activePlayer === "corp" &&
          (targets as any)[0]?.zone?.[0] === "deck" &&
          coreEvents.firstEvent(state, side, "corp-trash", (ctx: any) => {
            const c = ctx[0]?.card
              ? coreCard.getCard(state, ctx[0].card)
              : null;
            return c && c.zone?.[0] === "deck";
          })
        );
      }),
      msg: "gain 2 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits("corp", eid, 2);
      }),
    },
    {
      event: "corp-trash",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          state.activePlayer === "corp" &&
          (targets as any)[0]?.zone?.[0] === "deck" &&
          coreEvents.firstEvent(state, side, "corp-trash", (ctx: any) => {
            const c = ctx[0]?.card
              ? coreCard.getCard(state, ctx[0].card)
              : null;
            return c && c.zone?.[0] === "deck";
          })
        );
      }),
      msg: "gain 2 [Credits]",
      async: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits("corp", eid, 2);
      }),
    },
  ],
};

/** Nyusha "Sable" Sintashta: Symphonic Prodigy */
export const card_NyushaSableSintashta_SymphonicProdigy: CardDef = {
  title: 'Nyusha "Sable" Sintashta: Symphonic Prodigy',
  events: [
    coreMark.markChangedEvent,
    { ...coreMark.identifyMarkAbility, event: "runner-turn-begins" },
    {
      event: "successful-run",
      automatic: "gain-clicks",
      interactive: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        return (
          context["marked-server"] &&
          coreEvents.firstEvent(
            state,
            side,
            "successful-run",
            (ctx: any) => ctx[0]?.["marked-server"],
          )
        );
      }),
      msg: "gain [Click]",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainClicks(1);
      }),
    },
  ],
};

/** Ob Superheavy Logistics: Extract. Export. Excel. */
export const card_ObSuperheavyLogistics_ExtractExportExcel: CardDef = {
  title: "Ob Superheavy Logistics: Extract. Export. Excel.",
  implementation:
    "note - we ensure the card can be installed (asset/upgrade/ice)",
  abilities: [
    {
      label: "Always pause at start of turn",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const helper = coreChooseOne.chooseOneHelper(
          { label: "Always pause at start of turn" },
          [
            {
              option: "Always pause at turn start",
              ability: {
                effect: effect(function* (
                  st: any,
                  s: any,
                  e: any,
                  c: any,
                  t: any,
                ): Generator<any, any, any> {
                  coreUpdate.update!(st, s, {
                    ...c,
                    special: {
                      ...(c as any).special,
                      "pause-at-phase-12": true,
                    },
                  });
                  coreToasts.toast(
                    st,
                    "corp",
                    "The game will always pause at the start of the turn",
                  );
                }),
              },
            },
            {
              option: "Only if triggered by cards in play",
              ability: {
                effect: effect(function* (
                  st: any,
                  s: any,
                  e: any,
                  c: any,
                  t: any,
                ): Generator<any, any, any> {
                  coreUpdate.update!(st, s, {
                    ...c,
                    special: (c as any).special
                      ? { ...(c as any).special }
                      : {},
                    "pause-at-phase-12": undefined,
                  });
                  coreToasts.toast(
                    st,
                    "corp",
                    "The game only pause at turn start if triggered by cards in play",
                  );
                }),
              },
            },
          ],
        );
        continue_ability(state, side, helper, card, null);
      }),
    },
  ],
  flags: {
    "corp-phase-12": req(function* (
      state: State,
      side: Side,
      eid: EID,
      card: Card,
      targets: any[],
    ): Generator<any, any, any> {
      return (card as any).special?.["pause-at-phase-12"];
    }),
  },
  events: [
    {
      event: "corp-trash",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        return (
          contextCard &&
          coreCard.installed(contextCard) &&
          !context["during-installation"] &&
          coreCard.rezzed(contextCard) &&
          !utils.usedThisTurn(state, card.cid)
        );
      }),
      async: true,
      interactive: true,
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0] || {};
        const contextCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        const targetCost = (coreCard.cost(contextCard) || 0) - 1;
        const obAbility: any = {
          optional: {
            prompt:
              targetCost >= 0
                ? `Install a ${targetCost}-cost card from your deck?`
                : `Shuffle your deck (search for a ${targetCost}-cost card from your deck?)`,
            once: "per-turn",
            waitingPrompt: true,
            yesAbility: {
              msg: msg(
                "search R&D for a ",
                (n: number) => n.toString(),
                "-cost card",
              ),
              async: true,
              effect: effect(function* (
                state: State,
                side: Side,
                eid: EID,
                card: Card,
                targets: any[],
              ): Generator<any, any, any> {
                if (targetCost >= 0) {
                  continue_ability(
                    state,
                    side,
                    {
                      prompt: "Choose a card to install and rez",
                      choices: {
                        req: req(function* (
                          state: State,
                          side: Side,
                          eid: EID,
                          card: Card,
                          targets: any[],
                        ): Generator<any, any, any> {
                          const deck = (state as any).corp?.deck || [];
                          const valid = deck.filter(
                            (c: Card) =>
                              (coreCard.asset(c) ||
                                coreCard.upgrade(c) ||
                                coreCard.ice(c)) &&
                              coreCard.cost(c) === targetCost,
                          );
                          return (
                            valid.includes(targets[0]) || targets[0] === "Done"
                          );
                        }),
                      },
                      msg: "shuffle R&D",
                      async: true,
                      effect: effect(function* (
                        state: State,
                        side: Side,
                        eid: EID,
                        card: Card,
                        targets: any[],
                      ): Generator<any, any, any> {
                        if (targets[0] === "Done")
                          return coreEid.effectCompleted(state, side, eid);
                        coreShuffling.shuffle(state, side, "deck");
                        const addCosts = coreCostFns.rezAdditionalCostBonus(
                          state,
                          side,
                          targets[0],
                          (c: any) => c.cost?.type !== "credit",
                        );
                        const instTarget = targets[0];
                        if (
                          addCosts.length > 0 &&
                          corePayment.canPay(
                            state,
                            side,
                            coreCard.getTitle(instTarget) || "",
                            addCosts,
                          )
                        ) {
                          continue_ability(
                            state,
                            side,
                            {
                              optional: {
                                prompt: `Rez ${coreCard.getTitle(instTarget)}, paying additional costs?`,
                                yesAbility: {
                                  msg: msg(
                                    "rez ",
                                    (c: Card) => c.title || "",
                                    ", paying additional costs",
                                  ),
                                  async: true,
                                  effect: effect(function* (
                                    st: any,
                                    s: any,
                                    e: any,
                                    c: any,
                                    t: any,
                                  ): Generator<any, any, any> {
                                    coreInstalling.corpInstall(
                                      st,
                                      s,
                                      e,
                                      t[0],
                                      null,
                                      {
                                        "ignore-all-cost": true,
                                        "no-warning": true,
                                        "install-state": "rezzed-no-rez-cost",
                                      },
                                    );
                                  }),
                                },
                                noAbility: {
                                  msg: "install a card from R&D ignoring all credit costs",
                                  async: true,
                                  effect: effect(function* (
                                    st: any,
                                    s: any,
                                    e: any,
                                    c: any,
                                    t: any,
                                  ): Generator<any, any, any> {
                                    coreInstalling.corpInstall(
                                      st,
                                      s,
                                      e,
                                      t[0],
                                      null,
                                      {
                                        "ignore-all-cost": true,
                                        "no-warning": true,
                                      },
                                    );
                                  }),
                                },
                              },
                            },
                            card,
                            null,
                          );
                        } else if (addCosts.length > 0) {
                          continue_ability(
                            state,
                            side,
                            {
                              msg: "install a card from R&D without paying additional costs to rez",
                              async: true,
                              effect: effect(function* (
                                st: any,
                                s: any,
                                e: any,
                                c: any,
                                t: any,
                              ): Generator<any, any, any> {
                                coreInstalling.corpInstall(
                                  st,
                                  s,
                                  e,
                                  t[0],
                                  null,
                                  {
                                    "ignore-all-cost": true,
                                    "no-warning": true,
                                  },
                                );
                              }),
                            },
                            card,
                            null,
                          );
                        } else {
                          yield wait_for(
                            state,
                            [
                              { asyncResult: "result" },
                              coreRevealing.reveal(state, side, targets[0]),
                            ],
                            [],
                          );
                          coreInstalling.corpInstall(
                            state,
                            side,
                            eid,
                            coreCard.getCard(state, targets[0]),
                            null,
                            {
                              "ignore-all-cost": true,
                              "no-warning": true,
                              "install-state": "rezzed-no-rez-cost",
                            },
                          );
                        }
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
                      msg: "shuffle R&D",
                      effect: effect(function* (
                        st: any,
                        s: any,
                        e: any,
                        c: any,
                        t: any,
                      ): Generator<any, any, any> {
                        coreShuffling.shuffle("corp", "deck");
                      }),
                    },
                    card,
                    null,
                  );
                }
              }),
            },
            noAbility: {
              effect: effect(function* (
                st: any,
                s: any,
                e: any,
                c: any,
                t: any,
              ): Generator<any, any, any> {
                coreSay.systemMsg(`declines to use ${c.title}`);
              }),
            },
          },
        };
        continue_ability(state, side, obAbility, card, null);
      }),
    },
  ],
};

/** Omar Keung: Conspiracy Theorist */
export const card_OmarKeung_ConspiracyTheorist: CardDef = {
  title: "Omar Keung: Conspiracy Theorist",
  abilities: [
    coreDefHelpers.runServerAbility("archives", {
      action: true,
      cost: [corePayment.toC("click", 1)],
      once: "per-turn",
      events: [
        {
          event: "pre-successful-run",
          interactive: true,
          duration: "end-of-run",
          unregisterOnceResolved: true,
          req: req(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const run = (state as any).run;
            return (
              run &&
              run.server &&
              coreServers.centralToName(run.server) === "archives"
            );
          }),
          prompt: "Choose one",
          choices: ["HQ", "R&D"],
          msg: msg("change the attacked server to ", (t: string) => t),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const targetServer = targets[0] === "HQ" ? "hq" : "rd";
            (state as any).run.server = [targetServer];
          }),
        },
      ],
    }),
  ],
};

/** Nova Initiumia: Catalyst & Impetus */
export const card_NovaInitiumia_CatalystImpetus: CardDef = {
  title: "Nova Initiumia: Catalyst & Impetus",
};

/** Pālanā Foods: Sustainable Growth */
export const card_PalanaFoods_SustainableGrowth: CardDef = {
  title: "Pālanā Foods: Sustainable Growth",
  events: [
    {
      event: "runner-draw",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return (
          coreEvents.firstEvent(state, "corp", "runner-draw") &&
          (targets as any)[0]?.count > 0
        );
      }),
      msg: "gain 1 [Credits]",
      async: true,
      automatic: "gain-credits",
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreGaining.gainCredits("corp", eid, 1);
      }),
    },
  ],
};

/** Poétrï Luxury Brands: All the Rage */
export const card_PoetriLuxuryBrands_AllTheRage: CardDef = {
  title: "Poétrï Luxury Brands: All the Rage",
  events: [
    {
      event: "agenda-stolen",
      interactive: true,
      skippable: true,
      async: true,
      prompt: "Install a non-agenda from HQ?",
      changeInGameState: {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return ((state as any).corp?.hand || []).length > 0;
        }),
      },
      waitingPrompt: true,
      choices: {
        card: (c: Card) =>
          coreCard.corp(c) &&
          coreCard.inHand(c) &&
          !coreCard.agenda(c) &&
          !coreCard.operation(c),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          msgKeys: { "install-source": card },
        });
      }),
    },
    {
      event: "agenda-scored",
      skippable: true,
      interactive: true,
      optional: {
        prompt: "Look at the top 3 cards of R&D?",
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return ((state as any).corp?.deck || []).length > 0;
        }),
        yesAbility: {
          async: true,
          msg: msg("look at the top 3 cards of R&D"),
          effect: effect(function* (
            state: State,
            side: Side,
            eid: EID,
            card: Card,
            targets: any[],
          ): Generator<any, any, any> {
            const top3 = ((state as any).corp?.deck || []).slice(0, 3);
            continue_ability(
              state,
              side,
              coreChooseOne.chooseOneHelper(
                {
                  prompt: msg("The top of R&D is (in order): ", (c: Card[]) =>
                    utils.enumerateCards(c),
                  ),
                  optional: true,
                },
                top3
                  .filter(
                    (c: Card) => !coreCard.operation(c) && !coreCard.agenda(c),
                  )
                  .map((c: Card) => ({
                    option: `Install ${c.title}`,
                    ability: {
                      async: true,
                      waitingPrompt: true,
                      effect: effect(function* (
                        st: any,
                        s: any,
                        e: any,
                        c: any,
                        t: any,
                      ): Generator<any, any, any> {
                        const targetPosition = utils.positions(
                          (x: Card) => coreCard.sameCard(x, c),
                          top3,
                        )[0];
                        coreInstalling.corpInstall(st, s, e, c, null, {
                          msgKeys: {
                            "install-source": c,
                            "origin-index": targetPosition,
                            "display-origin": true,
                          },
                        });
                      }),
                    },
                  })),
              ),
              card,
              null,
            );
          }),
        },
      },
    },
  ],
};

/** Pravdivost Consulting: Political Solutions */
export const card_PravdivostConsulting_PoliticalSolutions: CardDef = {
  title: "Pravdivost Consulting: Political Solutions",
  events: [
    {
      event: "successful-run",
      skippable: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return coreEvents.firstEvent(state, side, "successful-run");
      }),
      interactive: true,
      async: true,
      waitingPrompt: true,
      prompt:
        "Choose a card that can be advanced to place 1 advancement counter on",
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            coreCard.installed(targets[0]) &&
            coreCard.canBeAdvanced(state, targets[0])
          );
        }),
      },
      msg: {
        public: msg(
          "place 1 advancement counter on ",
          (c: Card) => coreToString.cardStr(state, c) || "",
        ),
        corp: msg(
          "place 1 advancement counter on ",
          (c: Card) =>
            coreToString.cardStr(state, c, { maybeVisible: true }) || "",
        ),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreProps.addProp("corp", eid, targets[0], "advance-counter", 1, {
          placed: true,
        });
      }),
    },
  ],
};

/** PT Untaian: Life's Building Blocks */
export const card_PTUntaian_LifesBuildingBlocks: CardDef = {
  title: "PT Untaian: Life's Building Blocks",
  events: [
    {
      event: "corp-turn-ends",
      interactive: true,
      skippable: true,
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        return ((state as any).corp?.hand || []).length <= 3;
      }),
      changeInGameState: {
        silent: true,
        req: req(function* (state: State): Generator<any, any, any> {
          return (coreBoard.allInstalled(state, "corp") || []).some(
            (c: Card) =>
              !coreCard.rezzed(c) || coreCard.canBeAdvanced(state, c),
          );
        }),
      },
      prompt:
        "Pay 1 [Credits]: place 1 advancement counter on an unrezzed advanceable card?",
      waitingPrompt: true,
      choices: {
        req: req(function* (
          state: State,
          side: Side,
          eid: EID,
          card: Card,
          targets: any[],
        ): Generator<any, any, any> {
          return (
            coreCard.installed(targets[0]) &&
            !coreCard.rezzed(targets[0]) &&
            coreCard.canBeAdvanced(state, targets[0])
          );
        }),
      },
      cost: [corePayment.toC("credit", 1)],
      async: true,
      msg: {
        public: msg(
          "place 1 advancement counter on ",
          (c: Card) => coreToString.cardStr(state, c) || "",
        ),
        corp: msg(
          "place 1 advancement counter on ",
          (c: Card) =>
            coreToString.cardStr(state, c, { maybeVisible: true }) || "",
        ),
      },
      effect: effect(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        coreProps.addProp(state, side, eid, targets[0], "advance-counter", 1, {
          placed: true,
        });
      }),
    },
  ],
};

/** Quetzal: Free Spirit */
export const card_Quetzal_FreeSpirit: CardDef = {
  title: "Quetzal: Free Spirit",
  abilities: [
    Object.assign(coreIce.breakSub(null, 1, "Barrier", { repeatable: false }), {
      once: "per-turn",
    }),
  ],
};

/** Reina Roja: Freedom Fighter */
export const card_ReinaRoja_FreedomFighter: CardDef = {
  title: "Reina Roja: Freedom Fighter",
  staticAbilities: [
    {
      type: "rez-cost",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        if (!coreCard.ice(targets[0]) || coreCard.rezzed(targets[0]))
          return false;
        const triggered = coreEvents.eventCount(
          state,
          "runner",
          "rez",
          (ctx: any) => {
            const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
            return c && coreCard.ice(c);
          },
        );
        return triggered === 0;
      }),
      value: 1,
    },
  ],
  events: [
    {
      event: "rez",
      req: req(function* (
        state: State,
        side: Side,
        eid: EID,
        card: Card,
        targets: any[],
      ): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card
          ? coreCard.getCard(state, context.card)
          : null;
        if (!contextCard || !coreCard.ice(contextCard)) return false;
        const triggered = coreEvents.eventCount(
          state,
          "runner",
          "rez",
          (ctx: any) => {
            const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
            return c && coreCard.ice(c);
          },
        );
        return triggered <= 1;
      }),
      msg: msg(
        "increased the rez cost of ",
        (c: Card) => c.title || "",
        " by 1 [Credits]",
      ),
    },
  ],
};
