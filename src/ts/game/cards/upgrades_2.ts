/**
 * Upgrade Cards
 * Ported from Clojure cards/upgrades.clj to TypeScript
 *
 * Contains ~118 card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost-fns';
import * as coreCosts from '../core/costs';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play-instants';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

import { canSmartPurge } from './upgrades_1';

// Cayambe Grid
export const cayambeGrid: CardDef = {
  title: 'Cayambe Grid',
  events: [
    {
      event: ':corp-turn-begins',
      interactive: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const allInstalled = coreBoard.allInstalled(state, ':corp');
        const count = allInstalled.filter((c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c)).length;
        return count > 0;
      }),
      label: 'place 1 advancement counter (start of turn)',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const allInstalled = coreBoard.allInstalled(state, ':corp');
        const count = allInstalled.filter((c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c)).length;
        if (count > 0) {
          yield wait_for(state, [{ asyncResult: 'result' },
            continue_ability(state, side, {
              prompt: `Place 1 advancement counter on an ice protecting ${coreServers.zoneToName((card as any).zone?.[1])}`,
              choices: { card: (c: Card) => coreCard.ice(c) && coreServers.sameServer(c, card) },
              msg: msg((msgFn: any) => `place 1 advancement counter on ${coreToString.cardStr(state, target)}`),
              async: true,
              effect: effect(coreProps.addProp(eid, target, ':advance-counter', 1, { placed: true })),
            }, card, null)], []);
        }
      }),
    },
    {
      event: ':approach-server',
      interactive: req(() => true),
      req: req(forms.thisServer),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runIces = coreIce.getRunIces(state);
        const cost = runIces.filter((c: Card) => coreCard.getCounters(c, ':advancement') > 0).length * 2;
        const choices: string[] = [];
        if (corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', cost)])) {
          choices.push(`Pay ${cost} [Credits]`);
        }
        choices.push('End the run');
        yield wait_for(state, [{ asyncResult: 'result' },
          continue_ability(state, side, {
            async: true,
            player: ':runner',
            'waiting-prompt': true,
            prompt: 'Choose one',
            choices,
            msg: msg((msgFn: any) =>
              target === 'End the run' ? target.toLowerCase() : `force the Runner to ${target.toLowerCase()}`),
            effect: effect(function*(s: State, sd: Side, eid2: EID, c2: Card, t: any[]) {
              if (target === 'End the run') {
                yield wait_for(s, [{ asyncResult: 'result' }, coreRuns.endRun(s, sd, eid2, c2)], []);
              } else {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.pay(s, ':runner', coreEid.makeEid(s, eid), card, corePayment.toC('credit', cost))], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreSay.systemMsg(s, ':runner', (forms.context(s, c2, t) as any)?.msg || '')], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEffects.effectCompleted(s, sd, eid2)], []);
              }
            }),
          }, card, null)], []);
      }),
    },
  ],
  abilities: [
    {
      interactive: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const allInstalled = coreBoard.allInstalled(state, ':corp');
        const count = allInstalled.filter((c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c)).length;
        return count > 0;
      }),
      label: 'place 1 advancement counter (start of turn)',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const allInstalled = coreBoard.allInstalled(state, ':corp');
        const count = allInstalled.filter((c: Card) => coreCard.ice(c) && coreServers.sameServer(card, c)).length;
        if (count > 0) {
          yield wait_for(state, [{ asyncResult: 'result' },
            continue_ability(state, side, {
              prompt: `Place 1 advancement counter on an ice protecting ${coreServers.zoneToName((card as any).zone?.[1])}`,
              choices: { card: (c: Card) => coreCard.ice(c) && coreServers.sameServer(c, card) },
              msg: msg((msgFn: any) => `place 1 advancement counter on ${coreToString.cardStr(state, target)}`),
              async: true,
              effect: effect(coreProps.addProp(eid, target, ':advance-counter', 1, { placed: true })),
            }, card, null)], []);
        }
      }),
    },
  ],
};

// ChiLo City Grid
export const chiloCityGrid: CardDef = {
  title: 'ChiLo City Grid',
  events: [{
    ...coreDefHelpers.giveTags(1),
    event: ':successful-trace',
    req: req(forms.thisServer),
  }],
};

// Code Replicator
export const codeReplicator: CardDef = {
  title: 'Code Replicator',
  abilities: [{
    label: 'Force the runner to approach the passed piece of ice again',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      if (!forms.thisServer(state, card)) return false;
      const position = forms.runPosition(state);
      if (position === undefined) return false;
      if (position >= coreIce.getRunIces(state).length) return false;
      const server = coreBoard.cardToServer(state, card);
      const ices = server?.ices;
      if (!ices) return false;
      const passedIce = ices[position];
      return coreCard.rezzed(passedIce);
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreUpdate.updateIn(state, ['run', 'position'], (n: number) => n + 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.setNextPhase(state, ':approach-ice')], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreIce.updateAllIce(state, side)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreIce.updateAllIcebreakers(state, side)], []);
      const server = coreBoard.cardToServer(state, card);
      const ices = server?.ices;
      const pos = (forms.runPosition(state) as number) || 0;
      if (ices) {
        const passedIce = ices[pos];
        yield wait_for(state, [{ asyncResult: 'result' },
          coreSay.systemMsg(state, ':corp', `trashes ${card.title} to make the runner approach ${passedIce?.title || 'ice'} again`)], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', coreEid.makeEid(state, eid),
          coreDefHelpers.offerJackOut(), card, null)], []);
      const endRun = (state as any).endRun;
      if (!endRun?.ended) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.startNextPhase(state, side, eid)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEffects.effectCompleted(state, side, eid)], []);
      }
    }),
  }],
};

// Cold Site Server
export const coldSiteServer: CardDef = {
  title: 'Cold Site Server',
  'static-abilities': [{
    type: ':run-additional-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const server = (targets[1] as string[] | undefined)?.[0];
      return server === coreServers.unknownToKw(coreCard.getZone(card));
    }),
    value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const count = coreCard.getCounters(card, ':power');
      return Array(count).fill(null).map(() => [corePayment.toC('credit', 1), corePayment.toC('click', 1)]);
    }),
  }],
  events: [{
    event: ':corp-turn-begins',
    'automatic': ':last',
    interactive: req(() => true),
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreCard.getCounters(card, ':power') > 0),
    msg: 'remove all hosted power counters',
    async: true,
    effect: effect(coreProps.addCounter(eid, card, ':power', -coreCard.getCounters(card, ':power'), null)),
  }],
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(coreProps.addCounter(eid, card, ':power', 1, null)),
  }],
};

// Corporate Troubleshooter
export const corporateTroubleshooter: CardDef = {
  title: 'Corporate Troubleshooter',
  abilities: [{
    label: 'Add strength to a rezzed piece of ice protecting this server',
    cost: [corePayment.toC('trash-can'), corePayment.toC('x-credits')],
    choices: { all: true, req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t && coreCard.ice(t) && coreCard.rezzed(t) && coreServers.protectingSameServer(card, t);
    }) },
    msg: msg((msgFn: any) => `add ${corePayment.costValue(eid, ':x-credits')} strength to ${target.title}`),
    effect: effect(coreIce.pumpIce(target, corePayment.costValue(eid, ':x-credits'), ':end-of-turn')),
  }],
};

// Crisium Grid
export const crisiumGrid: CardDef = {
  title: 'Crisium Grid',
  'static-abilities': [{
    type: ':block-successful-run',
    req: req(forms.thisServer),
    value: true,
  }],
};

// Cyberdex Virus Suite
export const cyberdexVirusSuite: CardDef = {
  title: 'Cyberdex Virus Suite',
  flags: { 'rd-reveal': req(() => true) },
  poison: true,
  'on-access': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (canSmartPurge(state)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          continue_ability(state, side, {
            msg: 'purge virus counters',
            async: true,
            effect: effect(corePurging.purge(eid)),
          }, card, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          continue_ability(state, side, {
            optional: {
              'waiting-prompt': true,
              prompt: 'Purge virus counters?',
              'yes-ability': {
                async: true,
                effect: effect(corePurging.purge(eid)),
              },
            },
          }, card, null)], []);
      }
    }),
  },
  abilities: [{
    label: 'Purge virus counters',
    msg: 'purge virus counters',
    cost: [corePayment.toC('trash-can')],
    async: true,
    effect: effect(corePurging.purge(eid)),
  }],
};

// Daniela Jorge Inácio
export const danielaJorgeInácio: CardDef = {
  title: 'Daniela Jorge Inácio',
  'static-abilities': [{
    type: ':steal-additional-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t && (coreServers.inSameServer(card, t) || coreServers.fromSameServer(card, t));
    }),
    value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      corePayment.toC('add-random-from-hand-to-bottom-of-deck', 2)),
  }],
  events: [{
    event: ':pre-access-card',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const ctx = forms.context(state, card, targets) || {};
      return coreCard.rezzed(card) && coreCard.sameCard(ctx['accessed-card'], card);
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreFlags.registerRunFlag(state, side, card, ':can-trash',
          (s: State, _s2: Side, c2: Card) => {
            const ctx = forms.context(s, card, targets) || {};
            if (!coreCard.sameCard(ctx['accessed-card'], c2)) return true;
            return corePayment.canPay(s, ':runner', eid, card, null,
              [corePayment.toC('add-random-from-hand-to-bottom-of-deck', 2)]);
          }),
      ], []);
    }),
  }],
  'on-trash': {
    async: true,
    interactive: req(() => true),
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      forms.run(state) && side === ':runner'),
    msg: 'force the Runner to add 2 random cards from the grip to the bottom of the stack as additional cost to trash it',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.pay(state, ':runner', coreEid.makeEid(state, eid), card,
          [corePayment.toC('add-random-from-hand-to-bottom-of-deck', 2)])], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreSay.systemMsg(state, ':runner', (forms.context(state, card, targets) as any)?.msg || '')], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':steal-additional-cost',
          req: req((s: State, sd: Side, eid2: EID, c2: Card, t: any[]) => {
            const tgt = t[0];
            return tgt && (
              (c2 as any).previousZone === coreCard.getZone(tgt) ||
              coreServers.centralToZone(coreCard.getZone(tgt)) ===
                ((c2 as any).previousZone as string[]).slice(0, -1)
            );
          }),
          value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
            corePayment.toC('add-random-from-hand-to-bottom-of-deck', 2)),
          duration: ':end-of-run',
        }),
      ], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEffects.effectCompleted(state, side, eid)], []);
    }),
  },
};

// Daruma
export const daruma: CardDef = {
  title: 'Daruma',
  events: [{
    event: ':approach-server',
    interactive: req(() => true),
    req: req(forms.thisServer),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const chooseSwap = (toSwap: Card) => ({
        prompt: `Choose a card to swap with ${toSwap.title}`,
        choices: { 'not-self': true, card: (c: Card) =>
          coreCard.corp(c) && !coreCard.operation(c) && !coreCard.ice(c) &&
          (coreCard.inHand(c) || coreCard.installed(c)) },
        cost: [corePayment.toC('trash-can')],
        msg: msg((msgFn: any) => `swap ${coreToString.cardStr(state, toSwap)} with ${coreToString.cardStr(state, target)}`),
        async: true,
        effect: effect(coreInstalling.swapCardsAsync(eid, toSwap, target)),
      });
      const ability = {
        optional: {
          'waiting-prompt': true,
          prompt: msg((msgFn: any) => `Trash ${card.title} to swap a card in this server?`),
          'yes-ability': {
            async: true,
            prompt: 'Choose a card in this server to swap',
            choices: { req: req((s: State, sd: Side, eid2: EID, c2: Card, t: any[]) => {
              const tgt = t[0];
              return tgt && coreCard.installed(tgt) && coreServers.inSameServer(card, tgt);
            } }, 'not-self': true },
            effect: effect(continue_ability(state, side, chooseSwap(target), card, null)),
          },
          'no-ability': {
            effect: effect(corePrompts.clearWaitPrompt(':runner')),
          },
        },
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':corp', coreEid.makeEid(state, eid), ability, card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        continue_ability(state, ':runner', coreDefHelpers.offerJackOut(), card, null)], []);
    }),
  }],
};

// Dedicated Technician Team
export const dedicatedTechnicianTeam: CardDef = {
  title: 'Dedicated Technician Team',
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        (eid as any)['source-type'] === ':corp-install' &&
        (card as any).zone?.[1] === coreServers.unknownToKw((forms.context(state, card, targets) as any)?.server)),
      type: ':recurring',
    },
  },
};

// Defense Construct
export const defenseConstruct: CardDef = {
  title: 'Defense Construct',
  advanceable: ':always',
  abilities: [{
    label: 'Add cards from Archives to HQ',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const run = forms.run(state);
      return run && (run as any).server === ':archives' &&
        coreCard.getCounters(card, ':advancement') > 0;
    }),
    cost: [corePayment.toC('trash-can')],
    'show-discard': true,
    choices: {
      max: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreCard.getCounters(card, ':advancement')),
      card: (c: Card) => coreCard.corp(c) && !(c as any).seen && coreCard.inDiscard(c),
    },
    msg: msg((msgFn: any) => `add ${utils.quantify(targets?.length || 0, 'facedown card')} in Archives to HQ`),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      for (const c of (targets || [])) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'hand')], []);
      }
    }),
  }],
};

// Disposable HQ
export const disposableHQ: CardDef = {
  title: 'Disposable HQ',
  flags: { 'rd-reveal': req(() => true) },
  'on-access': {
    optional: {
      'waiting-prompt': true,
      prompt: 'Add cards from HQ to the bottom of R&D?',
      'yes-ability': {
        async: true,
        msg: 'add cards in HQ to the bottom of R&D',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const hand = corp?.hand || [];
          const dhq = (i: number, n: number) => ({
            req: req((s: State) => n > 0),
            prompt: 'Choose a card in HQ to add to the bottom of R&D',
            choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
            async: true,
            msg: 'add a card to the bottom of R&D',
            effect: effect(function*(s: State, sd: Side, eid2: EID, c2: Card, t: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' }, coreMoving.move(s, sd, target, 'deck')], []);
              if (i < n) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  continue_ability(s, sd, dhq(i + 1, n), c2, null)], []);
              }
            }),
          });
          yield wait_for(state, [{ asyncResult: 'result' },
            continue_ability(state, side, dhq(1, hand.length), card, null)], []);
        }),
      },
    },
  },
};

// Djupstad Grid
export const djupstadGrid: CardDef = {
  title: 'Djupstad Grid',
  events: [{
    event: ':agenda-scored',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const ctx = forms.context(state, card, targets) || {};
      const cardCtx = ctx.card;
      return cardCtx && (cardCtx as any).previousZone === (card as any).zone;
    }),
    interactive: req(() => true),
    async: true,
    effect: effect(coreDamage.damage(eid, ':brain', 1, { card })),
  }],
};

// Drone Screen
export const droneScreen: CardDef = {
  title: 'Drone Screen',
  events: [{
    event: ':run',
    async: true,
    trace: {
      base: 3,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        forms.thisServer(state, card) && forms.tagged(state)),
      successful: {
        msg: 'do 1 meat damage',
        async: true,
        effect: effect(coreDamage.damage(eid, ':meat', 1, {
          card,
          unpreventable: true,
        })),
      },
    },
  }],
};

// Embolus
export const embolus: CardDef = {
  title: 'Embolus',
  'derezzed-events': [{ event: ':runner-turn-ends' }],
  events: [
    {
      event: ':corp-turn-begins',
      once: ':per-turn',
      async: true,
      label: 'Place 1 power counter (start of turn)',
      effect: effect(continue_ability(
        {
          optional: {
            prompt: msg((msgFn: any) => `Pay 1 [Credit] to place 1 power counter on ${card.title}?`),
            'yes-ability': {
              effect: effect(coreProps.addCounter(eid, card, ':power', 1, null)),
              async: true,
              cost: [corePayment.toC('credit', 1)],
              msg: 'place 1 power counter on itself',
            },
          },
        },
        card, null,
      )),
    },
    {
      event: ':successful-run',
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreCard.getCounters(card, ':power') > 0),
      msg: 'remove 1 power counter from itself',
      async: true,
      effect: effect(coreProps.addCounter(eid, card, ':power', -1, null)),
    },
  ],
  abilities: [
    {
      once: ':per-turn',
      async: true,
      label: 'Place 1 power counter (start of turn)',
      effect: effect(continue_ability(
        {
          optional: {
            prompt: msg((msgFn: any) => `Pay 1 [Credit] to place 1 power counter on ${card.title}?`),
            'yes-ability': {
              effect: effect(coreProps.addCounter(eid, card, ':power', 1, null)),
              async: true,
              cost: [corePayment.toC('credit', 1)],
              msg: 'place 1 power counter on itself',
            },
          },
        },
        card, null,
      )),
    },
    {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        forms.thisServer(state, card) && forms.run(state)),
      cost: [corePayment.toC('power', 1)],
      msg: 'end the run',
      async: true,
      effect: effect(coreRuns.endRun(eid, card)),
    },
  ],
};

// Experiential Data
export const experientialData: CardDef = {
  title: 'Experiential Data',
  'static-abilities': [{
    type: ':ice-strength',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreServers.protectingSameServer(card, targets[0])),
    value: 1,
  }],
};

// Expo Grid
export const expoGrid: CardDef = {
  title: 'Expo Grid',
  'derezzed-events': [{ event: ':runner-turn-ends' }],
  events: [{
    event: ':corp-turn-begins',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const corp = (state as any).corp;
      const zone = (card as any).zone;
      const zoneCards = zone ? coreBoard.getCardInZone(corp, zone) : [];
      return zoneCards.some((c: Card) => coreCard.asset(c) && coreCard.rezzed(c));
    }),
    msg: 'gain 1 [Credits]',
    once: ':per-turn',
    'automatic': ':gain-credits',
    label: 'Gain 1 [Credits] (start of turn)',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 1)),
  }],
  abilities: [{
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const corp = (state as any).corp;
      const zone = (card as any).zone;
      const zoneCards = zone ? coreBoard.getCardInZone(corp, zone) : [];
      return zoneCards.some((c: Card) => coreCard.asset(c) && coreCard.rezzed(c));
    }),
    msg: 'gain 1 [Credits]',
    once: ':per-turn',
    'automatic': ':gain-credits',
    label: 'Gain 1 [Credits] (start of turn)',
    async: true,
    effect: effect(coreGaining.gainCredits(eid, 1)),
  }],
};

// Forced Connection
export const forcedConnection: CardDef = {
  title: 'Forced Connection',
  flags: { 'rd-reveal': req(() => true) },
  'on-access': {
    interactive: req(() => true),
    trace: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        !coreCard.inDiscard(card)),
      base: 3,
      successful: coreDefHelpers.giveTags(2),
    },
  },
};
