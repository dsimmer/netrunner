import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreAgendas from '../core/agendas';
import * as coreBadPublicity from '../core/bad-publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card-defs';
import * as coreCheckpoint from '../core/checkpoint';
import * as coreChooseOne from '../core/choose-one';
import * as coreCostFns from '../core/cost-fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpend from '../core/expend';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePrevention from '../core/prevention';
import * as coreProps from '../core/props';
import * as corePrompts from '../core/prompts';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set-aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

// ============================================================================
// Helper functions
// ============================================================================

function advanceAmbush(cost: number, ability: any, prompt?: string): any {
  const base = coreDefHelpers.installedAccessTrigger(cost, ability, prompt);
  return { ...base, advanceable: ':always' };
}

function takeNCreditsStartOfTurn(n: number, counterType: string = ':credit'): any {
  const numCounters = (card: Card) => Math.min(n, coreCard.getCounters(card, counterType));
  return {
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${numCounters(card)} [Credits]`),
    once: ':per-turn',
    automatic: ':gain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12 && (coreCard.getCounters(card, counterType) > 0);
    }),
    label: `Gain ${n} [Credits] (start of turn)`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, eid, card, counterType, n)], []);
    }),
  };
}

function campaign(counters: number, perTurn: number, counterType: string = ':credit'): any {
  const ability = takeNCreditsStartOfTurn(perTurn, counterType);
  return {
    data: { counter: { [counterType.replace(':', '')]: counters } },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [
      coreDefHelpers.trashOnEmpty(counterType),
      { ...ability, event: ':corp-turn-begins' },
    ],
    abilities: [ability],
  };
}

function credsOnRoundStart(perTurn: number): any {
  const ability: any = {
    msg: `gain ${perTurn} [Credits]`,
    label: `Gain ${perTurn} [Credits] (start of turn)`,
    once: ':per-turn',
    async: true,
    automatic: ':gain-credits',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, perTurn)], []);
    }),
  };
  return {
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
}

const executiveTrashEffect: any = {
  'when-inactive': true,
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return side === ':runner' && !!(targets as any)?.[0]?.accessed;
  }),
  msg: "add itself to the Runner's score area as an agenda worth 2 agenda points",
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreMoving.asAgenda(state, ':runner', card, 2);
  }),
};

function returnToTop(setAsideCards: Card[], reveal: boolean = false): any {
  return {
    prompt: 'Choose a card to put on top of R&D',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return setAsideCards.length > 0;
    }),
    choices: {
      min: 1, max: 1,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return setAsideCards.some((c: Card) => coreCard.sameCard(c, t));
      }),
    },
    async: true,
    'waiting-prompt': true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return `place ${reveal ? (t as any)?.title : 'a card'} on top of R&D`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      coreMoving.move(state, ':corp', t, ':deck', { front: true });
      const rem = setAsideCards.filter((c: Card) => !coreCard.sameCard(c, t));
      if (rem.length > 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, returnToTop(rem, reveal), card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

const gainPowerCounter: any = {
  async: true,
  msg: 'add 1 power counter to itself',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreProps.addCounter(state, side, eid, card, ':power', 1, { placed: true })], []);
  }),
};

// ============================================================================
// Card definitions
// ============================================================================

// Adonis Campaign
export const adonisCampaign: CardDef = {
  title: 'Adonis Campaign',
  ...campaign(12, 3),
};

// Advanced Assembly Lines
export const advancedAssemblyLines: CardDef = {
  title: 'Advanced Assembly Lines',
  'on-rez': {
    async: true,
    msg: 'gain 3 [Credits]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  },
  abilities: [{
    label: 'Install a non-agenda card from HQ',
    async: true,
    prompt: 'Choose a non-agenda card to install from HQ',
    'change-in-game-state': { req: req(function*(state: State) { return !!((state as any).corp?.hand?.length); }) },
    req: req(function*(state: State) { return !(state as any).run; }),
    choices: {
      card: (c: Card) => coreCard.corpInstallableType(c) && !coreCard.agenda(c) && coreCard.inHand(c) && coreCard.corp(c),
    },
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          msgKeys: { installSource: card, displayOrigin: true },
        })], []);
    }),
  }],
};

// Aggressive Secretary
export const aggressiveSecretary: CardDef = {
  title: 'Aggressive Secretary',
  ...advanceAmbush(2, {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
      `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'program')} to trash`),
    choices: {
      max: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      }),
      card: (c: Card) => coreCard.installed(c) && coreCard.program(c),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${utils.enumerateCards(targets)}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trashCards(state, side, eid, targets, { causeCard: card })], []);
    }),
  }),
};

// Alexa Belsky
export const alexaBelsky: CardDef = {
  title: 'Alexa Belsky',
  abilities: [{
    label: 'Shuffle all cards in HQ into R&D',
    async: true,
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          'waiting-prompt': true,
          prompt: 'How many credits do you want to pay?',
          choices: ':credit',
          player: ':runner',
          msg: msg((s: State, sd: Side, e: EID, c: Card, targets: any[]) => {
            const paid = targets[0] || 0;
            const hand = (s as any).corp?.hand || [];
            const prevented = Math.floor(paid / 2);
            const unprevented = Math.max(0, hand.length - prevented);
            return `shuffle ${utils.quantify(unprevented, 'card')} in HQ into R&D`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, targets: any[]) {
            const paid = targets[0] || 0;
            const prevented = Math.floor(paid / 2);
            const hand = (s as any).corp?.hand || [];
            if (prevented > 0) {
              const unprevented = hand.length - prevented;
              const shuffled = [...hand].sort(() => Math.random() - 0.5).slice(0, Math.max(0, unprevented));
              for (const hCard of shuffled) {
                coreMoving.move(s, ':corp', hCard, ':deck', null);
              }
              if (shuffled.length > 0) coreShuffling.shuffle(s, ':corp', ':deck');
              coreSay.systemMsg(s, ':runner',
                `pays ${paid} [Credits] to prevent ${utils.quantify(prevented, 'random card')} in HQ from being shuffled into R&D`);
            } else {
              coreShuffling.shuffleIntoDeck(s, ':corp', ':hand');
            }
            coreEid.effectCompleted(s, sd, e);
          }),
        }, card, null)], []);
    }),
  }],
};

// Alix T4LB07
export const alixT4LB07: CardDef = {
  title: 'Alix T4LB07',
  events: [{
    event: ':corp-install',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [{
    action: true,
    label: 'Gain 2 [Credits] for each counter on Alix T4LB07',
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${2 * coreCard.getCounters(card, ':power')} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2 * coreCard.getCounters(card, ':power'))], []);
    }),
  }],
};

// Allele Repression
export const alleleRepression: CardDef = {
  title: 'Allele Repression',
  advanceable: ':always',
  abilities: [{
    label: 'Swap 1 card in HQ and Archives for each advancement counter',
    cost: [corePayment.toC('trash-can', 1)],
    msg: msg((state: State, side: Side, eid: EID, card: Card) => {
      const corp = (state as any).corp;
      const total = Math.min(corp?.discard?.length || 0, corp?.hand?.length || 0, coreCard.getCounters(card, ':advancement'));
      return `swap ${utils.quantify(total, 'card')} in HQ and Archives`;
    }),
    async: true,
    'waiting-prompt': true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const corp = (state as any).corp;
      const total = Math.min(corp?.discard?.length || 0, corp?.hand?.length || 0, coreCard.getCounters(card, ':advancement'));
      const hqCards: any[] = yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: `Choose ${utils.quantify(total, 'card')} from HQ`,
          choices: {
            card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c),
            max: total, all: true,
          },
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
            coreEid.completeWithResult(s, sd, e, t);
          }),
        }, card, null)], []);
      const archivesCards: any[] = yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          'show-discard': true,
          prompt: `Choose ${utils.quantify(total, 'card')} from Archives`,
          choices: {
            card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
            max: total, all: true,
          },
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
            coreEid.completeWithResult(s, sd, e, t);
          }),
        }, card, null)], []);
      for (let i = 0; i < Math.min(hqCards.length, archivesCards.length); i++) {
        coreMoving.swapCards(state, side, hqCards[i], archivesCards[i]);
      }
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Amani Senai
export const amaniSenai: CardDef = {
  title: 'Amani Senai',
  events: [
    {
      event: ':agenda-scored',
      interactive: req(function*() { return true; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = (targets as any)[0] || {};
        const agenda = ctx.card;
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            interactive: req(function*() { return true; }),
            optional: {
              prompt: 'Initiate a trace?',
              autoresolve: coreOptional.getAutoresolve(':auto-fire'),
              'yes-ability': {
                trace: {
                  base: coreCard.getAdvancementRequirement(agenda),
                  successful: {
                    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
                    label: 'add 1 installed card to the grip',
                    msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                      `add ${(t[0] as any)?.title} to the grip`),
                    effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                      coreMoving.move(s, ':runner', t[0], ':hand', null);
                    }),
                  },
                },
              },
            },
          }, card, null)], []);
      }),
    },
    {
      event: ':agenda-stolen',
      interactive: req(function*() { return true; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = (targets as any)[0] || {};
        const agenda = ctx.card;
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            interactive: req(function*() { return true; }),
            optional: {
              prompt: 'Initiate a trace?',
              autoresolve: coreOptional.getAutoresolve(':auto-fire'),
              'yes-ability': {
                trace: {
                  base: coreCard.getAdvancementRequirement(agenda),
                  successful: {
                    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
                    label: 'add 1 installed card to the grip',
                    msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                      `add ${(t[0] as any)?.title} to the grip`),
                    effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                      coreMoving.move(s, ':runner', t[0], ':hand', null);
                    }),
                  },
                },
              },
            },
          }, card, null)], []);
      }),
    },
  ],
  abilities: [coreOptional.setAutoresolve(':auto-fire', 'Amani Senai')],
};

// Anson Rose
export const ansonRose: CardDef = (() => {
  const ability: any = {
    label: 'Place 1 advancement counter (start of turn)',
    once: ':per-turn',
    msg: 'place 1 advancement counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter', 1, { placed: true })], []);
    }),
  };
  return {
    title: 'Anson Rose',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [
      { ...ability, event: ':corp-turn-begins' },
      {
        event: ':rez',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = (targets as any)[0] || {};
          return coreCard.ice(ctx.card) && coreCard.getCounters(card, ':advancement') > 0;
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = (targets as any)[0] || {};
          const ice = coreCard.getCard(state, ctx.card);
          const iceName = (ice as any)?.title;
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              optional: {
                'waiting-prompt': true,
                prompt: `Move advancement counters to ${iceName}?`,
                'yes-ability': {
                  prompt: 'How many advancement counters do you want to move?',
                  choices: { number: req(function*(s: State, sd: Side, e: EID, c: Card) {
                    return coreCard.getCounters(c, ':advancement');
                  })},
                  async: true,
                  effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                    const n = t[0] || 0;
                    yield wait_for(s, [{ asyncResult: 'result' },
                      coreProps.addProp(s, ':corp', ice as Card, ':advance-counter', n, { placed: true })], []);
                    yield wait_for(s, [{ asyncResult: 'result' },
                      coreProps.addProp(s, ':corp', c, ':advance-counter', -n, { placed: true })], []);
                    coreSay.systemMsg(s, side, `uses ${(c as any)?.title} to move ${utils.quantify(n, 'advancement counter')} to ${coreToString.cardStr(s, ice as Card)}`);
                    coreEid.effectCompleted(s, sd, e);
                  }),
                },
              },
            }, card, null)], []);
        }),
      },
    ],
    abilities: [ability],
  };
})();

// Anthill Excavation Contract
export const anthillExcavationContract: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    label: 'Take 4 [Credits] and draw a card (start of turn)',
    req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(4, coreCard.getCounters(card, ':credit'))} [Credits] and draw a card`),
    async: true,
    automatic: ':draw-cards',
    interactive: req(function*() { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, 1, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, eid, card, ':credit', 4)], []);
    }),
  };
  return {
    title: 'Anthill Excavation Contract',
    data: { counter: { credit: 8 } },
    flags: { 'drip-economy': true },
    abilities: [ability],
    events: [
      { ...ability, event: ':corp-turn-begins' },
      coreDefHelpers.trashOnEmpty(':credit'),
    ],
  };
})();

// API-S Keeper Isobel
export const apiSKeeperIsobel: CardDef = {
  title: 'API-S Keeper Isobel',
  flags: {
    'corp-phase-12': req(function*(state: State) {
      return (coreBoard.allInstalled(state, ':corp') || []).some((c: Card) =>
        coreCard.getCounters(c, ':advancement') > 0);
    }),
  },
  abilities: [{
    req: req(function*(state: State) {
      return !!(state as any).corpPhase12 &&
        (coreBoard.allInstalled(state, ':corp') || []).some((c: Card) =>
          coreCard.getCounters(c, ':advancement') > 0);
    }),
    once: ':per-turn',
    label: 'Remove an advancement counter (start of turn)',
    prompt: 'Choose a card to remove an advancement counter from',
    choices: {
      card: (c: Card) => coreCard.getCounters(c, ':advancement') > 0 && coreCard.installed(c),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      const cnt = coreCard.getCounters(target, ':advancement');
      coreProps.setProp(state, side, target, ':advance-counter', cnt - 1);
      coreSay.systemMsg(state, ':corp', `uses ${(card as any)?.title} to remove 1 advancement counter from ${coreToString.cardStr(state, target)} and gains 3 [Credits]`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 3)], []);
    }),
  }],
};

// Aryabhata Tech
export const aryabhataTech: CardDef = {
  title: 'Aryabhata Tech',
  events: [{
    event: ':successful-trace',
    msg: 'gain 1 [Credit] and force the Runner to lose 1 [Credit]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, ':runner', eid, 1)], []);
    }),
  }],
};

// B-1001
export const b1001: CardDef = {
  title: 'B-1001',
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && (state as any).run?.server !== (coreCard.getZone(card)?.[1]);
    }),
    async: true,
    cost: [corePayment.toC('tag', 1)],
    msg: 'end the run',
    label: 'End the run on another server',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.endRun(state, side, eid, card)], []);
    }),
  }],
};

// Balanced Coverage
export const balancedCoverage: CardDef = (() => {
  const nameAbi: any = {
    prompt: 'Choose a card type',
    'waiting-prompt': true,
    choices: ['Operation', 'Asset', 'Upgrade', 'ICE', 'Agenda'],
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `choose ${targets[0]}`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const namedType = targets[0];
      const topCard = (state as any).corp?.deck?.[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: `The top card of R&D is: ${(topCard as any)?.title}`,
          'waiting-prompt': true,
          choices: ['OK'],
        }, card, null)], []);
      if ((topCard as any)?.type === namedType) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            optional: {
              prompt: 'Reveal it to gain 2 [Credits]?',
              'waiting-prompt': true,
              'yes-ability': {
                async: true,
                msg: msg((s: State, sd: Side, e: EID, c: Card) =>
                  `reveal ${(topCard as any)?.title} from the top of R&D and gain 2 [Credits]`),
                effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
                  yield wait_for(s, [{ asyncResult: 'result' },
                    coreRevealing.reveal(s, sd, coreEid.makeEid(s, e), topCard as Card)], []);
                  yield wait_for(s, [{ asyncResult: 'result' },
                    coreGaining.gainCredits(s, ':corp', e, 2)], []);
                }),
              },
              'no-ability': {
                effect: effect(function*(s: State, sd: Side, e: EID, c: Card) {
                  coreSay.systemMsg(s, sd, `declines to use ${(c as any)?.title} to reveal the top card of R&D`);
                }),
              },
            },
          }, card, null)], []);
      } else {
        coreSay.systemMsg(state, side, `declines to use ${(card as any)?.title} to reveal the top card of R&D`);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  const ability: any = {
    label: 'Look at the top card of R&D (start of turn)',
    once: ':per-turn',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, nameAbi, card, null)], []);
    }),
  };
  return {
    title: 'Balanced Coverage',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Bass CH1R180G4
export const bassCH1R180G4: CardDef = {
  title: 'Bass CH1R180G4',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    msg: 'gain [Click][Click]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreGaining.gainClicks(state, side, 2);
    }),
  }],
};

// Behold!
export const behold: CardDef = {
  title: 'Behold!',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreCard.inDiscard(card);
      }),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
        `Pay 4 [Credits] to use ${(card as any)?.title} ability?`),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, side, `declines to use ${(card as any)?.title}`);
        }),
      },
      'yes-ability': { ...coreDefHelpers.giveTags(2), cost: [corePayment.toC('credit', 4)] },
    },
  },
};

// Bio-Ethics Association
export const bioEthicsAssociation: CardDef = (() => {
  const ability: any = {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreFlags.unprotected(state, side, card);
    }),
    automatic: ':corp-damage',
    async: true,
    label: 'Do 1 net damage (start of turn)',
    once: ':per-turn',
    msg: 'do 1 net damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  };
  return {
    title: 'Bio-Ethics Association',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Bioroid Work Crew
export const bioraidWorkCrew: CardDef = {
  title: 'Bioroid Work Crew',
  implementation: 'Timing restriction of ability use not enforced',
  abilities: [{
    label: 'Install 1 card, paying all costs',
    req: req(function*(state: State) { return (state as any).activePlayer === ':corp'; }),
    'change-in-game-state': { req: req(function*(state: State) { return !!((state as any).corp?.hand?.length); }) },
    prompt: 'Choose a card in HQ to install',
    choices: {
      card: (c: Card) => !coreCard.operation(c) && coreCard.inHand(c) && coreCard.corp(c),
    },
    cost: [corePayment.toC('trash-can', 1)],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          msgKeys: { installSource: card, displayOrigin: true },
        })], []);
    }),
  }],
};

// Blacklist
export const blacklist: CardDef = {
  title: 'Blacklist',
  'on-rez': {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreFlags.lockZone(state, (card as any).cid, ':runner', ':discard');
    }),
  },
  'leave-play': effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreFlags.releaseZone(state, (card as any).cid, ':runner', ':discard');
  }),
};

// Bladderwort
export const bladderwort: CardDef = (() => {
  const ability: any = {
    msg: 'gain 1 [Credits]',
    label: 'Gain 1 [Credits] (start of turn)',
    once: ':per-turn',
    automatic: ':pre-gain-credits',
    interactive: req(function*() { return true; }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 1)], []);
      if (((state as any).corp?.credit || 0) <= 4) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            msg: 'do 1 net damage',
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, e, ':net', 1, { card: c })], []);
            }),
          }, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Bladderwort',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Brain-Taping Warehouse
export const brainTapingWarehouse: CardDef = {
  title: 'Brain-Taping Warehouse',
  'static-abilities': [{
    type: ':rez-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.ice(targets[0]) && coreCard.hasSubtype(targets[0], 'Bioroid');
    }),
    value: req(function*(state: State) {
      return -((state as any).runner?.click || 0);
    }),
  }],
};

// Breached Dome
export const breachedDome: CardDef = {
  title: 'Breached Dome',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const c = (state as any).runner?.deck?.[0];
      coreSay.systemMsg(state, ':corp', `uses ${(card as any)?.title} to do 1 meat damage and to trash ${(c as any)?.title} from the top of the stack`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.mill(state, ':corp', ':runner', 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':meat', 1, { card })], []);
    }),
  },
};

// Broadcast Square
export const broadcastSquare: CardDef = {
  title: 'Broadcast Square',
  prevention: [{
    prevents: ':bad-publicity',
    type: ':event',
    'max-uses': 1,
    mandatory: true,
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return corePrevention.preventable(targets[0]);
      }),
      trace: {
        base: 3,
        successful: {
          msg: 'prevent all bad publicity',
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              corePrevention.preventBadPublicity(state, side, eid, ':all')], []);
          }),
        },
      },
    },
  }],
};

// Byte!
export const byte: CardDef = {
  title: 'Byte!',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreCard.inDiscard(card) &&
          corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 4)]);
      }),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
        `Pay 4 [Credits] to use ${(card as any)?.title} ability?`),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, side, `declines to use ${(card as any)?.title}`);
        }),
      },
      'yes-ability': {
        async: true,
        cost: [corePayment.toC('credit', 4)],
        msg: 'give the Runner 1 tag and do 3 net damage',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreTags.gainTags(state, ':corp', 1, { suppressCheckpoint: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', 3, { card })], []);
        }),
      },
    },
  },
};

// C.I. Fund
export const ciFund: CardDef = {
  title: 'C.I. Fund',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State) {
      return ((state as any).corp?.credit || 0) > 0;
    }),
  },
  abilities: [
    {
      label: 'Store up to 3 [Credit] (start of turn)',
      prompt: 'How many credits do you want to store?',
      once: ':per-turn',
      choices: {
        number: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return Math.min((state as any).corp?.credit || 0, 3);
        }),
      },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = targets[0] || 0;
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':credit', n, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, side, eid, n)], []);
      }),
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `store ${targets[0] || 0} [Credit]`),
    },
    {
      label: 'Take all hosted credits',
      cost: [corePayment.toC('credit', 2), corePayment.toC('trash-can', 1)],
      msg: msg((state: State, side: Side, eid: EID, card: Card) =>
        `trash it and gain ${coreCard.getCounters(card, ':credit')} [Credits]`),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, coreCard.getCounters(card, ':credit'))], []);
      }),
    },
  ],
  events: [{
    event: ':corp-turn-begins',
    msg: 'place 2 [Credits] on itself',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':credit') >= 6;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':credit', 2, null)], []);
    }),
  }],
};

// Calvin B4L3Y
export const calvinB4L3Y: CardDef = {
  title: 'Calvin B4L3Y',
  abilities: [coreDefHelpers.drawAbi(2, null, {
    action: true,
    cost: [corePayment.toC('click', 1)],
    once: ':per-turn',
  })],
  'on-trash': {
    interactive: req(function*() { return true; }),
    optional: {
      req: req(function*(state: State, side: Side) { return side === ':runner'; }),
      'waiting-prompt': true,
      prompt: 'Draw 2 cards?',
      'yes-ability': coreDefHelpers.drawAbi(2),
    },
  },
};

// Capital Investors
export const capitalInvestors: CardDef = {
  title: 'Capital Investors',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    msg: 'gain 2 [Credits]',
    'keep-menu-open': ':while-clicks-left',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2)], []);
    }),
  }],
};

// Cerebral Overwriter
export const cerebralOverwriter: CardDef = {
  title: 'Cerebral Overwriter',
  ...advanceAmbush(3, {
    async: true,
    'waiting-prompt': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} core damage`),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':brain', n, { card })], []);
    }),
  }),
};

// Chairman Hiro
export const chairmanHiro: CardDef = {
  title: 'Chairman Hiro',
  'static-abilities': [coreHandSize.runnerHandSizePlus(-2)],
  'on-trash': executiveTrashEffect,
};

// Charlotte Caçador
export const charlotteCacador: CardDef = (() => {
  const choiceAbi: any = {
    label: 'Gain 4 [Credits] and draw 1 card',
    optional: {
      once: ':per-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement') > 0 && !!(state as any).corpPhase12;
      }),
      prompt: 'Remove 1 hosted advancement counter to gain 4 [Credits] and draw 1 card?',
      'yes-ability': {
        msg: 'remove 1 hosted advancement counter from itself to gain 4 [Credits] and draw 1 card',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addProp(state, ':corp', card, ':advance-counter', -1, null)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, side, 4)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDrawing.draw(state, side, eid, 1)], []);
        }),
      },
    },
  };
  const queueAbility: any = {
    interactive: req(function*() { return true; }),
    skippable: true,
    event: ':corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !coreEngine.usedOnce(state, { once: ':per-turn' }, card) && !!(state as any).corpPhase12;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, choiceAbi, card, null)], []);
    }),
  };
  const trashAb: any = {
    cost: [corePayment.toC('advancement', 1), corePayment.toC('trash-can', 1)],
    label: 'Gain 3 [Credits]',
    msg: 'gain 3 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 3)], []);
    }),
  };
  return {
    title: 'Charlotte Caçador',
    advanceable: ':always',
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [queueAbility],
    abilities: [choiceAbi, trashAb],
  };
})();

// Chekist Scion
export const chekistScion: CardDef = {
  title: 'Chekist Scion',
  ...advanceAmbush(0, {
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `give the Runner ${utils.quantify(1 + coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'tag')}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = 1 + coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, n)], []);
    }),
  }),
};

// Chief Slee
export const chiefSlee: CardDef = {
  title: 'Chief Slee',
  events: [{
    event: ':end-of-encounter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      return (ctx.ice?.subroutines || []).filter((s: any) => !s.broken).length > 0;
    }),
    msg: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      const n = (ctx.ice?.subroutines || []).filter((s: any) => !s.broken).length;
      return `place ${utils.quantify(n, 'power counter')} on itself`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      const n = (ctx.ice?.subroutines || []).filter((s: any) => !s.broken).length;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, ':corp', eid, card, ':power', n, null)], []);
    }),
  }],
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('power', 5)],
    'keep-menu-open': ':while-5-power-tokens-left',
    async: true,
    msg: 'do 5 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':meat', 5, { card })], []);
    }),
  }],
};

// City Surveillance
export const citySurveillance: CardDef = {
  title: 'City Surveillance',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'runner-phase-12': req(function*() { return true; }) },
  events: [{
    event: ':runner-turn-begins',
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const opts: string[] = [];
      if (corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)])) {
        opts.push('Pay 1 [Credits]');
      }
      opts.push('Take 1 tag');
      return opts;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      targets[0] === 'Take 1 tag' ? 'give the runner 1 tag' : `force the runner to ${utils.decapitalize(targets[0] || '')}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 1 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.pay(state, ':runner', coreEid.makeEid(state, eid), card, corePayment.toC('credit', 1))], []);
        coreSay.systemMsg(state, ':runner', result?.msg || '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', eid, 1)], []);
      }
    }),
  }],
};

// Clearinghouse
export const clearinghouse: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    async: true,
    label: 'Trash this asset to do 1 meat damage for each hosted advancement counter (start of turn)',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: msg((s: State, sd: Side, e: EID, c: Card) =>
              `Trash this asset to do ${coreCard.getCounters(c, ':advancement')} meat damage?`),
            'yes-ability': {
              async: true,
              msg: 'do 1 meat damage for each hosted advancement counter',
              effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.trash(s, sd, e, c, { causeCard: c })], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreDamage.damage(s, sd, e, ':meat', coreCard.getCounters(c, ':advancement'), { card: c })], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Clearinghouse',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    advanceable: ':always',
    abilities: [ability],
  };
})();

// Clone Suffrage Movement
export const cloneSuffrageMovement: CardDef = {
  title: 'Clone Suffrage Movement',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (state as any).corp?.discard?.some((c: Card) => coreCard.operation(c)) &&
        coreFlags.unprotected(state, side, card);
    }),
  },
  abilities: [{
    ...coreDefHelpers.corpRecur((c: Card) => coreCard.operation(c)),
    label: 'Add 1 operation from Archives to HQ',
    'waiting-prompt': true,
    prompt: 'Choose an operation in Archives to add to HQ',
    once: ':per-turn',
  }],
};

// Cohort Guidance Program
export const cohortGuidanceProgram: CardDef = {
  title: 'Cohort Guidance Program',
  flags: { 'corp-phase-12': req(function*() { return true; }) },
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [{
    event: ':corp-turn-begins',
    skippable: true,
    prompt: 'Choose one',
    interactive: req(function*() { return true; }),
    choices: req(function*(state: State) {
      const opts: string[] = [];
      if ((state as any).corp?.hand?.length) {
        opts.push('Trash 1 card from HQ to gain 2 [Credits] and draw 1 card');
      }
      if (((state as any).corp?.discard || []).some((c: Card) => !(c as any).seen)) {
        opts.push('Turn 1 facedown card in Archives faceup to place 1 advancement counter on an installed card');
      }
      opts.push('Done');
      return opts;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const choice = targets[0];
      if (choice === 'Done') {
        coreEid.effectCompleted(state, side, eid);
      } else if (choice === 'Trash 1 card from HQ to gain 2 [Credits] and draw 1 card') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose a card to trash',
            msg: 'trash a card from HQ to gain 2 [Credits] and draw 1 card',
            choices: { max: 1, all: true, card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trashCards(s, sd, e, t, { causeCard: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreGaining.gainCredits(s, sd, e, 2)], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDrawing.draw(s, sd, e, 1)], []);
            }),
          }, card, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose a card to turn faceup',
            choices: { card: (c: Card) => coreCard.inDiscard(c) && coreCard.corp(c) && !(c as any).seen },
            msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
              `turn ${(t[0] as any)?.title} in Archives faceup`),
            'show-discard': true,
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              coreUpdate.update(s, sd, { ...t[0], seen: true });
              yield wait_for(s, [{ asyncResult: 'result' },
                coreEngine.resolveAbility(s, sd, {
                  prompt: 'Choose an installed card',
                  choices: { card: (ic: Card) => coreCard.corp(ic) && coreCard.installed(ic) },
                  msg: msg((ss: State) => `place 1 advancement counter on ${coreToString.cardStr(ss, t[0])}`),
                  async: true,
                  effect: effect(function*(ss: State, ssd: Side, ee: EID, cc: Card, tt: any[]) {
                    yield wait_for(ss, [{ asyncResult: 'result' },
                      coreProps.addProp(ss, ssd, ee, tt[0], ':advance-counter', 1, { placed: true })], []);
                  }),
                }, c, null)], []);
            }),
          }, card, null)], []);
      }
    }),
  }],
};

// Commercial Bankers Group
export const commercialBankersGroup: CardDef = (() => {
  const ability: any = {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreFlags.unprotected(state, side, card);
    }),
    automatic: ':gain-credits',
    label: 'Gain 3 [Credits] (start of turn)',
    once: ':per-turn',
    msg: 'gain 3 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  };
  return {
    title: 'Commercial Bankers Group',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Constellation Protocol
export const constellationProtocol: CardDef = {
  title: 'Constellation Protocol',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State) {
      const installed = coreBoard.allInstalled(state, ':corp') || [];
      const iceWithTokens = installed.filter((c: Card) => coreCard.ice(c) && coreCard.getCounters(c, ':advancement') > 0);
      const advanceable = installed.filter((c: Card) => coreCard.ice(c) && coreCard.canBeAdvanced(state, c));
      if (!iceWithTokens.length) return false;
      const aTokenTitle = (iceWithTokens[0] as any)?.title;
      const others = advanceable.filter((c: Card) => (c as any)?.title !== aTokenTitle);
      return others.length > 0;
    }),
  },
  abilities: [{
    label: 'Move an advancement counter between 2 pieces of ice',
    once: ':per-turn',
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.getCounters(c, ':advancement') > 0 },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const fromIce = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a piece of ice that can be advanced',
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              return coreCard.ice(t[0]) && !coreCard.sameCard(fromIce, t[0]) && coreCard.canBeAdvanced(s, t[0]);
            }),
          },
          msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
            `move an advancement counter from ${coreToString.cardStr(s, fromIce)} to ${coreToString.cardStr(s, t[0])}`),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreProps.addProp(s, ':corp', t[0], ':advance-counter', 1, { placed: true })], []);
            yield wait_for(s, [{ asyncResult: 'result' },
              coreProps.addProp(s, ':corp', e, fromIce, ':advance-counter', -1, null)], []);
          }),
        }, card, null)], []);
    }),
  }],
};

// Contract Killer
export const contractKiller: CardDef = {
  title: 'Contract Killer',
  advanceable: ':always',
  abilities: [
    {
      action: true,
      label: 'Trash a connection',
      async: true,
      cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement') >= 2;
      }),
      choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Connection') },
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${(targets[0] as any)?.title}`),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
      }),
    },
    {
      action: true,
      label: 'Do 2 meat damage',
      async: true,
      cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement') >= 2;
      }),
      msg: 'do 2 meat damage',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':meat', 2, { card })], []);
      }),
    },
  ],
};

// Corporate Town
export const corporateTown: CardDef = (() => {
  const ability: any = {
    label: 'Trash a resource',
    once: ':per-turn',
    async: true,
    prompt: 'Choose a resource to trash',
    choices: { card: (c: Card) => coreCard.resource(c) },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${(targets[0] as any)?.title}`),
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) {
      return (coreBoard.allInstalled(state, ':runner') || []).some((c: Card) => coreCard.resource(c));
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, eid, targets[0], { unpreventable: true, causeCard: card })], []);
    }),
  };
  return {
    title: 'Corporate Town',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    'additional-cost': [corePayment.toC('forfeit', 1)],
    flags: {
      'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.rezzed(card) &&
          (coreBoard.allActiveInstalled(state, ':runner') || []).filter((c: Card) => coreCard.resource(c)).length > 0;
      }),
    },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// CPC Generator
export const cpcGenerator: CardDef = {
  title: 'CPC Generator',
  events: [{
    event: ':runner-credit-gain',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      const isClickCredit = ctx.action === ':runner-click-credit';
      return isClickCredit && coreEvents.firstEvent(state, side, ':runner-credit-gain',
        (t: any[]) => (t[0] || {}).action === ':runner-click-credit');
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 1)], []);
    }),
  }],
};

// CSR Campaign
export const csrCampaign: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    async: true,
    label: 'Draw 1 card (start of turn)',
    automatic: ':draw-cards',
    interactive: req(function*() { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Draw 1 card?',
            autoresolve: coreOptional.getAutoresolve(':auto-fire'),
            'yes-ability': coreDefHelpers.drawAbi(1),
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'CSR Campaign',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability, coreOptional.setAutoresolve(':auto-fire', 'CSR Campaign')],
  };
})();

// Cybernetics Court
export const cyberneticsCourt: CardDef = {
  title: 'Cybernetics Court',
  'static-abilities': [coreHandSize.corpHandSizePlus(4)],
};

// Cybersand Harvester
export const cybersandHarvester: CardDef = {
  title: 'Cybersand Harvester',
  events: [{
    event: ':rez',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.ice((targets as any)[0]?.card);
    }),
    msg: 'place 2 [Credits] on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, ':corp', eid, card, ':credit', 2, null)], []);
    }),
  }],
  abilities: [
    {
      label: 'Take all hosted credits',
      cost: [corePayment.toC('trash-can', 1)],
      'change-in-game-state': {
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return coreCard.getCounters(card, ':credit') > 0;
        }),
      },
      msg: msg((state: State, side: Side, eid: EID, card: Card) =>
        `gain ${coreCard.getCounters(card, ':credit')} [Credits]`),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, coreCard.getCounters(card, ':credit'))], []);
      }),
    },
    {
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDefHelpers.spendCredits(state, side, eid, card, ':credit', 1)], []);
      }),
      label: 'Take 1 hosted [Credits] (manual)',
      msg: 'take 1 hosted [Credits]',
    },
  ],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID) {
        return (eid as any)?.sourceType === ':corp-install';
      }),
      type: ':credit',
    },
  },
};

// Daily Business Show
export const dailyBusinessShow: CardDef = {
  title: 'Daily Business Show',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [
    coreDrawing.firstTimeDrawBonus(':corp', 1),
    {
      event: ':corp-draw',
      req: req(function*(state: State, side: Side) {
        return coreEvents.firstEvent(state, side, ':corp-draw');
      }),
      once: ':per-turn',
      'once-key': ':daily-business-show-put-bottom',
      interactive: req(function*() { return true; }),
      silent: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const dbs = (coreBoard.allInstalled(state, ':corp') || []).filter((c: Card) =>
          (c as any)?.title === 'Daily Business Show' && coreCard.rezzed(c));
        return card !== dbs[0];
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const dbs = (coreBoard.allInstalled(state, ':corp') || []).filter((c: Card) =>
          (c as any)?.title === 'Daily Business Show' && coreCard.rezzed(c));
        const drawn = (state as any).corpCurrentlyDrawing || [];
        if (!drawn.length) return coreEid.effectCompleted(state, side, eid);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            'waiting-prompt': true,
            prompt: `Choose ${utils.quantify(dbs.length, 'card')} to add to the bottom of R&D`,
            choices: {
              max: Math.min(dbs.length, drawn.length),
              card: (c: Card) => drawn.some((d: Card) => coreCard.sameCard(d, c)),
              all: true,
            },
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              for (const dc of [...t].reverse()) {
                const idx = drawn.findIndex((d: Card) => coreCard.sameCard(d, dc));
                coreSay.systemMsg(s, sd, `uses ${(c as any)?.title} to add the ${utils.ordinal(idx + 1)} card drawn to the bottom of R&D`);
                coreMoving.move(s, sd, dc, ':deck', null);
                coreMoving.removeFromCurrentlyDrawing(s, sd, dc);
              }
            }),
          }, card, null)], []);
      }),
    },
  ],
};

// Daily Quest
export const dailyQuest: CardDef = (() => {
  const ability: any = {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const zone = coreCard.getZone(card);
      const hostZone = coreCard.getZone((card as any).host);
      const serverKey = (zone?.[1] || hostZone?.[1]);
      const lastReg = (state as any).runner?.registerLast || {};
      return !(lastReg.successfulRun || []).includes(serverKey);
    }),
    label: 'gain 3 [Credits] (start of turn)',
    automatic: ':gain-credits',
    msg: 'gain 3 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 3)], []);
    }),
  };
  return {
    title: 'Daily Quest',
    'rez-req': req(function*(state: State) { return (state as any).activePlayer === ':corp'; }),
    events: [
      {
        event: ':successful-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return !!(targets as any)[0]?.context?.thisServer;
        }),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':runner', 'gains 2 [Credits] for a successful run on the Daily Quest server');
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':runner', eid, 2)], []);
        }),
      },
      { ...ability, event: ':corp-turn-begins' },
    ],
    abilities: [ability],
  };
})();

// Dedicated Response Team
export const dedicatedResponseTeam: CardDef = {
  title: 'Dedicated Response Team',
  events: [{
    ...coreDefHelpers.doMeatDamage(2),
    event: ':run-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreFlags.tagged(state) && !!(targets as any)[0]?.successful;
    }),
  }],
};

// Dedicated Server
export const dedicatedServer: CardDef = {
  title: 'Dedicated Server',
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (eid as any)?.sourceType === ':rez' && coreCard.ice(targets[0]);
      }),
      type: ':recurring',
    },
  },
};

// Director Haas
export const directorHaas: CardDef = {
  title: 'Director Haas',
  'in-play': [':click-per-turn', 1],
  'on-trash': executiveTrashEffect,
};

// Docklands Crackdown
export const docklandsCrackdown: CardDef = {
  title: 'Docklands Crackdown',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 2)],
    'keep-menu-open': ':while-2-clicks-left',
    msg: 'place 1 power counter in itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  'static-abilities': [{
    type: ':install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.runner(targets[0]) && coreEvents.noEvent(state, ':runner', ':runner-install');
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':power');
    }),
  }],
  events: [{
    event: ':runner-install',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.getCounters(card, ':power') > 0 && coreEvents.noEvent(state, ':runner', ':runner-install');
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `increase the install cost of ${((targets as any)[0]?.card as any)?.title} by ${coreCard.getCounters(card, ':power')} [Credits]`),
  }],
};

// Dr. Vientiane Keeling
export const drVientianeKeeling: CardDef = {
  title: 'Dr. Vientiane Keeling',
  'static-abilities': [coreHandSize.runnerHandSizePlus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return -coreCard.getCounters(card, ':power');
  }))],
  'on-rez': gainPowerCounter,
  events: [{ ...gainPowerCounter, event: ':corp-turn-begins' }],
};

// Drago Ivanov
export const dragoIvanov: CardDef = {
  title: 'Drago Ivanov',
  advanceable: ':always',
  abilities: [{
    cost: [corePayment.toC('advancement', 2)],
    req: req(function*(state: State) { return (state as any).activePlayer === ':corp'; }),
    msg: 'give the runner a tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, 1)], []);
    }),
  }],
};

// Drudge Work
export const drudgeWork: CardDef = {
  title: 'Drudge Work',
  data: { counter: { power: 3 } },
  events: [coreDefHelpers.trashOnEmpty(':power')],
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('power', 1)],
    choices: {
      card: (c: Card) => coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    label: 'Reveal an agenda from HQ or Archives',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0] as any;
      const zoneName = coreServers.zoneToName(coreCard.getZone(t));
      const pts = coreCard.getAgendaPoints(t);
      return `reveal ${t?.title} from ${zoneName}, gain ${pts} [Credits], and shuffle it into R&D`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, t)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, coreCard.getAgendaPoints(t))], []);
      coreMoving.move(state, ':corp', t, ':deck', null);
      coreShuffling.shuffle(state, ':corp', ':deck');
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Early Premiere
export const earlyPremiere: CardDef = {
  title: 'Early Premiere',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State) {
      return (coreBoard.allInstalled(state, ':corp') || []).some((c: Card) =>
        coreCard.canBeAdvanced(state, c) && coreCard.inServer(c));
    }),
  },
  abilities: [{
    cost: [corePayment.toC('credit', 1)],
    label: 'Place 1 advancement counter on a card that can be advanced in a server',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.canBeAdvanced(state, targets[0]) && coreCard.installed(targets[0]) && coreCard.inServer(targets[0]);
      }),
    },
    once: ':per-turn',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
    }),
  }],
};

// Echo Chamber
export const echoChamber: CardDef = {
  title: 'Echo Chamber',
  abilities: [{
    action: true,
    label: 'Add this asset to your score area as an agenda worth 1 agenda point',
    cost: [corePayment.toC('click', 3)],
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Edge of World
export const edgeOfWorld: CardDef = {
  title: 'Edge of World',
  ...coreDefHelpers.installedAccessTrigger(3, {
    msg: msg((state: State) => {
      const run = (state as any).run;
      const ices = (state as any).corp?.servers?.[run?.server]?.ices || [];
      return `do ${ices.length} core damage`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const run = (state as any).run;
      const ices = (state as any).corp?.servers?.[run?.server]?.ices || [];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':brain', ices.length, { card })], []);
    }),
  }),
};

// Eliza's Toybox
export const elizasToybox: CardDef = {
  title: "Eliza's Toybox", // apostrophe requires double quotes
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 3)],
    'keep-menu-open': ':while-3-clicks-left',
    label: 'Rez a card, ignoring all costs',
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) && !coreCard.agenda(c) && !coreCard.rezzed(c),
    },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], {
          ignoreCost: ':all-costs',
          msgKeys: { includeCostFromEid: eid },
        })], []);
    }),
  }],
};

// Elizabeth Mills
export const elizabethMills: CardDef = {
  title: 'Elizabeth Mills',
  'on-rez': {
    msg: 'remove 1 bad publicity',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreBadPublicity.loseBadPublicity(state, side, 1);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    label: 'Trash a location and take 1 bad publicity',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const hasLocation = (coreBoard.allInstalled(state, ':runner') || []).some((c: Card) =>
        coreCard.hasSubtype(c, 'Location'));
      if (hasLocation) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Trash a location and take 1 bad publicity',
            msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
              `trash ${(t[0] as any)?.title} and take 1 bad publicity`),
            choices: { min: 1, card: (c: Card) => coreCard.hasSubtype(c, 'Location') },
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, e, t[0], { causeCard: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreBadPublicity.gainBadPublicity(s, ':corp', e, 1)], []);
            }),
          }, card, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            msg: 'take 1 bad publicity',
            async: true,
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreBadPublicity.gainBadPublicity(s, ':corp', e, 1)], []);
            }),
          }, card, null)], []);
      }
    }),
  }],
};

// Encryption Protocol
export const encryptionProtocol: CardDef = {
  title: 'Encryption Protocol',
  'static-abilities': [{
    type: ':trash-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.installed(targets[0]);
    }),
    value: 1,
  }],
};

// Esca
export const esca: CardDef = {
  title: 'Esca',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    msg: 'force the Runner to lose 1 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 1)], []);
      if (coreFlags.tagged(state)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            req: req(function*(s: State) { return coreFlags.tagged(s); }),
            msg: 'do 1 net damage',
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, e, ':net', 1, null)], []);
            }),
          }, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Estelle Moon
export const estelleMoon: CardDef = {
  title: 'Estelle Moon',
  events: [{
    event: ':corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      const c = ctx.card;
      return (coreCard.asset(c) || coreCard.agenda(c) || coreCard.upgrade(c)) &&
        coreServers.isRemote((coreCard.getZone(c) || [])[1]);
    }),
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [{
    label: 'Draw 1 card and gain 2 [Credits] for each hosted power counter',
    cost: [corePayment.toC('trash-can', 1)],
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':power') > 0;
      }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const counters = coreCard.getCounters(card, ':power');
      const credits = 2 * counters;
      coreSay.systemMsg(state, side,
        `uses ${(card as any)?.title} to draw ${utils.quantify(counters, 'card')} and gain ${credits} [Credits]`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, eid, counters)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, credits)], []);
    }),
  }],
};

// Eve Campaign
export const eveCampaign: CardDef = {
  title: 'Eve Campaign',
  ...campaign(16, 2),
};

// Executive Boot Camp
export const executiveBootCamp: CardDef = {
  title: 'Executive Boot Camp',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [{
    event: ':corp-turn-begins',
    interactive: req(function*() { return true; }),
    prompt: 'Rez a card, paying 1 [Credit] less',
    'waiting-prompt': true,
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.corp(targets[0]) && coreCard.installed(targets[0]) && !coreCard.rezzed(targets[0]) &&
          coreRezzing.canPayToRez(state, side, eid, targets[0], { costBonus: -1 });
      }),
    },
    'change-in-game-state': {
      req: req(function*(state: State) {
        return (coreBoard.allInstalled(state, ':corp') || []).some((c: Card) => !coreCard.rezzed(c));
      }),
      silent: true,
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], { costBonus: -1, noWarning: true })], []);
    }),
  }],
  abilities: [{
    prompt: 'Choose an asset to reveal and add to HQ',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any)?.title}, add it to HQ, and shuffle R&D`),
    choices: req(function*(state: State) {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) => coreCard.asset(c)),
        { sorted: true });
    }),
    cost: [corePayment.toC('credit', 1), corePayment.toC('trash-can', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('credit', 1), corePayment.toC('trash-can', 1)] },
    label: 'Search R&D for an asset',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, targets[0])], []);
      coreShuffling.shuffle(state, side, ':deck');
      coreMoving.move(state, side, targets[0], ':hand', null);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Executive Search Firm
export const executiveSearchFirm: CardDef = {
  title: 'Executive Search Firm',
  abilities: [{
    action: true,
    prompt: 'Choose an Executive, Sysop, or Character to add to HQ',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any)?.title}, add it to HQ, and shuffle R&D`),
    choices: req(function*(state: State) {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) =>
          coreCard.hasAnySubtype(c, ['Executive', 'Sysop', 'Character'])),
        { sorted: true });
    }),
    cost: [corePayment.toC('click', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('click', 1)], action: true },
    'keep-menu-open': ':while-clicks-left',
    label: 'Search R&D for an Executive, Sysop, or Character',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreMoving.move(state, side, targets[0], ':hand', null);
      coreShuffling.shuffle(state, ':deck');
    }),
  }],
};

// Exposé
export const expose: CardDef = {
  title: 'Exposé',
  advanceable: ':always',
  abilities: [{
    label: 'Remove 1 bad publicity for each advancement counter on Exposé',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `remove ${coreCard.getCounters(card, ':advancement')} bad publicity`),
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreBadPublicity.loseBadPublicity(state, side, coreCard.getCounters(card, ':advancement'));
    }),
  }],
};

// False Flag
export const falseFlag: CardDef = {
  title: 'False Flag',
  advanceable: ':always',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `give the runner ${utils.quantify(Math.floor(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') / 2), 'tag')}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = Math.floor(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') / 2);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, n)], []);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 7)],
    label: 'Add this asset to your score area as an agenda worth 3 agenda points',
    msg: 'add itself to [their] score area as an agenda worth 3 agenda points',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreMoving.asAgenda(state, ':corp', card, 3);
    }),
  }],
};

// Federal Fundraising
export const federalFundraising: CardDef = (() => {
  const drawAb: any = {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreFlags.unprotected(state, side, card);
      }),
      prompt: 'Draw 1 card?',
      'waiting-prompt': true,
      'yes-ability': { msg: 'draw 1 card', async: true, effect: effect(function*(state: State, side: Side, eid: EID) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1)], []);
      }) },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, side, `declines to use ${(card as any)?.title} to draw 1 card`);
        }),
      },
    },
  };
  const ability: any = {
    once: ':per-turn',
    req: req(function*(state: State) {
      return !!(state as any).corpPhase12 && ((state as any).corp?.deck?.length > 0);
    }),
    skippable: true,
    interactive: req(function*() { return true; }),
    label: 'Look at the top 3 cards of R&D (start of turn)',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Look at the top 3 cards of R&D?',
            'waiting-prompt': true,
            'no-ability': drawAb,
            'yes-ability': {
              msg: 'rearrange the top 3 cards of R&D',
              async: true,
              'waiting-prompt': true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
                const from = (s as any).corp?.deck?.slice(0, 3) || [];
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd,
                    coreDefHelpers.reorderChoice(':corp', ':runner', from, [], from.length, from),
                    c, null)], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd, drawAb, c, null)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Federal Fundraising',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Franchise City
export const franchiseCity: CardDef = {
  title: 'Franchise City',
  events: [{
    event: ':access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.agenda((targets as any)[0]?.accessedCard);
    }),
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Front Company
export const frontCompany: CardDef = {
  title: 'Front Company',
  'static-abilities': [{
    type: ':cannot-run-on-server',
    req: req(function*(state: State, side: Side) {
      return !(coreEvents.turnEvents(state, side, ':run') || []).length;
    }),
    value: req(function*(state: State) {
      return Object.keys((state as any).corp?.servers?.remote || {}).map((k: string) => k);
    }),
  }],
  'rez-req': req(function*(state: State) { return (state as any).activePlayer === ':corp'; }),
  events: [{
    event: ':run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      return ctx.targetServer === ':archives' &&
        coreEvents.firstEvent(state, ':runner', ':run', (t: any[]) => (t[0] || {}).targetServer === ':archives') &&
        coreFlags.unprotected(state, side, card);
    }),
    msg: 'do 2 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 2, null)], []);
    }),
  }],
};

// Full Immersion RecStudio
export const fullImmersionRecStudio: CardDef = {
  title: 'Full Immersion RecStudio',
  'can-host': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.asset(targets[0]) || coreCard.agenda(targets[0])) &&
      ((card as any).hosted?.length || 0) < 2;
  }),
  'trash-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return 3 * ((card as any).hosted?.length || 0);
  }),
  abilities: [
    {
      action: true,
      label: 'Install an asset or agenda on this asset',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return ((card as any).hosted?.length || 0) < 2;
      }),
      cost: [corePayment.toC('click', 1)],
      prompt: 'Choose an asset or agenda to install',
      choices: {
        card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c)) && coreCard.inHand(c) && coreCard.corp(c),
      },
      msg: 'install and host an asset or agenda',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, targets[0], card, null)], []);
      }),
    },
    {
      label: 'Install a previously-installed asset or agenda on this asset (fixes only)',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return ((card as any).hosted?.length || 0) < 2;
      }),
      prompt: 'Choose an installed asset or agenda to host',
      choices: {
        card: (c: Card) => (coreCard.asset(c) || coreCard.agenda(c)) && coreCard.installed(c) && coreCard.corp(c),
      },
      msg: 'install and host an asset or agenda',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreHosting.host(state, side, card, targets[0]);
      }),
    },
  ],
};

// Fumiko Yamamori
export const fumikoYamamori: CardDef = {
  title: 'Fumiko Yamamori',
  events: [{
    event: ':reveal-spent-credits',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      return ctx.corpCredits != null && ctx.runnerCredits != null && ctx.corpCredits !== ctx.runnerCredits;
    }),
    msg: 'do 1 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':meat', 1, { card })], []);
    }),
  }],
};

// Gaslight
export const gaslight: CardDef = (() => {
  const searchForOperation: any = {
    prompt: 'Choose an operation to add to HQ',
    'waiting-prompt': true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t === 'Done' ? 'shuffle R&D' : `add ${coreCard.getTitle(t as Card)} from R&D to HQ`;
    }),
    choices: req(function*(state: State) {
      const ops = ((state as any).corp?.deck || []).filter((c: Card) => coreCard.operation(c))
        .sort((a: Card, b: Card) => ((a as any).title || '').localeCompare((b as any).title || ''));
      return [...ops, 'Done'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Done') {
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, targets[0])], []);
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreMoving.move(state, ':corp', targets[0], ':hand', null);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  const ability: any = {
    once: ':per-turn',
    skippable: true,
    async: true,
    label: 'Search R&D for an operation (start of turn)',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash this asset to search R&D for an operation?',
            'yes-ability': {
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.trash(s, sd, c, { causeCard: c })], []);
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(s, sd, searchForOperation, c, null)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Gaslight',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Gene Splicer
export const geneSplicer: CardDef = {
  title: 'Gene Splicer',
  advanceable: ':always',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} net damage`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', n, { card })], []);
    }),
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 3)],
    label: 'Add this asset to your score area as an agenda worth 1 agenda point',
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreMoving.asAgenda(state, ':corp', card, 1);
    }),
  }],
};

// Genetics Pavilion
export const geneticsPavilion: CardDef = {
  title: 'Genetics Pavilion',
  'on-rez': {
    msg: 'prevent the Runner from drawing more than 2 cards during [runner-pronoun] turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreDrawing.maxDraw(state, ':runner', 2);
      if (coreDrawing.remainingDraws(state, ':runner') === 0) {
        coreDrawing.preventDraw(state, ':runner');
      }
    }),
  },
  events: [{
    event: ':runner-turn-begins',
    silent: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreDrawing.maxDraw(state, ':runner', 2);
    }),
  }],
  'leave-play': effect(function*(state: State) {
    const runner = (state as any).runner;
    if (runner?.register) {
      delete runner.register.maxDraw;
      delete runner.register.cannotDraw;
    }
  }),
};

// Ghost Branch
export const ghostBranch: CardDef = {
  title: 'Ghost Branch',
  ...advanceAmbush(0, {
    async: true,
    'waiting-prompt': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `give the Runner ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'tag')}`),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const n = coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':corp', eid, n)], []);
    }),
  }),
};

// GRNDL Refinery
export const grndlRefinery: CardDef = {
  title: 'GRNDL Refinery',
  advanceable: ':always',
  abilities: [{
    action: true,
    label: 'Gain 4 [Credits] for each advancement counter on GRNDL Refinery',
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${4 * coreCard.getCounters(card, ':advancement')} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 4 * coreCard.getCounters(card, ':advancement'))], []);
    }),
  }],
};

// Haas Arcology AI
export const haasArcologyAI: CardDef = {
  title: 'Haas Arcology AI',
  advanceable: ':while-unrezzed',
  abilities: [{
    action: true,
    label: 'Gain [Click][Click]',
    once: ':per-turn',
    msg: 'gain [Click][Click]',
    cost: [corePayment.toC('click', 1), corePayment.toC('advancement', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreGaining.gainClicks(state, side, 2);
    }),
  }],
};

export const heartsAndMinds: CardDef = (() => {
  const political: any = {
    ...coreDefHelpers.placeAdvancementCounter(true, 1),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.unprotected(state, card);
    }),
  };
  const ability: any = {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    label: 'Move 1 hosted advancement counter to another card you can advance (start of turn)',
    skippable: true,
    once: ':per-turn',
    'waiting-prompt': true,
    prompt: 'Choose an installed card to move 1 hosted advancement counter from',
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.getCounters(c, ':advancement') > 0,
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const fromIce = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose an installed card you can advance',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const t = targets[0];
              return coreCard.installed(t) && coreProps.canBeAdvanced(state, t) &&
                !coreCard.sameCard(fromIce, t);
            }),
          },
          msg: {
            public: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `move 1 hosted advancement counter from ${coreToString.cardStr(state, fromIce)} to ${coreToString.cardStr(state, targets[0])}`),
            corp: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `move 1 hosted advancement counter from ${coreToString.cardStr(state, fromIce, { maybeVisible: true })} to ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`),
          },
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreProps.addProp(state, ':corp', targets[0], ':advance-counter', 1, { placed: true })], []);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreProps.addProp(state, ':corp', fromIce, ':advance-counter', -1)], []);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, ':corp', political, card, null)], []);
          }),
          cancel: political,
        }, card, null)], []);
    }),
    cancel: political,
  };
  return {
    title: 'Hearts and Minds',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Honeyfarm
export const honeyfarm: CardDef = {
  title: 'Honeyfarm',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    msg: 'force the Runner to lose 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 1)], []);
    }),
  },
};

// Clyde Van Rite
export const clydeVanRite: CardDef = (() => {
  const ability: any = {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
        ((state as any).runner?.deck?.length > 0);
    }),
    player: ':runner',
    once: ':per-turn',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const opts: string[] = [];
      if (corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)])) {
        opts.push('Pay 1 [Credits]');
      }
      if (!corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
        (state as any).runner?.deck?.length > 0) {
        opts.push('Trash the top card of the stack');
      }
      return opts;
    }),
    label: 'make the Runner pay 1 [Credits] or trash the top card of the stack (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `force the Runner to ${utils.decapitalize(targets[0] || '')}`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 1 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.pay(state, side, coreEid.makeEid(state, eid), card, corePayment.toC('credit', 1))], []);
        coreSay.systemMsg(state, side, result?.msg || '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':runner', eid, ':runner', 1)], []);
      }
    }),
  };
  return {
    title: 'Clyde Van Rite',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

// Hostile Architecture
export const hostileArchitecture: CardDef = {
  title: 'Hostile Architecture',
  events: [{
    event: ':runner-trash',
    async: true,
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const valid = (evs: any[]) => evs.some((e: any) => coreCard.corp(e.card) && coreCard.installed(e.card));
      return valid(targets as any[]) &&
        coreEvents.firstEvent(state, side, ':runner-trash', (t: any[]) => valid(t));
    }),
    msg: 'do 2 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', eid, ':meat', 2, { card })], []);
    }),
  }],
};

// Hostile Infrastructure
export const hostileInfrastructure: CardDef = {
  title: 'Hostile Infrastructure',
  events: [{
    event: ':runner-trash',
    async: true,
    'once-per-instance': false,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.corp((targets as any)[0]?.card);
    }),
    msg: 'do 1 net damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', eid, ':net', 1, { card })], []);
    }),
  }],
};

// Humanoid Resources
export const humanoidResources: CardDef = (() => {
  const playAnInstant: any = {
    prompt: 'Choose an operation',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const hand = (state as any).corp?.hand || [];
      const playable = hand.filter((c: Card) => {
        if (!coreCard.operation(c)) return false;
        const def = coreCardDefs.cardDef(c);
        const playCost = coreCostFns.playCost(state, side, c, null);
        return coreEngine.shouldTrigger(state, ':corp', { ...eid, source: c, sourceType: ':play' }, c, null, def?.['on-play'] || {}) &&
          corePayment.canPay(state, side, { ...eid, source: c, sourceType: ':play' }, c, null, [corePayment.toC('credit', playCost)]);
      });
      return [...playable, 'Done'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Done') {
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.playInstant(state, side, eid, targets[0], null)], []);
      }
    }),
  };
  return {
    title: 'Humanoid Resources',
    abilities: [{
      cost: [corePayment.toC('click', 3), corePayment.toC('trash-can', 1)],
      action: true,
      label: 'Gain 4 [Credits] and draw 3 cards',
      msg: 'gain 4 [Credits] and draw 3 cards',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreSay.playSfx(state, side, 'professional-contacts');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 4, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, eid, 3)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreDefHelpers.corpInstallUpToNCards(2), card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, playAnInstant, card, null)], []);
      }),
    }],
  };
})();

// Hyoubu Research Facility
export const hyoubuResearchFacility: CardDef = {
  title: 'Hyoubu Research Facility',
  events: [{
    event: ':reveal-spent-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = (targets as any)[0] || {};
      return ctx.corpCredits != null && coreEvents.firstEvent(state, side, ':reveal-spent-credits');
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `gain ${((targets as any)[0] || {}).corpCredits} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const n = ((targets as any)[0] || {}).corpCredits || 0;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, n)], []);
    }),
  }],
};

// Ibrahim Salem
export const ibrahimSalem: CardDef = (() => {
  const trashAbility = (cardType: string): any =>
    coreDefHelpers.withRevealedHand(':runner', { eventSide: ':corp' }, {
      req: req(function*(state: State) {
        return ((state as any).runner?.hand || []).some((c: Card) => coreCard.isType(c, cardType));
      }),
      prompt: `Choose a ${cardType} to trash`,
      choices: {
        card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) && coreCard.isType(c, cardType),
      },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
      }),
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${(targets[0] as any)?.title} from the grip`),
    });
  const chooseAbility: any = {
    label: 'Trash 1 card in the grip of a named type',
    'change-in-game-state': {
      req: req(function*(state: State) { return !!((state as any).runner?.hand?.length); }),
      silent: true,
    },
    once: ':per-turn',
    req: req(function*(state: State) { return !!((state as any).runner?.hand?.length); }),
    prompt: 'Choose a card type',
    choices: ['Event', 'Hardware', 'Program', 'Resource'],
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `choose ${targets[0]}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, trashAbility(targets[0]), card, null)], []);
    }),
  };
  return {
    title: 'Ibrahim Salem',
    'additional-cost': [corePayment.toC('forfeit', 1)],
    flags: {
      'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreEffects.isDisabledReg(state, card);
      }),
    },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    abilities: [chooseAbility],
  };
})();

// Idiosyncresis
export const idiosyncresis: CardDef = (() => {
  const adv = (card: Card) => coreCard.getCounters(card, ':advancement');
  const loseAmt = (card: Card, runner: any) => Math.min(2 * adv(card), runner?.credit || 0);
  const gainAmt = (card: Card) => 3 * adv(card);
  const abi: any = {
    event: ':corp-turn-begins',
    interactive: req(function*() { return true; }),
    skippable: true,
    label: 'Trash Idiosyncresis',
    optional: {
      prompt: 'Trash Idiosyncresis?',
      req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
      'yes-ability': {
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card) => {
          const runner = (state as any).runner;
          return `force the runner to lose ${loseAmt(card, runner)} [Credits], and then gain ${gainAmt(card)} [Credits]`;
        }),
        cost: [corePayment.toC('trash-can', 1)],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const runner = (state as any).runner;
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', eid, loseAmt(card, runner))], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, side, eid, gainAmt(card))], []);
        }),
      },
    },
  };
  return {
    title: 'Idiosyncresis',
    advanceable: ':always',
    events: [abi],
    abilities: [abi],
  };
})();

// Illegal Arms Factory
export const illegalArmsFactory: CardDef = (() => {
  const ability: any = {
    msg: 'gain 1 [Credits] and draw 1 card',
    label: 'Gain 1 [Credits] and draw 1 card (start of turn)',
    once: ':per-turn',
    automatic: ':draw-cards',
    async: true,
    req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, eid, 1)], []);
    }),
  };
  return {
    title: 'Illegal Arms Factory',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
    'on-trash': {
      req: req(function*(state: State, side: Side) { return side === ':runner'; }),
      msg: 'take 1 bad publicity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreBadPublicity.gainBadPublicity(state, ':corp', 1);
      }),
    },
  };
})();

// Indian Union Stock Exchange
export const indianUnionStockExchange: CardDef = {
  title: 'Indian Union Stock Exchange',
  events: [
    {
      event: ':play-operation',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = (targets as any)[0] || {};
        return ctx.card?.faction !== (state as any).corp?.identity?.faction;
      }),
      msg: 'gain 1 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 1)], []);
      }),
    },
    {
      event: ':rez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = (targets as any)[0] || {};
        return ctx.card?.faction !== (state as any).corp?.identity?.faction;
      }),
      msg: 'gain 1 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 1)], []);
      }),
    },
  ],
};

// Investigator Inez Delgado A
export const investigatorInezDelgadoA: CardDef = {
  title: 'Investigator Inez Delgado A',
  events: [{
    event: ':agenda-scored',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State) { return !!((state as any).runner?.scored?.length); }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const scored = ((targets as any)[0] || {}).card;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: msg((s: State) => `Swap ${(scored as any)?.title} for an agenda in the Runner's score area?`),
            'waiting-prompt': true,
            req: req(function*(s: State) { return !!((s as any).runner?.scored?.length); }),
            'yes-ability': {
              prompt: `Choose a scored Runner agenda to swap with ${(scored as any)?.title}`,
              choices: {
                req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                  return coreFlags.inRunnerScored(s, sd, t[0]) &&
                    !!(t[0] as any)?.agendapoints && (t[0] as any)?.agendapoints > 0;
                }),
              },
              msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                `swap ${coreToString.cardStr(s, scored)} for ${coreToString.cardStr(s, t[0])}`),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                const [, newScored] = coreMoving.swapAgendas(s, sd, scored, t[0]);
                const def = coreCardDefs.cardDef(newScored as Card);
                if (def?.['on-score']) {
                  yield wait_for(s, [{ asyncResult: 'result' },
                    coreEngine.resolveAbility(s, sd, def['on-score'], newScored as Card, null)], []);
                } else {
                  coreEid.effectCompleted(s, sd, e);
                }
              }),
            },
          },
        }, card, targets)], []);
    }),
  }],
};

// Investigator Inez Delgado A 2
export const investigatorInezDelgadoA2: CardDef = (() => {
  const swapAbi = (stolen: Card): any => ({
    prompt: `Swap ${(stolen as any)?.title} with an agenda in your score area?`,
    req: req(function*(state: State) { return !!((state as any).corp?.scored?.length); }),
    choices: {
      req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
        return coreFlags.inCorpScored(s, sd, t[0]);
      }),
    },
    msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
      `swap ${coreToString.cardStr(s, stolen)} for ${coreToString.cardStr(s, t[0])}`),
    effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
      coreMoving.swapAgendas(s, sd, t[0], stolen);
    }),
  });
  return {
    title: 'Investigator Inez Delgado A 2',
    events: [{
      event: ':agenda-stolen',
      interactive: req(function*() { return true; }),
      skippable: true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const stolen = ((targets as any)[0] || {}).card;
        const def = coreCardDefs.cardDef(stolen);
        if (def?.['on-score']) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              optional: {
                prompt: `Resolve the when-scored ability on ${(stolen as any)?.title}`,
                'waiting-prompt': true,
                'yes-ability': {
                  async: true,
                  msg: msg((s: State) => `resolve the when-scored ability on ${(stolen as any)?.title}`),
                  effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
                    yield wait_for(s, [{ asyncResult: 'result' },
                      coreEngine.resolveAbility(s, sd, def['on-score'], stolen, null)], []);
                    if (coreCard.getCard(s, stolen)) {
                      yield wait_for(s, [{ asyncResult: 'result' },
                        coreEngine.resolveAbility(s, sd, swapAbi(stolen), c, null)], []);
                    } else {
                      coreEid.effectCompleted(s, sd, e);
                    }
                  }),
                },
                'no-ability': swapAbi(stolen),
              },
            }, card, null)], []);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, swapAbi(stolen), card, null)], []);
        }
      }),
    }],
  };
})();

// Isabel McGuire
export const isabelMcGuire: CardDef = {
  title: 'Isabel McGuire',
  abilities: [{
    action: true,
    label: 'Add an installed card to HQ',
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `move ${coreToString.cardStr(state, targets[0])} to HQ`),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreMoving.move(state, side, targets[0], ':hand', null);
    }),
  }],
};

// IT Department
export const itDepartment: CardDef = {
  title: 'IT Department',
  abilities: [
    {
      action: true,
      cost: [corePayment.toC('click', 1)],
      'keep-menu-open': ':while-clicks-left',
      msg: 'place 1 power counter on itself',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
      }),
    },
    {
      cost: [corePayment.toC('power', 1)],
      'keep-menu-open': ':while-power-tokens-left',
      label: 'Add strength to a rezzed piece of ice',
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':power') > 0;
      }),
      msg: 'add strength to a rezzed piece of ice',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const itTarget = targets[0];
        coreEffects.registerLingeringEffect(state, card, {
          type: ':ice-strength',
          duration: ':end-of-turn',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
            return coreCard.sameCard(t[0], itTarget);
          }),
          value: req(function*(s: State, sd: Side, e: EID, c: Card) {
            return 1 + coreCard.getCounters(c, ':power');
          }),
        });
        coreIce.updateIceStrength(state, itTarget);
      }),
    },
  ],
};

// Jackson Howard
export const jacksonHoward: CardDef = {
  title: 'Jackson Howard',
  abilities: [
    coreDefHelpers.drawAbi(2, null, {
      action: true,
      cost: [corePayment.toC('click', 1)],
      'keep-menu-open': ':while-clicks-left',
    }),
    {
      label: 'Shuffle up to 3 cards from Archives into R&D',
      cost: [corePayment.toC('remove-from-game', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreShuffling.shuffleIntoRdEffect(state, side, eid, card, 3)], []);
      }),
    },
  ],
};

// Janaína "JK" Dumont Kindelán
export const janainaJKDumontKindelan: CardDef = (() => {
  const ability: any = {
    label: 'Place 3 [Credits] on this asset (start of turn)',
    once: ':per-turn',
    msg: 'place 3 [Credits] on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':credit', 3, { placed: true })], []);
    }),
  };
  return {
    title: 'Janaína "JK" Dumont Kindelán',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [
      ability,
      {
        action: true,
        cost: [corePayment.toC('click', 1)],
        label: 'Take all hosted credits and add this asset to HQ. Install 1 card from HQ',
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card) =>
          `gain ${coreCard.getCounters(coreCard.getCard(state, card), ':credit')} [Credits] and add itself to HQ`),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          if (coreCard.getCounters(coreCard.getCard(state, card), ':credit') > 0) {
            coreSay.playSfx(state, side, 'click-credit-3');
          }
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDefHelpers.takeCredits(state, side, card, ':credit', ':all')], []);
          coreMoving.move(state, ':corp', card, ':hand', null);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              async: true,
              prompt: 'Choose 1 card to install',
              choices: {
                card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHand(c),
              },
              effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreInstalling.corpInstall(s, sd, e, t[0], null, {
                    msgKeys: { installSource: c, displayOrigin: true },
                  })], []);
              }),
            }, card, null)], []);
        }),
      },
    ],
  };
})();

// Jeeves Model Bioroids
export const jeevesModelBioroids: CardDef = (() => {
  const ability: any = {
    label: 'Gain [Click]',
    msg: 'gain [Click]',
    once: ':per-turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreGaining.gainClicks(state, side, 1);
    }),
  };
  const cleanup = effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreUpdate.update(state, side, { ...(coreCard.getCard(state, card) || card), seenThisTurn: undefined });
  });
  return {
    title: 'Jeeves Model Bioroids',
    abilities: [ability],
    'leave-play': cleanup,
    events: [
      {
        event: ':corp-spent-click',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = (targets as any)[0] || {};
          const { action, value, abilityIdx } = ctx;
          const bacCid = (state as any).corp?.basicActionCard?.cid;
          const cause = typeof action === 'string' && action.startsWith(':')
            ? (action === ':play-instant' ? [bacCid, 3]
              : action === ':corp-click-install' ? [bacCid, 2]
              : [action, abilityIdx])
            : [action, abilityIdx];
          const causeKey = JSON.stringify(cause);
          const currentCard = coreCard.getCard(state, card) || card;
          const seen = (currentCard as any).seenThisTurn || {};
          const clicksSpent = (seen[causeKey] || 0) + (value || 0);
          const updated = coreUpdate.update(state, side, {
            ...currentCard,
            seenThisTurn: { ...seen, [causeKey]: clicksSpent },
          });
          if (clicksSpent >= 3) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, ability, card, null)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
      {
        event: ':corp-turn-ends',
        silent: true,
        effect: cleanup,
      },
    ],
  };
})();

// Kala Ghoda Real TV
export const kalaGhodaRealTV: CardDef = {
  title: 'Kala Ghoda Real TV',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*() { return true; }) },
  abilities: [
    {
      msg: 'look at the top card of the stack',
      'change-in-game-state': {
        req: req(function*(state: State) { return !!((state as any).runner?.deck?.length); }),
      },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const top = (state as any).runner?.deck?.[0];
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: `The top card of the stack is ${(top as any)?.title}`,
            'waiting-prompt': true,
            choices: ['OK'],
          }, card, null)], []);
      }),
    },
    {
      async: true,
      label: 'Trash the top card of the stack',
      msg: msg((state: State) =>
        `trash ${((state as any).runner?.deck?.[0] as any)?.title} from the stack`),
      cost: [corePayment.toC('trash-can', 1)],
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':corp', eid, ':runner', 1)], []);
      }),
    },
  ],
};

// Kuwinda K4H1U3
export const kuwinda: CardDef = {
  title: 'Kuwinda K4H1U3',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':power');
  }),
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*() { return true; }) },
  abilities: [{
    label: 'Trace X - do 1 core damage (start of turn)',
    trace: {
      base: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':power');
      }),
      successful: {
        async: true,
        msg: 'do 1 core damage',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':runner', eid, ':brain', 1, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, card, { causeCard: card })], []);
        }),
      },
      unsuccessful: {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
        }),
        async: true,
        msg: 'place 1 power counter on itself',
      },
    },
  }],
};

// Lady Liberty
export const ladyLiberty: CardDef = {
  title: 'Lady Liberty',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 3)],
    'keep-menu-open': ':while-3-clicks-left',
    label: 'Add agenda from HQ to score area',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const counters = coreCard.getCounters(coreCard.getCard(state, card), ':power');
      return ((state as any).corp?.hand || []).some((c: Card) =>
        coreCard.agenda(c) && (c as any).agendapoints === counters);
    }),
    'waiting-prompt': true,
    prompt: 'Choose an Agenda in HQ to add to score area',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.agenda(targets[0]) &&
          (targets[0] as any).agendapoints === coreCard.getCounters(coreCard.getCard(state, card), ':power') &&
          coreCard.inHand(targets[0]);
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `add ${(targets[0] as any)?.title} to score area`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = coreMoving.move(state, ':corp', targets[0], ':scored', null);
      coreInitializing.cardInit(state, ':corp', c as Card, { resolveEffect: false, initData: true });
      coreAgendas.updateAllAdvancementRequirements(state);
      coreAgendas.updateAllAgendaPoints(state);
      coreWinning.checkWinByAgenda(state, side);
    }),
  }],
  events: [{
    event: ':corp-turn-begins',
    automatic: ':last',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
};

// Lakshmi Smartfabrics
export const lakshmiSmartfabrics: CardDef = {
  title: 'Lakshmi Smartfabrics',
  events: [{
    event: ':rez',
    async: true,
    silent: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const power = coreCard.getCounters(card, ':power');
      return ((state as any).corp?.hand || []).some((c: Card) =>
        coreCard.agenda(c) && power >= (c as any).agendapoints);
    }),
    label: 'Reveal an agenda worth X points from HQ',
    async: true,
    cost: [corePayment.toC('x-power', 1)],
    'keep-menu-open': ':while-power-tokens-left',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const paidAmt = corePayment.costValue(eid, ':x-power');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose an agenda in HQ to reveal',
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
              return coreCard.agenda(t[0]) && (t[0] as any).agendapoints <= paidAmt;
            }),
          },
          msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
            `reveal ${(t[0] as any)?.title} from HQ`),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreRevealing.reveal(s, sd, t[0])], []);
            const title = (t[0] as any)?.title;
            coreFlags.registerTurnFlag(s, sd, c, ':can-steal', (ss: State, _: Side, fc: Card) => {
              if ((fc as any)?.title === title) {
                coreToasts.toast(ss, ':runner', 'Cannot steal due to Lakshmi Smartfabrics.', 'warning');
                return false;
              }
              return true;
            });
            coreEid.effectCompleted(s, sd, e);
          }),
        }, card, null)], []);
    }),
  }],
};

// Launch Campaign
export const launchCampaign: CardDef = {
  title: 'Launch Campaign',
  ...campaign(6, 2),
};

// Levy University
export const levyUniversity: CardDef = {
  title: 'Levy University',
  abilities: [{
    action: true,
    prompt: 'Choose a piece of ice',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `adds ${(targets[0] as any)?.title} to HQ`),
    choices: req(function*(state: State) {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) => coreCard.ice(c)),
        { sorted: true });
    }),
    label: 'Search R&D for a piece of ice',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('credit', 1), corePayment.toC('click', 1)], action: true },
    'keep-menu-open': ':while-clicks-left',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreMoving.move(state, side, targets[0], ':hand', null);
      coreShuffling.shuffle(state, ':deck');
    }),
  }],
};

// Lily Lockwell
export const lilyLockwell: CardDef = {
  title: 'Lily Lockwell',
  'on-rez': coreDefHelpers.drawAbi(3),
  abilities: [{
    action: true,
    label: 'Search R&D for an operation',
    prompt: 'Choose an operation to add to the top of R&D',
    'waiting-prompt': true,
    cost: [corePayment.toC('click', 1), corePayment.toC('tag', 1)],
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return t === 'No action' ? 'shuffle R&D'
        : `reveal ${(t as any)?.title} from R&D and add it to the top of R&D`;
    }),
    choices: req(function*(state: State) {
      const ops = ((state as any).corp?.deck || []).filter((c: Card) => coreCard.operation(c))
        .sort((a: Card, b: Card) => ((a as any).title || '').localeCompare((b as any).title || ''));
      return [...ops, 'No action'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'No action') {
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, targets[0])], []);
        coreShuffling.shuffle(state, ':corp', ':deck');
        coreMoving.move(state, ':corp', targets[0], ':deck', { front: true });
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Long-Term Investment
export const longTermInvestment: CardDef = {
  title: 'Long-Term Investment',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  abilities: [{
    action: true,
    label: 'Move any number of hosted credits to your credit pool',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':credit') >= 8;
    }),
    cost: [corePayment.toC('click', 1)],
    prompt: 'How many hosted credits do you want to take?',
    choices: { counter: ':credit' },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `gain ${targets[0]} [Credits]`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreSay.playSfx(state, ':corp', 'click-credit-3');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, targets[0])], []);
    }),
  }],
  events: [{
    event: ':corp-turn-begins',
    msg: 'place 2 [Credit] on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':credit', 2, null)], []);
    }),
  }],
};

// Lt. Todachine
export const ltTodachine: CardDef = {
  title: 'Lt. Todachine',
  events: [{
    event: ':rez',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.ice(((targets as any)[0] || {}).card);
    }),
    async: true,
    msg: 'give the Runner 1 tag',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, ':runner', eid, 1)], []);
    }),
  }],
};

// Lt. Todachine 2
export const ltTodachine2: CardDef = {
  title: 'Lt. Todachine 2',
  events: [
    {
      event: ':rez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(((targets as any)[0] || {}).card);
      }),
      async: true,
      msg: 'give the Runner 1 tag',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1)], []);
      }),
    },
    {
      event: ':breach-server',
      interactive: req(function*() { return true; }),
      req: req(function*(state: State) { return coreFlags.tagged(state); }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = (targets as any)[0] || {};
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            req: req(function*(s: State) {
              const numAccess = coreAccess.numCardsToAccess(s, ':runner', ctx.server, null);
              return coreFlags.tagged(s) &&
                (numAccess?.randomAccessLimit || 0) > 1 &&
                !coreAccess.getOnlyCardToAccess(s);
            }),
            msg: 'make the runner access 1 card fewer',
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card) {
              coreAccess.accessBonus(s, ':runner', ctx.server, -1);
            }),
          }, card, targets)], []);
      }),
    },
  ],
};

// Luana Campos
export const luanaCampos: CardDef = {
  title: 'Luana Campos',
  uninstall: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const ctx = (targets as any)[0] || {};
    const oldCard = ctx.oldCard;
    if (coreCard.rezzed(oldCard) && coreCard.getCounters(oldCard, ':bad-publicity') > 0) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          msg: msg((s: State) => `take ${coreCard.getCounters(oldCard, ':bad-publicity')} bad publicity`),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreBadPublicity.gainBadPublicity(s, sd, e, coreCard.getCounters(oldCard, ':bad-publicity'))], []);
          }),
        }, card, targets)], []);
    }
  }),
  events: [{
    event: ':corp-turn-begins',
    interactive: req(function*() { return true; }),
    'change-in-game-state': {
      req: req(function*(state: State) { return coreFlags.countBadPub(state) > 0; }),
      silent: true,
    },
    optional: {
      interactive: req(function*() { return true; }),
      prompt: 'Host a bad publicity counter to gain 3 [Credits] and draw a card?',
      'yes-ability': {
        msg: 'gain 3 [Credits] and draw 1 card',
        cost: [corePayment.toC('host-bad-pub', 1)],
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, side, eid, 3, { suppressCheckpoint: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDrawing.draw(state, side, eid, 1)], []);
        }),
      },
    },
  }],
};

// Magistrate Revontulet
export const magistrateRevontulet: CardDef = {
  title: 'Magistrate Revontulet',
  'static-abilities': [{
    type: ':steal-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.agenda(targets[0]);
    }),
    value: req(function*() { return [corePayment.toC('credit', 3)]; }),
  }],
  events: [{
    event: ':agenda-scored',
    async: true,
    interactive: req(function*() { return true; }),
    msg: 'force the Runner to lose 3 [Credits]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 3)], []);
    }),
  }],
};

// Malia Z0L0K4
export const maliaZ0L0K4: CardDef = (() => {
  const unmark = req(function*(state: State, side: Side, eid: EID, card: Card) {
    const currentCard = coreCard.getCard(state, card) || card;
    coreUpdate.update(state, side, {
      ...currentCard,
      special: { ...(currentCard as any).special, maliaTarget: null },
    });
    coreEffects.updateDisabledCards(state);
    yield wait_for(state, [{ asyncResult: 'result' },
      coreEngine.triggerEventSync(state, null, eid, ':disabled-cards-updated')], []);
  });
  return {
    title: 'Malia Z0L0K4',
    'on-rez': {
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `blank the text box of ${coreToString.cardStr(state, targets[0])}`),
      choices: {
        card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) && coreCard.resource(c) &&
          !coreCard.hasSubtype(c, 'Virtual'),
      },
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const currentCard = coreCard.getCard(state, card) || card;
        coreUpdate.update(state, side, {
          ...currentCard,
          special: { ...(currentCard as any).special, maliaTarget: targets[0] },
        });
        coreEffects.updateDisabledCards(state);
      }),
    },
    'leave-play': unmark,
    'move-zone': unmark,
    'static-abilities': [
      {
        type: ':icon',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const maliaTarget = (coreCard.getCard(state, card) || card as any)?.special?.maliaTarget;
          return coreCard.sameCard(targets[0], maliaTarget) ||
            (coreCard.sameCard((targets[0] as any)?.host, maliaTarget) &&
              (maliaTarget as any)?.title === 'DJ Fenris' &&
              (targets[0] as any)?.type === 'Fake-Identity');
        }),
        value: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return coreDefHelpers.makeIcon('MZ', card);
        }),
      },
      {
        type: ':disable-card',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const maliaTarget = (coreCard.getCard(state, card) || card as any)?.special?.maliaTarget;
          return coreCard.sameCard(targets[0], maliaTarget) ||
            (coreCard.sameCard((targets[0] as any)?.host, maliaTarget) &&
              (maliaTarget as any)?.title === 'DJ Fenris' &&
              (targets[0] as any)?.type === 'Fake-Identity');
        }),
        value: true,
      },
    ],
  };
})();

// Marilyn Campaign
export const marilynCampaign: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':credit') <= 2;
    }),
    req: req(function*(state: State) { return !!(state as any).corpPhase12; }),
    label: 'Gain 2 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(2, coreCard.getCounters(card, ':credit'))} [Credits]`),
    async: true,
    automatic: ':gain-credits',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, card, ':credit', 2)], []);
      if (!(coreCard.getCounters(coreCard.getCard(state, card), ':credit') > 0)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', eid, card, { unpreventable: true, causeCard: card })], []);
      } else {
        coreEid.effectCompleted(state, ':corp', eid);
      }
    }),
  };
  return {
    title: 'Marilyn Campaign',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    data: { counter: { credit: 8 } },
    prevention: [{
      prevents: ':trash',
      type: ':event',
      label: 'Shuffle Marilyn Campaign into R&D',
      'max-uses': 1,
      ability: {
        msg: 'shuffle itself into R&D instead of moving it to Archives',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return ((state as any).prevent?.trash?.remaining || []).some((c: any) =>
            coreCard.sameCard(c.card, card));
        }),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          const remaining = (state as any).prevent?.trash?.remaining || [];
          (state as any).prevent.trash.remaining = remaining.map((c: any) =>
            coreCard.sameCard(c.card, card)
              ? { ...c, destination: ':deck', shuffleRd: true }
              : c);
        }),
      },
    }],
  };
})();

// Mark Yale
export const markYale: CardDef = {
  title: 'Mark Yale',
  events: [{
    event: ':agenda-counter-spent',
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 1)], []);
    }),
  }],
  abilities: [
    {
      label: 'Gain 2 [Credits]',
      msg: 'gain 2 [Credits]',
      cost: [corePayment.toC('trash-can', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 2)], []);
      }),
    },
    {
      label: 'Gain 2 [Credits]',
      msg: 'gain 2 [Credits]',
      cost: [corePayment.toC('any-agenda-counter', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 2)], []);
      }),
    },
  ],
};

// Marked Accounts
export const markedAccounts: CardDef = (() => {
  const ability = takeNCreditsStartOfTurn(1);
  return {
    title: 'Marked Accounts',
    abilities: [
      ability,
      {
        action: true,
        cost: [corePayment.toC('click', 1)],
        msg: 'store 3 [Credits]',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, eid, card, ':credit', 3, null)], []);
        }),
      },
    ],
    events: [{ ...ability, event: ':corp-turn-begins' }],
  };
})();

// MCA Austerity Policy
export const mcaAusterityPolicy: CardDef = {
  title: 'MCA Austerity Policy',
  abilities: [
    {
      action: true,
      cost: [corePayment.toC('click', 1)],
      once: ':per-turn',
      msg: 'force the Runner to lose a [Click] next turn and place a power counter on itself',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEngine.registerEvents(state, side, card, [{
          event: ':runner-turn-begins',
          'unregister-once-resolved': true,
          duration: ':until-runner-turn-begins',
          effect: effect(function*(s: State, sd: Side) {
            coreGaining.loseClicks(s, ':runner', 1);
          }),
        }]);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
      }),
    },
    {
      action: true,
      cost: [corePayment.toC('click', 1), corePayment.toC('power', 3), corePayment.toC('trash-can', 1)],
      msg: 'gain 4 [Click]',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreGaining.gainClicks(state, side, 4);
      }),
    },
  ],
};

// Melange Mining Corp.
export const melangeMiningCorp: CardDef = {
  title: 'Melange Mining Corp.',
  abilities: [{
    ...coreDefHelpers.gainCreditsAbility(7),
    action: true,
    cost: [corePayment.toC('click', 3)],
    'keep-menu-open': ':while-3-clicks-left',
  }],
};

// Mental Health Clinic
export const mentalHealthClinic: CardDef = {
  title: 'Mental Health Clinic',
  ...credsOnRoundStart(1),
  'static-abilities': [coreHandSize.runnerHandSizePlus(1)],
};

// Moon Pool
export const moonPool: CardDef = (() => {
  const moonPoolPlaceAdvancements = (x: number): any => ({
    async: true,
    prompt: msg((state: State) => `Choose an installed card to place advancement counters on (${x} remaining)`),
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: {
      public: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(s, t[0])}`),
      corp: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(s, t[0], { maybeVisible: true })}`),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, targets[0], ':advance-counter', 1, { placed: true })], []);
      if (x > 1) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, moonPoolPlaceAdvancements(x - 1), card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
    cancel: { msg: 'decline to place advancement counters' },
  });
  const moonPoolRevealAbility: any = {
    prompt: 'Choose up to 2 facedown cards from Archives to shuffle into R&D',
    async: true,
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) && !coreCard.faceup(c),
      max: 2,
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${utils.enumerateCards(targets, { sorted: true })} from Archives and shuffle ${targets.length === 1 ? 'it' : 'them'} into R&D`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, targets)], []);
      for (const c of targets) {
        coreMoving.move(state, side, c, ':deck', null);
      }
      coreShuffling.shuffle(state, side, ':deck');
      const agendaCount = targets.filter((c: Card) => coreCard.agenda(c)).length;
      if (agendaCount > 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, moonPoolPlaceAdvancements(agendaCount), card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
    cancel: coreShuffling.shuffleMyDeck,
  };
  const moonPoolDiscardAbility: any = {
    prompt: 'Choose up to 2 cards from HQ to trash',
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c), max: 2 },
    async: true,
    msg: {
      public: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `trash ${utils.quantify(t.length, 'card')} from HQ`),
      corp: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `trash facedown ${utils.enumerateCards(t)} from HQ`),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trashCards(state, ':corp', eid, targets, { causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, moonPoolRevealAbility, card, null)], []);
    }),
    cancel: {
      msg: 'decline to trash any cards from HQ',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, moonPoolRevealAbility, card, null)], []);
      }),
    },
  };
  return {
    title: 'Moon Pool',
    abilities: [{
      label: 'Trash up to 2 cards from HQ. Shuffle up to 2 cards from Archives into R&D',
      cost: [corePayment.toC('remove-from-game', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, moonPoolDiscardAbility, card, null)], []);
      }),
    }],
  };
})();

export const mrStone: CardDef = {
  title: 'Mr. Stone',
  events: [{
    event: ':runner-gain-tag',
    async: true,
    msg: 'do 1 meat damage',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, ':corp', eid, ':meat', 1, { card })], []);
    }),
  }],
};

export const mumbaTemple: CardDef = {
  title: 'Mumba Temple',
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return (eid as any).sourceType === ':rez';
      }),
      type: ':recurring',
    },
  },
};

export const mumbadCityHall: CardDef = {
  title: 'Mumbad City Hall',
  abilities: [{
    action: true,
    label: 'Search R&D for an Alliance card',
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    prompt: 'Choose an Alliance card to play or install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return corePrompts.cancellable(
        (state as any).corp.deck.filter((c: Card) =>
          coreCard.hasSubtype(c, 'Alliance') &&
          (coreCard.operation(c) ? (state as any).corp.credit >= (c as any).cost : true)),
        { sorted: true });
    }),
    cancel: { ...(coreShuffling as any).shuffleMyDeck, action: true, cost: [corePayment.toC('click', 1)] },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const t = targets[0];
      return `reveal ${(t as any).title} from R&D and ${coreCard.operation(t) ? 'play' : 'install'} it`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, target)], []);
      coreShuffling.shuffle(state, side, ':deck');
      if (coreCard.operation(target)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreActions.playInstant(state, side, eid, target, null)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreInstalling.corpInstall(state, side, eid, target, null, {
            msgKeys: { installSource: card, known: true, displayOrigin: true },
          })], []);
      }
    }),
  }],
};

export const mumbadConstructionCo: CardDef = {
  title: 'Mumbad Construction Co.',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [{
    event: ':corp-turn-begins',
    silent: true,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter', 1, { placed: true })], []);
    }),
  }],
  abilities: [{
    cost: [corePayment.toC('credit', 2)],
    'keep-menu-open': ':while-advancement-tokens-left',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement') > 0 &&
        coreFinding.allActiveInstalled(state, ':corp').length > 0;
    }),
    label: 'Move an advancement counter to a faceup card',
    prompt: 'Choose a faceup card',
    choices: { card: (c: Card) => coreCard.faceup(c) },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `move an advancement counter to ${coreToString.cardStr(state, targets[0])}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, card, ':advance-counter', -1, { placed: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, target, ':advance-counter', 1, { placed: true })], []);
    }),
  }],
};

export const museumOfHistory: CardDef = {
  title: 'Museum of History',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (state as any).corp.discard.length > 0;
    }),
  },
  abilities: [{
    label: 'Shuffle cards in Archives into R&D',
    prompt: msg((state: State, side: Side, eid: EID, card: Card) => {
      const rezzedCount = coreFinding.allInstalled(state, ':corp').filter((c: Card) =>
        (c as any).title === (card as any).title && coreCard.rezzed(c)).length;
      return `Choose ${utils.quantify(rezzedCount, 'card')} in Archives to shuffle into R&D`;
    }),
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c),
      max: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreFinding.allInstalled(state, ':corp').filter((c: Card) =>
          (c as any).title === (card as any).title && coreCard.rezzed(c)).length;
      }),
    },
    'show-discard': true,
    once: ':per-turn',
    'once-key': ':museum-of-history',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const seen = targets.filter((c: Card) => (c as any).seen);
      const n = targets.filter((c: Card) => !(c as any).seen).length;
      return `shuffle ${utils.enumerateCards(seen, { sorted: true })}${n > 0 ? `${seen.length ? ' and ' : ''}${utils.quantify(n, 'card')}` : ''} into R&D`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      for (const c of targets) {
        coreMoving.move(state, ':corp', c, ':deck');
      }
      coreShuffling.shuffle(state, ':corp', ':deck');
    }),
  }],
  implementation: '[Erratum] Should be unique',
};

export const nanoetchingMatrix: CardDef = {
  title: 'Nanoetching Matrix',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    once: ':per-turn',
    msg: 'gain 2 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2)], []);
    }),
  }],
  'on-trash': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return side === ':runner';
      }),
      'waiting-prompt': true,
      prompt: 'Gain 2 [Credits]?',
      'yes-ability': {
        msg: 'gain 2 [Credits]',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':corp', eid, 2)], []);
        }),
      },
    },
  },
};

export const nasx: CardDef = (() => {
  const ability: any = {
    msg: 'gain 1 [Credits]',
    automatic: ':gain-credits',
    label: 'Gain 1 [Credits] (start of turn)',
    once: ':per-turn',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 1)], []);
    }),
  };
  return {
    title: 'NASX',
    implementation: 'Manual - click NASX to place power counters on itself',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [
      ability,
      {
        label: 'Place 1 power counter',
        cost: [corePayment.toC('credit', 1)],
        msg: 'place 1 power counter on itself',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
        }),
      },
      {
        label: 'Place 2 power counters',
        cost: [corePayment.toC('credit', 2)],
        msg: 'place 2 power counters on itself',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, eid, card, ':power', 2, null)], []);
        }),
      },
      {
        action: true,
        label: 'Gain 2 [Credits] for each hosted power counter',
        cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
        msg: msg((state: State, side: Side, eid: EID, card: Card) =>
          `gain ${2 * coreCard.getCounters(card, ':power')} [Credits]`),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, side, eid, 2 * coreCard.getCounters(card, ':power'))], []);
        }),
      },
    ],
  };
})();

export const netAnalytics: CardDef = (() => {
  const ability: any = {
    optional: {
      autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
      'waiting-prompt': true,
      player: ':corp',
      prompt: 'Draw 1 card?',
      'yes-ability': coreDefHelpers.drawAbi(1),
    },
  };
  return {
    title: 'Net Analytics',
    events: [
      {
        ...ability,
        event: ':runner-lose-tag',
        optional: {
          ...ability.optional,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return (targets[0] as any)?.context?.side === ':runner';
          }),
        },
      },
      {
        ...ability,
        event: ':runner-prevent',
        optional: {
          ...ability.optional,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return (targets[0] as any)?.context?.type === ':tag';
          }),
        },
      },
    ],
    abilities: [coreDefHelpers.setAutoresolve(':auto-fire', 'Net Analytics')],
  };
})();

export const netPolice: CardDef = {
  title: 'Net Police',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreLink.getLink(state);
  }),
  recurring: coreDefHelpers.getXFn(),
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return (eid as any).sourceType === ':trace';
      }),
      type: ':recurring',
    },
  },
};

export const neurostasis: CardDef = { title: 'Neurostasis', ...advanceAmbush(
  3,
  {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    async: true,
    prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
      `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'installed card')} to shuffle into the stack`),
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.runner(c),
      max: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `shuffle ${utils.enumerateCards(targets)} into the stack`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      for (const c of targets) {
        coreMoving.move(state, ':runner', c, ':deck', { shuffled: true });
      }
      coreShuffling.shuffle(state, ':runner', ':deck');
      coreEid.effectCompleted(state, side, eid);
    }),
  },
) };

export const newsTeam: CardDef = {
  title: 'News Team',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `force the Runner to ${utils.decapitalize(targets[0])}`),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Take 2 tags', 'Add News Team to score area'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Take 2 tags') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 2)], []);
      } else {
        coreMoving.asAgenda(state, ':runner', card, -1);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

export const ngoFront: CardDef = (() => {
  function builder(cost: number, cred: number): any {
    return {
      cost: [corePayment.toC('advancement', cost), corePayment.toC('trash-can', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, cred)], []);
      }),
      label: `Gain ${cred} [Credits]`,
      msg: `gain ${cred} [Credits]`,
    };
  }
  return {
    title: 'NGO Front',
    advanceable: ':always',
    abilities: [builder(1, 5), builder(2, 8)],
  };
})();

export const nicoCampaign: CardDef = (() => {
  const ability: any = {
    async: true,
    interactive: req(function*() { return true; }),
    once: ':per-turn',
    automatic: ':draw-cards',
    label: 'Take 3 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(3, coreCard.getCounters(card, ':credit'))} [Credits]`),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, card, ':credit', 3)], []);
      if (coreCard.getCounters(coreCard.getCard(state, card), ':credit') > 0) {
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', card, { unpreventable: true, causeCard: card })], []);
        coreSay.systemMsg(state, ':corp',
          `trashes Nico Campaign${(state as any).corp.deck.length ? ' and draws 1 card' : ''}`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, ':corp', eid, 1)], []);
      }
    }),
  };
  return {
    title: 'Nico Campaign',
    data: { counter: { credit: 9 } },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    abilities: [ability],
    events: [{ ...ability, event: ':corp-turn-begins' }],
  };
})();

export const nightmareArchive: CardDef = {
  title: 'Nightmare Archive',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      targets[0] === 'Suffer 1 core damage'
        ? 'do 1 core damage'
        : `force the runner to ${utils.decapitalize(targets[0])}`),
    player: ':runner',
    prompt: 'Choose one',
    choices: ['Suffer 1 core damage', 'Add Nightmare Archive to score area'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Suffer 1 core damage') {
        coreMoving.move(state, ':corp', card, ':rfg');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, ':corp', eid, ':brain', 1, { card })], []);
      } else {
        coreMoving.asAgenda(state, ':runner', card, -1);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

export const nihiloAgent: CardDef = {
  title: 'Nihilo Agent',
  data: { counter: { power: 3 } },
  events: [
    coreDefHelpers.trashOnEmpty(':power'),
    {
      event: ':corp-turn-ends',
      msg: 'take 1 bad publicity and give the Runner 1 tag',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.gainBadPublicity(state, ':corp', 1, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, card, ':power', -1, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, side, eid, 1)], []);
      }),
    },
    {
      event: ':corp-turn-begins',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return coreFlags.tagged(state) || coreBadPublicity.countBadPub(state) > 0;
        }),
      },
      msg: 'remove 1 bad publicity and 1 tag',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.loseBadPublicity(state, ':corp', 1, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.loseTags(state, side, eid, 1)], []);
      }),
    },
  ],
};

export const openForum: CardDef = {
  title: 'Open Forum',
  events: [{
    event: ':corp-mandatory-draw',
    interactive: req(function*() { return true; }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) => {
      const top = (state as any).corp.deck[0];
      return top
        ? `reveal ${top.title} from the top of R&D and add it to HQ`
        : 'reveal no cards from R&D (it is empty)';
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const top = (state as any).corp.deck[0];
      if (top) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, top)], []);
        coreMoving.move(state, ':corp', top, ':hand');
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a card in HQ to add to the top of R&D',
          async: true,
          choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
          msg: 'add 1 card from HQ to the top of R&D',
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreMoving.move(state, side, targets[0], ':deck', { front: true });
            coreEid.effectCompleted(state, side, eid);
          }),
        }, card, null)], []);
    }),
  }],
};

export const ottoCampaign: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':credit') <= 2;
    }),
    event: ':corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    label: 'Gain 2 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(2, coreCard.getCounters(card, ':credit'))} [Credits]`),
    async: true,
    automatic: ':gain-credits',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, card, ':credit', 2)], []);
      if (coreCard.getCounters(coreCard.getCard(state, card), ':credit') <= 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            msg: 'trash itself and gain [click][click]',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
              yield wait_for(state, [{ asyncResult: 'result' },
                coreMoving.trash(state, side, card, { sourceCard: card })], []);
              coreActions.gainClicks(state, side, 2);
              coreEid.effectCompleted(state, side, eid);
            }),
          }, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Otto Campaign',
    data: { counter: { credit: 6 } },
    events: [ability],
    'derezzed-events': [coreDefHelpers.corpRezToast],
    abilities: [ability],
  };
})();

export const padCampaign: CardDef = {
  title: 'PAD Campaign',
  ...credsOnRoundStart(1),
};

export const padFactory: CardDef = {
  title: 'PAD Factory',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    label: 'Place 1 advancement counter on a card',
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, ':corp', target, ':advance-counter', 1, { placed: true })], []);
      const tgtcid = (target as any).cid;
      coreFlags.registerTurnFlag(state, side, target, ':can-score', (s: State, _: any, c: Card) => {
        if ((c as any).cid === tgtcid &&
          coreCard.getAdvancementRequirement(c) <= coreCard.getCounters(c, ':advancement')) {
          coreToasts.toast(state, ':corp', 'Cannot score due to PAD Factory.', 'warning');
          return false;
        }
        return true;
      });
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

export const palanaAgroplex: CardDef = (() => {
  const ability: any = {
    msg: 'make each player draw 1 card',
    label: 'Make each player draw 1 card (start of turn)',
    once: ':per-turn',
    automatic: ':draw-cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':corp', 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', eid, 1)], []);
    }),
  };
  return {
    title: 'Pālanā Agroplex',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const personalizedPortal: CardDef = {
  title: 'Personalized Portal',
  special: { 'auto-fire': ':always' },
  abilities: [coreDefHelpers.setAutoresolve(':auto-fire', 'Personalized Portal (gain credits)')],
  events: [{
    event: ':corp-turn-begins',
    interactive: req(function*() { return true; }),
    async: true,
    msg: 'force the runner to draw 1 card',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', 1)], []);
      const credsToGain = Math.floor((state as any).runner.hand.length / 2);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: `Gain ${credsToGain} [Credits]?`,
            autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
            req: req(function*() { return credsToGain > 0; }),
            'waiting-prompt': true,
            'yes-ability': {
              msg: `gain ${credsToGain} [Credits]`,
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(state, side, eid, credsToGain)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  }],
};

export const phatGioanBaotixita: CardDef = (() => {
  const place: any = {
    silent: true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, { placed: true })], []);
    }),
  };
  function opt(x: number): any {
    return {
      option: `Do ${x} net damage`,
      ability: {
        msg: `do ${x} net damage`,
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', eid, ':net', x)], []);
        }),
      },
      ...(x === 1 ? {} : { cost: [corePayment.toC('power', x - 1)] }),
    };
  }
  const abi: any = coreChooseOne.chooseOneHelper({
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (coreEvents.firstEvent(state, ':corp', ':agenda-scored') &&
        coreEvents.noEvent(state, ':runner', ':agenda-stolen')) ||
        (coreEvents.firstEvent(state, ':runner', ':agenda-stolen') &&
        coreEvents.noEvent(state, ':corp', ':agenda-scored'));
    }),
    player: ':corp',
    side: ':corp',
    interactive: req(function*() { return true; }),
  }, [1, 2, 3].map(opt));
  return {
    title: 'Phật Gioan Baotixita',
    events: [
      { ...abi, event: ':agenda-scored' },
      { ...place, event: ':corp-turn-ends' },
      { ...abi, event: ':agenda-stolen' },
    ],
  };
})();

export const planB: CardDef = { title: 'Plan B', ...advanceAmbush(
  0,
  {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    prompt: 'Choose an Agenda in HQ to score',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.agenda(t) &&
          coreCard.getAdvancementRequirement(t) <= coreCard.getCounters(coreCard.getCard(state, card), ':advancement') &&
          coreCard.inHand(t);
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `score ${(targets[0] as any).title}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreAgendas.score(state, side, eid, targets[0], { noReq: true, ignoreTurn: true })], []);
    }),
  },
) };

export const plutus: CardDef = (() => {
  const abi: any = {
    once: ':per-turn',
    label: 'Play a transaction from Archives?',
    prompt: 'Play a transaction from Archives?',
    'show-discard': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return (state as any).corp.discard.some((c: Card) =>
          !(c as any).seen ||
          (coreCard.operation(c) && coreCard.hasSubtype(c, 'Transaction') &&
            coreActions.canPlayInstant(state, side, eid, c, null)));
      }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.operation(t) && coreCard.hasSubtype(t, 'Transaction') &&
          coreActions.canPlayInstant(state, side, eid, t, null);
      }),
    },
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `play ${(targets[0] as any).title} from Archives`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = { ...targets[0], rfgInsteadOfTrashing: true, special: { rfgWhenTrashed: true } };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreActions.playInstant(state, side,
          { ...eid, source: t, sourceType: ':play', sourceInfo: { abilityTargets: [t] } },
          t, null)], []);
    }),
  };
  return {
    title: 'Plutus',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...abi, event: ':corp-turn-begins' }],
    abilities: [abi],
    'additional-cost': [corePayment.toC('forfeit-or-trash-x-from-hand', 3)],
  };
})();

export const politicalDealings: CardDef = (() => {
  function pdhelper(agendas: Card[]): any {
    const agenda = agendas[0];
    if (!agenda) return null;
    return {
      optional: {
        prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
          `Reveal and install ${(agenda as any).title}?`),
        'yes-ability': {
          msg: msg((state: State, side: Side, eid: EID, card: Card) =>
            `reveal they drew ${(agenda as any).title}`),
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRevealing.reveal(state, side, agenda)], []);
            const cardDef = coreCardDefs.cardDef(agenda);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(state, side, agenda, null, {
                installState: (cardDef as any)?.installState || ':unrezzed',
                msgKeys: { installSource: card, known: true, displayOrigin: true },
              })], []);
            coreSetAside.removeFromCurrentlyDrawing(state, side, agenda);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, pdhelper(agendas.slice(1)), card, null)], []);
          }),
        },
        'no-ability': {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, pdhelper(agendas.slice(1)), card, null)], []);
          }),
        },
      },
    };
  }
  return {
    title: 'Political Dealings',
    events: [{
      event: ':corp-draw',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const currentlyDrawing: Card[] = (state as any).corp.currentlyDrawing || [];
        if (currentlyDrawing.some(coreCard.agenda)) {
          const agendas = currentlyDrawing.filter((c: Card) =>
            coreCard.agenda(c) && coreCard.getCard(state, c));
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, pdhelper(agendas), card, null)], []);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, ':corp', {
              prompt: 'You did not draw any agenda',
              choices: ['Carry on!'],
              'prompt-type': ':bogus',
            }, card, null)], []);
        }
      }),
    }],
  };
})();

export const pranaCondenser: CardDef = {
  title: 'Prāna Condenser',
  prevention: [{
    prevents: ':damage',
    type: ':event',
    'max-uses': 1,
    ability: {
      async: true,
      msg: 'prevent 1 net damage, place 1 counter on itself, and gain 3 [Credits]',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = targets[0];
        return ctx.type === ':net' && ctx.sourcePlayer === ':corp' && corePrevention.preventable(ctx);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          corePrevention.preventDamage(state, side, 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, card, ':power', 1, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 3)], []);
      }),
    },
  }],
  abilities: [{
    action: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `deal ${coreCard.getCounters(card, ':power')} net damage`),
    label: 'deal net damage',
    cost: [corePayment.toC('click', 2), corePayment.toC('trash-can', 1)],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', coreCard.getCounters(card, ':power'), { card })], []);
    }),
  }],
};

export const primaryTransmissionDish: CardDef = {
  title: 'Primary Transmission Dish',
  recurring: 3,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return (eid as any).sourceType === ':trace';
      }),
      type: ':recurring',
    },
  },
};

export const privateContracts: CardDef = {
  title: 'Private Contracts',
  data: { counter: { credit: 14 } },
  events: [coreDefHelpers.trashOnEmpty(':credit')],
  abilities: [coreDefHelpers.takeNCreditsAbility(2, 'asset', {
    action: true,
    'keep-menu-open': ':while-clicks-left',
    cost: [corePayment.toC('click', 1)],
  })],
};

export const projectJunebug: CardDef = { title: 'Project Junebug', ...advanceAmbush(
  1,
  {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${2 * coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} net damage`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net',
          2 * coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), { card })], []);
    }),
  },
) };

export const psychicField: CardDef = (() => {
  const ab: any = {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.installed(card);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const hand = (state as any).runner.hand.length;
      const message = `do ${hand} net damage`;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          psi: {
            'not-equal': {
              msg: message,
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, eid, ':net', hand, { card })], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Psychic Field',
    'on-expose': ab,
    'on-access': ab,
  };
})();

export const publicAccessPlaza: CardDef = {
  title: 'Public Access Plaza',
  ...credsOnRoundStart(1),
  'on-trash': {
    ...coreDefHelpers.giveTags(1),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return side === ':runner' && coreThreat.threatLevel(2, state);
    }),
  },
};

export const publicHealthPortal: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    label: 'Reveal the top card of R&D and gain 2 [Credits] (start of turn)',
    interactive: req(function*() { return true; }),
    automatic: ':gain-credits',
    msg: msg((state: State, side: Side, eid: EID, card: Card) => {
      const top = (state as any).corp.deck[0];
      return `reveal ${top?.title} from the top of R&D and gain 2 [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const top = (state as any).corp.deck[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, top)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2)], []);
    }),
  };
  return {
    title: 'Public Health Portal',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const publicSupport: CardDef = {
  title: 'Public Support',
  data: { counter: { power: 3 } },
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [
    {
      event: ':corp-turn-begins',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':power') > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':power', -1, null)], []);
      }),
    },
    {
      event: ':counter-added',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = targets[0];
        return coreCard.sameCard(card, ctx?.card) &&
          coreCard.getCounters(card, ':power') <= 0;
      }),
      msg: "add itself to [their] score area as an agenda worth 1 agenda point",
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreMoving.asAgenda(state, card, 1);
      }),
    },
  ],
};

export const quarantineSystem: CardDef = (() => {
  function rezIce(cnt: number, discount: number): any {
    return {
      prompt: `Choose a piece of ice to rez, paying ${discount} [Credits] less`,
      async: true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const t = targets[0];
          return coreCard.ice(t) &&
            coreRezzing.canPayToRez(state, side, { ...eid, source: card }, t, { costBonus: -discount }) &&
            !coreCard.rezzed(t);
        }),
      },
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRezzing.rez(state, side, targets[0], { noWarning: true, costBonus: -discount })], []);
        if (cnt < 3) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, rezIce(cnt + 1, discount), card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  return {
    title: 'Quarantine System',
    abilities: [{
      label: 'Forfeit agenda to rez up to 3 pieces of ice with a 2 [Credit] discount per agenda point',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return (state as any).corp.scored.length > 0;
      }),
      cost: [corePayment.toC('forfeit', 1)],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const lastRfg = (state as any).corp.rfg.slice(-1)[0];
        const discount = 2 * (lastRfg?.agendapoints || 0);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, rezIce(1, discount), card, null)], []);
      }),
    }],
  };
})();

export const ramanRai: CardDef = {
  title: 'Raman Rai',
  events: [{
    event: ':corp-draw',
    optional: {
      prompt: 'Swap two cards?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const currentlyDrawing: Card[] = (state as any).corp.currentlyDrawing || [];
        const discardTypes = new Set((state as any).corp.discard.map((c: Card) => (c as any).type));
        const drawingTypes = new Set(currentlyDrawing.map((c: Card) => (c as any).type));
        const hasIntersection = [...discardTypes].some(t => drawingTypes.has(t));
        return (state as any).corp.click > 0 && hasIntersection && currentlyDrawing.length > 0;
      }),
      'yes-ability': {
        once: ':per-turn',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          coreActions.loseClicks(state, ':corp', 1);
          const currentlyDrawing: Card[] = (state as any).corp.currentlyDrawing || [];
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              prompt: 'Choose a card in HQ that you just drew to swap for a card of the same type in Archives',
              choices: {
                card: (c: Card) => currentlyDrawing.some((d: Card) => coreCard.sameCard(c, d)),
              },
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                const setAsideCard = targets[0];
                const t = (setAsideCard as any).type;
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreEngine.resolveAbility(state, side, {
                    'show-discard': true,
                    prompt: `Choose an ${t} in Archives to reveal and swap into HQ for ${(setAsideCard as any).title}`,
                    choices: {
                      card: (c: Card) => coreCard.corp(c) && (c as any).type === t && coreCard.inDiscard(c),
                    },
                    msg: msg((s: State, sd: Side, e: EID, c: Card, ts: any[]) =>
                      `lose [Click], reveal ${(setAsideCard as any).title} from HQ, and swap it for ${(ts[0] as any).title} from Archives`),
                    async: true,
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                      yield wait_for(state, [{ asyncResult: 'result' },
                        coreRevealing.reveal(state, side, setAsideCard, targets[0])], []);
                      coreSetAside.swapSetAsideCards(state, side, setAsideCard, targets[0]);
                      coreEid.effectCompleted(state, side, eid);
                    }),
                  }, card, null)], []);
              }),
            }, card, null)], []);
        }),
      },
    },
  }],
};

export const rashidaJaheem: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    skippable: true,
    async: true,
    label: 'Gain 3 [Credits] and draw 3 cards (start of turn)',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash this asset to gain 3 [Credits] and draw 3 cards?',
            'yes-ability': {
              async: true,
              msg: 'gain 3 [Credits] and draw 3 cards',
              effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreMoving.trash(state, side, card, { causeCard: card })], []);
                (state as any).stats = (state as any).stats || {};
                (state as any).stats[side] = (state as any).stats[side] || {};
                (state as any).stats[side].rashidaCount = ((state as any).stats[side].rashidaCount || 0) + 1;
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(state, side, 3)], []);
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDrawing.draw(state, side, eid, 3)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Rashida Jaheem',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const realityThreedee: CardDef = (() => {
  const ability: any = {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, coreFlags.tagged(state) ? 2 : 1)], []);
    }),
    async: true,
    label: 'Gain credits (start of turn)',
    automatic: ':gain-credits',
    once: ':per-turn',
    msg: msg((state: State) =>
      coreFlags.tagged(state) ? 'gain 2 [Credits]' : 'gain 1 [Credits]'),
  };
  return {
    title: 'Reality Threedee',
    'on-rez': {
      msg: 'take 1 bad publicity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreBadPublicity.gainBadPublicity(state, ':corp', 1);
      }),
    },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const reaperFunction: CardDef = (() => {
  const ability: any = {
    async: true,
    once: ':per-turn',
    label: 'Trash this asset to do 2 net damage (start of turn)',
    automatic: ':corp-damage',
    interactive: req(function*() { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash Reaper Function to do 2 net damage?',
            'yes-ability': {
              msg: 'do 2 net damage',
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreMoving.trash(state, side, card, { causeCard: card })], []);
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreDamage.damage(state, side, eid, ':net', 2, { card })], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  };
  return {
    title: 'Reaper Function',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*() { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const reconstructionContract: CardDef = {
  title: 'Reconstruction Contract',
  events: [{
    event: ':damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = targets[0];
      return ctx.amount > 0 && ctx.damageType === ':meat';
    }),
    msg: 'place 1 advancement counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':advancement', 1, { placed: true })], []);
    }),
  }],
  abilities: [{
    label: 'Move hosted advancement counters to another card',
    cost: [corePayment.toC('trash-can', 1)],
    async: true,
    prompt: 'How many hosted advancement counters do you want to move?',
    choices: {
      number: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement');
      }),
      default: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(card, ':advancement');
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const numCounters = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose a card that can be advanced',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              return coreProps.canBeAdvanced(state, targets[0]);
            }),
          },
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreSay.systemMsg(state, side,
              `uses ${(card as any).title} to move ${utils.quantify(numCounters, 'hosted advancement counter')} to ${coreToString.cardStr(state, targets[0])}`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreProps.addCounter(state, side, eid, targets[0], ':advancement', numCounters, { placed: true })], []);
          }),
        }, card, null)], []);
    }),
  }],
};

export const refugeCampaign: CardDef = {
  title: 'Refuge Campaign',
  ...credsOnRoundStart(2),
};

export const regolithMiningLicense: CardDef = {
  title: 'Regolith Mining License',
  data: { counter: { credit: 15 } },
  events: [coreDefHelpers.trashOnEmpty(':credit')],
  abilities: [coreDefHelpers.takeNCreditsAbility(3, 'asset', {
    action: true,
    'keep-menu-open': ':while-clicks-left',
    cost: [corePayment.toC('click', 1)],
  })],
};

export const reversedAccounts: CardDef = {
  title: 'Reversed Accounts',
  advanceable: ':always',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    label: 'Force the Runner to lose 4 [Credits] per advancement',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `force the Runner to lose ${Math.min(4 * coreCard.getCounters(card, ':advancement'), (state as any).runner.credit)} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 4 * coreCard.getCounters(card, ':advancement'))], []);
    }),
  }],
};

export const rexCampaign: CardDef = (() => {
  const payoutAb: any = {
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Remove 1 bad publicity', 'Gain 5 [Credits]'],
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      utils.decapitalize(targets[0])),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Remove 1 bad publicity') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.loseBadPublicity(state, side, eid, 1)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 5)], []);
      }
    }),
  };
  const ability: any = {
    once: ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    label: 'Remove 1 counter (start of turn)',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, card, ':power', -1, null)], []);
      if (coreCard.getCounters(coreCard.getCard(state, card), ':power') === 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, card, { causeCard: card })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, payoutAb, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Rex Campaign',
    data: { counter: { power: 3 } },
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    ability: [ability],
  };
})();

export const ronaldFive: CardDef = (() => {
  const ability: any = {
    event: ':runner-trash',
    'once-per-instance': false,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return coreCard.corp(t?.card) && (state as any).runner.click > 0;
    }),
    msg: 'force the runner to lose [Click]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreActions.loseClicks(state, ':runner', 1);
    }),
  };
  return {
    title: 'Ronald Five',
    events: [ability],
    'on-trash': ability,
  };
})();

export const ronin: CardDef = {
  title: 'Ronin',
  advanceable: ':always',
  abilities: [{
    ...coreDefHelpers.doNetDamage(3),
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('trash-can', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement') >= 4;
    }),
  }],
};

export const roughneckRepairSquad: CardDef = {
  title: 'Roughneck Repair Squad',
  abilities: [{
    action: true,
    label: 'Gain 6 [Credits], may remove 1 bad publicity',
    cost: [corePayment.toC('click', 3)],
    'keep-menu-open': ':while-3-clicks-left',
    msg: 'gain 6 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, 6)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            req: req(function*(state: State) {
              return coreBadPublicity.countBadPub(state) > 0;
            }),
            prompt: 'Remove 1 bad publicity?',
            'yes-ability': {
              msg: 'remove 1 bad publicity',
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
                coreBadPublicity.loseBadPublicity(state, side, 1);
              }),
            },
          },
        }, card, null)], []);
    }),
  }],
};

export const sandburg: CardDef = {
  title: 'Sandburg',
  'on-rez': { effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreIce.updateAllIce(state, side);
  }) },
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State) {
      return (state as any).corp.credit >= 10;
    }),
    value: req(function*(state: State) {
      return Math.floor((state as any).corp.credit / 5);
    }),
  }],
  events: [
    {
      event: ':corp-gain',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets[0]?.type === ':credit';
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreIce.updateAllIce(state, side);
      }),
    },
    {
      event: ':corp-lose',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return targets[0]?.type === ':credit';
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreIce.updateAllIce(state, side);
      }),
    },
  ],
  'leave-play': effect(function*(state: State, side: Side, eid: EID, card: Card) {
    coreIce.updateAllIce(state, side);
  }),
};

export const sealedVault: CardDef = {
  title: 'Sealed Vault',
  abilities: [
    {
      label: 'Store any number of credits',
      cost: [corePayment.toC('credit', 1)],
      prompt: 'How many credits do you want to move?',
      choices: {
        number: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return (state as any).corp.credit - 1;
        }),
      },
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `store ${targets[0]} [Credits]`),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const n = targets[0];
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, card, ':credit', n)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, side, eid, n)], []);
      }),
    },
    {
      action: true,
      label: 'Move any number of credits to your credit pool',
      cost: [corePayment.toC('click', 1)],
      prompt: 'How many credits do you want to move?',
      choices: { counter: ':credit' },
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${targets[0]} [Credits]`),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, targets[0])], []);
      }),
    },
    {
      label: 'Move any number of credits to your credit pool',
      prompt: 'How many credits do you want to move?',
      choices: { counter: ':credit' },
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `gain ${targets[0]} [Credits]`),
      cost: [corePayment.toC('trash-can', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, targets[0])], []);
      }),
    },
  ],
};

export const securitySubcontract: CardDef = {
  title: 'Security Subcontract',
  abilities: [{
    ...coreDefHelpers.gainCreditsAbility(4),
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('ice', 1)],
    'keep-menu-open': ':while-clicks-left',
  }],
};

export const sensieActorsUnion: CardDef = {
  title: 'Sensie Actors Union',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: {
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.unprotected(state, card);
    }),
  },
  abilities: [{
    label: 'Draw 3 cards and add 1 card in HQ to the bottom of R&D',
    once: ':per-turn',
    msg: 'draw 3 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a card in HQ to add to the bottom of R&D',
          choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
          msg: 'add 1 card from HQ to the bottom of R&D',
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreMoving.move(state, side, targets[0], ':deck');
          }),
        }, card, null)], []);
    }),
  }],
};

export const serverDiagnostics: CardDef = (() => {
  const ability: any = {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2)], []);
    }),
    async: true,
    once: ':per-turn',
    automatic: ':gain-credits',
    label: 'Gain 2 [Credits] (start of turn)',
    msg: 'gain 2 [Credits]',
  };
  return {
    title: 'Server Diagnostics',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    abilities: [ability],
    events: [
      { ...ability, event: ':corp-turn-begins' },
      {
        event: ':corp-install',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return coreCard.ice(targets[0]?.card);
        }),
        async: true,
        msg: 'trash itself',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, card, { causeCard: card })], []);
        }),
      },
    ],
  };
})();

export const shannonClaire: CardDef = {
  title: 'Shannon Claire',
  abilities: [
    {
      action: true,
      cost: [corePayment.toC('click', 1)],
      'keep-menu-open': ':while-clicks-left',
      msg: 'draw 1 card from the bottom of R&D',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        const deck = (state as any).corp.deck;
        if (deck.length > 0) {
          coreMoving.move(state, ':corp', deck[deck.length - 1], ':hand');
        }
      }),
    },
    {
      label: 'Search R&D for an agenda',
      prompt: 'Choose an agenda to add to the bottom of R&D',
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `reveal ${(targets[0] as any).title} from R&D and add it to the bottom of R&D`),
      choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePrompts.cancellable(
          (state as any).corp.deck.filter(coreCard.agenda), { sorted: true });
      }),
      cost: [corePayment.toC('trash-can', 1)],
      cancel: { ...(coreShuffling as any).shuffleMyDeck, cost: [corePayment.toC('trash-can', 1)] },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, targets[0])], []);
        coreShuffling.shuffle(state, side, ':deck');
        coreMoving.move(state, side, targets[0], ':deck');
        coreEid.effectCompleted(state, side, eid);
      }),
    },
    {
      label: 'Search Archives for an agenda',
      prompt: 'Choose an agenda to add to the bottom of R&D',
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `reveal ${(targets[0] as any).title} from Archives and add it to the bottom of R&D`),
      choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePrompts.cancellable(
          (state as any).corp.discard.filter(coreCard.agenda), { sorted: true });
      }),
      cancel: { msg: 'do nothing', cost: [corePayment.toC('trash-can', 1)] },
      cost: [corePayment.toC('trash-can', 1)],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRevealing.reveal(state, side, targets[0])], []);
        coreMoving.move(state, side, targets[0], ':deck');
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

export const shatteredRemains: CardDef = { title: 'Shattered Remains', ...advanceAmbush(
  1,
  {
    async: true,
    'waiting-prompt': true,
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
      }),
    },
    prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
      `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'piece')} of hardware to trash`),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${utils.enumerateCards(targets)}`),
    choices: {
      max: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      }),
      card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trashCards(state, side, eid, targets, { causeCard: card })], []);
    }),
  },
) };

export const shiKyu: CardDef = {
  title: 'Shi.Kyū',
  poison: true,
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreCard.inDeck(card) &&
          corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 4)]);
      }),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
        `Pay credits to use ${(card as any).title} ability?`),
      'yes-ability': {
        prompt: 'How many credits do you want to pay?',
        choices: ':credit',
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `attempt to do ${targets[0]} net damage`),
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const dmg = targets[0];
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              player: ':runner',
              prompt: 'Choose one',
              'waiting-prompt': true,
              choices: [`Take ${dmg} net damage`, 'Add Shi.Kyū to score area'],
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                if ((targets[0] as string).startsWith('Add')) {
                  coreSay.systemMsg(state, ':runner',
                    `adds ${(card as any).title} to [their] score area as an agenda worth ${utils.quantify(-1, 'agenda point')}`);
                  coreMoving.asAgenda(state, ':runner', card, -1);
                  coreEid.effectCompleted(state, side, eid);
                } else {
                  coreSay.systemMsg(state, ':runner',
                    `takes ${dmg} net damage from ${(card as any).title}`);
                  yield wait_for(state, [{ asyncResult: 'result' },
                    coreDamage.damage(state, ':corp', eid, ':net', dmg, { card })], []);
                }
              }),
            }, card, targets)], []);
        }),
      },
    },
  },
};

export const shock: CardDef = {
  title: 'Shock!',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    msg: 'do 1 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  },
};

export const siu: CardDef = {
  title: 'SIU',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*() { return true; }) },
  abilities: [{
    label: 'Trace 3 - Give the Runner 1 tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).corpPhase12;
    }),
    async: true,
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          trace: {
            base: 3,
            label: 'Trace 3 - Give the Runner 1 tag',
            successful: coreDefHelpers.giveTags(1),
          },
        }, card, null)], []);
    }),
  }],
};

export const snare: CardDef = {
  title: 'Snare!',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return !coreCard.inDiscard(card) &&
          corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 4)]);
      }),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
        `Pay 4 [Credits] to use ${(card as any).title} ability?`),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, side, `declines to use ${(card as any).title}`);
        }),
      },
      'yes-ability': {
        async: true,
        cost: [corePayment.toC('credit', 4)],
        msg: 'give the Runner 1 tag and do 3 net damage',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreTags.gainTags(state, ':corp', 1, { suppressCheckpoint: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', 3, { card })], []);
        }),
      },
    },
  },
};

export const spaceCamp: CardDef = {
  title: 'Space Camp',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    optional: {
      'waiting-prompt': true,
      prompt: 'Place 1 advancement counter on a card that can be advanced?',
      'yes-ability': {
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`),
        prompt: 'Choose a card to place an advancement counter on',
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreProps.canBeAdvanced(state, targets[0]);
          }),
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
        }),
      },
    },
  },
};

export const spinDoctor: CardDef = {
  title: 'Spin Doctor',
  'on-rez': {
    async: true,
    msg: 'draw 2 cards',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, eid, 2)], []);
    }),
  },
  abilities: [{
    label: 'Shuffle up to 2 cards from Archives into R&D',
    cost: [corePayment.toC('remove-from-game', 1)],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.shuffleIntoRdEffect(state, side, eid, card, 2)], []);
    }),
  }],
};

export const storgoticResonator: CardDef = {
  title: 'Storgotic Resonator',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('power', 1)],
    'keep-menu-open': ':while-power-tokens-left',
    label: 'Do 1 net damage',
    msg: 'do 1 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  }],
  events: [{
    event: ':corp-trash',
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const runnerFaction = (state as any).runner.identity?.faction;
      const hasMatch = targets.some((t: any) => t?.card?.faction === runnerFaction);
      return hasMatch && coreEvents.firstEvent(state, side, ':corp-trash',
        (ts: any[]) => ts.some((t: any) => t?.card?.faction === runnerFaction));
    }),
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
};

export const studentLoans: CardDef = {
  title: 'Student Loans',
  'static-abilities': [{
    type: ':play-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return coreCard.event(t) &&
        (state as any).runner.discard.some((c: Card) => (c as any).title === (t as any).title);
    }),
    value: [corePayment.toC('credit', 2)],
  }],
};

export const superdeepBorehole: CardDef = {
  title: 'Superdeep Borehole',
  'on-rez': {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreUpdate.update(state, side, { ...coreCard.getCard(state, card), special: { boreholeValid: true } });
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':bad-publicity', 6, null)], []);
    }),
  },
  events: [
    {
      event: ':corp-turn-begins',
      msg: msg((state: State, side: Side, eid: EID, card: Card) =>
        `take 1 bad publicity from ${(card as any).title}`),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, card, ':bad-publicity', -1, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
      }),
    },
    {
      event: ':counter-added',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = targets[0];
        return coreCard.sameCard(card, ctx?.card) &&
          coreCard.getCounters(coreCard.getCard(state, card), ':bad-publicity') <= 0 &&
          !!(coreCard.getCard(state, card) as any)?.special?.boreholeValid;
      }),
      msg: 'win the game',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreWinning.win(state, ':corp', (card as any).title);
      }),
    },
  ],
};

export const synchrocyclotron: CardDef = {
  title: 'Synchrocyclotron',
  'static-abilities': [{
    type: ':play-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return coreCard.corp(t) &&
        coreEvents.noEvent(state, side, ':play-operation',
          (ts: any[]) => coreCard.hasSubtype(ts[0]?.card, 'Double')) &&
        coreCard.hasSubtype(t, 'Double');
    }),
    value: [corePayment.toC('click', -1)],
  }],
};

export const sundew: CardDef = {
  title: 'Sundew',
  events: [
    {
      event: ':runner-spent-click',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreEvents.firstEvent(state, side, ':runner-spent-click');
      }),
      msg: 'gain 2 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreUpdate.update(state, side,
          { ...coreCard.getCard(state, card), special: { spentClick: true } });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, 2)], []);
      }),
    },
    {
      event: ':run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreEvents.firstEvent(state, side, ':runner-spent-click') &&
          !!(state as any).run &&
          coreRuns.thisServer(state, card) &&
          !!(coreCard.getCard(state, card) as any)?.special?.spentClick;
      }),
      msg: 'lose 2 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        coreUpdate.update(state, side,
          { ...coreCard.getCard(state, card), special: { ...((coreCard.getCard(state, card) as any)?.special), spentClick: undefined } });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':corp', eid, 2)], []);
      }),
    },
  ],
};

export const svyatogorExcavator: CardDef = (() => {
  const ability: any = {
    async: true,
    label: 'trash a card to gain 3 [Credits]',
    once: ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreFinding.allInstalled(state, ':corp').length >= 2;
    }),
    choices: {
      'not-self': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const t = targets[0];
        return coreCard.corp(t) && coreCard.installed(t);
      }),
    },
    msg: {
      public: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${coreToString.cardStr(state, targets[0])} and gain 3 [Credits]`),
      corp: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${coreToString.cardStr(state, targets[0], { maybeVisible: true })} and gain 3 [Credits]`),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, targets[0], { unpreventable: true, causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  };
  return {
    title: 'Svyatogor Excavator',
    flags: {
      'corp-phase-12': req(function*(state: State) {
        return coreFinding.allInstalled(state, ':corp').length >= 2;
      }),
    },
    events: [{ ...ability, event: ':corp-turn-begins', interactive: req(function*() { return true; }) }],
    abilities: [ability],
  };
})();

export const synthDnaModification: CardDef = {
  title: 'Synth DNA Modification',
  events: [{
    event: ':subroutines-broken',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = targets[0];
      return coreCard.hasSubtype(ctx?.ice, 'AP') &&
        coreEvents.firstEvent(state, side, ':subroutines-broken',
          (ts: any[]) => coreCard.hasSubtype(ts[0]?.ice, 'AP'));
    }),
    msg: 'do 1 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  }],
};

export const teamSponsorship: CardDef = {
  title: 'Team Sponsorship',
  events: [{
    event: ':agenda-scored',
    prompt: 'Choose a card from Archives or HQ to install',
    'show-discard': true,
    interactive: req(function*() { return true; }),
    async: true,
    choices: {
      card: (c: Card) =>
        !coreCard.operation(c) && coreCard.corp(c) &&
        (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          ignoreInstallCost: true,
          msgKeys: { installSource: card, displayOrigin: true },
        })], []);
    }),
  }],
};

export const techStartup: CardDef = {
  title: 'Tech Startup',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*() { return true; }) },
  abilities: [{
    label: 'Search R&D for an asset to install',
    prompt: 'Choose an asset',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any).title} from R&D and install it`),
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (state as any).corp.deck.some(coreCard.asset);
    }),
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (state as any).corp.deck.filter(coreCard.asset);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, card, { causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, targets[0])], []);
      coreShuffling.shuffle(state, side, ':deck');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          msgKeys: { installSource: card, known: true, displayOrigin: true },
        })], []);
    }),
  }],
};

export const technoCo: CardDef = (() => {
  function isTechnoTarget(c: Card): boolean {
    return coreCard.program(c) || coreCard.hardware(c) ||
      (coreCard.resource(c) && coreCard.hasSubtype(c, 'Virtual'));
  }
  return {
    title: 'TechnoCo',
    special: { 'auto-fire': ':always' },
    abilities: [coreDefHelpers.setAutoresolve(':auto-fire', 'TechnoCo')],
    'static-abilities': [{
      type: ':install-cost',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return isTechnoTarget(targets[0]) && !(targets[1] as any)?.facedown;
      }),
      value: 1,
    }],
    events: [{
      event: ':runner-install',
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const ctx = targets[0];
          return isTechnoTarget(ctx?.card) && !ctx?.facedown;
        }),
        prompt: 'Gain 1 [Credit]?',
        'waiting-prompt': true,
        autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
        'yes-ability': {
          msg: 'gain 1 [Credits]',
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreGaining.gainCredits(state, ':corp', eid, 1)], []);
          }),
        },
      },
    }],
  };
})();

export const tenmaLine: CardDef = {
  title: 'Tenma Line',
  abilities: [{
    action: true,
    label: 'Swap 2 installed pieces of ice',
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    prompt: 'Choose 2 pieces of ice to swap positions',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreFinding.allInstalled(state, ':corp').filter(coreCard.ice).length >= 2;
    }),
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.ice(c),
      max: 2,
      all: true,
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `swap the positions of ${coreToString.cardStr(state, targets[0])} and ${coreToString.cardStr(state, targets[1])}`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreInstalling.swapInstalled(state, side, targets[0], targets[1]);
    }),
  }],
};

export const testGround: CardDef = {
  title: 'Test Ground',
  advanceable: ':always',
  abilities: [{
    label: 'Derez 1 card for each advancement counter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.getCounters(card, ':advancement') > 0;
    }),
    cost: [corePayment.toC('trash-can', 1)],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const cardsToDerez = Math.min(
        coreFinding.allInstalled(state, ':corp')
          .filter((c: Card) => coreCard.rezzed(c) && !coreCard.agenda(c)).length,
        coreCard.getCounters(card, ':advancement'));
      const paymentEid = eid;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: `derez ${cardsToDerez} cards`,
          'waiting-prompt': true,
          choices: {
            card: (c: Card) => coreCard.installed(c) && coreCard.rezzed(c) && !coreCard.agenda(c),
            max: cardsToDerez,
            all: true,
          },
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRezzing.derez(state, side, eid, targets,
                { msgKeys: { includeCostFromEid: paymentEid } })], []);
          }),
        }, card, null)], []);
    }),
  }],
};

export const theBoard: CardDef = {
  title: 'The Board',
  'on-trash': executiveTrashEffect,
  'static-abilities': [{
    type: ':agenda-value',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0]?.scoredSide === ':runner';
    }),
    value: -1,
  }],
};

export const theNewsNowHour: CardDef = {
  title: 'The News Now Hour',
  events: [{
    event: ':runner-turn-begins',
    silent: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreActions.preventCurrent(state, side);
    }),
  }],
  'on-rez': {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreActions.preventCurrent(state, side);
    }),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card) {
    (state as any).runner.register.cannotPlayCurrent = false;
  }),
};

export const thePowersThatBe: CardDef = {
  title: 'The Powers That Be',
  events: [{
    event: ':agenda-scored',
    prompt: 'Choose a card from Archives or HQ to install, ignoring all costs',
    'show-discard': true,
    interactive: req(function*() { return true; }),
    async: true,
    choices: {
      card: (c: Card) =>
        coreCard.corpInstallableType(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          ignoreInstallCost: true,
          msgKeys: { installSource: card, displayOrigin: true },
        })], []);
    }),
  }],
};

export const theRoot: CardDef = {
  title: 'The Root',
  recurring: 3,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const t = (eid as any).sourceType;
        return t === ':advance' || t === ':corp-install' || t === ':rez' ||
          coreActions.isBasicAdvanceAction(eid);
      }),
      type: ':recurring',
    },
  },
};

export const thomasHaas: CardDef = {
  title: 'Thomas Haas',
  advanceable: ':always',
  abilities: [{
    label: 'Gain credits',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${2 * coreCard.getCounters(card, ':advancement')} [Credits]`),
    cost: [corePayment.toC('trash-can', 1)],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2 * coreCard.getCounters(card, ':advancement'))], []);
    }),
  }],
};

export const tieredSubscription: CardDef = {
  title: 'Tiered Subscription',
  events: [{
    event: ':run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreEvents.firstEvent(state, side, ':run');
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, 1)], []);
    }),
  }],
};

export const toshiyukiSakai: CardDef = { title: 'Toshiyuki Sakai', ...advanceAmbush(
  0,
  {
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose an asset or agenda in HQ',
    choices: {
      card: (c: Card) =>
        (coreCard.agenda(c) || coreCard.asset(c)) && coreCard.inHand(c),
    },
    msg: 'swap itself for an asset or agenda from HQ',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const counters = coreCard.getCounters(card, ':advancement');
      const [movedCard, movedTarget] = coreInstalling.swapCards(state, side, card, targets[0]);
      coreProps.setProp(state, side, movedTarget, ':advance-counter', counters);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', {
          optional: {
            prompt: 'Access the newly installed card?',
            'yes-ability': {
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreAccess.accessCard(state, side, eid, coreCard.getCard(state, movedTarget))], []);
              }),
            },
          },
        }, movedCard, null)], []);
    }),
  },
) };

export const triesteModelBioroids: CardDef = {
  title: 'Trieste Model Bioroids',
  'on-rez': {
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `prevent ${coreToString.cardStr(state, targets[0])} from being broken by runner card abilities`),
    choices: {
      card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && coreCard.hasSubtype(c, 'Bioroid'),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreUpdate.update(state, side, {
        ...coreCard.getCard(state, card),
        special: { triesteTarget: targets[0] },
      });
    }),
  },
  'static-abilities': [
    {
      type: ':icon',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(targets[0], (card as any).special?.triesteTarget);
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreDefHelpers.makeIcon('TMB', card);
      }),
    },
    {
      type: ':prevent-paid-ability',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const [breakCard, breakAbility] = targets;
        return coreCard.sameCard((state as any).currentIce, (card as any).special?.triesteTarget) &&
          coreCard.runner(breakCard) &&
          (!coreCard.identity(breakCard) || coreCard.fakeIdentity(breakCard)) &&
          (breakAbility?.break !== undefined || breakAbility?.breaks !== undefined ||
            breakAbility?.heapBreakerBreak !== undefined || breakAbility?.breakCost !== undefined);
      }),
      value: true,
    },
  ],
};

export const trojan: CardDef = {
  title: 'Trojan',
  flags: { 'rd-reveal': req(function*() { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !coreCard.inDiscard(card);
    }),
    msg: 'lose 2 [Credits], destroy itself, and trash 1 card from HQ at random',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':corp', 2)], []);
      coreMoving.move(state, side, card, ':destroyed');
      const hand = (state as any).corp.hand;
      const trashTarget = hand.length > 0
        ? hand[Math.floor(Math.random() * hand.length)]
        : null;
      if (trashTarget) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', eid, trashTarget, { causeCard: card })], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

export const turtlebacks: CardDef = {
  title: 'Turtlebacks',
  events: [{
    event: ':server-created',
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 1)], []);
    }),
  }],
};

export const ubiquitousVig: CardDef = (() => {
  const ability: any = {
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${coreCard.getCounters(card, ':advancement')} [Credits]`),
    label: 'Gain 1 [Credits] for each advancement counter (start of turn)',
    automatic: ':corp-gain-credits',
    once: ':per-turn',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, coreCard.getCounters(card, ':advancement'))], []);
    }),
  };
  return {
    title: 'Ubiquitous Vig',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    advanceable: ':always',
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const urbanRenewal: CardDef = {
  title: 'Urban Renewal',
  data: { counter: { power: 3 } },
  'derezzed-events': [coreDefHelpers.corpRezToast],
  events: [{
    event: ':corp-turn-begins',
    automatic: ':corp-damage',
    async: true,
    interactive: req(function*() { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, card, ':power', -1, null)], []);
      if (coreCard.getCounters(coreCard.getCard(state, card), ':power') <= 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, card, { causeCard: card })], []);
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to do 4 meat damage`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':meat', 4, { card })], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

export const urticaCipher: CardDef = { title: 'Urtica Cipher', ...advanceAmbush(
  0,
  {
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${2 + coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} net damage`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net',
          2 + coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), { card })], []);
    }),
  },
) };

export const vaporframeFabricator: CardDef = {
  title: 'Vaporframe Fabricator',
  'on-trash': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return side === ':runner';
    }),
    async: true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) && !coreCard.operation(c),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardToInstall = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
            const zone = coreCard.getZone(card);
            return coreServers.installableServers(state, cardToInstall)
              .filter((s: string) => s !== coreServers.zoneToName(zone));
          }),
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(state, side, eid, cardToInstall, targets[0], {
                ignoreAllCost: true,
                msgKeys: { installSource: card, displayOrigin: true },
              })], []);
          }),
        }, card, null)], []);
    }),
  },
  abilities: [{
    action: true,
    label: 'Install 1 card',
    async: true,
    cost: [corePayment.toC('click', 1)],
    once: ':per-turn',
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) && !coreCard.operation(c),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreInstalling.corpInstallMsg(targets[0])),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null, {
          ignoreAllCost: true,
          msgKeys: { installSource: card, displayOrigin: true },
        })], []);
    }),
  }],
};

export const veraIvanovnaShuyskaya: CardDef = (() => {
  const ability: any = {
    optional: {
      prompt: 'Reveal the grip and trash a card?',
      autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
      'yes-ability': coreDefHelpers.withRevealedHand(':runner', { eventSide: ':corp' }, {
        prompt: 'Choose a card to trash',
        req: req(function*(state: State) {
          return (state as any).runner.hand.length > 0;
        }),
        choices: {
          card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c),
        },
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `trash ${(targets[0] as any).title} from the Grip`),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
        }),
      }),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, side, `declines to use ${(card as any).title}`);
        }),
      },
    },
  };
  return {
    title: 'Vera Ivanovna Shuyskaya',
    events: [
      { ...ability, event: ':agenda-scored' },
      { ...ability, event: ':agenda-stolen' },
    ],
    abilities: [coreDefHelpers.setAutoresolve(':auto-fire', 'Vera Ivanovna Shuyskaya')],
  };
})();

export const victoriaJenkins: CardDef = {
  title: 'Victoria Jenkins',
  'on-rez': {
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreActions.lose(state, ':runner', { clickPerTurn: 1 });
    }),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card) {
    coreActions.gain(state, ':runner', { clickPerTurn: 1 });
  }),
  'on-trash': executiveTrashEffect,
};

export const wageWorkers: CardDef = (() => {
  const payoff: any = {
    msg: 'gain [Click]',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !(state as any)[side]?.register?.terminal;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreActions.gainClicks(state, side, 1);
    }),
  };
  function relevantKeys(context: any) {
    return { cid: context?.card?.cid, idx: context?.abilityIdx };
  }
  return {
    title: 'Wage Workers',
    events: [{
      event: ':action-resolved',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return side === ':corp';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        const similarActions = coreEvents.eventCount(state, side, ':action-resolved',
          (ts: any[]) => {
            const ctx = ts[0];
            return JSON.stringify(relevantKeys(ctx)) === JSON.stringify(relevantKeys(context));
          });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, similarActions === 3 ? payoff : null, card, null)], []);
      }),
    }],
  };
})();

export const wallToWall: CardDef = (() => {
  const all: any[] = [
    {
      msg: 'gain 1 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 1)], []);
      }),
    },
    {
      msg: 'draw 1 card',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, side, eid, 1)], []);
      }),
    },
    {
      label: 'place 1 advancement counter on a piece of ice',
      msg: {
        public: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 1 advancement counter on ${coreToString.cardStr(state, targets[0])}`),
        corp: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `place 1 advancement counter on ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`),
      },
      prompt: 'Choose a piece of ice to place 1 advancement counter on',
      async: true,
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
      }),
    },
    {
      label: 'add this asset to HQ',
      msg: 'add itself to HQ',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreMoving.move(state, side, card, ':hand');
      }),
    },
  ];
  function makeLabel(abi: any): string {
    return abi.label || abi.msg || '';
  }
  function choice(abis: any[], n: number): any {
    const choices = [...abis.map(makeLabel), 'Done'];
    return {
      prompt: 'Choose an ability to resolve',
      choices,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const target = targets[0];
        const chosenAbility = abis.find(a => makeLabel(a) === target);
        if (chosenAbility) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, chosenAbility, card, null)], []);
        }
        if (n > 1 && target !== 'Done' && chosenAbility) {
          const remaining = abis.filter(a => a !== chosenAbility);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, choice(remaining, n - 1), card, null)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    };
  }
  const ability: any = {
    async: true,
    automatic: ':last',
    interactive: req(function*() { return true; }),
    label: 'resolve an ability (start of turn)',
    once: ':per-turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      const assetCount = coreFinding.allActiveInstalled(state, ':corp').filter(coreCard.asset).length;
      const n = assetCount > 1 ? 1 : 3;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, choice(all, n), card, null)], []);
    }),
  };
  return {
    title: 'Wall to Wall',
    'derezzed-events': [{ ...coreDefHelpers.corpRezToast, event: ':runner-turn-ends' }],
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const wardenFatuma: CardDef = {
  title: 'Warden Fatuma',
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.ice(targets[0]) && coreCard.rezzed(targets[0]) &&
        coreCard.hasSubtype(targets[0], 'Bioroid');
    }),
    value: {
      position: ':front',
      subroutines: [{
        label: '[Warden Fatuma] Force the Runner to lose [Click], if able',
        msg: 'force the Runner to lose [Click], if able',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreActions.loseClicks(state, ':runner', 1);
        }),
      }],
    },
  }],
};

export const warmReception: CardDef = (() => {
  const install: any = {
    prompt: 'Choose a card to install',
    async: true,
    choices: {
      card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHand(c),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const installEid = coreEid.makeEid(state, eid);
      const installedCard = await new Promise(resolve =>
        coreInstalling.corpInstall(state, side, installEid, targets[0], null, {
          msgKeys: { installSource: card, displayOrigin: true },
        }).then(resolve));
      coreFlags.registerTurnFlag(state, side, card, ':can-score',
        (s: State, _: any, c: Card) => {
          if (coreCard.sameCard(c, installedCard as Card)) {
            coreToasts.toast(state, ':corp', 'Cannot score due to Warm Reception.', 'warning');
            return false;
          }
          return true;
        });
      coreEid.effectCompleted(state, side, eid);
    }),
  };
  const derezAbi: any = {
    label: 'Derez another card (start of turn)',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreCard.unprotected(state, card);
    }),
    prompt: 'Choose another card to derez',
    choices: {
      'not-self': true,
      card: (c: Card) => coreCard.rezzed(c),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, eid, [card, targets[0]])], []);
    }),
  };
  return {
    title: 'Warm Reception',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{
      event: ':corp-turn-begins',
      interactive: req(function*() { return true; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, install, card, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, derezAbi, card, null)], []);
      }),
    }],
  };
})();

export const watchdog: CardDef = (() => {
  function notTriggered(state: State): boolean {
    return coreEvents.noEvent(state, ':runner', ':rez',
      (ts: any[]) => coreCard.ice(ts[0]?.card));
  }
  return {
    title: 'Watchdog',
    'static-abilities': [{
      type: ':rez-cost',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(targets[0]) && notTriggered(state);
      }),
      value: req(function*(state: State) {
        return -coreFlags.countTags(state);
      }),
    }],
    events: [{
      event: ':rez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(targets[0]?.card) && notTriggered(state);
      }),
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `reduce the rez cost of ${(targets[0]?.card as any)?.title} by ${coreFlags.countTags(state)} [Credits]`),
    }],
  };
})();

export const whampoaReclamation: CardDef = {
  title: 'Whampoa Reclamation',
  abilities: [{
    label: 'Add 1 card from Archives to the bottom of R&D',
    once: ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (state as any).corp.hand.length > 0 && (state as any).corp.discard.length > 0;
    }),
    async: true,
    cost: [corePayment.toC('trash-from-hand', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          'waiting-prompt': true,
          prompt: 'Choose a card in Archives to add to the bottom of R&D',
          'show-discard': true,
          choices: {
            card: (c: Card) => coreCard.inDiscard(c) && coreCard.corp(c),
          },
          msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            return `trash 1 card from HQ and add ${(t as any).seen ? (t as any).title : 'a card'} from Archives to the bottom of R&D`;
          }),
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            coreMoving.move(state, side, targets[0], ':deck');
          }),
        }, card, null)], []);
    }),
  }],
};

export const workingPrototype: CardDef = {
  title: 'Working Prototype',
  events: [{
    event: ':rez',
    silent: true,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [
    {
      action: true,
      cost: [corePayment.toC('click', 1), corePayment.toC('power', 1)],
      label: 'Gain 3 [Credits]',
      msg: 'gain 3 [Credits]',
      'keep-menu-open': ':while-power-tokens-left',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 3)], []);
      }),
    },
    {
      action: true,
      cost: [corePayment.toC('click', 1), corePayment.toC('power', 5)],
      label: 'Gain 6 [Credits]. Add 1 resource to the top of the stack',
      'keep-menu-open': ':while-5-power-tokens-left',
      msg: 'gain 6 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, 6)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose a resource',
            req: req(function*(state: State) {
              return coreFinding.allInstalledRunnerType(state, ':resource').length > 0;
            }),
            choices: { card: (c: Card) => coreCard.resource(c) },
            msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `add ${(targets[0] as any).title} to the top of the stack`),
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              coreMoving.move(state, ':runner', targets[0], ':deck', { front: true });
            }),
          }, card, null)], []);
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  ],
};

export const worldsPlaza: CardDef = {
  title: 'Worlds Plaza',
  abilities: [{
    action: true,
    label: 'Install an asset on this asset',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return ((card as any).hosted || []).length < 3;
    }),
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    prompt: 'Choose an asset to install',
    choices: {
      card: (c: Card) => coreCard.asset(c) && coreCard.inHand(c) && coreCard.corp(c),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `host ${(targets[0] as any).title}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, targets[0], card, null)], []);
      const hosted = (coreCard.getCard(state, card) as any).hosted || [];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, hosted[hosted.length - 1], { costBonus: -2 })], []);
    }),
  }],
};

export const zaibatsuLoyalty: CardDef = {
  title: 'Zaibatsu Loyalty',
  prevention: [
    {
      prevents: ':expose',
      type: ':ability',
      label: '1 [Credit]: Zaibatsu Loyalty',
      ability: {
        cost: [corePayment.toC('credit', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return corePrevention.preventable(targets[0]);
        }),
        msg: 'prevent a card from being exposed',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            corePrevention.preventExpose(state, side, eid, card)], []);
        }),
      },
    },
    {
      prevents: ':expose',
      type: ':ability',
      label: '[trash]: Zaibatsu Loyalty',
      ability: {
        cost: [corePayment.toC('trash-can', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return corePrevention.preventable(targets[0]);
        }),
        msg: 'prevent a card from being exposed',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            corePrevention.preventExpose(state, side, eid, card)], []);
        }),
      },
    },
  ],
  'derezzed-events': [{
    event: ':expose-interrupt',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card) {
              return !coreCard.rezzed(card);
            }),
            prompt: msg((state: State, side: Side, eid: EID, card: Card) => {
              const cards = (ctx?.cards || []).map((c: Card) => coreToString.cardStr(state, c, { visible: true }));
              return `The Runner is about to expose ${utils.enumerateStr(cards)}. Rez Zaibatsu Loyalty?`;
            }),
            'yes-ability': {
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
                yield wait_for(state, [{ asyncResult: 'result' },
                  coreRezzing.rez(state, side, eid, card)], []);
              }),
            },
          },
        }, card, null)], []);
    }),
  }],
};

export const zealousJudge: CardDef = {
  title: 'Zealous Judge',
  'rez-req': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreFlags.tagged(state);
  }),
  abilities: [{
    action: true,
    async: true,
    label: 'Give the Runner 1 tag',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    'keep-menu-open': ':while-clicks-left',
    msg: 'give the Runner 1 tag',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, side, eid, 1)], []);
    }),
  }],
};
