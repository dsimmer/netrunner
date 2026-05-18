/**
 * Hardware Cards
 * Ported from Clojure cards/hardware.clj to TypeScript
 *
 * Contains all Runner hardware card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
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
import * as coreVirus from '../core/virus';
import * as coreWinning from '../core/winning';
import * as coreSetAsideModule from '../core/set_aside';
import * as coreSabotage from '../core/sabotage';
import * as coreMark from '../core/mark';
import * as utils from '../utils';
import * as jintekiUtils from '../../jinteki/utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { preventUpToNDamageFn, coreChooseOneMod } from './_helpers';
import type { CardDef } from '../../types';

import { addCounterFn, allActiveInstalledFn, allInstalledFn, anyEffectsFn, asAgendaFn, breachAccessBonus, cardStr, corpFn, countVirusProgramsFn, damageNameFn, effectCompletedFn, enumerateCards, eventFn, exposeFn, facedownFn, faceupFn, firstEventFn, gainCreditsFn, getAutoresolveFn, getCardFn, getCounters, getCurrentEncounterFn, getSetAsideFn, hasSubtypeFn, hostFn, iceFn, inDiscardFn, installedFn, jackOutFn, linkPlusFn, loseCreditsFn, loseTagsFn, makeResultFn, moveFn, muPlusFn, noEventFn, offerJackOut, preventDamageFn, preventTagFn, preventableFn, programFn, quantify, removeOnce, resolveAbilityFn, resourceFn, rezzedFn, runnerCanPayAndInstallFn, runnerFn, runnerHandSizePlusFn, runnerInstallFn, sameCard, setAsideFn, shuffleDeck, systemMsg, targetServerFn, threatLevelFn, toC, trashFn, updateBreakerStrengthFn, updateFn, virusMuPlusFn, virusProgramFn, winFn } from './hardware_1';

// __cardScopeShim — placeholders for legacy literal-scope references
const state: any = undefined as any;
const side: any = undefined as any;
const eid: any = undefined as any;
const card: any = undefined as any;
const target: any = undefined as any;
const targets: any = undefined as any;
const ctx: any = undefined as any;
const asyncResult: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function setAutoresolveFn(_kw?: string, _name?: string): any { return {}; }
function countRealTagsFn(state: any): number { return ((state as any)?.runner?.tag?.base) || 0; }
function runFn(_server?: any, _opts?: any): any { return {}; }

// Feedback Filter
export const feedbackFilter: CardDef = {
  title: 'Feedback Filter',
  prevention: [
    {
      prevents: 'damage',
      type: 'ability',
      label: 'Feedback Filter (Net)',
      ability: {
        async: true,
        cost: [toC('credit', 3)],
        msg: 'prevent 1 net damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.type === 'net' || ctx.type === ':net') && preventableFn(ctx);
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          preventDamageFn(state, side, eid, 1);
        }),
      },
    },
    {
      prevents: 'damage',
      type: 'ability',
      label: 'Feedback Filter (Core)',
      ability: {
        ...preventUpToNDamageFn(2, [':brain', ':core']),
        cost: [toC(':trash-can')],
      },
    },
  ],
};

// Flame-out
export const flameOut: CardDef = {
  title: 'Flame-out',
  implementation: 'Credit usage restriction not enforced',
  'static-abilities': [{
    type: ':can-host',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      return programFn(target);
    }),
    'max-cards': 1,
  }],
  data: { counter: { credit: 9 } },
  abilities: [
    {
      label: 'Take 1 hosted [Credits]',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return !!(hosted?.length && getCounters(card, 'credit') > 0);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        systemMsg(state, ':runner', 'takes 1 hosted [Credits] from Flame-out');
        // Register flame-out effect
        const cardObj = getCardFn(state, card);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        (corePayment as any).spendCredits?.(state, side, eid, card, 'credit', 1);
      }),
    },
    {
      label: 'Take all hosted [Credits]',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted;
        return !!(hosted?.length && getCounters(card, 'credit') > 0);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const credits = getCounters(card, 'credit');
        systemMsg(state, ':runner', `takes ${credits} hosted [Credits] from Flame-out`);
        const cardObj = getCardFn(state, card);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        coreDefHelpers.takeCredits(state, side, eid, card, 'credit', ':all');
      }),
    },
  ],
  events: [
    {
      event: 'runner-turn-ends',
      automatic: ':last',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        return cardObj?.special?.['flame-out-trigger'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        updateFn(state, side, { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': false } });
        const cardObj2 = getCardFn(state, card);
        const hosted = cardObj2?.hosted?.[0];
        if (hosted) {
          systemMsg(state, ':runner', `trashes ${hosted.title} from Flame-out`);
          trashFn(state, side, eid, hosted, { causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
    {
      event: 'corp-turn-ends',
      automatic: ':last',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        return cardObj?.special?.['flame-out-trigger'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        updateFn(state, side, { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': false } });
        const cardObj2 = getCardFn(state, card);
        const hosted = cardObj2?.hosted?.[0];
        if (hosted) {
          systemMsg(state, ':runner', `trashes ${hosted.title} from Flame-out`);
          trashFn(state, side, eid, hosted, { causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const host = forms.host?.(state, cardObj);
        return eid['source-type'] === ':ability' &&
          host && sameCard(cardObj, host) &&
          getCounters(cardObj, 'credit') > 0;
      }),
      'custom-amount': 1,
      'custom': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        yield wait_for(state, [{ asyncResult: 'result' },
          addCounterFn(state, side, cardObj, 'credit', -1, { 'suppress-checkpoint': true })], []);
        coreUpdate.update(state, ':runner', { ...cardObj, special: { ...cardObj.special, 'flame-out-trigger': true } });
        effectCompletedFn(state, side, makeResultFn(eid, 1));
      }),
      type: ':custom',
    },
  },
};

// Flip Switch
export const flipSwitch: CardDef = {
  title: 'Flip Switch',
  events: [{
    event: 'initialize-trace',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).activePlayer === ':runner';
      }),
      'waiting-prompt': true,
      prompt: 'Trash Flip Switch to reduce the base trace strength to 0?',
      'yes-ability': {
        msg: 'reduce the base trace strength to 0',
        cost: [toC(':trash-can')],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          coreUpdate.updateIn(state, [':trace', 'force-base'], () => 0);
        }),
      },
    },
  }],
  abilities: [
    {
      label: 'Jack out',
      'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runFn(state) || getCurrentEncounterFn(state)); }) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).activePlayer === ':runner';
      }),
      msg: 'jack out',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { jackOutFn(eid); }),
    },
    {
      label: 'Remove 1 tag',
      'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return countRealTagsFn(state) > 0; }) },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).activePlayer === ':runner';
      }),
      msg: 'remove 1 tag',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { loseTagsFn(eid, 1); }),
    },
  ],
};

// Forger
export const forger: CardDef = {
  title: 'Forger',
  events: [(coreChooseOneMod as any).chooseOneHelper(
    {
      event: 'tag-interrupt',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(getPreventFn(state)?.tag?.remaining > 0 &&
          !anyEffectsFn(state, side, ':prevent-paid-ability', true, card, [
            { msg: 'avoid 1 tag', label: 'Avoid 1 tag', async: true, cost: [toC(':trash-can')],
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { preventTagFn(':runner', eid, 1); }) },
            0
          ]));
      }),
      optional: true,
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    },
    [{
      option: 'Avoid 1 tag',
      cost: [toC(':trash-can')],
      ability: { msg: 'avoid 1 tag', label: 'Avoid 1 tag', async: true, cost: [toC(':trash-can')],
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { preventTagFn(':runner', eid, 1); }) },
      }
    ])
  ],
  'static-abilities': [linkPlusFn(1)],
  abilities: [{
    msg: 'remove 1 tag',
    label: 'Remove 1 tag',
    cost: [toC(':trash-can')],
    'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return countRealTagsFn(state) > 0; }) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { loseTagsFn(eid, 1); }),
  }],
};

export function getPreventFn(state: State): any {
  return (state as any).prevent;
}

// Friday Chip
export const fridayChip: CardDef = {
  title: 'Friday Chip',
  abilities: [{
    ...setAutoresolveFn('auto-fire', 'Friday Chip placing virus counters on itself'),
  }],
  special: { 'auto-fire': ':always' },
  events: [{
    event: 'runner-turn-begins',
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `move 1 virus counter to ${target.title}`; })(); },
    skippable: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (getCounters(card, 'virus') > 0 && countVirusProgramsFn(state) > 0);
    }),
    choices: { card: virusProgramFn },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        addCounterFn(state, ':runner', card, 'virus', -1, { 'suppress-checkpoint': true })], []);
      addCounterFn(state, ':runner', eid, target, 'virus', 1);
    }),
  }, {
    event: 'runner-trash',
    'once-per-instance': true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return targets.some((t: any) => corpFn(t.card));
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const amtTrashed = targets.filter((t: any) => corpFn(t.card)).length;
      const singAb = {
        optional: {
          prompt: `Place a virus counter on ${card.title}?`,
          autoresolve: getAutoresolveFn('auto-fire'),
          'yes-ability': {
            async: true,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { systemMsg(':runner', `uses ${card.title} to place 1 virus counter on itself`); addCounterFn(':runner', eid, card, 'virus', 1); }),
          },
        },
      };
      const multAb = {
        prompt: `Place virus counters on ${card.title}?`,
        choices: { number: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return amtTrashed; }), default: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return amtTrashed; }) },
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; systemMsg(':runner', `uses ${card.title} to place ${quantify(target, 'virus counter')} on itself`); addCounterFn(':runner', eid, card, 'virus', target); }),
      };
      const ab = amtTrashed > 1 ? multAb : singAb;
      continue_ability(state, side, ab, card, targets);
    }),
  }],
};

// Gachapon
export const gachapon: CardDef = {
  title: 'Gachapon',
  abilities: [{
    label: 'Install a card from among the top 6 cards of the stack',
    'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
    cost: [toC(':trash-can')],
    async: true,
    'waiting-prompt': true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const deck = runnerFn(state)?.deck || [];
      setAsideFn(state, side, eid, deck.slice(0, 6));
      const setAsideCards = getSetAsideFn(state, side, eid).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      systemMsg(state, side, `${(eid as any).latestPaymentStr || 'The player'} to use ${card.title} to set aside ${enumerateCards(setAsideCards)} from the top of the stack`);
      yield wait_for(state, [{ asyncResult: 'result' },
        resolveAbilityFn(state, side, {
          async: true,
          prompt: `The set aside cards are: ${enumerateCards(setAsideCards)}`,
          choices: ['OK'],
        }, card, null)], []);

      const installFn = (setAsideCards: Card[]) => ({
        prompt: 'Choose a card to install',
        async: true,
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const validCards = setAsideCards.filter((c: Card) =>
            (programFn(c) || (resourceFn(c) && hasSubtypeFn(c, 'Virtual'))) &&
            runnerCanPayAndInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, c,
              { 'cost-bonus': -2, 'no-toast': true }));
          return [...validCards, 'Done'];
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          if (target === 'Done') {
            continue_ability(state, side, shuffleNextFn(setAsideCards, null, null), card, null);
            return;
          }
          const setAsideCards2 = removeOnce(setAsideCards, target);
          const newEid = { ...eid, source: card, 'source-type': ':runner-install' };
          yield wait_for(state, [{ asyncResult: 'result' },
            runnerInstallFn(state, side, newEid, target, {
              'cost-bonus': -2,
              'msg-keys': { installSource: card, displayOrigin: true },
            })], []);
          continue_ability(state, side, shuffleNextFn(setAsideCards2, null, null), card, null);
        }),
      });

      const shuffleNextFn = (setAsideCards: Card[], chosenCard: Card | null, toShuffle: Card[] | null) => ({
        prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
          if (finished) {
            return `Removing: ${enumerateCards(setAsideCards, ':sorted')}[br]Shuffling: ${enumerateCards(toShuffle || [], ':sorted')}`;
          }
          return `Choose ${3 - (toShuffle?.length || 0)} more cards to shuffle back.${toShuffle?.length ? '[br]Currently shuffling back: ' + enumerateCards(toShuffle, ':sorted') : ''}`;
        },
        async: true,
        'not-distinct': true,
        choices: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> {
          const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
          return finished ? ['Done', 'Start over'] : setAsideCards;
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
          if (finished) {
            if (target === 'Done') {
              continue_ability(state, side, shuffleEndFn(setAsideCards, toShuffle || []), card, null);
            } else if (target === 'Start over') {
              continue_ability(state, side, shuffleNextFn(
                [...(setAsideCards || [])],
                null,
                [...(toShuffle || [])]
              ), card, null);
            }
          } else if (target) {
            const newSetAside = removeOnce(setAsideCards, target);
            const newToShuffle = [...(toShuffle || []), target];
            continue_ability(state, side, shuffleNextFn(newSetAside, target, newToShuffle), card, null);
          }
        }),
      });

      const shuffleEndFn = (removeFromGame: Card[], shuffleBack: Card[]) => ({
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `shuffle ${enumerateCards(shuffleBack, ':sorted')} into the stack and remove ${enumerateCards(removeFromGame, ':sorted')} from the game`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          for (const c of removeFromGame) {
            moveFn(state, side, c, ':rfg');
          }
          for (const c of shuffleBack) {
            moveFn(state, side, c, ':deck');
          }
          shuffleDeck(state, side, ':deck');
        }),
      });

      continue_ability(state, side, installFn(setAsideCards), card, null);
    }),
  }],
};

function shuffleNextFn(setAsideCards: Card[], chosenCard: Card | null, toShuffle: Card[]): any {
  return {
    prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const finished = toShuffle?.length >= 3 || setAsideCards.length === 0;
      if (finished) {
        return `Removing: ${enumerateCards(setAsideCards, ':sorted')}[br]Shuffling: ${enumerateCards(toShuffle || [], ':sorted')}`;
      }
      return `Choose ${3 - (toShuffle?.length || 0)} more cards to shuffle back.${toShuffle?.length ? '[br]Currently shuffling back: ' + enumerateCards(toShuffle, ':sorted') : ''}`;
    },
    async: true,
    'not-distinct': true,
    choices: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> {
      const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
      return finished ? ['Done', 'Start over'] : setAsideCards;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const finished = (toShuffle?.length ?? 0) >= 3 || setAsideCards.length === 0;
      if (finished) {
        if (target === 'Done') {
          continue_ability(state, side, shuffleEndFn(setAsideCards, toShuffle || []), card, null);
        } else if (target === 'Start over') {
          continue_ability(state, side, shuffleNextFn(
            [...(setAsideCards || [])],
            null,
            [...(toShuffle || [])]
          ), card, null);
        }
      } else if (target) {
        const newSetAside = removeOnce(setAsideCards, target);
        const newToShuffle = [...(toShuffle || []), target];
        continue_ability(state, side, shuffleNextFn(newSetAside, target, newToShuffle), card, null);
      }
    }),
  };
}

function shuffleEndFn(removeFromGame: Card[], shuffleBack: Card[]): any {
  return {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `shuffle ${enumerateCards(shuffleBack, ':sorted')} into the stack and remove ${enumerateCards(removeFromGame, ':sorted')} from the game`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      for (const c of removeFromGame) {
        moveFn(state, side, c, ':rfg');
      }
      for (const c of shuffleBack) {
        moveFn(state, side, c, ':deck');
      }
      shuffleDeck(state, side, ':deck');
    }),
  };
}

// GAMEDRAGON™ Pro
export const gamedragonPro: CardDef = {
  title: 'GAMEDRAGON™ Pro',
  'on-install': {
    prompt: 'Choose an icebreaker to host GAMEDRAGON™ Pro',
    event: 'runner-turn-begins',
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const allInst = allInstalledFn(state, ':runner');
        return allInst.some((c: Card) =>
          programFn(c) && !hasSubtypeFn(c, 'AI') && !sameCard(c, card) && hasSubtypeFn(c, 'Icebreaker'));
      }),
    },
    'waiting-prompt': true,
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        return installedFn(target) && programFn(target) && !hasSubtypeFn(target, 'AI') && hasSubtypeFn(target, 'Icebreaker');
      }),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; hostFn(state, side, target, card); }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `host itself on ${target.title}`; })(); },
  },
  events: [
    {
      event: 'runner-turn-begins',
      prompt: 'Choose an icebreaker to host GAMEDRAGON™ Pro',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const allInst = allInstalledFn(state, ':runner');
          return allInst.some((c: Card) =>
            programFn(c) && !hasSubtypeFn(c, 'AI') && !sameCard(c, card) && hasSubtypeFn(c, 'Icebreaker'));
        }),
      },
      'waiting-prompt': true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          return installedFn(target) && programFn(target) && !hasSubtypeFn(target, 'AI') && hasSubtypeFn(target, 'Icebreaker');
        }),
      },
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; hostFn(state, side, target, card); }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `host itself on ${target.title}`; })(); },
    },
    {
      event: 'pump-breaker',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return sameCard((forms.context(state, card, targets) as any)?.card, card);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const newPump = { ...ctx.effect, duration: ':end-of-run' };
        const effects = (state as any).effects || [];
        const filtered = effects.filter((e: any) => e.uuid !== newPump.uuid);
        (state as any).effects = [...filtered, newPump];
        updateBreakerStrengthFn(state, side, (forms.context(state, card, targets) as any)?.card);
      }),
    },
  ],
  'static-abilities': [{
    type: ':breaker-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return sameCard(targets[0], card);
    }),
    value: 1,
  }],
};

// Gebrselassie
export const gebrselassie: CardDef = {
  title: 'Gebrselassie',
  abilities: [{
    action: true,
    msg: 'host itself on an installed non-AI icebreaker',
    cost: [toC('click', 1)],
    choices: { card: (c: Card) => installedFn(c) && hasSubtypeFn(c, 'Icebreaker') && !hasSubtypeFn(c, 'AI') },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const host = getCardFn(state, card);
      // Remove original-duration effects
      const effects = (state as any).effects || [];
      const newEffects = effects.reduce((acc: any[], e: any) => {
        if (sameCard(host, e.card) && e.type === ':breaker-strength' && e['original-duration']) {
          acc.push({ ...e, duration: e['original-duration'], 'original-duration': undefined });
        } else {
          acc.push(e);
        }
        return acc;
      }, []);
      (state as any).effects = newEffects;
      updateBreakerStrengthFn(state, side, host);
      hostFn(state, side, target, card);
    }),
  }],
  events: [{
    event: 'pump-breaker',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return sameCard((forms.context(state, card, targets) as any)?.card, card);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      const effects = (state as any).effects || [];
      const lastPump = { ...ctx.effect, duration: ':end-of-turn', 'original-duration': effects[effects.length - 1]?.duration };
      const filtered = effects.filter((e: any) => e.uuid !== lastPump.uuid);
      (state as any).effects = [...filtered, lastPump];
      updateBreakerStrengthFn(state, side, (forms.context(state, card, targets) as any)?.card);
    }),
  }],
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const host = getCardFn(state, card);
    const effects = (state as any).effects || [];
    const newEffects = effects.reduce((acc: any[], e: any) => {
      if (sameCard(host, e.card) && e.type === ':breaker-strength' && e['original-duration']) {
        acc.push({ ...e, duration: e['original-duration'], 'original-duration': undefined });
      } else {
        acc.push(e);
      }
      return acc;
    }, []);
    (state as any).effects = newEffects;
    updateBreakerStrengthFn(state, side, host);
  }),
};

// Ghosttongue
export const ghosttongue: CardDef = {
  title: 'Ghosttongue',
  'on-install': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }),
  },
  'static-abilities': [{
    type: ':play-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      return eventFn(target);
    }),
    value: -1,
  }],
};

// GPI Net Tap
export const gpiNetTap: CardDef = {
  title: 'GPI Net Tap',
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const run = forms.run(state);
      return run?.phase === ':approach-ice' &&
        iceFn(forms.currentIce?.(state)) &&
        !rezzedFn(forms.currentIce?.(state));
    }),
    label: 'expose approached ice',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        exposeFn(state, side, coreEid.makeEID(state, eid), [forms.currentIce?.(state)])], []);
      continue_ability(state, side, offerJackOut(), card, null);
    }),
  }],
};

// Grimoire
export const grimoire: CardDef = {
  title: 'Grimoire',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'runner-install',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return hasSubtypeFn(ctx.card, 'Virus');
    }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { addCounterFn(eid, (forms.context(state, card, targets) as any)?.card, 'virus', 1); }),
  }],
};

// Heartbeat
export const heartbeat: CardDef = {
  title: 'Heartbeat',
  'static-abilities': [muPlusFn(1)],
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    label: 'Heartbeat',
    ability: {
      async: true,
      cost: [toC(':trash-installed', 1)],
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent 1 ${damageNameFn(state)} damage`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return preventableFn(forms.context(state, card, targets));
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        preventDamageFn(state, side, eid, 1);
      }),
    },
  }],
};

// Hermes
export const hermes: CardDef = {
  title: 'Hermes',
  let: {
    ability: {
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      prompt: 'Choose an unrezzed card',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const allInst = allActiveInstalledFn(state, ':corp');
          return allInst.some((c: Card) => !faceupFn(c) && installedFn(c));
        }),
      },
      'waiting-prompt': true,
      choices: { card: (c: Card) => !faceupFn(c) && installedFn(c) && corpFn(c), all: true },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `add ${cardStr(state, target)} to HQ`; },
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; moveFn(':corp', target, ':hand'); }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  events: [
    { event: 'agenda-scored', ...(forms.ability || {}) },
    { event: 'agenda-stolen', ...(forms.ability || {}) },
  ],
};

// Hijacked Router
export const hijackedRouter: CardDef = {
  title: 'Hijacked Router',
  events: [
    {
      event: 'server-created',
      msg: 'force the Corp to lose 1 [Credits]',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { loseCreditsFn(':corp', eid, 1); }),
    },
    {
      event: 'successful-run',
      skippable: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return targetServerFn(forms.context(state, card, targets)) === ':archives';
        }),
        prompt: `Trash ${card.title} to force the Corp to lose 3 [Credits]?`,
        'yes-ability': {
          async: true,
          msg: 'force the Corp to lose 3 [Credits]',
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              trashFn(state, ':runner', card, { unpreventable: true, causeCard: card })], []);
            loseCreditsFn(state, ':corp', eid, 3);
          }),
        },
      },
    },
  ],
};

// Hippo
export const hippo: CardDef = {
  title: 'Hippo',
  events: [{
    event: 'subroutines-broken',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const pred = (c: any) => c.allSubsBroken && c.outermost && c['during-run'] && c['on-attacked-server'];
        return pred(ctx) &&
          getCardFn(state, ctx.ice) &&
          firstEventFn(state, side, 'subroutines-broken',
            (t: any[]) => { const c = t[0]; return c && pred(c); });
      }),
      prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Remove this hardware from the game to trash ${(forms.context(state, card, targets) as any)?.ice?.title || 'the ice'}?`,
      'yes-ability': {
        async: true,
        cost: [toC(':remove-from-game')],
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `trash ${cardStr(state, (forms.context(state, card, targets) as any)?.ice)}`,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { trashFn(eid, (forms.context(state, card, targets) as any)?.ice, { causeCard: card }); }),
      },
    },
  }],
};

// Hippocampic Mechanocytes
export const hippocampicMechanocytes: CardDef = {
  title: 'Hippocampic Mechanocytes',
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card }); }),
  },
  data: { counter: { power: 2 } },
  'static-abilities': [runnerHandSizePlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return getCounters(card, 'power');
  }))],
};

// HQ Interface
export const hqInterface: CardDef = {
  title: 'HQ Interface',
  events: [breachAccessBonus(':hq', 1)],
};

// Jeitinho
export const jeitinho: CardDef = {
  title: 'Jeitinho',
  events: [
    {
      event: 'bypassed-ice',
      location: ':discard',
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return threatLevelFn(3, state) && inDiscardFn(card);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        continue_ability(state, side, {
          optional: {
            prompt: 'Install this hardware from the heap?',
            'yes-ability': {
              cost: [toC(':lose-click', 1)],
              async: true,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                const runner = runnerFn(state);
                const discard = runner?.discard || [];
                const targetCard = discard.find((c: Card) => c['printed-title'] === card['printed-title']);
                if (targetCard) {
                  runnerInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, targetCard, {
                    'msg-keys': { displayOrigin: true, installSource: card },
                  });
                }
              }),
            },
          },
        }, card, null);
      }),
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return installedFn(card) &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':hq') &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':rd') &&
          (runnerFn(state)?.reg?.successfulRun || []).some((s: any) => s === ':archives');
      }),
      msg: 'add itself to the score area as an assassination agenda worth 0 agenda points',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        asAgendaFn(state, ':runner', card, 0);
        const scored = (state as any).runner?.scored || [];
        const matchingCount = scored.filter((c: Card) => c['printed-title'] === card['printed-title']).length;
        if (matchingCount === 3) {
          systemMsg(state, side, 'wins the game');
          winFn(state, ':runner', 'assassination plot (Jeitinho)');
          effectCompletedFn(state, side, eid);
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

// Keiko
export const keiko: CardDef = {
  title: 'Keiko',
  'static-abilities': [muPlusFn(2)],
  events: [
    {
      event: 'spent-credits-from-card',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const companionPred = (c: Card) => !facedownFn(c) && hasSubtypeFn(c, 'Companion');
        const validCtx = (targets: any[]) => targets.some((t: any) => {
          const c = t.card;
          return runnerFn(c) && installedFn(c) && companionPred(c);
        });
        return validCtx(targets) &&
          firstEventFn(state, side, 'spent-credits-from-card', validCtx) &&
          noEventFn(state, side, 'runner-install',
            (t: any[]) => t[0] && t[0].card && companionPred(t[0].card));
      }),
      msg: 'gain 1 [Credit]',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainCreditsFn(':runner', eid, 1); }),
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const companionPred = (c: Card) => !facedownFn(c) && hasSubtypeFn(c, 'Companion');
        const validCtx = (targets: any[]) => targets.some((t: any) => {
          const c = t.card;
          return runnerFn(c) && installedFn(c) && companionPred(c);
        });
        return companionPred(ctx.card) &&
          firstEventFn(state, side, 'runner-install', validCtx) &&
          noEventFn(state, side, 'spent-credits-from-card', validCtx);
      }),
      msg: 'gain 1 [Credit]',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainCreditsFn(':runner', eid, 1); }),
    },
  ],
};

// Knobkierie
export const knobkierie: CardDef = {
  title: 'Knobkierie',
  'static-abilities': [virusMuPlusFn(3)],
  events: [{
    event: 'successful-run',
    skippable: true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return firstEventFn(state, ':runner', 'successful-run') &&
          countVirusProgramsFn(state) > 0;
      }),
      prompt: 'Place 1 virus counter?',
      autoresolve: getAutoresolveFn('auto-fire'),
      'yes-ability': {
        prompt: 'Choose an installed virus program to place 1 virus counter on',
        choices: { card: (c: Card) => installedFn(c) && hasSubtypeFn(c, 'Virus') && programFn(c) },
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `place 1 virus counter on ${target.title}`; })(); },
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; addCounterFn(eid, target, 'virus', 1); }),
      },
    },
  }],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'Knobkierie') }],
};
