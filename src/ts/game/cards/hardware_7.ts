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
import { installChoice, makeEidFn2, getDamageFn } from './_helpers';
import { drawAbility } from '../core/def_helpers';
import type { CardDef } from '../../types';

import { accessBonusFn, accessCardFn, addCounterFn, allActiveInstalledFn, breachAccessBonus, cancelable, cardFlagFn, chosenDamageFn, corpFn, drawFn, effectCompletedFn, enableRunnerDamageChoiceFn, enumerateCards, eventCountFn, firstEventFn, gainClicksFn, gainCreditsFn, getAutoresolveFn, getCardFn, getCounters, getOnlyCardToAccessFn, handSizeFn, hasAnySubtypeFn, hasSubtypeFn, iceFn, identifyMarkAbility, inCorpScoredFn, inDiscardFn, inHandFn, installedFn, isCentralFn, isTypeFn, linkPlusFn, loseTagsFn, markChangedEvent, moveFn, muPlusFn, neverFn, playSfx, programFn, quantify, registerEventsFn, reorderChoice, rezzedFn, runEventsFn, runnerCanChooseDamageFn, runnerCanPayAndInstallFn, runnerFn, runnerHandSizePlusFn, runnerInstallFn, sabotageAbility, sameCard, shuffleDeck, strToInt, successfulRunReplaceBreach, swapAgendasFn, systemMsg, targetServerFn, toC, trashFn, updateBreakerStrengthFn } from './hardware_1';
import { complementFn } from './hardware_6';

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
const eid: any = undefined as any;
const asyncResult: any = undefined as any;
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;
const side: any = undefined as any;
const ctx: any = undefined as any;
const card: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function setAutoresolveFn(_kw?: string, _name?: string): any { return {}; }
function countRealTagsFn(state: any): number { return ((state as any)?.runner?.tag?.base) || 0; }
function runFn(_server?: any, _opts?: any): any { return {}; }

// Silencer
export const silencer: CardDef = {
  title: 'Silencer',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const t = target;
        return eid['source-type'] === ':ability' &&
          hasSubtypeFn(t, 'Killer') && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Simulchip
export const simulchip: CardDef = {
  title: 'Simulchip',
  'static-abilities': [{
    type: ':card-ability-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const pred = (event: any[]) => event.some((t: any) => runnerFn(t.card) && installedFn(t.card) && programFn(t.card));
      return sameCard(card, (forms.context(state, card, targets) as any)?.card) &&
        (eventCountFn(state, null, 'runner-trash', pred) +
         eventCountFn(state, null, 'corp-trash', pred) +
         eventCountFn(state, null, 'game-trash', pred)) === 0;
    }),
    value: [toC(':program', 1)],
  }],
  abilities: [{
    async: true,
    label: 'Install a program from the heap',
    'change-in-game-state': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        return discard.some((c: Card) => programFn(c) &&
          runnerCanPayAndInstallFn(state, side, { ...eid, source: card, 'source-type': ':runner-install' }, c,
            { 'cost-bonus': -3, 'no-toast': true }));
      }),
    },
    cost: [toC(':trash-can')],
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; continue_ability({
      'show-discard': true,
      'waiting-prompt': true,
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          return inDiscardFn(target) && programFn(target) &&
            runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, target, { 'cost-bonus': -3 });
        }),
      },
      async: true,
      effect: effect(runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target, {
        'cost-bonus': -3,
        'msg-keys': { displayOrigin: true, installSource: card, 'include-cost-from-eid': eid },
      })),
    }, card, null); }),
  }],
};

// Skulljack
export const skulljack: CardDef = {
  title: 'Skulljack',
  'on-install': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }),
  },
  'static-abilities': [{ type: ':trash-cost', value: -1 }],
};

// Solidarity Badge
export const solidarityBadge: CardDef = {
  title: 'Solidarity Badge',
  events: [
    {
      event: 'runner-turn-begins',
      skippable: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return getCounters(getCardFn(state, card), 'power') > 0;
      }),
      async: true,
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return getCounters(getCardFn(state, card), 'power') > 0;
      }),
      prompt: 'Choose one',
      'waiting-prompt': true,
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const tags = countRealTagsFn(state);
        return ['Draw 1 card', ...(tags > 0 ? ['Remove 1 tag'] : []), 'Done'];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        if (target === 'Draw 1 card') {
          yield wait_for(state, [{ asyncResult: 'result' },
            addCounterFn(state, side, card, 'power', -1)], []);
          systemMsg(state, side, `uses ${card.title} to draw 1 card`);
          drawFn(state, ':runner', eid, 1);
        } else if (target === 'Remove 1 tag') {
          yield wait_for(state, [{ asyncResult: 'result' },
            addCounterFn(state, side, card, 'power', -1)], []);
          systemMsg(state, side, `uses ${card.title} to remove 1 tag`);
          loseTagsFn(state, ':runner', eid, 1);
        } else {
          effectCompletedFn(state, ':runner', eid);
        }
      }),
    },
    {
      event: 'runner-trash',
      async: true,
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targets.some((t: any) => corpFn(t.card)) &&
          firstEventFn(state, side, 'runner-trash',
            (t: any[]) => t.some((x: any) => corpFn(x.card)));
      }),
      msg: 'place 1 power counter on itself',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { addCounterFn(':runner', eid, card, 'power', 1); }),
    },
  ],
};

// Spinal Modem
export const spinalModem: CardDef = {
  title: 'Spinal Modem',
  'static-abilities': [muPlusFn(1)],
  recurring: 2,
  events: [{
    event: 'successful-trace',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !!runFn(state);
    }),
    msg: 'suffer 1 core damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }),
  }],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const t = target;
        return eid['source-type'] === ':ability' && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// Sports Hopper
export const sportsHopper: CardDef = {
  title: 'Sports Hopper',
  'static-abilities': [linkPlusFn(1)],
  abilities: [{
    ...drawAbility(3, null, {
      'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
      cost: [toC(':trash-can')],
    }),
  }],
};

// Spy Camera
export const spyCamera: CardDef = {
  title: 'Spy Camera',
  abilities: [
    {
      action: true,
      cost: [toC('click', 1)],
      'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
      async: true,
      label: 'Look at the top X cards of the stack',
      msg: 'look at the top X cards of the stack and rearrange them',
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const n = (allActiveInstalledFn(state, ':runner').filter((c: Card) => c.title === card.title)).length;
        const deck = runnerFn(state)?.deck || [];
        const from = deck.slice(0, n);
        if (from.length > 0) {
          continue_ability(state, side,
            reorderChoice(':runner', ':corp', from, 0, from.length, from),
            card, null);
        }
      }),
    },
    {
      label: 'Look at the top card of R&D',
      msg: 'look at the top card of R&D',
      cost: [toC(':trash-can')],
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability({
        prompt: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const corp = corpFn(state);
          const topCard = corp?.deck?.[0];
          return `The top card of R&D is ${topCard?.title || ''}`;
        }),
        choices: ['OK'],
      }, card, null); }),
    },
  ],
};

// Supercorridor
export const supercorridor: CardDef = {
  title: 'Supercorridor',
  'static-abilities': [
    muPlusFn(2),
    runnerHandSizePlusFn(1),
  ],
  events: [{
    event: 'runner-turn-ends',
    interactive: getAutoresolveFn('auto-fire', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-fire', neverFn),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const runner = runnerFn(state);
        const corp = corpFn(state);
        return (runner?.credit ?? 0) === (corp?.credit ?? 0);
      }),
      'waiting-prompt': true,
      prompt: 'Gain 2 [Credits]?',
      autoresolve: getAutoresolveFn('auto-fire'),
      'yes-ability': {
        msg: 'gain 2 [Credits]',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainCreditsFn(eid, 2); }),
      },
      'no-ability': { effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { systemMsg(`declines to use ${card.title}`); }) },
    },
  }],
  abilities: [{ ...setAutoresolveFn('auto-fire', 'Supercorridor') }],
};

// Swift
export const swift: CardDef = {
  title: 'Swift',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return hasSubtypeFn(ctx.card, 'Run') &&
        firstEventFn(state, side, 'play-event',
          (t: any[]) => t[0] && hasSubtypeFn((t[0] as any).card, 'Run'));
    }),
    msg: 'gain a [click]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainClicksFn(1); }),
  }],
};

// T400 Memory Diamond
export const t400MemoryDiamond: CardDef = {
  title: 'T400 Memory Diamond',
  'static-abilities': [
    muPlusFn(1),
    {
      type: ':hand-size',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return side === ':runner';
      }),
      value: 1,
    },
  ],
};

// The Gauntlet
export const theGauntlet: CardDef = {
  title: 'The Gauntlet',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.server === ':hq';
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const evs = runEventsFn(state, side, 'subroutines-broken');
      const relevant = evs.filter((ev: any) => {
        const ctx = ev[0];
        const t = getCardFn(state, ctx.ice);
        return ctx.allSubsBroken && (getCardFn(state, ctx.ice)) &&
          (coreBoard.getZone?.(t) === ':hq' || ctx.ice === ':hq');
      });
      const byCid = [...new Set(relevant.map((ev: any) => ev[0].card?.cid))];
      const bonusCount = byCid.length;
      accessBonusFn(state, ':runner', ':hq', bonusCount);
    }),
  }],
};

// The Personal Touch
export const thePersonalTouch: CardDef = {
  title: 'The Personal Touch',
  hosting: { card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && installedFn(c) },
  'on-install': { effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { updateBreakerStrengthFn(getCardFn(state, card)); }) },
  'static-abilities': [{
    type: ':breaker-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return sameCard(targets[0], card);
    }),
    value: 1,
  }],
};

// The Toolbox
export const theToolbox: CardDef = {
  title: 'The Toolbox',
  'static-abilities': [
    muPlusFn(2),
    linkPlusFn(2),
  ],
  recurring: 2,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const t = target;
        return eid['source-type'] === ':ability' && hasSubtypeFn(t, 'Icebreaker');
      }),
      type: ':recurring',
    },
  },
};

// The Tungsten Tailor
export const theTungstenTailor: CardDef = {
  title: 'The Tungsten Tailor',
  'static-abilities': [{
    type: ':ice-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      return iceFn(target);
    }),
    value: -1,
  }],
  events: [{
    event: 'subroutines-broken',
    async: true,
    'once-per-instance': true,
    automatic: ':gain-credits',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      const validCtx = (ctx: any) => ctx['was-zero-or-less-strength'];
      return targets.some(validCtx) &&
        firstEventFn(state, side, 'subroutines-broken',
          (t: any[]) => t[0] && validCtx(t[0]));
    }),
    msg: 'gain 1 [Credits]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainCreditsFn(state, side, eid, 1); }),
  }],
};

// The Wizard's Chest
export const theWizardsChest: CardDef = {
  title: "The Wizard's Chest",
  let: {
    searchFn: (state: State, side: Side, eid: EID, card: Card, remainder: Card[], type: string, revStr: string, firstCard: Card | null, secondCard: Card | null) => {
      if (remainder.length > 0) {
        const revealedCard = remainder[0];
        const restOfDeck = remainder.slice(1);
        const newRevStr = revStr ? `${revStr}, ${revealedCard.title}` : revealedCard.title;

        const isType = isTypeFn(revealedCard, type);

        if (isType) {
          if (!firstCard) {
            return theWizardsChest.let.searchFn(state, side, eid, card, restOfDeck, type, newRevStr, revealedCard, null);
          } else {
            return installChoice(state, side, eid, card, newRevStr, firstCard, revealedCard, null);
          }
        } else {
          return theWizardsChest.let.searchFn(state, side, eid, card, restOfDeck, type, newRevStr, firstCard, secondCard);
        }
      } else {
        if (!firstCard) {
          return continue_ability(state, side, {
            msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `reveal ${revStr} from the top of the stack`,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { shuffleDeck(':deck'); systemMsg('shuffles the Stack'); }),
          }, card, null);
        } else {
          return installChoice(state, side, eid, card, revStr, firstCard, secondCard, null);
        }
      }
    },
    installChoice: (state: State, side: Side, eid: EID, card: Card, revStr: string, firstCard: Card, secondCard: Card | null, remainder: Card[]) => {
      continue_ability(state, side, {
        prompt: 'Choose one',
        choices: [
          `Install ${firstCard.title}`,
          secondCard ? `Install ${secondCard.title}` : null,
          'No install',
        ].filter(Boolean),
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `reveal ${revStr} from the top of the stack`,
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          if (target !== 'No install') {
            yield wait_for(state, [{ asyncResult: 'result' },
              runnerInstallFn(state, side, makeEidFn2(state, { source: card, 'source-type': ':runner-install' }),
                target === `Install ${firstCard.title}` ? firstCard : secondCard,
                { 'ignore-all-cost': true, 'msg-keys': { displayOrigin: true, installSource: card } })], []);
            shuffleDeck(state, side, ':deck');
            systemMsg(state, side, 'shuffles the Stack');
            effectCompletedFn(state, side, eid);
          } else {
            shuffleDeck(state, side, ':deck');
            systemMsg(state, side, 'shuffles the Stack');
            effectCompletedFn(state, side, eid);
          }
        }),
      }, card, null);
    },
  },
  abilities: [{
    cost: [toC(':trash-can')],
    'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
    label: 'Set aside cards from the top of the stack',
    prompt: 'Choose a card type',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return cancelable(['Hardware', 'Program', 'Resource']);
    }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runner = runnerFn(state);
      const reg = runner?.reg || {};
      return (reg.successfulRun || []).some((s: any) => s === ':hq') &&
        (reg.successfulRun || []).some((s: any) => s === ':rd') &&
        (reg.successfulRun || []).some((s: any) => s === ':archives');
    }),
    async: true,
    effect: effect(
      (() => {
        const deck = runnerFn(state)?.deck || [];
        const type = target || 'Program';
        return theWizardsChest.let.searchFn(state, side, eid, card, deck, type, '', null, null);
      })()
    ),
  }],
};

// Time Bomb
export const timeBomb: CardDef = {
  title: 'Time Bomb',
  data: { counter: { power: 1 } },
  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const runner = runnerFn(state);
    const reg = runner?.reg || {};
    return (reg.successfulRun || []).some((s: any) => [':hq', ':rd', ':archives'].includes(s));
  }),
  events: [{
    event: 'runner-turn-begins',
    automatic: ':force-discard',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (getCounters(getCardFn(state, card), 'power') >= 3) {
        yield wait_for(state, [{ asyncResult: 'result' },
          trashFn(state, side, card, { causeCard: card })], []);
        continue_ability(state, side, sabotageAbility(3), card, null);
      } else {
        systemMsg(state, side, `uses ${card.title} to place 1 power counter on itself`);
        addCounterFn(state, side, eid, card, 'power', 1);
      }
    }),
  }],
};

// Titanium Ribs
export const titaniumRibs: CardDef = {
  title: 'Titanium Ribs',
  'on-install': {
    async: true,
    msg: 'suffer 2 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { enableRunnerDamageChoiceFn(); coreDamage.damage(eid, ':meat', 2, { unboostable: true, card: card }); }),
  },
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreUpdate.updateIn(state, ['damage'], (d: any) => { if (d) delete d['damage-choose-runner']; return d; });
  }),
  events: [{
    event: 'pre-resolve-damage',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.amount > 0) &&
        runnerCanChooseDamageFn(state) &&
        !(getDamageFn(state)?.['damage-replace']);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      const hand = runnerFn(state)?.hand || [];
      const dmg = ctx.amount ?? 0;
      continue_ability(state, ':runner', {
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0]; hand.length < dmg
          ? chosenDamageFn(':runner', hand)
          : {
              'waiting-prompt': true,
              prompt: `Choose ${quantify(dmg, 'card')} to trash for the ${ctx.damageType || 'damage'} damage`,
              choices: { max: dmg, all: true, card: (c: Card) => inHandFn(c) && runnerFn(c) },
              msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `trash ${enumerateCards(targets, ':sorted')}`,
              effect: effect(chosenDamageFn(':runner', targets)),
            }; }),
      }, card, null);
    }),
  }],
};

// Top Hat
export const topHat: CardDef = {
  title: 'Top Hat',
  events: [successfulRunReplaceBreach({
    targetServer: ':rd',
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = forms.run(state);
        const corp = corpFn(state);
        return (run?.maxAccess ?? 0) !== 0 && (corp?.deck?.length ?? 0) > 0;
      }),
      prompt: 'Which card from the top of R&D would you like to access? (Card 1 is on top)',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const corp = corpFn(state);
        return Array.from({ length: Math.min((corp?.deck?.length || 0), 5) }, (_, i) => String(i + 1));
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `only access the card at position ${target} of R&D`; })(); },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        if (getOnlyCardToAccessFn(state)) {
          effectCompletedFn(state, null, eid);
          return;
        }
        const corp = corpFn(state);
        const idx = strToInt(target) - 1;
        const cardToAccess = corp?.deck?.[idx];
        if (cardToAccess) {
          accessCardFn(state, side, eid, cardToAccess, 'an unseen card');
        }
      }),
    },
  })],
};

// Touchstone
export const touchstone: CardDef = {
  title: 'Touchstone',
  events: [{
    event: 'play-event',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return firstEventFn(state, side, 'play-event');
    }),
    async: true,
    silent: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { addCounterFn(state, side, eid, card, 'credit', 1); }),
  }],
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!runFn(state);
      }),
      type: ':credit',
    },
  },
};

// Turntable
export const turntable: CardDef = {
  title: 'Turntable',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'agenda-stolen',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !!(corpFn(state)?.scored?.length);
    }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability({
      'change-in-game-state': { silent: true },
      prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Swap ${(forms.context(state, card, targets) as any)?.card?.title || 'stolen agenda'} for an agenda in the Corp's score area?`,
      'yes-ability': {
        prompt: `Choose a scored Corp agenda to swap with ${(forms.context(state, card, targets) as any)?.card?.title || 'the stolen agenda'}`,
        choices: { card: (c: Card) => inCorpScoredFn(state, side, c) },
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `swap ${(forms.context(state, card, targets) as any)?.card?.title || 'stolen'} for ${target.title}`; })(); },
        effect: effect(swapAgendasFn(target, (forms.context(state, card, targets) as any)?.card)),
      },
    }, card, targets); }),
  }],
};

// Ubax
export const ubax: CardDef = {
  title: 'Ubax',
  let: {
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(state as any)['runner-phase-12'];
      }),
      automatic: ':draw-cards',
      msg: 'draw 1 card',
      label: 'Draw 1 card (start of turn)',
      once: ':per-turn',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(eid, 1); }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  flags: {
    'runner-turn-draw': true,
    'runner-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const identity = getCardFn(state, (state as any).runner?.identity);
      const allActive = allActiveInstalledFn(state, ':runner');
      const cards = [identity, ...allActive];
      return cards.filter((c: Card) => cardFlagFn(c, ':runner-turn-draw', true)).length > 1;
    }),
  },
  events: [{ event: 'runner-turn-begins', ...(forms.let?.ability || {}) }],
  abilities: [forms.let?.ability],
};

// Unregistered S&W '35
export const unregisteredSW: CardDef = {
  title: "Unregistered S&W '35",
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runner = runnerFn(state);
      const reg = runner?.reg || {};
      return (reg.successfulRun || []).some((s: any) => s === ':hq') &&
        allActiveInstalledFn(state, ':corp').some((c: Card) =>
          rezzedFn(c) && installedFn(c) &&
          hasAnySubtypeFn(c, ['Bioroid', 'Clone', 'Executive', 'Sysop']));
    }),
    label: 'trash a Bioroid, Clone, Executive or Sysop',
    prompt: 'Choose a Bioroid, Clone, Executive, or Sysop to trash',
    choices: { card: (c: Card) => rezzedFn(c) && installedFn(c) && hasAnySubtypeFn(c, ['Bioroid', 'Clone', 'Executive', 'Sysop']) },
    async: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `trash ${target.title}`; })(); },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; trashFn(eid, target, { causeCard: card }); }),
  }],
};

// Vigil
export const vigil: CardDef = {
  title: 'Vigil',
  let: {
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(state as any)['runner-phase-12'] &&
          (corpFn(state)?.hand?.length ?? 0) === handSizeFn(state, ':corp');
      }),
      automatic: ':draw-cards',
      msg: 'draw 1 card',
      label: 'Draw 1 card (start of turn)',
      once: ':per-turn',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(eid, 1); }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  events: [{ event: 'runner-turn-begins', ...(forms.let?.ability || {}) }],
  abilities: [forms.let?.ability],
};

// Virtuoso
export const virtuoso: CardDef = {
  title: 'Virtuoso',
  'static-abilities': [muPlusFn(1)],
  events: [
    markChangedEvent(),
    identifyMarkAbility(),
    {
      event: 'successful-run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return (ctx as any)['marked-server'] &&
          firstEventFn(state, side, 'successful-run',
            (t: any[]) => (t[0] || {})['marked-server']);
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        if (ctx.server?.[0] === ':hq') {
          systemMsg(state, side, `uses ${card.title} to access 1 additional card from HQ this run`);
          registerEventsFn(state, side, card, [breachAccessBonus(':hq', 1, { duration: ':end-of-run' })]);
          effectCompletedFn(state, side, eid);
        } else {
          systemMsg(state, side, `will use ${card.title} to breach HQ when this run ends`);
          registerEventsFn(state, side, card, [{
            event: 'run-ends',
            duration: ':end-of-run',
            async: true,
            interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
            msg: 'breach HQ',
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { breachServerFn(state, ':runner', eid, [':hq'], null); }),
          }]);
          effectCompletedFn(state, side, eid);
        }
      }),
    },
  ],
};

function breachServerFn(...args: any[]): void {
  (coreAccess.breachServer as any)?.(...args);
}

// WAKE Implant v2A-JRJ
export const wakeImplant: CardDef = {
  title: 'WAKE Implant v2A-JRJ',
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card }); }),
  },
  events: [
    {
      event: 'successful-run',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targetServerFn(forms.context(state, card, targets)) === ':hq';
      }),
      msg: 'place 1 power counter on itself',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { addCounterFn(state, ':runner', eid, card, 'power', 1, { placed: true }); }),
    },
    {
      event: 'breach-server',
      automatic: ':pre-breach',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.server === ':rd' && getCounters(card, 'power') > 0;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        continue_ability(state, side, {
          prompt: 'How many additional R&D accesses do you want to make?',
          choices: { number: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return Math.min(3, getCounters(card, 'power'));
          }), default: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return Math.min(3, getCounters(card, 'power'));
          }) },
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `access ${quantify(target, 'additional card')} from R&D`; },
          'waiting-prompt': true,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            accessBonusFn(state, ':runner', ':rd', Math.max(0, target));
            addCounterFn(state, ':runner', eid, card, 'power', -target, { placed: true });
          }),
        }, card, null);
      }),
    },
  ],
};

// Window
export const window: CardDef = {
  title: 'Window',
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
    'keep-menu-open': ':while-clicks-left',
    msg: 'draw 1 card from the bottom of the stack',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { moveFn((runnerFn(state)?.deck || []).slice(-1)[0], ':hand'); }),
  }],
};

// Zamba
export const zamba: CardDef = {
  title: 'Zamba',
  special: { 'auto-gain-credits': ':always' },
  implementation: 'Credit gain is automatic',
  'static-abilities': [muPlusFn(2)],
  abilities: [{ ...setAutoresolveFn('auto-gain-credits', 'Zamba gaining credits on expose') }],
  events: [{
    event: 'expose',
    interactive: getAutoresolveFn('auto-gain-credits', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-gain-credits', neverFn),
    async: true,
    optional: {
      'waiting-prompt': true,
      prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Gain ${(forms.context(state, card, targets) as any)?.cards?.length || 0} [Credits]?`,
      autoresolve: getAutoresolveFn('auto-gain-credits'),
      'yes-ability': {
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${(forms.context(state, card, targets) as any)?.cards?.length || 0} [Credits]`,
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainCreditsFn(eid, (forms.context(state, card, targets) as any)?.cards?.length || 0); }),
      },
    },
  }],
};

// Zenit Chip JZ-2MJ
export const zenitChip: CardDef = {
  title: 'Zenit Chip JZ-2MJ',
  'on-install': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }),
  },
  events: [{
    event: 'successful-run',
    automatic: ':draw-cards',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return isCentralFn(ctx.server) &&
        firstEventFn(state, side, 'successful-run',
          (t: any[]) => { const c = t[0]; return c && isCentralFn(c.server); });
    }),
    msg: 'draw 1 card',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(state, ':runner', eid, 1); }),
  }],
};

// Zer0
export const zer0: CardDef = {
  title: 'Zer0',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':net', 1)],
    once: ':per-turn',
    msg: 'gain 1 [Credits] and draw 2 cards',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      playSfx(state, side, 'professional-contacts');
      yield wait_for(state, [{ asyncResult: 'result' },
        gainCreditsFn(state, side, 1, { 'suppress-checkpoint': true })], []);
      drawFn(state, side, eid, 2);
    }),
  }],
};
