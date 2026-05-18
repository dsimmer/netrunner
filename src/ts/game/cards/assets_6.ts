import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreAgendas from '../core/agendas';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreCheckpoint from '../core/checkpoint';
import * as coreChooseOne from '../core/choose_one';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
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
import * as coreHandSize from '../core/hand_size';
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
import * as coreSetAside from '../core/set_aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

import { expose } from './assets_3';

// Stub helpers (to be ported from clj cards/*.clj)
function advanceAmbush(_args?: any, _ability?: any): any { return {}; }
function credsOnRoundStart(_n?: number, _opts?: any): any { return {}; }

export const openForum: CardDef = {
  title: 'Open Forum',
  events: [{
    event: ':corp-mandatory-draw',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    msg: msg((state: State, side: Side, eid: EID, card: Card) => {
      const top = (state as any).corp.deck[0];
      return top
        ? `reveal ${top.title} from the top of R&D and add it to HQ`
        : 'reveal no cards from R&D (it is empty)';
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':credit') <= 2;
    }),
    event: ':corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    label: 'Gain 2 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(2, coreCard.getCounters(card, ':credit'))} [Credits]`),
    async: true,
    automatic: ':gain-credits',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDefHelpers.takeCredits(state, side, card, ':credit', 2)], []);
      if (coreCard.getCounters(coreCard.getCard(state, card), ':credit') <= 0) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            msg: 'trash itself and gain [click][click]',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':corp', 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', eid, 1)], []);
    }),
  };
  return {
    title: 'Pālanā Agroplex',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
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
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    async: true,
    msg: 'force the runner to draw 1 card',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', 1)], []);
      const credsToGain = Math.floor((state as any).runner.hand.length / 2);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: `Gain ${credsToGain} [Credits]?`,
            autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
            req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return credsToGain > 0; }),
            'waiting-prompt': true,
            'yes-ability': {
              msg: `gain ${credsToGain} [Credits]`,
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', eid, ':net', x)], []);
        }),
      },
      ...(x === 1 ? {} : { cost: [corePayment.toC('power', x - 1)] }),
    };
  }
  const abi: any = coreChooseOne.chooseOneHelper({
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return (coreEvents.firstEvent(state, ':corp', ':agenda-scored') &&
        coreEvents.noEvent(state, ':runner', ':agenda-stolen')) ||
        (coreEvents.firstEvent(state, ':runner', ':agenda-stolen') &&
        coreEvents.noEvent(state, ':corp', ':agenda-scored'));
    }),
    player: ':corp',
    side: ':corp',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    prompt: 'Choose an Agenda in HQ to score',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.agenda(t) &&
          coreCard.getAdvancementRequirement(t) <= coreCard.getCounters(coreCard.getCard(state, card), ':advancement') &&
          coreCard.inHand(t);
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `score ${(targets[0] as any).title}`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return (state as any).corp.discard.some((c: Card) =>
          !(c as any).seen ||
          (coreCard.operation(c) && coreCard.hasSubtype(c, 'Transaction') &&
            coreActions.canPlayInstant(state, side, eid, c, null)));
      }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.operation(t) && coreCard.hasSubtype(t, 'Transaction') &&
          coreActions.canPlayInstant(state, side, eid, t, null);
      }),
    },
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `play ${(targets[0] as any).title} from Archives`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = targets[0];
        return ctx.type === ':net' && ctx.sourcePlayer === ':corp' && corePrevention.preventable(ctx);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `do ${2 * coreCard.getCounters(coreCard.getCard(state, card), ':advancement')} net damage`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net',
          2 * coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), { card })], []);
    }),
  },
) };

export const psychicField: CardDef = (() => {
  const ab: any = {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.installed(card);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const hand = (state as any).runner.hand.length;
      const message = `do ${hand} net damage`;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          psi: {
            'not-equal': {
              msg: message,
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return side === ':runner' && coreThreat.threatLevel(2, state);
    }),
  },
};

export const publicHealthPortal: CardDef = (() => {
  const ability: any = {
    once: ':per-turn',
    label: 'Reveal the top card of R&D and gain 2 [Credits] (start of turn)',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    automatic: ':gain-credits',
    msg: msg((state: State, side: Side, eid: EID, card: Card) => {
      const top = (state as any).corp.deck[0];
      return `reveal ${top?.title} from the top of R&D and gain 2 [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':power') > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':power', -1, null)], []);
      }),
    },
    {
      event: ':counter-added',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = targets[0];
        return coreCard.sameCard(card, ctx?.card) &&
          coreCard.getCounters(card, ':power') <= 0;
      }),
      msg: "add itself to [their] score area as an agenda worth 1 agenda point",
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const t = targets[0];
          return coreCard.ice(t) &&
            coreRezzing.canPayToRez(state, side, { ...eid, source: card }, t, { costBonus: -discount }) &&
            !coreCard.rezzed(t);
        }),
      },
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return (state as any).corp.scored.length > 0;
      }),
      cost: [corePayment.toC('forfeit', 1)],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const currentlyDrawing: Card[] = (state as any).corp.currentlyDrawing || [];
        const discardTypes = new Set((state as any).corp.discard.map((c: Card) => (c as any).type));
        const drawingTypes = new Set(currentlyDrawing.map((c: Card) => (c as any).type));
        const hasIntersection = [...discardTypes].some(t => drawingTypes.has(t));
        return (state as any).corp.click > 0 && hasIntersection && currentlyDrawing.length > 0;
      }),
      'yes-ability': {
        once: ':per-turn',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreActions.loseClicks(state, ':corp', 1);
          const currentlyDrawing: Card[] = (state as any).corp.currentlyDrawing || [];
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              prompt: 'Choose a card in HQ that you just drew to swap for a card of the same type in Archives',
              choices: {
                card: (c: Card) => currentlyDrawing.some((d: Card) => coreCard.sameCard(c, d)),
              },
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash this asset to gain 3 [Credits] and draw 3 cards?',
            'yes-ability': {
              async: true,
              msg: 'gain 3 [Credits] and draw 3 cards',
              effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    flags: { 'corp-phase-12': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const realityThreedee: CardDef = (() => {
  const ability: any = {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, coreFlags.tagged(state) ? 2 : 1)], []);
    }),
    async: true,
    label: 'Gain credits (start of turn)',
    automatic: ':gain-credits',
    once: ':per-turn',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      coreFlags.tagged(state) ? 'gain 2 [Credits]' : 'gain 1 [Credits]'),
  };
  return {
    title: 'Reality Threedee',
    'on-rez': {
      msg: 'take 1 bad publicity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Trash Reaper Function to do 2 net damage?',
            'yes-ability': {
              msg: 'do 2 net damage',
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    flags: { 'corp-phase-12': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
    events: [{ ...ability, event: ':corp-turn-begins' }],
    abilities: [ability],
  };
})();

export const reconstructionContract: CardDef = {
  title: 'Reconstruction Contract',
  events: [{
    event: ':damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = targets[0];
      return ctx.amount > 0 && ctx.damageType === ':meat';
    }),
    msg: 'place 1 advancement counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      number: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':advancement');
      }),
      default: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':advancement');
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const numCounters = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose a card that can be advanced',
          choices: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return coreProps.canBeAdvanced(state, targets[0]);
            }),
          },
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    label: 'Remove 1 counter (start of turn)',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
