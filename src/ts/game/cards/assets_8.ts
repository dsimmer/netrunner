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

import { executiveTrashEffect } from './assets_1';
import { expose } from './assets_3';

// Stub helpers (to be ported from clj cards/*.clj)
function advanceAmbush(_args?: any, _ability?: any): any { return {}; }

export const theBoard: CardDef = {
  title: 'The Board',
  'on-trash': executiveTrashEffect,
  'static-abilities': [{
    type: ':agenda-value',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreActions.preventCurrent(state, side);
    }),
  }],
  'on-rez': {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreActions.preventCurrent(state, side);
    }),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    (state as any).runner.register.cannotPlayCurrent = false;
  }),
};

export const thePowersThatBe: CardDef = {
  title: 'The Powers That Be',
  events: [{
    event: ':agenda-scored',
    prompt: 'Choose a card from Archives or HQ to install, ignoring all costs',
    'show-discard': true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    async: true,
    choices: {
      card: (c: Card) =>
        coreCard.corpInstallableType(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 2 * coreCard.getCounters(card, ':advancement'))], []);
    }),
  }],
};

export const tieredSubscription: CardDef = {
  title: 'Tiered Subscription',
  events: [{
    event: ':run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreEvents.firstEvent(state, side, ':run');
    }),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const counters = coreCard.getCounters(card, ':advancement');
      const [movedCard, movedTarget] = coreInstalling.swapCards(state, side, card, targets[0]);
      coreProps.setProp(state, side, movedTarget, ':advance-counter', counters);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', {
          optional: {
            prompt: 'Access the newly installed card?',
            'yes-ability': {
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreUpdate.update(state, side, {
        ...coreCard.getCard(state, card),
        special: { triesteTarget: targets[0] },
      });
    }),
  },
  'static-abilities': [
    {
      type: ':icon',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(targets[0], (card as any).special?.triesteTarget);
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreDefHelpers.makeIcon('TMB', card);
      }),
    },
    {
      type: ':prevent-paid-ability',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
  poison: true,
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !coreCard.inDiscard(card);
    }),
    msg: 'lose 2 [Credits], destroy itself, and trash 1 card from HQ at random',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net',
          2 + coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), { card })], []);
    }),
  },
) };

export const vaporframeFabricator: CardDef = {
  title: 'Vaporframe Fabricator',
  'on-trash': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return side === ':runner';
    }),
    async: true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) && !coreCard.operation(c),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const cardToInstall = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            const zone = coreCard.getZone(card);
            return coreServers.installableServers(state, cardToInstall)
              .filter((s: string) => s !== coreServers.zoneToName(zone));
          }),
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
        req: req(function*(state: State): Generator<any, any, any> {
          return (state as any).runner.hand.length > 0;
        }),
        choices: {
          card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c),
        },
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
          `trash ${(targets[0] as any).title} from the Grip`),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
        }),
      }),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreActions.lose(state, ':runner', { clickPerTurn: 1 });
    }),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreActions.gain(state, ':runner', { clickPerTurn: 1 });
  }),
  'on-trash': executiveTrashEffect,
};

export const wageWorkers: CardDef = (() => {
  const payoff: any = {
    msg: 'gain [Click]',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !(state as any)[side]?.register?.terminal;
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return side === ':corp';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 1)], []);
      }),
    },
    {
      msg: 'draw 1 card',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addProp(state, side, eid, targets[0], ':advance-counter', 1, { placed: true })], []);
      }),
    },
    {
      label: 'add this asset to HQ',
      msg: 'add itself to HQ',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    label: 'resolve an ability (start of turn)',
    once: ':per-turn',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.ice(targets[0]) && coreCard.rezzed(targets[0]) &&
        coreCard.hasSubtype(targets[0], 'Bioroid');
    }),
    value: {
      position: ':front',
      subroutines: [{
        label: '[Warden Fatuma] Force the Runner to lose [Click], if able',
        msg: 'force the Runner to lose [Click], if able',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.unprotected(state, card);
    }),
    prompt: 'Choose another card to derez',
    choices: {
      'not-self': true,
      card: (c: Card) => coreCard.rezzed(c),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, eid, [card, targets[0]])], []);
    }),
  };
  return {
    title: 'Warm Reception',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    events: [{
      event: ':corp-turn-begins',
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.ice(targets[0]) && notTriggered(state);
      }),
      value: req(function*(state: State): Generator<any, any, any> {
        return -coreFlags.countTags(state);
      }),
    }],
    events: [{
      event: ':rez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return (state as any).corp.hand.length > 0 && (state as any).corp.discard.length > 0;
    }),
    async: true,
    cost: [corePayment.toC('trash-from-hand', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, 6)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            prompt: 'Choose a resource',
            req: req(function*(state: State): Generator<any, any, any> {
              return coreFinding.allInstalledRunnerType(state, ':resource').length > 0;
            }),
            choices: { card: (c: Card) => coreCard.resource(c) },
            msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
              `add ${(targets[0] as any).title} to the top of the stack`),
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return corePrevention.preventable(targets[0]);
        }),
        msg: 'prevent a card from being exposed',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return corePrevention.preventable(targets[0]);
        }),
        msg: 'prevent a card from being exposed',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            corePrevention.preventExpose(state, side, eid, card)], []);
        }),
      },
    },
  ],
  'derezzed-events': [{
    event: ':expose-interrupt',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
              return !coreCard.rezzed(card);
            }),
            prompt: msg((state: State, side: Side, eid: EID, card: Card) => {
              const cards = (ctx?.cards || []).map((c: Card) => coreToString.cardStr(state, c, { visible: true }));
              return `The Runner is about to expose ${utils.enumerateStr(cards)}. Rez Zaibatsu Loyalty?`;
            }),
            'yes-ability': {
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
  'rez-req': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreFlags.tagged(state);
  }),
  abilities: [{
    action: true,
    async: true,
    label: 'Give the Runner 1 tag',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    'keep-menu-open': ':while-clicks-left',
    msg: 'give the Runner 1 tag',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, side, eid, 1)], []);
    }),
  }],
};
