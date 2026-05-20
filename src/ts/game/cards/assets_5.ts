import type { Card, CardDef, EID, Side, State } from '../../types';
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
import { takeNCreditsStartOfTurn } from './assets_1';

// Stub helpers (to be ported from clj cards/*.clj)
function advanceAmbush(_args?: any, _ability?: any): any { return {}; }
function credsOnRoundStart(_n?: number, _opts?: any): any { return {}; }

// Luana Campos
export const luanaCampos: CardDef = {
  title: 'Luana Campos',
  uninstall: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const ctx = (targets as any)[0] || {};
    const oldCard = ctx.oldCard;
    if (coreCard.rezzed(oldCard) && coreCard.getCounters(oldCard, ':bad-publicity') > 0) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          msg: msg((s: State) => `take ${coreCard.getCounters(oldCard, ':bad-publicity')} bad publicity`),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreBadPublicity.gainBadPublicity(s, sd, e, coreCard.getCounters(oldCard, ':bad-publicity'))], []);
          }),
        }, card, targets)], []);
    }
  }),
  events: [{
    event: ':corp-turn-begins',
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    'change-in-game-state': {
      req: req(function*(state: State): Generator<any, any, any> { return coreFlags.countBadPub(state) > 0; }),
      silent: true,
    },
    optional: {
      interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
      prompt: 'Host a bad publicity counter to gain 3 [Credits] and draw a card?',
      'yes-ability': {
        msg: 'gain 3 [Credits] and draw 1 card',
        cost: [corePayment.toC('host-bad-pub', 1)],
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.agenda(targets[0]);
    }),
    value: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return [corePayment.toC('credit', 3)]; }),
  }],
  events: [{
    event: ':agenda-scored',
    async: true,
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    msg: 'force the Runner to lose 3 [Credits]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, 3)], []);
    }),
  }],
};

// Malia Z0L0K4
export const maliaZ0L0K4: CardDef = (() => {
  const unmark = req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const maliaTarget = (coreCard.getCard(state, card) || card as any)?.special?.maliaTarget;
          return coreCard.sameCard(targets[0], maliaTarget) ||
            (coreCard.sameCard((targets[0] as any)?.host, maliaTarget) &&
              (maliaTarget as any)?.title === 'DJ Fenris' &&
              (targets[0] as any)?.type === 'Fake-Identity');
        }),
        value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          return coreDefHelpers.makeIcon('MZ', card);
        }),
      },
      {
        type: ':disable-card',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':credit') <= 2;
    }),
    req: req(function*(state: State): Generator<any, any, any> { return !!(state as any).corpPhase12; }),
    label: 'Gain 2 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(2, coreCard.getCounters(card, ':credit'))} [Credits]`),
    async: true,
    automatic: ':gain-credits',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          return ((state as any).prevent?.trash?.remaining || []).some((c: any) =>
            coreCard.sameCard(c.card, card));
        }),
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 2)], []);
      }),
    },
    {
      label: 'Gain 2 [Credits]',
      msg: 'gain 2 [Credits]',
      cost: [corePayment.toC('any-agenda-counter', 1)],
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreEngine.registerEvents(state, side, card, [{
          event: ':runner-turn-begins',
          'unregister-once-resolved': true,
          duration: ':until-runner-turn-begins',
          effect: effect(function*(s: State, sd: Side): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    prompt: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Choose an installed card to place advancement counters on (${x} remaining)`),
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: {
      public: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(s, t[0])}`),
      corp: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
        `place 1 advancement counter on ${coreToString.cardStr(s, t[0], { maybeVisible: true })}`),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trashCards(state, ':corp', eid, targets, { causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, moonPoolRevealAbility, card, null)], []);
    }),
    cancel: {
      msg: 'decline to trash any cards from HQ',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter', 1, { placed: true })], []);
    }),
  }],
  abilities: [{
    cost: [corePayment.toC('credit', 2)],
    'keep-menu-open': ':while-advancement-tokens-left',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':advancement') > 0 &&
        coreFinding.allActiveInstalled(state, ':corp').length > 0;
    }),
    label: 'Move an advancement counter to a faceup card',
    prompt: 'Choose a faceup card',
    choices: { card: (c: Card) => coreCard.faceup(c) },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `move an advancement counter to ${coreToString.cardStr(state, targets[0])}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      max: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2)], []);
    }),
  }],
  'on-trash': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return side === ':runner';
      }),
      'waiting-prompt': true,
      prompt: 'Gain 2 [Credits]?',
      'yes-ability': {
        msg: 'gain 2 [Credits]',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
        }),
      },
      {
        label: 'Place 2 power counters',
        cost: [corePayment.toC('credit', 2)],
        msg: 'place 2 power counters on itself',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return (targets[0] as any)?.context?.side === ':runner';
          }),
        },
      },
      {
        ...ability,
        event: ':runner-prevent',
        optional: {
          ...ability.optional,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreLink.getLink(state);
  }),
  recurring: coreDefHelpers.getXFn(),
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return (eid as any).sourceType === ':trace';
      }),
      type: ':recurring',
    },
  },
};

export const neurostasis: CardDef = { title: 'Neurostasis', ...advanceAmbush(
  3,
  {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
    }),
    'waiting-prompt': true,
    async: true,
    prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
      `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'installed card')} to shuffle into the stack`),
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.runner(c),
      max: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `shuffle ${utils.enumerateCards(targets)} into the stack`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `force the Runner to ${utils.decapitalize(targets[0])}`),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['Take 2 tags', 'Add News Team to score area'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    once: ':per-turn',
    automatic: ':draw-cards',
    label: 'Take 3 [Credits] (start of turn)',
    msg: msg((state: State, side: Side, eid: EID, card: Card) =>
      `gain ${Math.min(3, coreCard.getCounters(card, ':credit'))} [Credits]`),
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          return coreFlags.tagged(state) || coreBadPublicity.countBadPub(state) > 0;
        }),
      },
      msg: 'remove 1 bad publicity and 1 tag',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.loseBadPublicity(state, ':corp', 1, { suppressCheckpoint: true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.loseTags(state, side, eid, 1)], []);
      }),
    },
  ],
};
