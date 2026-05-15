/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
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
import type { CardDef } from '../../types';

import { addProgramToTopOfStack, addRunnerCardToGrip, bioraidBreak, doPsi, endTheRun, endTheRunUnlessRunnerPays, forcedToAvoidTags, gainCreditsSub, gainPowerCounter, heroToHero, installFromHqSub, maybeDrawSub, runnerLosesClick, runnerLosesCredits, tagTrace, takeBadPub, traceAbility, trashHardwareSub, trashProgramSub, trashResourceSub } from './ice_1';

// Sandman
export const sandman: CardDef = {
  title: 'Sandman',
  subroutines: [addRunnerCardToGrip, addRunnerCardToGrip],
};

// Sandstone
export const sandstone: CardDef = {
  title: 'Sandstone',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return -coreCard.getCounters(card, ':virus');
  }))],
  'on-encounter': {
    msg: 'place 1 virus counter on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':virus', 1, null)], []);
      coreIce.updateIceStrength(state, side, coreCard.getCard(state, card));
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Sapper
export const sapper: CardDef = {
  title: 'Sapper',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  subroutines: [trashProgramSub],
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) { return !coreCard.inDiscard(card); }),
    msg: 'force the Runner to encounter Sapper',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.forceIceEncounter(state, side, eid, card)], []);
    }),
  },
};

// Scatter Field
export const scatterField: CardDef = {
  title: 'Scatter Field',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    const zone = coreCard.getZone(card) as string[];
    return ((state as any).corp?.servers?.[zone?.[1]]?.ices?.length ?? 0) === 1 ? 4 : 0;
  }))],
  subroutines: [installFromHqSub(), endTheRun],
};

// Searchlight
export const searchlight: CardDef = (() => {
  const sub: any = {
    label: 'Trace X - Give the Runner 1 tag',
    trace: {
      base: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement');
      }),
      label: 'Give the Runner 1 tag',
      successful: coreDefHelpers.giveTags(1),
    },
  };
  return {
    title: 'Searchlight',
    'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement');
    }),
    advanceable: ':always',
    subroutines: [sub, sub],
  };
})();

// Seidr Adaptive Barrier
export const seidrAdaptiveBarrier: CardDef = {
  title: 'Seidr Adaptive Barrier',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return (coreServers.cardToServer(state, card)?.ices ?? []).length;
  }))],
  subroutines: [endTheRun],
};

// Self-Adapting Code Wall
export const selfAdaptingCodeWall: CardDef = {
  title: 'Self-Adapting Code Wall',
  'static-abilities': [{
    type: ':cannot-lower-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]?.ice);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Semak-samun
export const semakSamun: CardDef = {
  title: 'Semak-samun',
  'static-abilities': [{
    type: ':cannot-break-subs-on-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && !coreCard.hasSubtype(context?.icebreaker, 'Fracter');
    }),
    value: true,
  }],
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('net', 3))],
};

// Sensei
export const sensei: CardDef = {
  title: 'Sensei',
  subroutines: [{
    label: 'Give encountered ice "End the run"',
    msg: 'give encountered ice "[Subroutine] End the run" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.rezzed(tgts[0]) &&
            coreCard.sameCard(tgts[0], coreIce.getCurrentIce(s)) &&
            !coreCard.sameCard(card, tgts[0]);
        }),
        value: { subroutines: [endTheRun] },
      });
    }),
  }],
};

// Seraph
export const seraph: CardDef = {
  title: 'Seraph',
  'on-encounter': {
    prompt: 'Choose one',
    player: ':runner',
    'waiting-prompt': true,
    choices: req(function*(state: State) {
      const hand = (state as any).runner?.hand ?? [];
      return [
        'Lose 3 [Credits]',
        hand.length >= 2 ? 'Suffer 2 net damage' : null,
        !forcedToAvoidTags(state, ':runner' as Side) ? 'Take 1 tag' : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])} on encountering it`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Lose 3 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, 3)], []);
      } else if (targets[0] === 'Suffer 2 net damage') {
        yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', eid, card, [corePayment.toC('net', 2)])], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1, { unpreventable: true })], []);
      }
    }),
  },
  subroutines: [runnerLosesCredits(3), coreDefHelpers.doNetDamage(2), coreDefHelpers.giveTags(1)],
};

// Shadow
export const shadow: CardDef = {
  title: 'Shadow',
  ...wallIce([gainCreditsSub(2), tagTrace(3)]),
};

// Sherlock 1.0
export const sherlock10: CardDef = {
  title: 'Sherlock 1.0',
  subroutines: [traceAbility(4, addProgramToTopOfStack), traceAbility(4, addProgramToTopOfStack)],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Sherlock 2.0
export const sherlock20: CardDef = (() => {
  const sub = traceAbility(4, {
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
    label: 'Add 1 installed program to the bottom of the stack',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `add ${(targets[0] as any)?.title} to the bottom of the stack`;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreMoving.move(state, ':runner', targets[0], ':deck');
    }),
  });
  return {
    title: 'Sherlock 2.0',
    subroutines: [sub, sub, coreDefHelpers.giveTags(1)],
    'runner-abilities': [bioraidBreak(2, 2)],
  };
})();

// Shinobi
export const shinobi: CardDef = {
  title: 'Shinobi',
  'on-rez': takeBadPub,
  subroutines: [
    traceAbility(1, coreDefHelpers.doNetDamage(1)),
    traceAbility(2, coreDefHelpers.doNetDamage(2)),
    traceAbility(3, {
      label: 'Do 3 net damage and end the run',
      msg: 'do 3 net damage and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, coreEid.makeEid(state, eid), ':net', 3, { card })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, side, eid, card)], []);
      }),
    }),
  ],
};

// Shiro
export const shiro: CardDef = {
  title: 'Shiro',
  subroutines: [
    {
      label: 'Rearrange the top 3 cards of R&D',
      msg: 'rearrange the top 3 cards of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      async: true,
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const from = ((state as any).corp?.deck ?? []).slice(0, 3);
        if (from.length > 0) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, coreIce.reorderChoice(':corp', ':runner', from, [], from.length, from), card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
    {
      label: 'The runner breaches R&D unless the corp pays 1 [Credit]',
      optional: {
        prompt: 'Pay 1 [Credits] to keep the Runner from breaching R&D?',
        'yes-ability': {
          cost: [corePayment.toC('credit', 1)],
          msg: 'keep the Runner from breaching R&D',
        },
        'no-ability': {
          async: true,
          msg: 'make the Runner breach R&D',
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.breachServer(state, ':runner', eid, [':rd'], { noRoot: true })], []);
          }),
        },
      },
    },
  ],
};

// Sleipnir
export const sleipnir: CardDef = {
  title: 'Sleipnir',
  subroutines: [
    maybeDrawSub(1),
    {
      prompt: 'Shuffle up 1 card from HQ or Archives into R&D?',
      label: 'You may shuffle 1 card from HQ or Archives into R&D',
      'show-discard': true,
      choices: { card: (c: Card) => coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
      async: true,
      msg: {
        public: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `shuffle ${coreToString.cardStr(state, targets[0])} into R&D`;
        }),
        corp: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `shuffle ${coreToString.cardStr(state, targets[0], { maybeVisible: true })} into R&D`;
        }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':corp', targets[0], ':deck');
        coreMoving.shuffle(state, ':corp', ':deck');
        coreEid.effectCompleted(state, ':corp', eid);
      }),
    },
    endTheRun,
  ],
};

// Slot Machine
export const slotMachine: CardDef = (() => {
  function effectType(card: Card): string {
    return `:slot-machine-top-3-${(card as any).cid}`;
  }
  function top3(state: State): Card[] {
    return ((state as any).runner?.deck ?? []).slice(0, 3);
  }
  function top3Types(state: State, card: Card, et: string): number {
    const effects = coreEffects.getEffects(state, ':corp', et, card);
    const cards: Card[] = effects?.[0] ?? [];
    return new Set(cards.map((c: Card) => (c as any).type)).size;
  }
  function ability(): any {
    return {
      label: 'Encounter ability (manual)',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreMoving.move(state, ':runner', (state as any).runner?.deck?.[0], ':deck');
        const t3 = top3(state);
        const et = effectType(card);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: et,
          duration: ':end-of-encounter',
          value: t3,
        });
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to put the top card of the stack to the bottom, then reveal ${utils.enumerateStr(t3.map((c: Card) => `${(c as any).title} (${(c as any).type})`))} from the top of the stack`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, eid, t3)], []);
      }),
    };
  }
  return {
    title: 'Slot Machine',
    'on-encounter': ability(),
    abilities: [ability()],
    subroutines: [
      {
        label: 'Runner loses 3 [Credits]',
        msg: 'force the Runner to lose 3 [Credits]',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', eid, 3)], []);
        }),
      },
      {
        label: 'Gain 3 [Credits]',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const et = effectType(card);
          const effects = coreEffects.getEffects(state, ':corp', et, card);
          const cards: Card[] = effects?.[0] ?? [];
          const uniqueTypes = new Set(cards.map((c: Card) => (c as any).type)).size;
          if ((uniqueTypes <= 2 && cards.length === 3) || (uniqueTypes === 1 && cards.length === 2)) {
            coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to gain 3 [Credits]`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreGaining.gainCredits(state, ':corp', eid, 3)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
      {
        label: 'Place 3 advancement counters',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const et = effectType(card);
          const effects = coreEffects.getEffects(state, ':corp', et, card);
          const cards: Card[] = effects?.[0] ?? [];
          const uniqueTypes = new Set(cards.map((c: Card) => (c as any).type)).size;
          if (cards.length === 3 && uniqueTypes === 1) {
            const placeAbility = {
              choices: { card: (c: Card) => coreCard.installed(c) },
              prompt: 'Choose an installed card',
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `place 3 advancement counters on ${coreToString.cardStr(s, tgts[0])}`;
              }),
              async: true,
              effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreProps.addProp(s, sd, e, tgts[0], ':advance-counter', 3, { placed: true })], []);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, placeAbility, card, null)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    ],
  };
})();

// Snoop
export const snoop: CardDef = {
  title: 'Snoop',
  'on-encounter': {
    msg: msg(function(state: State) {
      return `reveal ${utils.enumerateCards((state as any).runner?.hand ?? [], { sorted: true })} from the grip`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, eid, (state as any).runner?.hand ?? [])], []);
    }),
  },
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':power') > 0;
    }),
    'change-in-game-state': { req: req(function*(state: State) { return ((state as any).runner?.hand?.length ?? 0) > 0; }) },
    cost: [corePayment.toC('power', 1)],
    label: 'Reveal all cards in the grip and trash 1 card',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const trashAbility = coreRevealing.withRevealedHand(':runner', { eventSide: ':corp' }, {
        prompt: 'Choose a card to trash',
        req: req(function*(s: State) { return ((s as any).runner?.hand?.length ?? 0) > 0; }),
        choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) },
        async: true,
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `trash ${(tgts[0] as any)?.title} from the Grip`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreMoving.trash(s, sd, e, tgts[0], { causeCard: c })], []);
        }),
      });
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, trashAbility, card, null)], []);
    }),
  }],
  subroutines: [traceAbility(3, gainPowerCounter)],
};

// Snowflake
export const snowflake: CardDef = {
  title: 'Snowflake',
  subroutines: [doPsi(endTheRun)],
};

// Sorocaban Blade
export const sorocabanBlade: CardDef = {
  title: 'Sorocaban Blade',
  events: [
    {
      event: ':corp-trash',
      silent: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return !!coreIce.getCurrentEncounter(state) &&
          (targets as any[]).some((t: any) => coreCard.runner(t.card) && coreCard.installed(t.card));
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreCard.updateCard(state, side, Object.assign({}, card, { special: Object.assign({}, (card as any).special, { sorocabanBlade: true }) }));
      }),
    },
    {
      event: ':end-of-encounter',
      silent: true,
      req: req(function*() { return true; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreCard.updateCard(state, side, Object.assign({}, card, { special: Object.assign({}, (card as any).special, { sorocabanBlade: undefined }) }));
      }),
    },
  ],
  subroutines: [
    trashResourceSub,
    Object.assign({}, trashHardwareSub, {
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !(card as any)?.special?.sorocabanBlade;
      }) },
    }),
    Object.assign({}, trashProgramSub, {
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !(card as any)?.special?.sorocabanBlade;
      }) },
    }),
  ],
};

// Special Offer
export const specialOffer: CardDef = {
  title: 'Special Offer',
  subroutines: [{
    label: 'Gain 5 [Credits] and trash this ice',
    msg: 'gain 5 [Credits] and trash itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 5)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Spiderweb
export const spiderweb: CardDef = {
  title: 'Spiderweb',
  subroutines: [endTheRun, endTheRun, endTheRun],
};

// Starlit Knight
export const starlitKnight: CardDef = {
  title: 'Starlit Knight',
  'on-encounter': {
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) { return coreThreat.threatLevel(4, state); }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const subs = utils.sumTagEffects(state);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        value: req(function*() { return { subroutines: Array(subs).fill(endTheRun) }; }),
      });
    }),
  },
  subroutines: [coreDefHelpers.giveTags(1), coreDefHelpers.giveTags(1)],
};

// Stavka
export const stavka: CardDef = {
  title: 'Stavka',
  'on-rez': {
    optional: {
      prompt: 'Trash another card to give Stavka +5 strength?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, side,
          Object.assign({}, eid, { source: card, sourceType: ':ability' }), card, null,
          [corePayment.toC('trash-other-installed', 1)]);
      }),
      'yes-ability': {
        prompt: 'Choose another installed card to trash',
        cost: [corePayment.toC('trash-other-installed', 1)],
        msg: 'give itself +5 strength for the remainder of the run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          if ((state as any).run) {
            coreEffects.registerLingeringEffect(state, side, card, {
              type: ':ice-strength',
              duration: ':end-of-run',
              req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(tgts[0], card); }),
              value: 5,
            });
            coreIce.updateIceStrength(state, side, card);
          }
        }),
      },
    },
  },
  subroutines: [trashProgramSub, trashProgramSub],
};

// Surveyor
export const surveyor: CardDef = {
  title: 'Surveyor',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
  }))],
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
  }),
  subroutines: [
    {
      label: 'Trace X - Give the Runner 2 tags',
      trace: {
        base: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
        }),
        label: 'Give the Runner 2 tags',
        successful: coreDefHelpers.giveTags(2),
      },
    },
    {
      label: 'Trace X - End the run',
      trace: {
        base: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return 2 * ((coreServers.cardToServer(state, card)?.ices ?? []).length);
        }),
        label: 'End the run',
        successful: endTheRun,
      },
    },
  ],
};

// Susanoo-no-Mikoto
export const susanooNoMikoto: CardDef = {
  title: 'Susanoo-no-Mikoto',
  subroutines: [{
    async: true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State) {
        return !!(state as any).run && (state as any).run?.server?.[0] !== ':discard';
      }),
    },
    msg: 'make the Runner continue the run on Archives',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const run = (state as any).run;
      const lingering = coreEffects.registerLingeringEffect(state, side, card, {
        type: ':cannot-jack-out',
        value: true,
        duration: ':end-of-run',
      });
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        effect: req(function*(s: State, sd: Side) {
          coreEffects.unregisterEffectByUuid(s, sd, lingering);
        }),
      }]);
      if (run && (run.encounters ?? []).length === 1 && run.phase !== ':success') {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.encounterEnds(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Swarm
export const swarm: CardDef = (() => {
  const sub: any = {
    player: ':runner',
    async: true,
    label: 'Trash a program',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        'The Corp trashes a program',
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ? 'Pay 3 [Credits]' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 3 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 3)])], []);
        coreSay.systemMsg(state, ':runner', result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':corp', trashProgramSub, card, null)], []);
      }
    }),
  };
  return Object.assign({}, heroToHero(sub), { title: 'Swarm', 'on-rez': takeBadPub });
})();

// Swordsman
export const swordsman: CardDef = {
  title: 'Swordsman',
  'static-abilities': [{
    type: ':cannot-break-subs-on-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      return coreCard.sameCard(card, context?.ice) && coreCard.hasSubtype(context?.icebreaker, 'AI');
    }),
    value: true,
  }],
  subroutines: [
    {
      async: true,
      prompt: 'Choose an AI program to trash',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return `trash ${(targets[0] as any)?.title}`; }),
      label: 'Trash an AI program',
      'change-in-game-state': { silent: true, req: req(function*(state: State) {
        return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c) && coreCard.hasSubtype(c, 'AI'));
      }) },
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) && coreCard.hasSubtype(c, 'AI') },
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    coreDefHelpers.doNetDamage(1),
  ],
};

// SYNC BRE
export const syncBre: CardDef = {
  title: 'SYNC BRE',
  subroutines: [
    tagTrace(4),
    traceAbility(2, {
      label: 'Runner reduces cards accessed by 1 for this run',
      msg: 'reduce cards accessed for this run by 1',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreRuns.accessBonus(state, ':total', -1);
      }),
    }),
  ],
};

// Syailendra
export const syailendra: CardDef = {
  title: 'Syailendra',
  advanceable: ':always',
  'on-encounter': Object.assign({}, coreDefHelpers.placeAdvancementCounter(true), {
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement') >= 3;
    }),
  }),
  subroutines: [
    coreDefHelpers.placeAdvancementCounter(true),
    runnerLosesCredits(2),
    coreDefHelpers.doNetDamage(1),
  ],
};

// Tapestry
export const tapestry: CardDef = {
  title: 'Tapestry',
  subroutines: [
    runnerLosesClick,
    maybeDrawSub(1),
    {
      req: req(function*(state: State) { return ((state as any).corp?.hand?.length ?? 0) > 0; }),
      prompt: 'Choose a card in HQ to move to the top of R&D',
      choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
      msg: 'add 1 card in HQ to the top of R&D',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, side, targets[0], ':deck', { front: true });
      }),
    },
  ],
};

// Tatu-Bola
export const tatuBola: CardDef = {
  title: 'Tatu-Bola',
  events: [{
    event: ':pass-ice',
    interactive: req(function*(state: State) { return !!(state as any).run; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(targets[0]?.ice, card);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const iceInHand = ((state as any).corp?.hand ?? []).filter((c: Card) => coreCard.ice(c));
      let innerAbility: any;
      if (iceInHand.length > 0) {
        innerAbility = {
          optional: {
            prompt: msg(function(s: State) { return `Gain 4 [Credits] and swap ${coreToString.cardStr(s, card)} with a piece of ice in HQ?`; }),
            'waiting-prompt': true,
            'no-ability': { msg: 'decline to install a card' },
            'yes-ability': {
              prompt: 'Choose a piece of ice',
              'waiting-prompt': true,
              choices: req(function*(s: State) { return ((s as any).corp?.hand ?? []).filter((c: Card) => coreCard.ice(c)); }),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreCard.swapCardsAsync(s, sd, coreEid.makeEid(s, e), tgts[0], coreCard.getCard(s, card))], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(s, ':corp', e, 4)], []);
              }),
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `swap ${coreToString.cardStr(s, card)} with a piece of ice from HQ and gain 4 [Credits]`;
              }),
            },
          },
        };
      } else {
        innerAbility = {
          prompt: 'You have no ice', choices: ['OK'], 'waiting-prompt': true, msg: 'decline to install a card',
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
    }),
  }],
  subroutines: [endTheRun],
};

// Taurus
export const taurus: CardDef = {
  title: 'Taurus',
  ...constellationIce(trashHardwareSub),
};

// Thimblerig
export const thimblerig: CardDef = (() => {
  function ability(): any {
    return {
      interactive: req(function*(state: State) { return !!(state as any).run; }),
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const installed = coreBoard.allInstalled(state, ':corp').filter((c: Card) => coreCard.ice(c));
          const inRun = !!(state as any).run;
          return installed.length >= 2 && (!inRun || coreCard.sameCard(targets[0]?.ice, card));
        }),
        prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `Swap ${coreToString.cardStr(state, card)} with another ice?`;
        }),
        'yes-ability': {
          prompt: 'Choose a piece of ice to swap Thimblerig with',
          choices: { card: (c: Card) => coreCard.ice(c), 'not-self': true },
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreIce.swapIce(state, side, card, targets[0]);
          }),
          msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return `swap ${coreToString.cardStr(state, card)} with ${coreToString.cardStr(state, targets[0])}`;
          }),
        },
      },
    };
  }
  return {
    title: 'Thimblerig',
    events: [
      Object.assign({}, ability(), { event: ':pass-ice' }),
      Object.assign({}, ability(), { event: ':corp-turn-begins' }),
    ],
    subroutines: [endTheRun],
  };
})();

// Thoth
export const thoth: CardDef = {
  title: 'Thoth',
  'on-encounter': coreDefHelpers.giveTags(1),
  subroutines: [
    traceAbility(4, {
      label: 'Do 1 net damage for each Runner tag',
      async: true,
      msg: msg(function(state: State) { return `do ${utils.countTags(state)} net damage`; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', utils.countTags(state), { card })], []);
      }),
    }),
    traceAbility(4, {
      label: 'Runner loses 1 [Credits] for each tag',
      async: true,
      msg: msg(function(state: State) { return `force the Runner to lose ${utils.countTags(state)} [Credits]`; }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, utils.countTags(state))], []);
      }),
    }),
  ],
};

// Tithe
export const tithe: CardDef = {
  title: 'Tithe',
  subroutines: [coreDefHelpers.doNetDamage(1), gainCreditsSub(1)],
};

// Tithonium
export const tithonium: CardDef = {
  title: 'Tithonium',
  'alternative-cost': [corePayment.toC('forfeit', 1)],
  'cannot-host': true,
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    {
      label: 'Trash a resource and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const resources = coreBoard.allInstalled(state, ':runner').filter((c: Card) => coreCard.resource(c));
        let trashedCard: Card | null = null;
        if (resources.length > 0) {
          const trashAbility = {
            req: req(function*() { return resources.length > 0; }),
            async: true,
            choices: { all: true, card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine' })], []);
              coreEid.completeWithResult(s, sd, e, tgts[0]);
            }),
          };
          trashedCard = yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, trashAbility, card, null)], []);
        }
        coreSay.systemMsg(state, side,
          `uses ${(card as any).title} to ${trashedCard ? `trash ${(trashedCard as any).title} and ends the run` : 'end the run'}`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.endRun(state, side, eid, card)], []);
      }),
    },
  ],
};

// TL;DR
export const tldr: CardDef = {
  title: 'TL;DR',
  subroutines: [{
    label: 'Duplicate each subroutine on a piece of ice',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `duplicate each subroutine on ${(tgts[0]?.ice as any)?.title}`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const t = tgts[0]?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':tldr-effect',
            duration: ':end-of-encounter',
            value: 1,
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(t, tgts2[0]);
            }),
          });
        }),
      }]);
    }),
  }],
};

// TMI
export const tmi: CardDef = {
  title: 'TMI',
  'on-rez': {
    trace: {
      base: 2,
      msg: 'keep TMI rezzed',
      label: 'Keep TMI rezzed',
      unsuccessful: {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, side, eid, card)], []);
        }),
      },
    },
  },
  subroutines: [endTheRun],
};
