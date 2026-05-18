/**
 * Agenda Cards
 * Ported from Clojure cards/agendas.clj to TypeScript
 *
 * Contains ~181 card definitions with their abilities and events.
 * Each card has properties like on-score, on-access, events, static-abilities, etc.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAgendas from '../core/agendas';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
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
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set_aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { iceBoostAgenda } from './_helpers';
import type { CardDef } from '../../types';

import { agendaCounters } from './agendas_1';
import * as coreBadPublicity from '../core/bad_publicity';

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const state: any = undefined as any;
const target: any = undefined as any;
const side: any = undefined as any;
const asyncResult: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function projectAgenda(_args?: any): any { return {}; }

// Salvo Testing
export const salvoTesting: CardDef = {
  title: 'Salvo Testing',
  events: [{
    event: 'agenda-scored',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    optional: {
      prompt: 'Do 1 core damage?',
      'waiting-prompt': true,
      'yes-ability': { msg: 'do 1 core damage', async: true, effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }) },
    },
  }],
};

// SDS Drone Deployment
export const sdsDroneDeployment: CardDef = {
  title: 'SDS Drone Deployment',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return [corePayment.toC('program', 1)]; }),
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreBoard.allInstalledRunnerType(state, ':program').length > 0;
    }),
    'waiting-prompt': true,
    prompt: 'Choose a program to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c), all: true },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return target.title; })(); },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreMoving.trash(eid, target, { causeCard: card }); }),
  },
};

// See How They Run
export const seeHowTheyRun: CardDef = {
  title: 'See How They Run',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    msg: 'give the runner 1 tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, ':runner', 1)], []);
      continue_ability(
        state, side,
        {
          msg: 'start a psi game (do 1 core damage / do 1 net damage)',
          psi: {
            'not-equal': { msg: 'do 1 core damage', async: true, effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })) },
            equal: { async: true, msg: 'do 1 net damage', effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })) },
          },
        },
        card,
        null
      );
    }),
  },
};

// Self-Destruct Chips
export const selfDestructChips: CardDef = {
  title: 'Self-Destruct Chips',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to decrease the Runner's maximum hand size by 1`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [coreHandSize.runnerHandSizePlus(-1)],
};

// Send a Message
export const sendMessage: CardDef = {
  title: 'Send a Message',
  abilities: [{
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' }); }),
  }],
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' }); }),
  },
  stolen: {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' }); }),
  },
};

// Sensor Net Activation
export const sensorNetActivation: CardDef = {
  title: 'Sensor Net Activation',
  'on-score': agendaCounters(1),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => coreCard.hasSubtype(c, 'Bioroid') && !coreCard.rezzed(c));
    }),
    label: 'Choose a bioroid to rez, ignoring all costs',
    prompt: 'Choose a bioroid to rez, ignoring all costs',
    choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Bioroid') && !coreCard.rezzed(c) },
    async: true,
    effect: effect(function*(state: State, Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.rez(state, side, target, { 'ignore-cost': ':all-costs', msgKeys: { includeCostFromEid: eid } })], []);
      const c = (asyncResult || {}).card;
      const ev = ((state as any).activePlayer === ':corp') ? ':corp-turn-ends' : ':runner-turn-ends';
      coreEngine.registerEvents(state, side, card, [{
        event: ev,
        'unregister-once-resolved': true,
        duration: ':end-of-turn',
        async: true,
        effect: effect(coreRezzing.derez(eid, c)),
      }]);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Sentinel Defense Program
export const sentinelDefenseProgram: CardDef = {
  title: 'Sentinel Defense Program',
  events: [{
    event: 'damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.amount > 0 && ctx['damage-type'] === ':brain');
    }),
    msg: 'do 1 net damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':net', 1, { card: card }); }),
  }],
};

// Sericulture Expansion
export const sericultureExpansion: CardDef = {
  title: 'Sericulture Expansion',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    ...Object.assign(coreDefHelpers.placeAdvancementCounter(null, 2), {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreBoard.allInstalled(state, ':corp').length > 0 &&
          corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
      }),
      cost: [corePayment.toC('agenda', 1)],
    }),
  }],
};

// Show of Force
export const showOfForce: CardDef = {
  title: 'Show of Force',
  'on-score': {
    async: true,
    msg: 'do 2 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 2, { card: card }); }),
  },
};

// Sisyphus Protocol
export const sisyphusProtocol: CardDef = {
  title: 'Sisyphus Protocol',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      const ice = ctx.ice || {};
      return coreCard.rezzed(ice) &&
        (coreCard.hasSubtype(ice, 'Code Gate') || coreCard.hasSubtype(ice, 'Sentry')) &&
        coreEvents.firstEvent(state, side, 'pass-ice', (t: any[]) => {
          const first = t[0];
          const firstIce = first?.ice || {};
          return coreCard.rezzed(firstIce) &&
            (coreCard.hasSubtype(firstIce, 'Code Gate') || coreCard.hasSubtype(firstIce, 'Sentry'));
        });
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const ctx = forms.context(state, card, targets) || {};
      const encIce = coreCard.getCard(state, ctx.ice);
      continue_ability(
        state, side,
        {
          prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Make the runner encounter ${encIce.title} again?`,
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const opts: string[] = [];
            if (corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 1)])) opts.push('Pay 1 [Credit]');
            if (corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('trash-from-hand', 1)])) opts.push('Trash 1 card from HQ');
            opts.push('Done');
            return opts.filter(Boolean);
          }),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            if (target === 'Done') {
              coreEid.effectCompleted(state, side, eid);
            } else {
              continue_ability(
                state, side,
                {
                  cost: target === 'Pay 1 [Credit]' ? [corePayment.toC('credit', 1)] : [corePayment.toC('trash-from-hand', 1)],
                  'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                    return encIce && coreCard.rezzed(encIce);
                  })},
                  msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `make the runner encounter ${coreToString.cardStr(state, encIce)} again`,
                  async: true,
                  effect: effect(coreRuns.forceIceEncounter(state, side, eid, encIce)),
                },
                card,
                null
              );
            }
          }),
        },
        encIce,
        targets
      );
    }),
  }],
};

// Slash and Burn Agriculture
export const slashAndBurnAgriculture: CardDef = {
  title: 'Slash and Burn Agriculture',
  expend: Object.assign(coreDefHelpers.placeAdvancementCounter(true, 2), { cost: [corePayment.toC('credit', 1)] }),
};

// SSL Endorsement
export const sslEndorsement: CardDef = {
  title: 'SSL Endorsement',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  abilities: [coreOptional.setAutoresolve(':auto-fire', 'SSL Endorsement')],
  stolen: agendaCounters(9, ':credit'),
  'on-score': agendaCounters(9, ':credit'),
  events: [{
    event: 'corp-turn-begins',
    automatic: ':gain-credits',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (coreCard.getCounters(card, ':credit') || 0) > 0;
      }),
      'once': ':per-turn',
      prompt: 'Gain 3 [Credits]?',
      autoresolve: coreOptional.getAutoresolve(':auto-fire'),
      'yes-ability': {
        async: true,
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${Math.min(3, coreCard.getCounters(card, ':credit') || 0)} [Credits]`,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          if ((coreCard.getCounters(card, ':credit') || 0) > 0) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.takeCredits(state, side, eid, card, ':credit', 3)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    },
  }],
};

// Standoff
export const standoff: CardDef = {
  title: 'Standoff',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      corePrompts.showWaitPrompt(String((side === ':corp' ? 'Runner' : 'Corp') + ' to trash a card for Standoff'));
      continue_ability(':runner', stand(':runner'), card, null);
    }),
  },
};

function stand(side: string): any {
  return {
    async: true,
    prompt: 'Choose one of your installed cards to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreTags.sameSide(side, (c as any).side) },
    cancel: {
      'display-side': side,
      msg: 'decline trashing any more cards',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (side === ':runner') {
          yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, ':corp', 1)], []);
          corePrompts.clearWaitPrompt(state, ':corp');
          coreSay.systemMsg(state, ':corp', `uses ${card.title} to draw 1 card and gain 5 [Credits]`);
          coreGaining.gainCredits(state, ':corp', eid, 5);
        } else {
          corePrompts.clearWaitPrompt(state, ':runner');
          coreEid.effectCompleted(state, ':corp', eid);
        }
      }),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, target,
        side === ':corp' ? { unpreventable: true, causeCard: card } : { unpreventable: true, causeCard: card, cause: ':forced-to-trash' }
      )], []);
      coreSay.systemMsg(state, side, `trashes ${coreToString.cardStr(state, target)} for ${card.title}`);
      corePrompts.clearWaitPrompt(state, coreTags.otherSide(side));
      corePrompts.showWaitPrompt(state, side, `${coreTags.sideStr(coreTags.otherSide(side))} to trash a card for ${card.title}`);
      continue_ability(state, coreTags.otherSide(side), stand(coreTags.otherSide(side)), card, null);
    }),
  };
}

// Stegodon MK IV
export const stegodonMKIV: CardDef = {
  title: 'Stegodon MK IV',
  events: [
    {
      event: 'run',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const rezzedTargets = (coreBoard.allInstalledCorp(state) || [])
          .filter((c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] !== (forms.context(state, card, targets) || {}).server);
        if (rezzedTargets.length > 0) {
          continue_ability(
            state, side,
            {
              prompt: 'Choose a piece of ice protecting another server to derez',
              'waiting-prompt': true,
              choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                return rezzedTargets.some((c: Card) => coreCard.sameCard(c, targets[0]));
              })},
              'once': ':per-turn',
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, side, target, { msgKeys: { 'and-then': ' and gain 1 [Credits]' } })], []);
                coreGaining.gainCredits(state, side, eid, 1);
              }),
            },
            card,
            null
          );
        }
      }),
    },
    {
      event: 'derez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return forms.run(state) && coreEvents.firstRunEvent(state, side, 'derez', (ctx: any[]) => ctx.some((c: any) => coreCard.ice(c.card)));
      }),
      msg: 'lower strength of each installed icebreaker by 2',
    },
  ],
  'leave-play': effect(coreIce.updateAllIcebreakers()),
  'static-abilities': [{
    type: ':breaker-strength',
    value: -2,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return forms.run(state) &&
        coreCard.hasSubtype(targets[0] || {}, 'Icebreaker') &&
        coreEvents.runEventCount(state, side, 'derez', (ctx: any[]) => ctx.some((c: any) => coreCard.ice(c.card))) >= 1;
    }),
  }],
};

// Sting!
export const sting: CardDef = {
  title: 'Sting!',
  'on-score': {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `deal ${1 + countOppStings(state, ':corp')} net damage`,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':net', 1 + countOppStings(state, ':corp'), { card: card }); }),
  },
  stolen: {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `deal ${1 + countOppStings(state, ':runner')} net damage`,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':net', 1 + countOppStings(state, ':runner'), { card: card }); }),
  },
};

function countOppStings(state: State, side: Side): number {
  const scored = (state as any)[side]?.scored || [];
  return scored.filter((c: Card) => c.title === 'Sting!').length;
}

// Stoke the Embers
export const stokeTheEmbers: CardDef = {
  title: 'Stoke the Embers',
  'on-score': scoreAbi(3),
  'derezzed-events': [{
    event: 'corp-install',
    optional: {
      prompt: 'Reveal this agenda to gain 2 [Credits] and place 1 advancement counter on an installed card?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        return (card as any).previousZone?.[0] !== ':hand' &&
          coreCard.sameCard((target as any)?.card || {}, card);
      }),
      'waiting-prompt': true,
      'yes-ability': {
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `reveal itself from ${(card as any).previousZone?.[0]}`,
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, card)], []);
          continue_ability(state, side, scoreAbi(2), coreCard.getCard(state, card), null);
        }),
      },
    },
  }],
};

function scoreAbi(credGain: number): any {
  return {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${credGain} [Credits]`,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), credGain)], []);
      const placeAbi = Object.assign(coreDefHelpers.placeAdvancementCounter(null, 1), {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return coreBoard.allInstalledCorp(state).length > 0;
        }),
      });
      continue_ability(state, side, placeAbi, card, null);
    }),
  };
}

// Successful Field Test
export const successfulFieldTest: CardDef = {
  title: 'Successful Field Test',
  'on-score': {
    async: true,
    msg: 'install cards from HQ, ignoring all costs',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corp = (state as any).corp;
      const handOps = (corp?.hand || []).filter((c: Card) => !coreCard.operation(c));
      const maxOps = handOps.length;
      continue_ability(state, side, sft(1, maxOps), card, null);
    }),
  },
};

function sft(n: number, maxOps: number): any {
  return {
    prompt: 'Choose a card in HQ to install',
    async: true,
    choices: { card: (c: Card) => coreCard.corp(c) && !coreCard.operation(c) && coreCard.inHand(c) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(state, side, target, null, {
        'ignore-all-cost': true, msgKeys: { installSource: card, displayOrigin: true }
      })], []);
      if (n < maxOps) {
        continue_ability(state, side, sft(n + 1, maxOps), card, null);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Superconducting Hub
export const superconductingHub: CardDef = {
  title: 'Superconducting Hub',
  'static-abilities': [{
    type: ':hand-size',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return side === ':corp'; }),
    value: 2,
  }],
  'on-score': {
    optional: {
      prompt: 'Draw 2 cards?',
      'yes-ability': { msg: 'draw 2 cards', async: true, effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDrawing.draw(':corp', eid, 2); }) },
    },
  },
};

// Superior Cyberwalls
export const superiorCyberwalls: CardDef = {
  title: 'Superior Cyberwalls',
  ...iceBoostAgenda('Barrier'),
};

// TGTBT
export const tgtbt: CardDef = {
  title: 'TGTBT',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  'on-access': coreDefHelpers.giveTags(1),
};

// The Cleaners
export const theCleaners: CardDef = {
  title: 'The Cleaners',
  prevention: [{
    prevents: ':pre-damage',
    type: ':event',
    'max-uses': 1,
    mandatory: true,
    ability: {
      async: true,
      condition: ':active',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.type === ':meat' &&
          ctx.prevented !== ':all' &&
          ctx['source-player'] === ':corp' &&
          !ctx.unboostable;
      }),
      msg: 'increase the pending meat damage by 1',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damageBoost(state, side, eid, 1); }),
    },
  }],
};

// The Future is Now
export const theFutureIsNow: CardDef = {
  title: 'The Future is Now',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    prompt: 'Choose a card to add to HQ',
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).corp?.deck?.length > 0; }) },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).corp?.deck || []; }),
    msg: 'add a card from R&D to HQ and shuffle R&D',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (state as any).corp?.deck?.length > 0;
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreShuffling.shuffle(state, side, ':deck'); coreMoving.move(state, side, target, 'hand'); }),
  },
};

// The Future Perfect
export const theFuturePerfect: CardDef = {
  title: 'The Future Perfect',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  'on-access': {
    psi: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !forms.installed(state, card); }),
      'not-equal': {
        msg: 'prevent itself from being stolen',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreFlags.registerRunFlag(card, ':can-steal', function(_s: State, _sd: Side, c: Card) { return !coreCard.sameCard(c, card); }); coreEid.effectCompleted(eid); }),
      },
    },
  },
};

// Timely Public Release
export const timelyPublicRelease: CardDef = {
  title: 'Timely Public Release',
  'on-score': agendaCounters(1),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': false,
    label: 'Install a piece of ice in any position, ignoring all costs',
    prompt: 'Choose a piece of ice to install',
    'show-discard': true,
    choices: { card: (c: Card) => coreCard.ice(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    async: true,
    msg: 'install an ice from HQ or Archives',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const chosenIce = target;
      continue_ability(
        state, side,
        {
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreBoard.installableServers(state, chosenIce); }),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const chosenServer = target;
            const zone = [...coreBoard.serverToZone(state, chosenServer), ':ices'];
            const numIce = ((state as any).corp?.servers?.[zone[1]]?.ices || []).length;
            continue_ability(
              state, side,
              {
                prompt: `Which position to install in? (0 is innermost)`,
                choices: Array.from({ length: numIce + 1 }, (_, i) => String(i)).reverse(),
                async: true,
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                  const idx = parseInt(target, 10);
                  yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(state, side, eid, chosenIce, chosenServer, {
                    'ignore-all-cost': true, index: idx, msgKeys: { installSource: card, displayOrigin: true }
                  })], []);
                }),
              },
              card,
              null
            );
          }),
        },
        card,
        null
      );
    }),
  }],
};

// Tomorrow's Headline
export const tomorrowsHeadline: CardDef = {
  title: "Tomorrow's Headline",
  'on-score': coreDefHelpers.giveTags(1),
  stolen: coreDefHelpers.giveTags(1),
};

// Transport Monopoly
export const transportMonopoly: CardDef = {
  title: 'Transport Monopoly',
  'on-score': agendaCounters(2),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'once': ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }),
    msg: 'prevent this run from becoming successful',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEffects.registerLingeringEffect(card, {
      type: ':block-successful-run',
      duration: ':end-of-run',
      value: true,
    }); }),
  }],
};

// Underway Renovation
export const underwayRenovation: CardDef = {
  title: 'Underway Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
      const n = adv >= 4 ? 2 : 1;
      const runnerDeck = (state as any).runner?.deck || [];
      if (runnerDeck.length > 0) {
        return `trash ${utils.enumerateCards(runnerDeck.slice(0, n))} from the stack`;
      }
      return 'trash no cards from the stack (it is empty)';
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
      const n = adv >= 4 ? 2 : 1;
      coreMoving.mill(':corp', eid, ':runner', n);
    }),
  }],
};

function adv4(s: State, c: Card): number {
  return (coreCard.getCounters(coreCard.getCard(s, c), ':advancement') || 0) >= 4 ? 2 : 1;
}

// Unorthodox Predictions
export const unorthodoxPredictions: CardDef = {
  title: 'Unorthodox Predictions',
  implementation: 'Prevention of subroutine breaking is not enforced',
  'on-score': {
    prompt: 'Choose an ice type',
    choices: ['Barrier', 'Code Gate', 'Sentry'],
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `prevent subroutines on ${target} ice from being broken until next turn`; })(); },
  },
};

// Utopia Fragment
export const utopiaFragment: CardDef = {
  title: 'Utopia Fragment',
  'static-abilities': [{
    type: ':steal-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreCard.getCounters(targets[0] || {}, ':advancement') || 0) > 0;
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return corePayment.toC('credit', 2 * (coreCard.getCounters(targets[0] || {}, ':advancement') || 0));
    }),
  }],
};

// Vanity Project
export const vanityProject: CardDef = {
  title: 'Vanity Project',
  // No special implementation
  ...{},
};

// Veterans Program
export const veteransProgram: CardDef = {
  title: 'Veterans Program',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    msg: 'remove 2 bad publicity',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.loseBadPublicity(2); }),
  },
};

// Viral Weaponization
export const viralWeaponization: CardDef = {
  title: 'Viral Weaponization',
  'on-score': {
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.registerEvents(card, [{
      event: ((state as any).activePlayer === ':corp') ? ':corp-turn-ends' : ':runner-turn-ends',
      'unregister-once-resolved': true,
      duration: ':end-of-turn',
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `do ${(state as any).runner?.hand?.length} net damage`,
      async: true,
      effect: effect(coreDamage.damage(eid, ':net', (state as any).runner?.hand?.length || 0, { card: card })),
    }]); }),
  },
};

// Voting Machine Initiative
export const votingMachineInitiative: CardDef = {
  title: 'Voting Machine Initiative',
  'on-score': agendaCounters(3),
  events: [{
    event: 'runner-turn-begins',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0;
      }),
      'waiting-prompt': true,
      prompt: 'Make the Runner lose [Click]?',
      'yes-ability': {
        msg: 'make the Runner lose [Click]',
        cost: [corePayment.toC('agenda', 1)],
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.loseClicks(':runner', 1); }),
      },
    },
  }],
};

// Vulcan Coverup
export const vulcanCoverup: CardDef = {
  title: 'Vulcan Coverup',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    msg: 'do 2 meat damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 2, { card: card }); }),
  },
  stolen: {
    msg: 'force the Corp to take 1 bad publicity',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity(':corp', eid, 1); }),
  },
};

// Vulnerability Audit
export const vulnerabilityAudit: CardDef = {
  title: 'Vulnerability Audit',
  flags: {
    'can-score': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const result = coreCard.installed(card) !== ':this-turn';
      if (!result) {
        coreToasts.toast(state, ':corp', 'Cannot score Vulnerability Audit the turn it was installed.', 'warning');
      }
      return result;
    }),
  },
};

// Water Monopoly
export const waterMonopoly: CardDef = {
  title: 'Water Monopoly',
  'static-abilities': [{
    type: ':install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const targetCard = targets[0];
      const secondTarget = targets[1];
      return coreCard.resource(targetCard) &&
        !coreCard.hasSubtype(targetCard, 'Virtual') &&
        !(secondTarget as any)?.facedown;
    }),
    value: 1,
  }],
};

// Witch Hunt
export const witchHunt: CardDef = {
  title: 'Witch Hunt',
  stolen: bpAbi,
  'on-score': bpAbi,
  events: [{
    'unregister-once-resolved': true,
    event: 'corp-action-phase-ends',
    duration: ':end-of-turn',
    req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ((forms.tagged(state) || 0) > 0 ? 'Remove all tags, and then give the Runner 3 tags' : 'give the Runner 3 tags'),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((forms.tagged(state) || 0) > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, ':all', { suppressCheckpoint: true })], []);
        coreTags.gainTags(state, side, eid, 3);
      } else {
        coreTags.gainTags(state, side, eid, 3);
      }
    }),
  }],
};

const bpAbi: any = {
  msg: 'take 1 bad publicity',
  async: true,
  effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity(':corp', eid, 1); }),
};
