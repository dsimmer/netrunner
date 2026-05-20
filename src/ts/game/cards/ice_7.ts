/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreCheckpoint from '../core/checkpoint';
import * as coreChooseOne from '../core/choose_one';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { nextIceVariableSubs, constellationIce, zeroToHero } from './_helpers';
import { addProgramToTopOfStack, bioraidBreak, currentlyEncounteringCard, endTheRun, endTheRunIfTagged, endTheRunUnlessRunner, endTheRunUnlessRunnerPays, gainCreditsSub, gainPowerCounter, harmonicIceCount, installFromHqSub, maybeDrawSub, nextIceCount, resolveAnotherSubroutine, rezAnIce, runnerLosesCredits, tagTrace, takeBadPub, traceAbility, trashProgramSub, trashResourceSub, trashTypeOrEndTheRun, wonderSub } from './ice_1';

// Stub helpers (to be ported from clj cards/*.clj)
function spaceIce(..._args: any[]): any { return {}; }

// Mlinzi
export const mlinzi: CardDef = (() => {
  function netOrMill(netDmg: number, millCnt: number): any {
    return {
      label: `Do ${netDmg} net damage`,
      player: ':runner',
      'waiting-prompt': true,
      prompt: 'Choose one',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return [
          `Take ${netDmg} net damage`,
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-from-deck', millCnt)])
            ? utils.capitalize(corePayment.buildCostLabel([corePayment.toC('trash-from-deck', millCnt)])) : null,
        ].filter(Boolean);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (targets[0] === `Take ${netDmg} net damage`) {
          coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to do ${netDmg} net damage`);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':runner', eid, ':net', netDmg, { card })], []);
        } else {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('trash-from-deck', millCnt)])], []);
          coreSay.systemMsg(state, ':runner', result?.msg ?? '');
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return { title: 'Mlinzi', subroutines: [netOrMill(1, 2), netOrMill(2, 3), netOrMill(3, 4)] };
})();

// Mother Goddess
export const motherGoddess: CardDef = {
  title: 'Mother Goddess',
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const corp = (state as any).corp;
      const ices: Card[] = Object.values(corp?.servers ?? {}).flatMap((s: any) => s?.ices ?? []);
      return ices
        .filter((ice: Card) => coreCard.rezzed(ice) && !coreCard.sameCard(card, ice))
        .flatMap((ice: Card) => (ice as any).subtypes ?? []);
    }),
  }],
  subroutines: [endTheRun],
  events: [
    { event: ':rez', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side): Generator<any, any, any> { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':derez', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side): Generator<any, any, any> { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':card-moved', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> { return coreCard.ice(tgts[0]?.card); }), effect: effect(function*(s: State, sd: Side): Generator<any, any, any> { coreIce.updateAllSubtypes(s, sd); }) },
    { event: ':ice-subtype-changed', req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> { return coreCard.ice(tgts[0]); }), effect: effect(function*(s: State, sd: Side): Generator<any, any, any> { coreIce.updateAllSubtypes(s, sd); }) },
  ],
};

// Muckraker
export const muckraker: CardDef = {
  title: 'Muckraker',
  'on-rez': takeBadPub,
  subroutines: [tagTrace(1), tagTrace(2), tagTrace(3), endTheRunIfTagged],
};

// Mycoweb
export const mycoweb: CardDef = {
  title: 'Mycoweb',
  subroutines: [
    {
      label: 'Install an ice from Archives, ignoring all costs',
      'show-discard': true,
      choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.ice(targets[0]) && coreCard.inDiscard(targets[0]);
      }) },
      'waiting-prompt': true,
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreInstalling.corpInstallMsg(targets[0]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, targets[0], null, { ignoreInstallCost: true })], []);
      }),
    },
    rezAnIce({ costBonus: -2 }),
    resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Sentry'), 'Resolve subroutine on a rezzed Sentry', true),
    resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Code Gate'), 'Resolve subroutine on another rezzed Code Gate'),
  ],
};

// N-Pot
export const nPot: CardDef = (() => {
  function etrIfThreatX(x: number): any {
    return Object.assign({}, endTheRun, {
      label: `If threat >= ${x}, End the run`,
      'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return coreThreat.threatLevel(x, state); }) },
    });
  }
  return {
    title: 'N-Pot',
    subroutines: [endTheRun, etrIfThreatX(2), etrIfThreatX(4)],
    'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 3)], 1, null, {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return currentlyEncounteringCard(card, state);
      }),
    })],
  };
})();

// Najja 1.0
export const najja10: CardDef = {
  title: 'Najja 1.0',
  subroutines: [endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Nebula
export const nebula: CardDef = {
  title: 'Nebula',
  ...spaceIce(trashProgramSub),
};

// Negotiator
export const negotiator: CardDef = {
  title: 'Negotiator',
  subroutines: [gainCreditsSub(2), trashProgramSub],
  'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 2)], 1, 'All', {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return currentlyEncounteringCard(card, state);
    }),
  })],
};

// Nerine 2.0
export const nerine20: CardDef = (() => {
  const sub: any = {
    label: 'Do 1 core damage and Corp may draw 1 card',
    async: true,
    msg: 'do 1 core damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':runner', coreEid.makeEid(state, eid), ':brain', 1, { card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, 1)], []);
    }),
  };
  return {
    title: 'Nerine 2.0',
    subroutines: [sub, sub],
    'runner-abilities': [bioraidBreak(2, 2)],
    abilities: [coreEngine.setAutoresolve(':auto-fire', 'Nerine 2.0 drawing cards')],
  };
})();

// Neural Katana
export const neuralKatana: CardDef = {
  title: 'Neural Katana',
  subroutines: [coreDefHelpers.doNetDamage(3)],
};

// News Hound
export const newsHound: CardDef = {
  title: 'News Hound',
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, targets[0]) &&
        ([...state.corp?.current ?? [], ...state.runner?.current ?? []]).length > 0;
    }),
    value: { subroutines: [endTheRun] },
  }],
  subroutines: [tagTrace(3)],
};

// NEXT Bronze
export const nextBronze: CardDef = {
  title: 'NEXT Bronze',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State): Generator<any, any, any> {
    return nextIceCount((state as any).corp);
  }))],
};

// NEXT Diamond
export const nextDiamond: CardDef = {
  title: 'NEXT Diamond',
  'rez-cost-bonus': req(function*(state: State): Generator<any, any, any> { return -nextIceCount((state as any).corp); }),
  subroutines: [
    coreDefHelpers.doBrainDamage(1),
    coreDefHelpers.doBrainDamage(1),
    {
      prompt: 'Choose a card to trash',
      label: 'Trash 1 installed Runner card',
      'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return coreBoard.allInstalled(state, ':runner').length > 0; }) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `trash ${(targets[0] as any)?.title}`; }),
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
  ],
};

// NEXT Gold
export const nextGold: CardDef = (() => {
  function trashPrograms(cnt: number, state: State, side: Side, card: Card, eid: EID): any {
    if (cnt > 0) {
      return (function*(): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, trashProgramSub, card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, trashPrograms(cnt - 1, state, side, card, eid)], []);
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: 'NEXT Gold',
    'x-fn': req(function*(state: State): Generator<any, any, any> { return nextIceCount((state as any).corp); }),
    subroutines: [
      {
        label: 'Do X net damage',
        msg: msg(function(state: State) { return `do ${nextIceCount((state as any).corp)} net damage`; }),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', nextIceCount((state as any).corp), { card })], []);
        }),
      },
      {
        label: 'Trash X programs',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          const n = nextIceCount((state as any).corp);
          const programs = coreBoard.allActiveInstalled(state, ':runner').filter((c: Card) => coreCard.program(c)).length;
          yield wait_for(state, [{ asyncResult: 'result' }, trashPrograms(Math.min(programs, n), state, side, card, eid)], []);
        }),
      },
    ],
  };
})();

// NEXT Opal
export const nextOpal: CardDef = {
  title: 'NEXT Opal',
  ...nextIceVariableSubs(installFromHqSub()),
};

// NEXT Sapphire
export const nextSapphire: CardDef = {
  title: 'NEXT Sapphire',
  'x-fn': req(function*(state: State): Generator<any, any, any> { return nextIceCount((state as any).corp); }),
  subroutines: [
    {
      label: 'Draw up to X cards',
      prompt: 'How many cards do you want to draw?',
      'waiting-prompt': true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `draw ${utils.quantify(targets[0], 'card')}`; }),
      choices: { number: req(function*(state: State): Generator<any, any, any> { return nextIceCount((state as any).corp); }), default: req(function*(): Generator<any, any, any> { return 1; }) },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, eid, targets[0])], []);
      }),
    },
    {
      label: 'Add up to X cards from Archives to HQ',
      prompt: 'Choose cards to add to HQ',
      'show-discard': true,
      choices: {
        card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
        max: req(function*(state: State): Generator<any, any, any> { return nextIceCount((state as any).corp); }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        for (const c of targets) coreMoving.move(state, side, c, ':hand');
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const seen = targets.filter((c: Card) => (c as any).seen);
        const m = targets.filter((c: Card) => !(c as any).seen).length;
        return `add ${utils.enumerateCards(seen, { sorted: true })}${m > 0 ? ` and ${utils.quantify(m, 'unseen card')}` : ''} to HQ`;
      }),
    },
    {
      label: 'Shuffle up to X cards from HQ into R&D',
      prompt: 'Choose cards to shuffle into R&D',
      choices: {
        card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
        max: req(function*(state: State): Generator<any, any, any> { return nextIceCount((state as any).corp); }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        for (const c of targets) coreMoving.move(state, ':corp', c, ':deck');
        coreMoving.shuffle(state, ':corp', ':deck');
      }),
      cancel: coreMoving.shuffleMyDeck,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `shuffle ${utils.quantify(targets.length, 'card')} from HQ into R&D`;
      }),
    },
  ],
};

// NEXT Silver
export const nextSilver: CardDef = {
  title: 'NEXT Silver',
  ...nextIceVariableSubs(endTheRun),
};

// Nightdancer
export const nightdancer: CardDef = (() => {
  const sub: any = {
    label: 'The Runner loses [Click], if able. You have an additional [Click] to spend during your next turn',
    msg: 'force the runner to lose a [Click], if able. Corp gains an additional [Click] to spend during [their] next turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreGaining.loseClicks(state, ':runner', 1);
      (state as any).corp.extraClickTemp = ((state as any).corp.extraClickTemp ?? 0) + 1;
    }),
  };
  return { title: 'Nightdancer', subroutines: [sub, sub] };
})();

// Oduduwa
export const oduduwa: CardDef = {
  title: 'Oduduwa',
  'on-encounter': {
    msg: 'place 1 advancement counter on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, coreEid.makeEid(state, eid), card, ':advance-counter', 1, { placed: true })], []);
      const currentCard = coreCard.getCard(state, card);
      const counters = coreCard.getCounters(currentCard, ':advancement');
      const optAbility = {
        optional: {
          prompt: `Place ${utils.quantify(counters, 'advancement counter')} on another ice?`,
          'yes-ability': {
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return `place ${utils.quantify(counters, 'advancement counter')} on ${coreToString.cardStr(s, tgts[0])}`;
            }),
            async: true,
            choices: { card: (c: Card) => coreCard.ice(c), 'not-self': true },
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreProps.addProp(s, sd, e, tgts[0], ':advance-counter', counters, { placed: true })], []);
            }),
          },
        },
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, optAbility, coreCard.getCard(state, card), null)], []);
    }),
  },
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.getCounters(card, ':advancement');
  }),
  subroutines: [endTheRun, endTheRun],
};

// Orion
export const orion: CardDef = {
  title: 'Orion',
  ...spaceIce(trashProgramSub, resolveAnotherSubroutine(), endTheRun),
};

// Otoroshi
export const otoroshi: CardDef = {
  title: 'Otoroshi',
  subroutines: [{
    async: true,
    label: 'Place 3 advancement counters on an installed card',
    msg: 'place 3 advancement counters on an installed card',
    prompt: 'Choose an installed card in the root of a remote server',
    req: req(function*(state: State): Generator<any, any, any> {
      return coreBoard.allInstalled(state, ':corp').some((c: Card) => !coreCard.ice(c));
    }),
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) && !coreCard.ice(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const c = targets[0];
      const title = coreToString.cardStr(state, c);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, coreEid.makeEid(state, eid), c, ':advancement', 3, { placed: true })], []);
      const canPay3 = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]);
      const accessAbility = {
        player: ':runner',
        async: true,
        'waiting-prompt': true,
        prompt: 'Choose one',
        choices: [`Access ${title}`, canPay3 ? 'Pay 3 [Credits]' : null].filter(Boolean),
        msg: msg(function(s: State, sd: Side, e: EID, ca: Card, tgts: any[]) {
          return `force the Runner to ${utils.decapitalize(tgts[0])}`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, ca: Card, tgts: any[]): Generator<any, any, any> {
          if (tgts[0] === 'Pay 3 [Credits]') {
            const result: any = yield wait_for(s, [{ asyncResult: 'result' },
              corePayment.pay(s, ':runner', coreEid.makeEid(s, e), ca, [corePayment.toC('credit', 3)])], []);
            coreSay.systemMsg(s, ':runner', result?.msg ?? '');
            coreEid.effectCompleted(s, sd, e);
          } else {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreRuns.accessCard(s, ':runner', e, c)], []);
          }
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, accessAbility, card, null)], []);
    }),
  }],
};

// Owl
export const owl: CardDef = {
  title: 'Owl',
  subroutines: [addProgramToTopOfStack],
};

// Pachinko
export const pachinko: CardDef = {
  title: 'Pachinko',
  subroutines: [endTheRunIfTagged, endTheRunIfTagged],
};

// Palisade
export const palisade: CardDef = {
  title: 'Palisade',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return !coreServers.protectingACentral(state, card) ? 2 : 0;
  }))],
  subroutines: [endTheRun],
};

// Paper Wall
export const paperWall: CardDef = {
  title: 'Paper Wall',
  events: [{
    event: ':subroutines-broken',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && context?.allSubsBroken;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', eid, card, { causeCard: card, cause: ':effect' })], []);
    }),
  }],
  subroutines: [endTheRun],
};

// Paywall
export const paywall: CardDef = {
  title: 'Paywall',
  'on-encounter': runnerLosesCredits(1),
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('credit', 1))],
};

// Peeping Tom
export const peepingTom: CardDef = (() => {
  const sub = endTheRunUnlessRunner('takes 1 tag', 'take 1 tag', coreDefHelpers.giveTags(1));
  return {
    title: 'Peeping Tom',
    'on-encounter': {
      prompt: 'Choose a card type',
      choices: ['Event', 'Hardware', 'Program', 'Resource'],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardtype = targets[0];
        const hand: Card[] = (state as any).runner?.hand ?? [];
        const n = hand.filter((c: Card) => coreCard.isType(c, cardtype)).length;
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to name ${cardtype}, reveal ${utils.enumerateCards(hand, { sorted: true })} from the grip, and gain ${utils.quantify(n, 'subroutine')}`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, coreEid.makeEid(state, eid), hand)], []);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':additional-subroutines',
          duration: ':end-of-run',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> { return coreCard.sameCard(card, tgts[0]); }),
          value: { subroutines: Array(n).fill(sub) },
        });
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  };
})();

// Pharos
export const pharos: CardDef = {
  title: 'Pharos',
  advanceable: ':always',
  subroutines: [coreDefHelpers.giveTags(1), endTheRun, endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return wonderSub(card, 3) ? 5 : 0;
  }))],
};

// Phoneutria
export const phoneutria: CardDef = {
  title: 'Phoneutria',
  subroutines: [coreDefHelpers.doNetDamage(1), coreDefHelpers.doNetDamage(1)],
  events: [{
    event: ':pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(targets[0]?.ice, card) && ((state as any).runner?.hand?.length ?? 0) >= 4;
    }),
    msg: 'give the Runner 1 tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, side, eid, 1)], []);
    }),
  }],
};

// Ping
export const ping: CardDef = {
  title: 'Ping',
  'on-rez': Object.assign({}, coreDefHelpers.giveTags(1), {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
  }),
  subroutines: [endTheRun],
};

// Piranhas
export const piranhas: CardDef = {
  title: 'Piranhas',
  'additional-cost': [corePayment.toC('tag-or-bad-pub', 1)],
  subroutines: [
    maybeDrawSub(1),
    coreDefHelpers.doNetDamage(1),
    Object.assign({}, endTheRun, {
      label: 'End the run if there are more cards in HQ than in the grip',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).corp?.hand?.length ?? 0) > ((state as any).runner?.hand?.length ?? 0);
        }),
      },
    }),
  ],
};

// Pop-up Window
export const popUpWindow: CardDef = {
  title: 'Pop-up Window',
  'on-encounter': gainCreditsSub(1),
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('credit', 1))],
};

// Biawak
export const biawak: CardDef = {
  title: 'Biawak',
  subroutines: [
    trashTypeOrEndTheRun('program', (c: Card) => coreCard.program(c), trashProgramSub),
    trashTypeOrEndTheRun('resource', (c: Card) => coreCard.resource(c), trashResourceSub),
    endTheRun,
  ],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return eid.sourceType === ':rez' &&
          ((state as any).corp?.scored?.length ?? 0) > 0 &&
          coreCard.sameCard(card, targets[0]);
      }),
      'custom-amount': 10,
      'max-uses': 1,
      custom: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const targetCard = targets[0];
        const ability = {
          prompt: 'Forfeit an agenda to pay for 10 [Credits] of the rez cost?',
          async: true,
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              return coreCard.inCorpScored(s, sd, tgts[0]);
            }),
          },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `forfeit ${(tgts[0] as any)?.title} to pay for 10 [Credits] its rez cost`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' }, coreCard.forfeit(s, sd, tgts[0])], []);
            coreEid.completeWithResult(s, sd, e, 10);
          }),
          cancel: {
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID): Generator<any, any, any> {
              coreEid.effectCompleted(s, sd, coreEid.makeResult(e, 0));
            }),
          },
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, ability, card, null)], []);
      }),
      type: ':custom',
      'while-inactive': true,
    },
  },
};

// Pulse
export const pulse: CardDef = {
  title: 'Pulse',
  'rez-sound': 'pulse',
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    msg: 'force the runner to lose [Click]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreGaining.loseClicks(state, ':runner', 1);
    }),
  },
  subroutines: [
    {
      label: 'Runner loses 1 [Credits] for each rezzed piece of Harmonic ice',
      msg: msg(function(state: State) { return `make the runner lose ${harmonicIceCount((state as any).corp)} [Credits]`; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, harmonicIceCount((state as any).corp))], []);
      }),
    },
    endTheRunUnlessRunnerPays(corePayment.toC('click', 1)),
  ],
};

// Pup
export const pup: CardDef = (() => {
  const sub: any = {
    player: ':runner',
    async: true,
    label: 'Do 1 net damage unless the Runner pays 1 [Credits]',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return [
        'Suffer 1 net damage',
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ? 'Pay 1 [Credits]' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Suffer 1 net damage') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':corp', coreDefHelpers.doNetDamage(1), card, null)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 1)])], []);
        coreSay.systemMsg(state, ':runner', result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return { title: 'Pup', subroutines: [sub, sub] };
})();

// Quandary
export const quandary: CardDef = {
  title: 'Quandary',
  subroutines: [endTheRun],
};

// Quicksand
export const quicksand: CardDef = {
  title: 'Quicksand',
  'on-encounter': gainPowerCounter,
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.getCounters(card, ':power');
  }))],
};

// Rainbow
export const rainbow: CardDef = {
  title: 'Rainbow',
  subroutines: [endTheRun],
};

// Ravana 1.0
export const ravana10: CardDef = (() => {
  const sub = resolveAnotherSubroutine((c: Card) => coreCard.hasSubtype(c, 'Bioroid'), 'Resolve a subroutine on a rezzed bioroid ice');
  return { title: 'Ravana 1.0', subroutines: [sub, sub], 'runner-abilities': [bioraidBreak(1, 1)] };
})();

// Red Tape
export const redTape: CardDef = {
  title: 'Red Tape',
  subroutines: [{
    label: 'Give +3 strength to all ice for the remainder of the run',
    msg: 'give +3 strength to all ice for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':ice-strength',
        duration: ':end-of-run',
        value: 3,
      });
      coreIce.updateAllIce(state, side);
    }),
  }],
};

// Resistor
export const resistor: CardDef = {
  title: 'Resistor',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State): Generator<any, any, any> { return utils.countTags(state); }))],
  subroutines: [traceAbility(4, endTheRun)],
};

// Reverb
export const reverb: CardDef = {
  title: 'Reverb',
  'rez-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return -coreBoard.allInstalled(state, ':corp').filter(
      (c: Card) => coreCard.ice(c) && !coreCard.sameCard(card, c) && !coreCard.rezzed(c)).length;
  }),
  subroutines: [endTheRun, endTheRun],
};

// Rime
export const rime: CardDef = {
  title: 'Rime',
  implementation: 'Can be rezzed anytime already',
  'on-rez': {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreIce.updateAllIce(state, side);
    }),
  },
  subroutines: [runnerLosesCredits(1)],
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreServers.protectingSameServer(state, card, targets[0]);
    }),
    value: 1,
  }],
};

// Rototurret
export const rototurret: CardDef = {
  title: 'Rototurret',
  subroutines: [trashProgramSub, endTheRun],
};

// RSVP
export const rsvp: CardDef = {
  title: 'RSVP',
  subroutines: [{
    label: 'Runner cannot spend credits this run',
    msg: 'prevent the runner from spending credits this run',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      if ((state as any).run) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-pay-credit',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            return tgts[0]?.amount == null || tgts[0].amount > 0;
          }),
          value: true,
          duration: ':end-of-run',
        });
      }
    }),
  }],
};

// Sadaka
export const sadaka: CardDef = {
  title: 'Sadaka',
  subroutines: [
    {
      label: 'Look at the top 3 cards of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const topCards = ((state as any).corp?.deck ?? []).slice(0, 3);
        const arrangeAbility = {
          'waiting-prompt': true,
          prompt: `The top cards of R&D are (top->bottom): ${utils.enumerateCards(topCards)}`,
          choices: ['Arrange cards', 'Shuffle R&D'],
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            if (tgts[0] === 'Arrange cards') {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreEngine.resolveAbility(s, sd, coreIce.reorderChoice(':corp', topCards), c, null)], []);
              coreSay.systemMsg(s, ':corp', `rearranges the top ${utils.quantify(topCards.length, 'card')} of R&D`);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDrawing.maybeDraw(s, sd, e, c, 1)], []);
            } else {
              coreMoving.shuffle(s, ':corp', ':deck');
              coreSay.systemMsg(s, ':corp', 'shuffles R&D');
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDrawing.maybeDraw(s, sd, e, c, 1)], []);
            }
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, arrangeAbility, card, null)], []);
      }),
    },
    {
      label: 'Trash 1 card in HQ',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const trashHQAbility = {
          'waiting-prompt': true,
          prompt: 'Choose a card in HQ to trash',
          choices: req(function*(s: State): Generator<any, any, any> {
            return coreCard.cancellable((s as any).corp?.hand ?? [], { sorted: true });
          }),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreMoving.trash(s, ':corp', coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine' })], []);
            coreSay.systemMsg(s, ':corp', 'trashes a card from HQ');
            yield wait_for(s, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(s, sd, trashResourceSub, c, null)], []);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, trashHQAbility, card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { causeCard: card })], []);
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to trash itself`);
        coreRuns.encounterEnds(state, side, eid);
      }),
    },
  ],
};

// Sagittarius
export const sagittarius: CardDef = {
  title: 'Sagittarius',
  ...constellationIce(trashProgramSub),
};

// Saisentan
export const saisentan: CardDef = (() => {
  const sub: any = {
    label: 'Do 1 net damage',
    async: true,
    msg: 'do 1 net damage',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card, cause: ':subroutine' })], []);
    }),
  };
  return {
    title: 'Saisentan',
    'on-encounter': {
      'waiting-prompt': true,
      prompt: 'Choose a card type',
      choices: ['Event', 'Hardware', 'Program', 'Resource'],
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `choose the card type ${targets[0]}`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreCard.updateCard(state, side, Object.assign({}, card, { cardTarget: targets[0] }));
      }),
    },
    events: [
      {
        event: ':damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const context = targets[0];
          return context?.damageType === ':net' && context?.cause === ':subroutine' && coreCard.sameCard(context?.card, card);
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const context = targets[0];
          const trashedCards: Card[] = context?.cardsTrashed ?? [];
          const chosenType = (card as any).cardTarget;
          const matching = trashedCards.filter((c: Card) => coreCard.isType(c, chosenType));
          if (matching.length === 0) {
            coreEid.effectCompleted(state, side, eid);
            return;
          }
          function resolveExtraDamage(x: number): any {
            return (function*(): Generator<any, any, any> {
              coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to deal 1 additional net damage${x > 1 ? ` (${x - 1} remaining)` : ''}`);
              if (x <= 1) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
              } else {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 1, { card })], []);
                yield wait_for(state, [{ asyncResult: 'result' }, resolveExtraDamage(x - 1)], []);
              }
            })();
          }
          yield wait_for(state, [{ asyncResult: 'result' }, resolveExtraDamage(matching.length)], []);
        }),
      },
      {
        event: ':end-of-encounter',
        req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> { return !!(card as any).cardTarget; }),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreCard.updateCard(state, side, Object.assign({}, card, { cardTarget: undefined }));
        }),
      },
    ],
    subroutines: [sub, sub, sub],
  };
})();

// Salvage
export const salvage: CardDef = {
  title: 'Salvage',
  ...zeroToHero(tagTrace(2)),
};

// Sand Storm
export const sandStorm: CardDef = {
  title: 'Sand Storm',
  subroutines: [{
    async: true,
    label: 'Move this ice and the run to another server',
    prompt: 'Choose another server and redirect the run to its outermost position',
    choices: req(function*(state: State): Generator<any, any, any> {
      const currentServer = coreServers.zoneName((state as any).run?.server);
      return coreCard.cancellable(forms.servers(state).filter((s: string) => s !== currentServer));
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `move itself and the run on ${targets[0]} and trash itself`;
    }),
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> { return coreCard.installed(card); }) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const movedIce = coreMoving.move(state, side, card, [...coreServers.serverToZone(state, targets[0]), ':ices']);
      coreRuns.redirectRun(state, side, targets[0]);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, coreEid.makeEid(state, eid), movedIce, { unpreventable: true, cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};
