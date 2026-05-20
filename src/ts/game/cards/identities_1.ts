import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreAccess from '../core/access';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreChooseOne from '../core/choose_one';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMark from '../core/mark';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
const eid: any = undefined as any;
const asyncResult: any = undefined as any;
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;
const side: any = undefined as any;
const ctx: any = undefined as any;
const card: any = undefined as any;

// Helpers shared by draft-format identities (ported from cards/identities.clj).
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
    if (typeof f === 'string') counts[f] = (counts[f] || 0) + 1;
  }
  let max = 0;
  let best: string | null = null;
  let tied = false;
  for (const [f, n] of Object.entries(counts)) {
    if (n > max) { max = n; best = f; tied = false; }
    else if (n === max) { tied = true; }
  }
  if (tied) best = null;
  return best === faction;
}

/** Fringe Applications: Tomorrow, Today */
export const card_FringeApplications_TomorrowToday: CardDef = {
  title: 'Fringe Applications: Tomorrow, Today',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-turn-begins',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'Weyland Consortium');
      }),
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => coreCard.ice(c)); }) },
      prompt: 'Choose a piece of ice to place 1 advancement counter on',
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c) },
      msg: msg('place 1 advancement counter on ', (c: Card) => coreToString.cardStr(state, c) || ''),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreProps.addProp(state, side, eid, targets[0], 'advance-counter', 1, { placed: true });
      })
    }
  ]
};

/** Gabriel Santiago: Consummate Professional */
export const card_GabrielSantiago_ConsummateProfessional: CardDef = {
  title: 'Gabriel Santiago: Consummate Professional',
  events: [{
    event: 'successful-run', automatic: 'gain-credits', silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0]?.context || {};
      return ctx.targetServer === 'hq' && coreEvents.firstSuccessfulRunOnServer(state, 'hq');
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Gagarin Deep Space: Expanding the Horizon */
export const card_GagarinDeepSpace_ExpandingTheHorizon: CardDef = {
  title: 'Gagarin Deep Space: Expanding the Horizon',
  events: [{
    event: 'pre-access-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      const zone = coreCard.getZone(accessedCard);
      return zone && coreServers.isRemote(zone);
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreAccess.accessCostBonus([corePayment.toC('credit', 1)]);
    }),
    msg: 'make the Runner spend 1 [Credits] to access'
  }]
};

/** GameNET: Where Dreams are Real */
export const card_GameNET_WhereDreamsAreReal: CardDef = {
  title: 'GameNET: Where Dreams are Real',
  events: [
    {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).run;
        if (!run) return false;
        if (coreEid.source(eid)?.side !== 'Runner') return false;
        if (eid.sourceType === 'runner-trash-corp-cards' || eid.sourceType === 'runner-steal') {
          const addCosts = (eid as any).additionalCosts || [];
          for (const ac of addCosts) {
            if ((ac.cost?.type === 'credit' || ac.cost?.type === 'x-credit') && coreEid.source(ac.source)?.side === 'Corp') return true;
          }
        }
        return false;
      }),
      async: true, msg: 'gain 1 [Credits]',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
    },
    {
      event: 'runner-credit-loss',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).run;
        if (!run) return false;
        return coreEid.source(eid)?.side === 'Runner';
      }),
      async: true, msg: 'gain 1 [Credits]',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
    }
  ]
};

/** GRNDL: Power Unleashed */
export const card_GRNDL_PowerUnleashed: CardDef = {
  title: 'GRNDL: Power Unleashed',
  events: [{
    event: 'pre-start-game',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    async: true,
    msg: 'start the game with 10 [Credits] and 1 bad publicity',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'corp', 5)], []);
      if ((state as any).corp?.badPublicity <= 0) {
        coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1);
      }
    })
  }]
};

/** Haarpsichord Studios: Entertainment Unleashed */
export const card_HaarpsichordStudios_EntertainmentUnleashed: CardDef = {
  title: 'Haarpsichord Studios: Entertainment Unleashed',
  staticAbilities: [{
    type: 'cannot-steal',
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    })
  }],
  events: [{
    event: 'access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const accessedCard = context.accessedCard ? coreCard.getCard(state, context.accessedCard) : null;
      return accessedCard && coreCard.agenda(accessedCard) && (coreEvents.eventCount(state, side, 'agenda-stolen') || 0) > 0;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreToasts.toast(state, 'runner', 'Cannot steal due to Haarpsichord Studios.', 'warning');
    })
  }]
};

/** Haas-Bioroid: Architects of Tomorrow */
export const card_HaasBioroid_ArchitectsOfTomorrow: CardDef = {
  title: 'Haas-Bioroid: Architects of Tomorrow',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const ice = context.ice ? coreCard.getCard(state, context.ice) : null;
      if (!ice || !coreCard.rezzed(ice) || !coreCard.hasSubtype(ice, 'Bioroid')) return false;
      return coreEvents.firstEvent(state, 'runner', 'pass-ice', (ctx: any) => {
        const ice = ctx.ice ? coreCard.getCard(state, ctx.ice) : null;
        return ice && coreCard.rezzed(ice) && coreCard.installed(ice) && coreCard.hasSubtype(ice, 'Bioroid');
      });
    }),
    waitingPrompt: true, prompt: 'Choose a Bioroid to rez', player: 'corp',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.hasSubtype(targets[0], 'Bioroid') && !coreCard.rezzed(targets[0]) &&
          coreRezzing.canPayToRez(state, side, eid, targets[0], { 'cost-bonus': -4 });
      })
    },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreRezzing.rez(state, side, eid, targets[0], { 'cost-bonus': -4 });
    })
  }]
};

/** Haas-Bioroid: Engineering the Future */
export const card_HaasBioroid_EngineeringTheFuture: CardDef = {
  title: 'Haas-Bioroid: Engineering the Future',
  events: [{
    event: 'corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, 'corp', 'corp-install');
    }),
    automatic: 'gain-credits', msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Haas-Bioroid: Precision Design */
export const card_HaasBioroid_PrecisionDesign: CardDef = {
  title: 'Haas-Bioroid: Precision Design',
  staticAbilities: [coreHandSize.corpHandSizePlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return 1; }))],
  events: [{
    event: 'agenda-scored',
    interactive: true,
    optional: {
      prompt: 'Add 1 card from Archives to HQ?',
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      yesAbility: coreDefHelpers.corpRecur
    }
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Haas-Bioroid: Precision Design'); }) }]
};

/** Haas-Bioroid: Stronger Together */
export const card_HaasBioroid_StrongerTogether: CardDef = {
  title: 'Haas-Bioroid: Stronger Together',
  staticAbilities: [{
    type: 'ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.hasSubtype(targets[0], 'Bioroid'); }),
    value: 1
  }],
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreIce.updateAllIce(state, side); }),
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreIce.updateAllIce(state, side); })
};

/** Harishchandra Ent.: Where You're the Star */
export const card_HarishchandraEnt_WhereYoureTheStar: CardDef = {
  title: "Harishchandra Ent.: Where You're the Star",
  events: [
    {
      event: 'post-runner-draw',
      req: req(function*(state: State): Generator<any, any, any> { return utils.isTagged?.(state) ?? false; }),
      msg: msg('see that the Runner drew: ', (runner: any) => {
        return runner && runner.length > 0 ? utils.enumerateCards(runner) : 'no cards';
      })
    },
    {
      event: 'tags-changed',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const tagged = utils.isTagged?.(state) ?? false;
        const gripRevealed = (state as any).runner?.openhand;
        if (tagged) {
          if (!gripRevealed) {
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} make the Runner play with [runner-pronoun] grip revealed`);
            const grip = (state as any).runner?.hand || [];
            const gripStr = grip.length > 0 ? utils.enumerateCards(grip) : 'no cards';
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} to see that the Runner currently has ${gripStr} in [runner-pronoun] grip`);
            coreRevealing.revealHand(state, 'runner');
          }
        } else {
          if (gripRevealed) {
            const grip = (state as any).runner?.hand || [];
            const gripStr = grip.length > 0 ? utils.enumerateCards(grip) : 'no cards';
            coreSay.systemMsg(state, 'corp', `uses ${coreCard.getTitle(card)} to note that the Runner had ${gripStr} in [runner-pronoun] grip before it was concealed`);
            coreRevealing.concealHand(state, 'runner');
          }
        }
      })
    }
  ],
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (utils.isTagged?.(state) ?? false) coreRevealing.revealHand(state, 'runner');
  }),
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (utils.isTagged?.(state) ?? false) coreRevealing.concealHand(state, 'runner');
  })
};

/** Harmony Medtech: Biomedical Pioneer */
export const card_HarmonyMedtech_BiomedicalPioneer: CardDef = {
  title: 'Harmony Medtech: Biomedical Pioneer',
  staticAbilities: [{ type: 'agenda-point-req', value: -1 }]
};

/** Hayley Kaplan: Universal Scholar */
export const card_HayleyKaplan_UniversalScholar: CardDef = {
  title: 'Hayley Kaplan: Universal Scholar',
  events: [{
    event: 'runner-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (!coreEvents.firstEvent(state, side, 'runner-install')) return false;
      if ((targets as any)[0]?.context?.facedown) return false;
      const allInstalled = coreBoard.allActiveInstalled(state, 'runner');
      return allInstalled.some((c: Card) => {
        const flag = coreFlags.cardFlag?.(c, 'runner-install-draw');
        return flag;
      });
    }),
    async: true, waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const itarget = context.card ? coreCard.getCard(state, context.card) : null;
      const cardType = itarget ? (itarget.type || '') : '';
      const inHand = coreDefHelpers.allCardsInHandStar(state, 'runner') || [];
      const sameType = inHand.some((c: Card) => coreCard.isType(c, cardType));
      if (sameType) {
        const ability: any = {
          optional: {
            prompt: `Install another ${cardType} from the grip?`,
            yesAbility: {
              prompt: `Choose a ${cardType} to install`,
              choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.isType(targets[0], cardType) && coreDefHelpers.inHandStar(state, targets[0]); }) },
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], {
                  msgKeys: { 'install-source': card, 'display-origin': true }
                });
              })
            }
          }
        };
        continue_ability(state, side, ability, card, null);
      } else {
        continue_ability(state, side, { prompt: `You have no ${cardType} to install`, choices: ['Carry on!'], promptType: 'bogus' }, card, null);
      }
    })
  }]
};

/** Hiram "0mission" Svensson: Shadow of the Past */
export const card_Hiram0missionSvensson_ShadowOfThePast: CardDef = {
  title: 'Hiram "0mission" Svensson: Shadow of the Past',
  events: [
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
        return contextCard && coreCard.hardware(contextCard);
      }),
      msg: msg('look at ', (c: any) => c.title || 'the top card', ' on top of R&D'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    },
    {
      event: 'runner-trash',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (targets as any[]).some((t: any) => {
          const context = t.context || {};
          const ctxCard = context.card ? coreCard.getCard(state, context.card) : null;
          return ctxCard && coreCard.hardware(ctxCard);
        });
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreDefHelpers.scry(state, side, card, 'corp', 1);
      })
    }
  ]
};

/** Hoshiko Shiro: Untold Protagonist */
export const card_HoshikoShiro_UntoldProtagonist: CardDef = {
  title: 'Hoshiko Shiro: Untold Protagonist',
  staticAbilities: [
    coreLink.linkPlus(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return card.flipped ? 1 : 0; }), 1),
    {
      type: 'gain-subtype',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Digital'
    },
    {
      type: 'lose-subtype',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && card.flipped;
      }),
      value: 'Natural'
    }
  ],
  events: [
    {
      event: 'pre-first-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'runner'; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front' });
      })
    },
    {
      event: 'runner-turn-ends',
      automatic: 'gain-credits', interactive: true, async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = (state as any).runner;
        const accessedCards = run?.register?.accessedCards;
        if (card.flipped && !accessedCards) {
          coreSay.systemMsg(state, 'runner', 'flips [their] identity to Hoshiko Shiro: Untold Protagonist');
          coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5), subtype: 'Natural' });
          coreLink.updateLink(state);
        } else if (!card.flipped && accessedCards) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 2)], []);
          coreSay.systemMsg(state, 'runner', 'gains 2 [Credits] and flips [their] identity to Hoshiko Shiro: Mahou Shoujo');
          coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip', subtype: 'Digital' });
          coreLink.updateLink(state);
        }
        return coreEid.effectCompleted(state, side, eid);
      })
    },
    {
      event: 'runner-turn-begins',
      automatic: 'lose-credits',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return card.flipped; }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), 1)], []);
        coreSay.systemMsg(state, 'runner', `uses ${card.title} to draw 1 card and lose 1 [Credits]`);
        return coreEid.effectCompleted(state, side, eid);
      })
    }
  ],
  abilities: [{
    label: 'flip identity',
    msg: 'flip [their] identity manually',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (card.flipped) {
        coreUpdate.update!(state, side, { ...card, flipped: false, face: 'front', code: (card.code || '').substring(0, 5), subtype: 'Natural' });
      } else {
        coreUpdate.update!(state, side, { ...card, flipped: true, face: 'back', code: (card.code || '').substring(0, 5) + 'flip', subtype: 'Digital' });
      }
      coreLink.updateLink(state);
    })
  }]
};

/** Hyoubu Institute: Absolute Clarity */
export const card_HyoubuInstitute_AbsoluteClarity: CardDef = {
  title: 'Hyoubu Institute: Absolute Clarity',
  events: [{
    event: 'corp-reveal',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const cards = context.cards || [];
      if (cards.length <= 0) return false;
      return coreEvents.firstEvent(state, side, 'corp-reveal', (ctx: any) => (ctx.cards || []).length > 0);
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }],
  abilities: [
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal the top card of the Stack', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const revealed = ((state as any).runner?.deck || [])[0];
        if (revealed) {
          coreSay.systemMsg(state, side, `uses ${card.title} to reveal ${revealed.title} from the top of the Stack`);
          coreRevealing.reveal(state, side, eid, revealed);
        }
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 1)],
      label: 'Reveal a random card from the Grip', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const hand = ((state as any).runner?.hand || []).slice();
        const revealed = hand[Math.floor(Math.random() * hand.length)];
        if (revealed) {
          coreSay.systemMsg(state, side, `uses ${card.title} to reveal ${revealed.title} from the Grip`);
          coreRevealing.reveal(state, side, eid, revealed);
        }
      })
    }
  ]
};

/** Iain Stirling: Retired Spook */
export const card_IainStirling_RetiredSpook: CardDef = {
  title: 'Iain Stirling: Retired Spook',
  flags: { 'drip-economy': true },
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.agendaPoint || 0) > ((state as any).runner?.agendaPoint || 0);
    }),
    automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.agendaPoint || 0) > ((state as any).runner?.agendaPoint || 0);
    }),
    once: 'per-turn', automatic: 'gain-credits', msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 2); })
  }]
};

/** Industrial Genomics: Growing Solutions */
export const card_IndustrialGenomics_GrowingSolutions: CardDef = {
  title: 'Industrial Genomics: Growing Solutions',
  staticAbilities: [{
    type: 'trash-cost',
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.discard || []).filter((c: Card) => !c.seen).length;
    })
  }]
};

/** Information Dynamics: All You Need To Know */
export const card_InformationDynamics_AllYouNeedToKnow: CardDef = {
  title: 'Information Dynamics: All You Need To Know',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'agenda-scored',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreTags.gainTags('corp', eid, 1); })
    },
    {
      event: 'agenda-stolen',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (card.disabled || coreEffects.isDisabled(state, side, card)) return false;
        return hasMostFaction(state, 'corp', 'NBN');
      }),
      interactive: true, msg: 'give the Runner 1 tag', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreTags.gainTags('corp', eid, 1); })
    }
  ]
};

/** Issuaq Adaptics: Sustaining Diversity */
export const card_IssuaqAdaptics_SustainingDiversity: CardDef = {
  title: 'Issuaq Adaptics: Sustaining Diversity',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  leavePlay: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreGaining.gain('agenda-point-req', coreCard.getCounters(card, 'power'));
  }),
  staticAbilities: [{
    type: 'agenda-point-req',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return -(coreCard.getCounters(card, 'power') || 0);
    })
  }],
  events: [{
    event: 'agenda-scored', interactive: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corpInstallEvents = coreEvents.turnEvents(state, side, 'corp-install') || [];
      const advanceEvents = coreEvents.turnEvents(state, side, 'advance') || [];
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard) return true;
      const matchesInstall = corpInstallEvents.every((e: any) => !coreCard.sameCard(contextCard, e[0].card));
      const matchesAdvance = advanceEvents.every((e: any) => !coreCard.sameCard(contextCard, e[0].card));
      return matchesInstall && matchesAdvance;
    }),
    msg: 'put 1 charge counter on itself', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreProps.addCounter(state, side, eid, card, 'power', 1);
    })
  }]
};

/** Jamie "Bzzz" Micken: Techno Savant */
export const card_JamieBzzzMicken_TechnoSavant: CardDef = {
  title: 'Jamie "Bzzz" Micken: Techno Savant',
  events: [
    { event: 'pre-start-game', effect: effect(function*(state: State): Generator<any, any, any> { draftPointsTarget(state); }) },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return hasMostFaction(state, 'runner', 'Shaper') && coreEvents.firstEvent(state, side, 'runner-install');
      }),
      msg: 'draw 1 card', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw(eid, 1); })
    }
  ]
};

/** Jemison Astronautics: Sacrifice. Audacity. Success. */
export const card_JemisonAstronautics_SacrificeAudacitySuccess: CardDef = {
  title: 'Jemison Astronautics: Sacrifice. Audacity. Success.',
  events: [{
    event: 'corp-forfeit-agenda',
    async: true, waitingPrompt: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const p = (coreCard.getAgendaPoints(context.card) || 0) + 1;
      continue_ability(state, side, {
        prompt: 'Choose a card to place advancement counters on',
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
        msg: msg('place ', (n: number) => utils.quantify(n, 'advancement counter'), ' on ', (c: Card) => coreToString.cardStr(state, c) || ''),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreProps.addProp('corp', eid, targets[0], 'advance-counter', p, { placed: true });
        })
      }, card, null);
    })
  }]
};

/** Jesminder Sareen: Girl Behind the Curtain */
export const card_JesminderSareen_GirlBehindTheCurtain: CardDef = {
  title: 'Jesminder Sareen: Girl Behind the Curtain',
  staticAbilities: [{
    type: 'forced-to-avoid-tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) === 0;
    }),
    value: true
  }],
  events: [{
    event: 'tag-interrupt', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).run;
      if (!run) return false;
      return (coreEvents.runEventCount(state, side, 'tag-interrupt') || 0) <= 1;
    }),
    msg: 'avoid 1 tag',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { corePrevention.preventTag('runner', eid, 1); })
  }]
};

/** Jinteki Biotech: Life Imagined */
export const card_JintekiBiotech_LifeImagined: CardDef = {
  title: 'Jinteki Biotech: Life Imagined',
  events: [{
    event: 'pre-first-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === 'corp'; }),
    prompt: msg('Choose a copy of ', (c: Card) => c.title || '', ' to use this game'),
    choices: ['The Brewery', 'The Tank', 'The Greenhouse'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreUpdate.update!(state, side, { ...card, 'biotech-target': targets[0], face: 'front' });
      coreSay.systemMsg(`has chosen a copy of ${card.title} for this game`);
    })
  }],
  abilities: [
    {
      label: 'Check chosen flip identity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const target = card['biotech-target'];
        if (target === 'The Brewery') coreToasts.toast(state, 'corp', 'Flip to: The Brewery (Do 2 net damage)', 'info');
        else if (target === 'The Tank') coreToasts.toast(state, 'corp', 'Flip to: The Tank (Shuffle Archives into R&D)', 'info');
        else if (target === 'The Greenhouse') coreToasts.toast(state, 'corp', 'Flip to: The Greenhouse (Place 4 advancement counters on a card)', 'info');
        else coreToasts.toast(state, 'corp', 'No flip identity specified', 'info');
      })
    },
    {
      action: true, cost: [corePayment.toC('click', 3)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !card['biotech-used']; }),
      label: 'Flip this identity', async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreUpdate.update!(state, side, { ...coreCard.getCard(state, card), 'biotech-used': true });
        const flip = card['biotech-target'];
        if (flip === 'The Brewery') {
          coreSay.systemMsg(state, side, `uses The Brewery to do 2 net damage`);
          coreUpdate.update!(state, side, { ...card, code: 'brewery', face: 'brewery' });
          coreDamage.damage(state, side, eid, 'net', 2, { card });
        } else if (flip === 'The Tank') {
          coreSay.systemMsg(state, side, `uses The Tank to shuffle Archives into R&D`);
          coreShuffling.shuffleIntoDeck(state, side, 'discard');
          coreUpdate.update!(state, side, { ...card, code: 'tank', face: 'tank' });
          return coreEid.effectCompleted(state, side, eid);
        } else if (flip === 'The Greenhouse') {
          coreSay.systemMsg(state, side, `uses The Greenhouse to place 4 advancement counters on a card that can be advanced`);
          coreUpdate.update!(state, side, { ...card, code: 'greenhouse', face: 'greenhouse' });
          continue_ability(state, side, {
            prompt: 'Choose a card that can be advanced',
            choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.canBeAdvanced(state, targets[0]); }) },
            async: true,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              coreProps.addProp(eid, targets[0], 'advance-counter', 4, { placed: true });
            })
          }, card, null);
        } else {
          coreToasts.toast(state, 'corp', `Unknown Jinteki Biotech: Life Imagined card: ${flip}`, 'error');
          return coreEid.effectCompleted(state, side, eid);
        }
      })
    }
  ]
};

/** Jinteki: Personal Evolution */
export const card_Jinteki_PersonalEvolution: CardDef = {
  title: 'Jinteki: Personal Evolution',
  events: [
    { event: 'agenda-scored', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDamage.damage(eid, 'net', 1, { card }); }) },
    { event: 'agenda-stolen', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDamage.damage(eid, 'net', 1, { card }); }) }
  ]
};

/** Jinteki: Potential Unleashed */
export const card_Jinteki_PotentialUnleashed: CardDef = {
  title: 'Jinteki: Potential Unleashed',
  events: [{
    event: 'damage', async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (targets as any)[0]?.context?.damageType === 'net';
    }),
    changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.deck || []).length > 0; }) },
    msg: msg('trash ', (r: any) => (r.hand || [])[0]?.title || 'the top card', ' from the top of the stack'),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.mill('corp', eid, 'runner', 1); })
  }]
};

/** Jinteki: Replicating Perfection */
export const card_Jinteki_ReplicatingPerfection: CardDef = {
  title: 'Jinteki: Replicating Perfection',
  staticAbilities: [{
    type: 'cannot-run-on-server',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.eventCount(state, side, 'run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || '')) === 0;
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const remotes = coreBoard.getRemotes(state);
      return Object.keys(remotes || {});
    })
  }]
};

/** Jinteki: Restoring Humanity */
export const card_Jinteki_RestoringHumanity: CardDef = {
  title: 'Jinteki: Restoring Humanity',
  events: [{
    event: 'corp-turn-ends', automatic: 'gain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return ((state as any).corp?.discard || []).filter((c: Card) => !c.seen).length > 0;
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('corp', eid, 1); })
  }]
};

/** Kabonesa Wu: Netspace Thrillseeker */
export const card_KabonesaWu_NetspaceThrillseeker: CardDef = {
  title: 'Kabonesa Wu: Netspace Thrillseeker',
  abilities: [{
    action: true, cost: [corePayment.toC('click', 1)],
    label: 'Install a non-virus program from the stack, lowering the cost by 1 [Credit]',
    prompt: 'Choose a program',
    changeInGameState: { req: req(function*(state: State): Generator<any, any, any> { return ((state as any).runner?.deck || []).length > 0; }) },
    choices: (state: any) => {
      const deck = ((state as any).runner?.deck || []);
      return corePrompts.cancellable(deck.filter((c: Card) =>
        coreCard.program(c) && !coreCard.hasSubtype(c, 'Virus') &&
        corePayment.canPay(state, 'runner', { ...eid, source: card, sourceType: 'runner-install' }, c, null,
          [corePayment.toC('credit', (coreCostFns.installCost(state, side, c, { 'cost-bonus': -1 }) || 0))])
      ));
    },
    async: true, waitingPrompt: true,
    cancel: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ({ action: true, cost: [corePayment.toC('click', 1)] }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.runnerInstall(state, side, target, { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } })], []);
      const installedCard = (state as any).__lastAsyncResult;
      coreEngine.registerEvents(state, side, card, [{
        event: 'runner-turn-ends',
        interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.getCard(state, installedCard); }),
        silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !coreCard.getCard(state, installedCard); }),
        changeInGameState: { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreCard.getCard(state, installedCard); }) },
        abilityName: `Kabonesa Wu (${installedCard.title})`,
        msg: msg('remove ', (c: Card) => c.title || '', ' from the game'),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreMoving.move(state, side, coreCard.getCard(state, installedCard), 'rfg');
        })
      }]);
      return coreEid.effectCompleted(state, side, eid);
    })
  }]
};

/** Kate "Mac" McCaffrey: Digital Tinker */
export const card_KateMacMcCaffrey_DigitalTinker: CardDef = {
  title: 'Kate "Mac" McCaffrey: Digital Tinker',
  staticAbilities: [{
    type: 'install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const isKateType = coreCard.hardware(targets[0]) || coreCard.program(targets[0]);
      if (!isKateType) return false;
      const triggered = coreEvents.eventCount(state, 'runner', 'runner-install', (ctx: any) => {
        const c = ctx.card;
        return c && (coreCard.hardware(c) || coreCard.program(c));
      });
      return triggered === 0;
    }),
    value: -1
  }]
};

/** Ken "Express" Tenma: Disappeared Clone */
export const card_KenExpressTenma_DisappearedClone: CardDef = {
  title: 'Ken "Express" Tenma: Disappeared Clone',
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      if (!contextCard || !coreCard.hasSubtype(contextCard, 'Run')) return false;
      return coreEvents.firstEvent(state, 'runner', 'play-event', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.hasSubtype(c, 'Run');
      });
    }),
    msg: 'gain 1 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits(eid, 1); })
  }]
};

/** Khan: Savvy Skiptracer */
export const card_Khan_SavvySkiptracer: CardDef = {
  title: 'Khan: Savvy Skiptracer',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, 'runner', 'pass-ice');
    }),
    async: true, interactive: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runner = (state as any).runner;
      const hand = runner?.hand || [];
      const canInstall = hand.some((c: Card) => {
        if (!coreCard.hasSubtype(c, 'Icebreaker')) return false;
        const cost = coreCostFns.installCost(state, side, c, { 'cost-bonus': -1 });
        return corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, c, null, [corePayment.toC('credit', cost || 0)]);
      });
      if (canInstall) {
        continue_ability(state, side, {
          prompt: 'Choose an icebreaker to install',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return coreCard.inHandStar(state, targets[0]) && coreCard.hasSubtype(targets[0], 'Icebreaker') &&
                corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'runner-install' }, targets[0], null,
                  [corePayment.toC('credit', (coreCostFns.installCost(state, side, targets[0], { 'cost-bonus': -1 }) || 0))]);
            })
          },
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { 'cost-bonus': -1, msgKeys: { 'display-origin': true, 'install-source': card } });
          })
        }, card, null);
      }
    })
  }]
};

/** Laramy Fisk: Savvy Investor */
export const card_LaramyFisk_SavvyInvestor: CardDef = {
  title: 'Laramy Fisk: Savvy Investor',
  events: [{
    event: 'successful-run', skippable: true, async: true,
    interactive: coreOptional.getAutoresolve('auto-fire', (v: any) => !coreOptional.never(v)),
    silent: coreOptional.getAutoresolve('auto-fire', (v: any) => coreOptional.never(v) ? true : false),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const context = (targets as any)[0]?.context || {};
        if (!coreServers.isCentral(context.server || '')) return false;
        return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
      }),
      autoResolve: coreOptional.getAutoresolve('auto-fire'),
      prompt: 'Force the Corp to draw 1 card?',
      yesAbility: { msg: 'force the Corp to draw 1 card', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw('corp', eid, 1); }) },
      noAbility: { effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
    }
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Laramy Fisk: Savvy Investor'); }) }]
};

/** Lat: Ethical Freelancer */
export const card_Lat_EthicalFreelancer: CardDef = {
  title: 'Lat: Ethical Freelancer',
  events: [{
    event: 'runner-turn-ends', interactive: true, async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = (state as any).runner;
      const corp = (state as any).corp;
      const runHand = run?.hand || [];
      const corpHand = corp?.hand || [];
      continue_ability(state, side, {
        optional: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return runHand.length === corpHand.length; }),
          autoResolve: coreOptional.getAutoresolve('auto-fire'),
          waitingPrompt: true,
          prompt: 'Draw 1 card?',
          yesAbility: { async: true, msg: 'draw 1 card', effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreDrawing.draw('runner', eid, 1); }) },
          noAbility: { effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreSay.systemMsg(`declines to use ${card.title}`); }) }
        }
      }, card, null);
    })
  }],
  abilities: [{ effect: effect(function*(state: State): Generator<any, any, any> { coreOptional.setAutoresolve('auto-fire', 'Lat: Ethical Freelancer'); }) }]
};

/** Leela Patel: Trained Pragmatist */
export const card_LeelaPatel_TrainedPragmatist: CardDef = {
  title: 'Leela Patel: Trained Pragmatist',
  events: [
    {
      event: 'agenda-scored',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.move('corp', targets[0], 'hand'); })
    },
    {
      event: 'agenda-stolen',
      interactive: true, prompt: 'Choose an unrezzed card to return to HQ',
      choices: { card: (c: Card) => !coreCard.faceup(c) && coreCard.installed(c) && coreCard.corp(c), all: true },
      changeInGameState: { silent: true, req: req(function*(state: State): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.faceup(c) && coreCard.installed(c)); }) },
      msg: msg('add ', (c: Card) => coreToString.cardStr(state, c) || '', ' to HQ'),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreMoving.move('corp', targets[0], 'hand'); })
    }
  ]
};

/** LEO Construction: Labor Solutions */
export const card_LEOConstruction_LaborSolutions: CardDef = {
  title: 'LEO Construction: Labor Solutions',
  abilities: [{
    cost: [corePayment.toC('bioroid-run-server', 1)], once: 'per-turn',
    label: 'end the run', msg: 'end the run', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreRuns.endRun(state, side, eid, card); })
  }]
};

/** Liza Talking Thunder: Prominent Legislator */
export const card_LizaTalkingThunder_ProminentLegislator: CardDef = {
  title: 'Liza Talking Thunder: Prominent Legislator',
  events: [{
    event: 'successful-run', automatic: 'draw-cards', async: true, interactive: true,
    msg: 'draw 2 cards and take 1 tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      if (!coreServers.isCentral(context.server || '')) return false;
      return coreEvents.firstEvent(state, side, 'successful-run', (ctx: any) => coreServers.isCentral(ctx[0]?.server || ''));
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', 2, { suppressCheckpoint: true })], []);
      coreTags.gainTags(state, 'runner', eid, 1);
    })
  }]
};

/** Los: Data Hijacker */
export const card_Los_DataHijacker: CardDef = {
  title: 'Los: Data Hijacker',
  events: [{
    event: 'rez',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const contextCard = context.card ? coreCard.getCard(state, context.card) : null;
      return contextCard && coreCard.ice(contextCard) && coreEvents.firstEvent(state, side, 'rez', (ctx: any) => {
        const c = ctx.card ? coreCard.getCard(state, ctx.card) : null;
        return c && coreCard.ice(c);
      });
    }),
    msg: 'gain 2 [Credits]', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { coreGaining.gainCredits('runner', eid, 2); })
  }]
};

/** Magdalene Keino-Chemutai: Cryptarchitect */
export const card_MagdaleneKeinoChemutai_Cryptarchitect: CardDef = {
  title: 'Magdalene Keino-Chemutai: Cryptarchitect',
  events: [{
    event: 'runner-discard-to-hand-size', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = (targets as any)[0]?.context || {};
      const cards = context.cards || [];
      const installable = cards.filter((c: Card) =>
        (coreCard.hardware(c) || coreCard.program(c)) &&
        coreInstalling.runnerCanPayAndInstall(state, 'runner', eid, c, { noToast: true })
      );
      if (installable.length > 0) {
        continue_ability(state, side, {
          prompt: 'Install a discarded program or piece of hardware?',
          choices: corePrompts.cancellable(installable),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreInstalling.runnerInstall(state, side, eid, targets[0], { msgKeys: { 'install-source': card, 'display-origin': true } });
          })
        }, card, null);
      }
    })
  }]
};

/** MaxX: Maximum Punk Rock */
export const card_MaxX_MaximumPunkRock: CardDef = {
  title: 'MaxX: Maximum Punk Rock',
  flags: {
    'runner-turn-draw': true,
    'runner-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (card.disabled) return false;
      if (coreEffects.isDisabled(state, side, card)) return false;
      const allActive = coreBoard.allActiveInstalled(state, 'runner') || [];
      return allActive.some((c: Card) => coreFlags.cardFlag?.(c, 'runner-turn-draw') === true);
    })
  },
  events: [{
    event: 'runner-turn-begins',
    prompt: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = ((state as any).runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }],
  abilities: [{
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = ((state as any).runner?.deck || []);
      if (deck.length > 0) return `trash ${utils.enumerateCards(deck.slice(0, 2))} from the stack and draw 1 card`;
      return 'trash the top 2 cards from the stack and draw 1 card - but the stack is empty';
    }),
    label: 'trash and draw cards', once: 'per-turn', automatic: 'post-draw-cards', async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.mill('runner', 'runner', 2)], []);
      coreDrawing.draw(state, 'runner', eid, 1);
    })
  }]
};
