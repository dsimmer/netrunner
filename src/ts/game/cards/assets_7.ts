import type { Card, CardDef, EID, Server, Side, State } from '../../types';
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
import { advanceAmbush } from './assets_1';

export const ronaldFive: CardDef = (() => {
  const ability: any = {
    event: ':runner-trash',
    'once-per-instance': false,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const t = targets[0];
      return coreCard.corp(t?.card) && (state as any).runner.click > 0;
    }),
    msg: 'force the runner to lose [Click]',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, 6)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            req: req(function*(state: State): Generator<any, any, any> {
              return coreBadPublicity.countBadPub(state) > 0;
            }),
            prompt: 'Remove 1 bad publicity?',
            'yes-ability': {
              msg: 'remove 1 bad publicity',
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
  'on-rez': { effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreIce.updateAllIce(state, side);
  }) },
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State): Generator<any, any, any> {
      return (state as any).corp.credit >= 10;
    }),
    value: req(function*(state: State): Generator<any, any, any> {
      return Math.floor((state as any).corp.credit / 5);
    }),
  }],
  events: [
    {
      event: ':corp-gain',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targets[0]?.type === ':credit';
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreIce.updateAllIce(state, side);
      }),
    },
    {
      event: ':corp-lose',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targets[0]?.type === ':credit';
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreIce.updateAllIce(state, side);
      }),
    },
  ],
  'leave-play': effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        number: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          return (state as any).corp.credit - 1;
        }),
      },
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `store ${targets[0]} [Credits]`),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.unprotected(state, card);
    }),
  },
  abilities: [{
    label: 'Draw 3 cards and add 1 card in HQ to the bottom of R&D',
    once: ':per-turn',
    msg: 'draw 3 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a card in HQ to add to the bottom of R&D',
          choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
          msg: 'add 1 card from HQ to the bottom of R&D',
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            coreMoving.move(state, side, targets[0], ':deck');
          }),
        }, card, null)], []);
    }),
  }],
};

export const serverDiagnostics: CardDef = (() => {
  const ability: any = {
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return coreCard.ice(targets[0]?.card);
        }),
        async: true,
        msg: 'trash itself',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return corePrompts.cancellable(
          (state as any).corp.deck.filter(coreCard.agenda), { sorted: true });
      }),
      cost: [corePayment.toC('trash-can', 1)],
      cancel: { ...(coreShuffling as any).shuffleMyDeck, cost: [corePayment.toC('trash-can', 1)] },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return corePrompts.cancellable(
          (state as any).corp.discard.filter(coreCard.agenda), { sorted: true });
      }),
      cancel: { msg: 'do nothing', cost: [corePayment.toC('trash-can', 1)] },
      cost: [corePayment.toC('trash-can', 1)],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
      }),
    },
    prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
      `Choose ${utils.quantify(coreCard.getCounters(coreCard.getCard(state, card), ':advancement'), 'piece')} of hardware to trash`),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `trash ${utils.enumerateCards(targets)}`),
    choices: {
      max: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement');
      }),
      card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const dmg = targets[0];
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, {
              player: ':runner',
              prompt: 'Choose one',
              'waiting-prompt': true,
              choices: [`Take ${dmg} net damage`, 'Add Shi.Kyū to score area'],
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  poison: true,
  'on-access': {
    msg: 'do 1 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  },
};

export const siu: CardDef = {
  title: 'SIU',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  abilities: [{
    label: 'Trace 3 - Give the Runner 1 tag',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !!(state as any).corpPhase12;
    }),
    async: true,
    cost: [corePayment.toC('trash-can', 1)],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  'on-access': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return !coreCard.inDiscard(card) &&
          corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 4)]);
      }),
      'waiting-prompt': true,
      prompt: msg((state: State, side: Side, eid: EID, card: Card) =>
        `Pay 4 [Credits] to use ${(card as any).title} ability?`),
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreSay.systemMsg(state, side, `declines to use ${(card as any).title}`);
        }),
      },
      'yes-ability': {
        async: true,
        cost: [corePayment.toC('credit', 4)],
        msg: 'give the Runner 1 tag and do 3 net damage',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
  flags: { 'rd-reveal': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
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
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return coreProps.canBeAdvanced(state, targets[0]);
          }),
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, eid, 2)], []);
    }),
  },
  abilities: [{
    label: 'Shuffle up to 2 cards from Archives into R&D',
    cost: [corePayment.toC('remove-from-game', 1)],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDamage.damage(state, side, eid, ':net', 1, { card })], []);
    }),
  }],
  events: [{
    event: ':corp-trash',
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runnerFaction = (state as any).runner.identity?.faction;
      const hasMatch = targets.some((t: any) => t?.card?.faction === runnerFaction);
      return hasMatch && coreEvents.firstEvent(state, side, ':corp-trash',
        (ts: any[]) => ts.some((t: any) => t?.card?.faction === runnerFaction));
    }),
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
};

export const studentLoans: CardDef = {
  title: 'Student Loans',
  'static-abilities': [{
    type: ':play-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, card, ':bad-publicity', -1, null)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
      }),
    },
    {
      event: ':counter-added',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = targets[0];
        return coreCard.sameCard(card, ctx?.card) &&
          coreCard.getCounters(coreCard.getCard(state, card), ':bad-publicity') <= 0 &&
          !!(coreCard.getCard(state, card) as any)?.special?.boreholeValid;
      }),
      msg: 'win the game',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreWinning.win(state, ':corp', (card as any).title);
      }),
    },
  ],
};

export const synchrocyclotron: CardDef = {
  title: 'Synchrocyclotron',
  'static-abilities': [{
    type: ':play-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreEvents.firstEvent(state, side, ':runner-spent-click');
      }),
      msg: 'gain 2 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreUpdate.update(state, side,
          { ...coreCard.getCard(state, card), special: { spentClick: true } });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', eid, 2)], []);
      }),
    },
    {
      event: ':run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreEvents.firstEvent(state, side, ':runner-spent-click') &&
          !!(state as any).run &&
          coreRuns.thisServer(state, card) &&
          !!(coreCard.getCard(state, card) as any)?.special?.spentClick;
      }),
      msg: 'lose 2 [Credits]',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreFinding.allInstalled(state, ':corp').length >= 2;
    }),
    choices: {
      'not-self': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, side, targets[0], { unpreventable: true, causeCard: card })], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  };
  return {
    title: 'Svyatogor Excavator',
    flags: {
      'corp-phase-12': req(function*(state: State): Generator<any, any, any> {
        return coreFinding.allInstalled(state, ':corp').length >= 2;
      }),
    },
    events: [{ ...ability, event: ':corp-turn-begins', interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) }],
    abilities: [ability],
  };
})();

export const synthDnaModification: CardDef = {
  title: 'Synth DNA Modification',
  events: [{
    event: ':subroutines-broken',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = targets[0];
      return coreCard.hasSubtype(ctx?.ice, 'AP') &&
        coreEvents.firstEvent(state, side, ':subroutines-broken',
          (ts: any[]) => coreCard.hasSubtype(ts[0]?.ice, 'AP'));
    }),
    msg: 'do 1 net damage',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    async: true,
    choices: {
      card: (c: Card) =>
        !coreCard.operation(c) && coreCard.corp(c) &&
        (coreCard.inHand(c) || coreCard.inDiscard(c)),
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

export const techStartup: CardDef = {
  title: 'Tech Startup',
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  abilities: [{
    label: 'Search R&D for an asset to install',
    prompt: 'Choose an asset',
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `reveal ${(targets[0] as any).title} from R&D and install it`),
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return (state as any).corp.deck.some(coreCard.asset);
    }),
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return (state as any).corp.deck.filter(coreCard.asset);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return isTechnoTarget(targets[0]) && !(targets[1] as any)?.facedown;
      }),
      value: 1,
    }],
    events: [{
      event: ':runner-install',
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = targets[0];
          return isTechnoTarget(ctx?.card) && !ctx?.facedown;
        }),
        prompt: 'Gain 1 [Credit]?',
        'waiting-prompt': true,
        autoresolve: coreDefHelpers.getAutoresolve(':auto-fire'),
        'yes-ability': {
          msg: 'gain 1 [Credits]',
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreFinding.allInstalled(state, ':corp').filter(coreCard.ice).length >= 2;
    }),
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.ice(c),
      max: 2,
      all: true,
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `swap the positions of ${coreToString.cardStr(state, targets[0])} and ${coreToString.cardStr(state, targets[1])}`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreInstalling.swapInstalled(state, side, targets[0], targets[1]);
    }),
  }],
};

export const testGround: CardDef = {
  title: 'Test Ground',
  advanceable: ':always',
  abilities: [{
    label: 'Derez 1 card for each advancement counter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':advancement') > 0;
    }),
    cost: [corePayment.toC('trash-can', 1)],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRezzing.derez(state, side, eid, targets,
                { msgKeys: { includeCostFromEid: paymentEid } })], []);
          }),
        }, card, null)], []);
    }),
  }],
};
