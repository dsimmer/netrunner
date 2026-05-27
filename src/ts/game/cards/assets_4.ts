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
import { campaign } from './assets_1';
// Humanoid Resources
export const humanoidResources: CardDef = (() => {
  const playAnInstant: any = {
    prompt: 'Choose an operation',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = (targets as any)[0] || {};
      return ctx.corpCredits != null && coreEvents.firstEvent(state, side, ':reveal-spent-credits');
    }),
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `gain ${((targets as any)[0] || {}).corpCredits} [Credits]`),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      req: req(function*(state: State): Generator<any, any, any> {
        return ((state as any).runner?.hand || []).some((c: Card) => coreCard.isType(c, cardType));
      }),
      prompt: `Choose a ${cardType} to trash`,
      choices: {
        card: (c: Card) => coreCard.inHand(c) && coreCard.runner(c) && coreCard.isType(c, cardType),
      },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { causeCard: card })], []);
      }),
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${(targets[0] as any)?.title} from the grip`),
    });
  const chooseAbility: any = {
    label: 'Trash 1 card in the grip of a named type',
    'change-in-game-state': {
      req: req(function*(state: State): Generator<any, any, any> { return !!((state as any).runner?.hand?.length); }),
      silent: true,
    },
    once: ':per-turn',
    req: req(function*(state: State): Generator<any, any, any> { return !!((state as any).runner?.hand?.length); }),
    prompt: 'Choose a card type',
    choices: ['Event', 'Hardware', 'Program', 'Resource'],
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `choose ${targets[0]}`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, trashAbility(targets[0]), card, null)], []);
    }),
  };
  return {
    title: 'Ibrahim Salem',
    'additional-cost': [corePayment.toC('forfeit', 1)],
    flags: {
      'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    skippable: true,
    label: 'Trash Idiosyncresis',
    optional: {
      prompt: 'Trash Idiosyncresis?',
      req: req(function*(state: State): Generator<any, any, any> { return !!(state as any).corpPhase12; }),
      'yes-ability': {
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card) => {
          const runner = (state as any).runner;
          return `force the runner to lose ${loseAmt(card, runner)} [Credits], and then gain ${gainAmt(card)} [Credits]`;
        }),
        cost: [corePayment.toC('trash-can', 1)],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State): Generator<any, any, any> { return !!(state as any).corpPhase12; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side): Generator<any, any, any> { return side === ':runner'; }),
      msg: 'take 1 bad publicity',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        return ctx.card?.faction !== (state as any).corp?.identity?.faction;
      }),
      msg: 'gain 1 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, 1)], []);
      }),
    },
    {
      event: ':rez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        return ctx.card?.faction !== (state as any).corp?.identity?.faction;
      }),
      msg: 'gain 1 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
    req: req(function*(state: State): Generator<any, any, any> { return !!((state as any).runner?.scored?.length); }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const scored = ((targets as any)[0] || {}).card;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: msg((s: State) => `Swap ${(scored as any)?.title} for an agenda in the Runner's score area?`),
            'waiting-prompt': true,
            req: req(function*(s: State): Generator<any, any, any> { return !!((s as any).runner?.scored?.length); }),
            'yes-ability': {
              prompt: `Choose a scored Runner agenda to swap with ${(scored as any)?.title}`,
              choices: {
                req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
                  return coreFlags.inRunnerScored(s, sd, t[0]) &&
                    !!(t[0] as any)?.agendapoints && (t[0] as any)?.agendapoints > 0;
                }),
              },
              msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
                `swap ${coreToString.cardStr(s, scored)} for ${coreToString.cardStr(s, t[0])}`),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State): Generator<any, any, any> { return !!((state as any).corp?.scored?.length); }),
    choices: {
      req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
        return coreFlags.inCorpScored(s, sd, t[0]);
      }),
    },
    msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
      `swap ${coreToString.cardStr(s, stolen)} for ${coreToString.cardStr(s, t[0])}`),
    effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
      coreMoving.swapAgendas(s, sd, t[0], stolen);
    }),
  });
  return {
    title: 'Investigator Inez Delgado A 2',
    events: [{
      event: ':agenda-stolen',
      interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
      skippable: true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
                  effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
      }),
    },
    {
      cost: [corePayment.toC('power', 1)],
      'keep-menu-open': ':while-power-tokens-left',
      label: 'Add strength to a rezzed piece of ice',
      choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':power') > 0;
      }),
      msg: 'add strength to a rezzed piece of ice',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const itTarget = targets[0];
        coreEffects.registerLingeringEffect(state, card, {
          type: ':ice-strength',
          duration: ':end-of-turn',
          req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
            return coreCard.sameCard(t[0], itTarget);
          }),
          value: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':credit', 3, { placed: true })], []);
    }),
  };
  return {
    title: 'Janaína "JK" Dumont Kindelán',
    'derezzed-events': [coreDefHelpers.corpRezToast],
    flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
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
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
              effect: effect(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreGaining.gainClicks(state, side, 1);
    }),
  };
  const cleanup = effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
  flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  abilities: [
    {
      msg: 'look at the top card of the stack',
      'change-in-game-state': {
        req: req(function*(state: State): Generator<any, any, any> { return !!((state as any).runner?.deck?.length); }),
      },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        `trash ${((state as any).runner?.deck?.[0] as any)?.title} from the stack`),
      cost: [corePayment.toC('trash-can', 1)],
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.mill(state, ':corp', eid, ':runner', 1)], []);
      }),
    },
  ],
};

// Kuwinda K4H1U3
export const kuwinda: CardDef = {
  title: 'Kuwinda K4H1U3',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.getCounters(card, ':power');
  }),
  'derezzed-events': [coreDefHelpers.corpRezToast],
  flags: { 'corp-phase-12': req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }) },
  abilities: [{
    label: 'Trace X - do 1 core damage (start of turn)',
    trace: {
      base: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':power');
      }),
      successful: {
        async: true,
        msg: 'do 1 core damage',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':runner', eid, ':brain', 1, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, card, { causeCard: card })], []);
        }),
      },
      unsuccessful: {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const counters = coreCard.getCounters(coreCard.getCard(state, card), ':power');
      return ((state as any).corp?.hand || []).some((c: Card) =>
        coreCard.agenda(c) && (c as any).agendapoints === counters);
    }),
    'waiting-prompt': true,
    prompt: 'Choose an Agenda in HQ to add to score area',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.agenda(targets[0]) &&
          (targets[0] as any).agendapoints === coreCard.getCounters(coreCard.getCard(state, card), ':power') &&
          coreCard.inHand(targets[0]);
      }),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `add ${(targets[0] as any)?.title} to score area`),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addCounter(state, side, eid, card, ':power', 1, null)], []);
    }),
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const power = coreCard.getCounters(card, ':power');
      return ((state as any).corp?.hand || []).some((c: Card) =>
        coreCard.agenda(c) && power >= (c as any).agendapoints);
    }),
    label: 'Reveal an agenda worth X points from HQ',
    async: true,
    cost: [corePayment.toC('x-power', 1)],
    'keep-menu-open': ':while-power-tokens-left',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const paidAmt = corePayment.costValue(eid, ':x-power');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose an agenda in HQ to reveal',
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
              return coreCard.agenda(t[0]) && (t[0] as any).agendapoints <= paidAmt;
            }),
          },
          msg: msg((s: State, sd: Side, e: EID, c: Card, t: any[]) =>
            `reveal ${(t[0] as any)?.title} from HQ`),
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, t: any[]): Generator<any, any, any> {
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
    choices: req(function*(state: State): Generator<any, any, any> {
      return corePrompts.cancellable(
        ((state as any).corp?.deck || []).filter((c: Card) => coreCard.ice(c)),
        { sorted: true });
    }),
    label: 'Search R&D for a piece of ice',
    cost: [corePayment.toC('click', 1), corePayment.toC('credit', 1)],
    cancel: { ...coreShuffling.shuffleMyDeck, cost: [corePayment.toC('credit', 1), corePayment.toC('click', 1)], action: true },
    'keep-menu-open': ':while-clicks-left',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    choices: req(function*(state: State): Generator<any, any, any> {
      const ops = ((state as any).corp?.deck || []).filter((c: Card) => coreCard.operation(c))
        .sort((a: Card, b: Card) => ((a as any).title || '').localeCompare((b as any).title || ''));
      return [...ops, 'No action'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreCard.getCounters(card, ':credit') >= 8;
    }),
    cost: [corePayment.toC('click', 1)],
    prompt: 'How many hosted credits do you want to take?',
    choices: { counter: ':credit' },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
      `gain ${targets[0]} [Credits]`),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreSay.playSfx(state, ':corp', 'click-credit-3');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, targets[0])], []);
    }),
  }],
  events: [{
    event: ':corp-turn-begins',
    msg: 'place 2 [Credit] on itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.ice(((targets as any)[0] || {}).card);
    }),
    async: true,
    msg: 'give the Runner 1 tag',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.ice(((targets as any)[0] || {}).card);
      }),
      async: true,
      msg: 'give the Runner 1 tag',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1)], []);
      }),
    },
    {
      event: ':breach-server',
      interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
      req: req(function*(state: State): Generator<any, any, any> { return coreFlags.tagged(state); }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = (targets as any)[0] || {};
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            req: req(function*(s: State): Generator<any, any, any> {
              const numAccess = coreAccess.numCardsToAccess(s, ':runner', ctx.server, null);
              return coreFlags.tagged(s) &&
                (numAccess?.randomAccessLimit || 0) > 1 &&
                !coreAccess.getOnlyCardToAccess(s);
            }),
            msg: 'make the runner access 1 card fewer',
            effect: effect(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
              coreAccess.accessBonus(s, ':runner', ctx.server, -1);
            }),
          }, card, targets)], []);
      }),
    },
  ],
};
