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
import { autoIcebreakerFn, targetFn } from './_helpers';
import type { CardDef } from '../../types';

import { accessBonusFn, addCounterFn, allActiveInstalledFn, anySubsBrokenFn, breachAccessBonus, breakSubFn, bypassIceFn, canTriggerFn, cardStr, corpFn, damageTypeFn, derezFn, drawFn, effectCompletedFn, endRunFn, eventFn, faceupFn, firstEventFn, gainCreditsFn, gainTagsFn, getAutoresolveFn, getCardFn, getCounters, getLinkFn, hardwareFn, hasSubtypeFn, iceFn, inHandFn, inHandStarFn, installedFn, isTaggedFn, linkPlusFn, lookAtTheTop, makeResultFn, makeRunFn, millFn, moveFn, muPlusFn, neverFn, playInstantFn, playTieredSfx, preventDamageFn, preventTagFn, preventUpToNDamageFn, preventableFn, programFn, pumpFn, quantify, registerEventsFn, registerLingeringEffectFn, registerOnceFn, resolveAbilityFn, revealFn, rezCostFn, runnerCanPayAndInstallFn, runnerFn, runnerInstallFn, sameCard, shuffleDeck, successfulRunReplaceBreach, systemMsg, targetServerFn, toC, trashCardsFn, trashFn, trashOnEmptyFn, triggerEventFn, unregisterEffectByUuidFn, updateBreakerStrengthFn, zoneNameFn } from './hardware_1';

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const state: any = undefined as any;
const target: any = undefined as any;

// Stub helpers (to be ported from clj cards/*.clj)
function setAutoresolveFn(_kw?: string, _name?: string): any { return {}; }
function runFn(_server?: any, _opts?: any): any { return {}; }

export function complementFn(fn: any): any {
  return (...args: any[]) => !fn(...args);
}

// Patchwork
export const patchwork: CardDef = {
  title: 'Patchwork',
  let: {
    installWord: (c: Card) => eventFn(c) ? 'play' : 'install',
    patchworkAbility: { once: ':per-turn',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreUpdate.updateIn(card, ['special', 'patchwork'], () => true); }) },
    patchworkManualPrognosis: {
      cost: [toC('click', 1)],
      action: true,
      once: ':per-turn',
      label: 'Manually resolve patchwork',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(runnerFn(state)?.hand?.length &&
          canTriggerFn(state, side, eid, forms.let?.patchworkAbility, card, targets));
      }),
      prompt: 'Designate a card to play or install',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          return runnerFn(target) && inHandStarFn(state, target);
        }),
      },
      'waiting-prompt': true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const toPlay = target;
        continue_ability(state, side, {
          prompt: 'Designate a card to trash',
          choices: { card: (c: Card) => runnerFn(c) && inHandFn(c), all: true },
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            registerOnceFn(state, side, forms.let?.patchworkAbility, card);
            const toTrash = target;
            continue_ability(state, side,
              sameCard(toTrash, toPlay)
                ? { msg: `trash ${toTrash.title} from the Grip, and is no longer able to ${forms.let?.installWord?.(toPlay)} it`,
                    async: true,
                    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { trashFn(state, side, eid, toTrash, { causeCard: card }); }) }
                : { msg: `trash ${toTrash.title} to ${forms.let?.installWord?.(toPlay)} ${toPlay.title} from the Grip, paying 2 [Credits] less`,
                    async: true,
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                      yield wait_for(state, [{ asyncResult: 'result' },
                        trashFn(state, side, eid, toTrash, { causeCard: card })], []);
                      if (eventFn(toPlay)) {
                        playInstantFn(state, ':runner', eid, toPlay, { 'cost-bonus': -2 });
                      } else {
                        runnerInstallFn(state, ':runner', eid, toPlay, { 'cost-bonus': -2 });
                      }
                    }),
                  },
              card, null);
          }),
        }, card, null);
      }),
    },
  },
  'static-abilities': [muPlusFn(1)],
  abilities: [forms.let?.patchworkManualPrognosis],
  implementation: 'click on patchwork to manually resolve it (for tricks)',
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const srcType = eid['source-type'];
        return (srcType === ':play' || srcType === 'play' || srcType === ':runner-install' || srcType === 'runner-install') &&
          !!(runnerFn(state)?.hand?.length - 1 >= 0) && // at least one card other than target
          !card?.special?.patchwork &&
          canTriggerFn(state, side, eid, forms.let?.patchworkAbility, card, targets);
      }),
      'custom-amount': 2,
      'custom': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const costType = (eid['source-type'] === ':play' ? 'play' : eid['source-type'] === ':runner-install' ? 'install' : '');
        const targetCard = target;
        continue_ability(state, side, {
          prompt: `Trash a card to lower the ${costType} cost of ${targetCard.title} by 2 [Credits]`,
          async: true,
          choices: { card: (c: Card) => inHandFn(c) && runnerFn(c) && !sameCard(c, targetCard) },
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `trash ${target?.title || ''} to lower the ${costType} cost of ${targetCard?.title || ''} by 2 [Credits]`; })(); },
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              trashFn(state, side, eid, target, { unpreventable: true, causeCard: card })], []);
            registerOnceFn(state, side, forms.let?.patchworkAbility, card);
            effectCompletedFn(state, side, makeResultFn(eid, 2));
          }),
          cancel: {
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              effectCompletedFn(state, side, makeResultFn(eid, 0));
            }),
          },
        }, card, null);
      }),
      type: ':custom',
      'cost-reduction': true,
    },
  },
};

// Pennyshaver
export const pennyshaver: CardDef = {
  title: 'Pennyshaver',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'successful-run',
    silent: true,
    async: true,
    msg: 'place 1 [Credits]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      addCounterFn(state, ':runner', eid, card, 'credit', 1);
    }),
  }],
  abilities: [{
    action: true,
    cost: [toC('click', 1)],
    label: 'Gain 1 [Credits]. Take all hosted credits',
    async: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${1 + (getCounters(card, 'credit') ?? 0)} [Credits]`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const credits = 1 + (getCounters(card, 'credit') ?? 0);
      playTieredSfx(state, side, 'click-credit', credits, 3);
      yield wait_for(state, [{ asyncResult: 'result' },
        addCounterFn(state, side, card, 'credit', (credits - 1) * -1)], []);
      gainCreditsFn(state, ':runner', eid, credits);
    }),
  }],
};

// Plascrete Carapace
export const plascreteCarapace: CardDef = {
  title: 'Plascrete Carapace',
  data: { counter: { power: 4 } },
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      cost: [toC('power', 1)],
      msg: 'prevent 1 meat damage',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return preventableFn(ctx) && (ctx.type === 'meat' || ctx.type === ':meat');
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        preventDamageFn(state, side, eid, 1);
      }),
    },
  }],
  events: [trashOnEmptyFn('power')],
};

// Poison Vial
export const poisonVial: CardDef = {
  title: 'Poison Vial',
  ...autoIcebreakerFn({
    data: { counter: { power: 3 } },
    events: [trashOnEmptyFn('power')],
    abilities: [breakSubFn(toC('power', 1), 2, 'All', {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return anySubsBrokenFn(forms.currentIce?.(state));
      }),
    })],
  }),
};

// Polyhistor
export const polyhistor: CardDef = {
  title: 'Polyhistor',
  let: {
    abi: {
      optional: {
        prompt: 'Draw 1 card to force the Corp to draw 1 card?',
        'waiting-prompt': true,
        'yes-ability': {
          msg: 'draw 1 card and force the Corp to draw 1 card',
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' }, drawFn(state, ':runner', 1)], []);
            drawFn(state, ':corp', eid, 1);
          }),
        },
        'no-ability': { effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { systemMsg(`declines to use ${card.title}`); }) },
      },
    },
  },
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [
    {
      event: 'pass-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = forms.run(state);
        return (run?.server || []).join('') === 'hq' &&
          (run?.position ?? 0) === 0 &&
          (runnerFn(state)?.deck?.length ?? 0) > 0;
      }),
      async: true,
      once: ':per-turn',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(state, ':runner', forms.let?.abi, card, null); }),
    },
    {
      event: 'run',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const run = targetFn(state, card, targets);
        return (run?.server || []).join('') === 'hq' &&
          (run?.position ?? 0) === 0 &&
          (runnerFn(state)?.deck?.length ?? 0) > 0;
      }),
      async: true,
      once: ':per-turn',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(state, ':runner', forms.let?.abi, card, null); }),
    },
  ],
};

// Prepaid VoicePAD
export const prepaidVoicePad: CardDef = {
  title: 'Prepaid VoicePAD',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const t = target;
        return eventFn(t) &&
          ((eid['cost-paid']?.length ?? 0) === 0 || eid['x-cost']) &&
          eid['source-type'] === ':play';
      }),
      type: ':recurring',
    },
  },
};

// Prognostic Q-Loop
export const prognosticQLoop: CardDef = {
  title: 'Prognostic Q-Loop',
  events: [{
    event: 'run',
    interactive: getAutoresolveFn('auto-fire', (complementFn(neverFn) as any)),
    silent: getAutoresolveFn('auto-fire', neverFn),
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return firstEventFn(state, side, 'run');
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(runnerFn(state)?.deck?.length); }) },
      autoresolve: getAutoresolveFn('auto-fire'),
      prompt: 'Look at top 2 cards of the stack?',
      'yes-ability': lookAtTheTop(':runner', ':runner', 2),
    },
  }],
  abilities: [
    { ...setAutoresolveFn('auto-fire', 'Prognostic Q-Loop') },
    {
      label: 'Reveal and install top card of the stack',
      once: ':per-turn',
      cost: [toC('credit', 1)],
      'change-in-game-state': { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return (runnerFn(state)?.deck?.length ?? 0) > 0; }) },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `reveal ${(runnerFn(state)?.deck?.[0])?.title || ''} from the top of the stack`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          revealFn(state, side, (runnerFn(state)?.deck?.[0]) || null)], []);
        continue_ability(state, side, {
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              const topCard = (runnerFn(state)?.deck?.[0]) || null;
              return (topCard && (programFn(topCard) || hardwareFn(topCard)) &&
                runnerCanPayAndInstallFn(state, side, { ...eid, 'source-type': ':runner-install' }, topCard));
            }),
            prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Install ${(runnerFn(state)?.deck?.[0])?.title || 'the top card'}?`,
            'yes-ability': {
              async: true,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { runnerInstallFn({ ...eid, 'source-type': ':runner-install' },
                (runnerFn(state)?.deck?.[0]), {
                  'msg-keys': { displayOrigin: true, originIndex: 0, installSource: card },
                }); }),
            },
          },
        }, card, null);
      }),
    },
  ],
};

// Public Terminal
export const publicTerminal: CardDef = {
  title: 'Public Terminal',
  recurring: 1,
  interactions: {
    'pay-credits': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const t = target;
        return eid['source-type'] === ':play' && hasSubtypeFn(t, 'Run');
      }),
      type: ':recurring',
    },
  },
};

// Q-Coherence Chip
export const qCoherenceChip: CardDef = {
  title: 'Q-Coherence Chip',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'runner-trash',
      async: true,
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return installedFn(ctx.card) && programFn(ctx.card);
      }),
      msg: 'trash itself',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { trashFn(eid, card, { causeCard: card }); }),
    },
    {
      event: 'corp-trash',
      async: true,
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return installedFn(ctx.card) && programFn(ctx.card);
      }),
      msg: 'trash itself',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { trashFn(eid, card, { causeCard: card }); }),
    },
  ],
};

// Qianju PT
export const qianjuPT: CardDef = {
  title: 'Qianju PT',
  flags: { 'runner-phase-12': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
  abilities: [{
    label: 'Lose [Click], avoid 1 tag (start of turn)',
    once: ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !!(state as any)['runner-phase-12'];
    }),
    cost: [toC(':lose-click', 1)],
    msg: 'avoid the first tag received until [their] next turn',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const currentTurn = (state as any).turn;
      const lingering = registerLingeringEffectFn(state, side, card, {
        type: ':forced-to-avoid-tag',
        duration: ':until-next-runner-turn-begins',
        value: true,
      });
      registerEventsFn(state, side, card, [{
        event: 'tag-interrupt',
        'unregister-once-resolved': true,
        duration: ':until-next-runner-turn-begins',
        async: true,
        msg: 'avoid 1 tag',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          unregisterEffectByUuidFn(state, side, lingering);
          preventTagFn(state, ':runner', eid, 1);
        }),
      }]);
    }),
  }],
};

// R&D Interface
export const rndInterface: CardDef = {
  title: 'R&D Interface',
  events: [breachAccessBonus(':rd', 1)],
};

// Rabbit Hole
export const rabbitHole: CardDef = {
  title: 'Rabbit Hole',
  'static-abilities': [linkPlusFn(1)],
  'on-install': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const deck = runnerFn(state)?.deck || [];
        return deck.some((c: Card) => c.title === card.title);
      }),
      prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Install another copy of ${card.title}?`,
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          triggerEventFn(state, side, ':searched-stack');
          shuffleDeck(state, ':runner', ':deck');
          const deck = runnerFn(state)?.deck || [];
          const c = deck.find((x: Card) => x.title === card.title);
          if (c) {
            runnerInstallFn(state, side, eid, c, {
              'msg-keys': { installSource: card, displayOrigin: true },
            });
          } else {
            effectCompletedFn(state, side, eid);
          }
        }),
      },
    },
  },
};

// Ramujan-reliant 550 BMI
export const ramujanReliant: CardDef = {
  title: 'Ramujan-reliant 550 BMI',
  let: {
    maxTrash: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => 1 + allActiveInstalledFn(state, ':runner')
      .filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length,
  },
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      cost: [toC(':trash-can')],
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent up to ${getCardFn(state, card) ? 1 + allActiveInstalledFn(state, ':runner').filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length : 1} damage`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return true; // preventUpToNDamage check
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const maxTrash = 1 + allActiveInstalledFn(state, ':runner')
          .filter((c: Card) => c.title === 'Ramujan-reliant 550 BMI').length;
        yield wait_for(state, [{ asyncResult: 'result' },
          resolveAbilityFn(state, side, preventUpToNDamageFn(maxTrash, [':net', ':core', ':brain']), card, targets)], []);
        const prevented = (state as any).prevent?.damage?.prevented ?? 0;
        systemMsg(state, side, `uses ${card.title} to trash the top ${prevented} cards of the stack`);
        millFn(state, ':runner', eid, card, prevented);
      }),
    },
  }],
};

// Recon Drone
export const reconDrone: CardDef = {
  title: 'Recon Drone',
  prevention: [{
    prevents: 'damage',
    type: 'ability',
    ability: {
      async: true,
      'fake-cost': [toC(':trash-can')],
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return preventableFn(forms.context(state, card, targets)) &&
          sameCard((forms.context(state, card, targets) as any)?.sourceCard, (state as any).access);
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        continue_ability(state, side, {
          cost: [toC(':trash-can'), toC(':x-credits', 0, { maximum: (forms.context(state, card, targets) as any)?.remaining ?? 0 })],
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent ${costValueFn(eid, ':x-credits')} ${damageTypeFn(state)} damage`,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            preventDamageFn(state, side, eid, costValueFn(eid, ':x-credits'));
          }),
        }, card, null);
      }),
    },
  }],
};

function costValueFn(eid: EID, type: string): number {
  return corePayment.costValue?.(eid, type) ?? 0;
}

// Record Reconstructor
export const recordReconstructor: CardDef = {
  title: 'Record Reconstructor',
  events: [successfulRunReplaceBreach({
    targetServer: ':archives',
    ability: {
      prompt: 'Choose one faceup card to add to the top of R&D',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const corp = corpFn(state);
        const faceupCards = (corp?.discard || []).filter((c: Card) => faceupFn(c));
        return !!(faceupCards?.length);
      }),
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const corp = corpFn(state);
        return (corp?.discard || []).filter((c: Card) => faceupFn(c));
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `add ${target.title} to the top of R&D`; })(); },
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; moveFn(':corp', target, ':deck', { front: true }); }),
    },
  })],
};

// Reflection
export const reflection: CardDef = {
  title: 'Reflection',
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [{
    event: 'jack-out',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corp = corpFn(state);
      const hand = corp?.hand || [];
      const targetCard = hand.length > 0 ? hand[Math.floor(Math.random() * hand.length)] : null;
      if (targetCard) {
        systemMsg(state, ':runner', `force the Corp to reveal ${targetCard.title} from HQ`);
        revealFn(state, ':corp', eid, targetCard);
      }
    }),
  }],
};

// Replicator
export const replicator: CardDef = {
  title: 'Replicator',
  events: [{
    event: 'runner-install',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return ctx.card && hardwareFn(ctx.card) &&
        (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title);
    }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return !(ctx.card && hardwareFn(ctx.card) &&
        (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title));
    }),
    optional: {
      prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `Search the stack for another copy of ${(forms.context(state, card, targets) as any)?.card?.title || 'this card'} and add it to the grip?`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.card && hardwareFn(ctx.card) &&
          (runnerFn(state)?.deck || []).some((c: Card) => c.title === ctx.card.title);
      }),
      'yes-ability': {
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `add a copy of ${(forms.context(state, card, targets) as any)?.card?.title || 'this card'} from the stack to the grip`,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { triggerEventFn(':searched-stack'); shuffleDeck(':deck'); moveFn(
            (runnerFn(state)?.deck || []).find((c: Card) => c.title === ((forms.context(state, card, targets) as any)?.card)?.title),
            ':hand'
          ); }),
      },
    },
  }],
};

// Respirocytes
export const respirocytes: CardDef = {
  title: 'Respirocytes',
  implementation: 'Only watches trashes, playing events, and installing. Doesnt know about your hand size pre-install.',
  let: {
    ability: {
      once: ':per-turn',
      msg: 'draw 1 card and place a power counter',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, drawFn(state, ':runner', 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          addCounterFn(state, side, getCardFn(state, card), 'power', 1)], []);
        if (getCounters(getCardFn(state, card), 'power') >= 3) {
          systemMsg(state, ':runner', `trashes ${card.title} as it reached 3 power counters`);
          trashFn(state, side, eid, card, { unpreventable: true, causeCard: card });
        } else {
          effectCompletedFn(state, side, eid);
        }
      }),
    },
    event: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(forms.let?.ability, card, targets); }),
    },
  },
  'on-install': {
    async: true,
    msg: 'suffer 1 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 1, { unboostable: true, card: card }); }),
  },
  events: [
    { event: 'play-event', ...(forms.let?.event || {}) },
    { event: 'runner-hand-changed?', ...(forms.let?.event || {}) },
    {
      event: 'runner-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targets.some((t: any) => runnerFn(t.card) && inHandFn(t.card)) &&
          (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'corp-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return targets.some((t: any) => runnerFn(t.card) && inHandFn(t.card)) &&
          (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const prevZone = ctx['previous-zone'] || [];
        return prevZone.includes('hand') && (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      ...forms.let?.event,
    },
    {
      event: 'runner-turn-begins',
      automatic: ':draw-cards',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(forms.let?.ability, card, null); }),
    },
    {
      event: 'corp-turn-begins',
      automatic: ':draw-cards',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (runnerFn(state)?.hand?.length ?? 0) === 0;
      }),
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(forms.let?.ability, card, null); }),
    },
  ],
  abilities: [forms.let?.ability],
};

// Rotary
export const rotary: CardDef = {
  title: 'Rotary',
  'static-abilities': [muPlusFn(1)],
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        return ([':hq', ':rd', 'hq', 'rd'].includes(ctx.server));
      }),
      prompt: 'Tag 1 tag to see an additional card?',
      'yes-ability': {
        cost: [toC(':gain-tag', 1)],
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `access 1 additional card from ${zoneNameFn(targetServerFn(forms.context(state, card, targets)))}`,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { accessBonusFn(targetServerFn(forms.context(state, card, targets)), 1); }),
      },
    },
  }],
  'corp-abilities': [{
    action: true,
    label: 'Trash Rotary',
    async: true,
    cost: [toC('click', 1), toC('credit', 2)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return isTaggedFn(state) && side === ':corp';
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { systemMsg(':corp', 'spends [Click] and 2 [Credits] to trash Rotary'); trashFn(':corp', eid, card, { causeCard: card }); }),
  }],
};

// Rubicon Switch
export const rubiconSwitch: CardDef = {
  title: 'Rubicon Switch',
  abilities: [{
    action: true,
    cost: [toC('click', 1), toC(':x-credits')],
    label: 'Derez a piece of ice rezzed this turn',
    once: ':per-turn',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const paymentEid = eid;
      const spentCredits = costValueFn(eid, ':x-credits');
      continue_ability(state, side, {
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return iceFn(target) &&
              (target as any)?.rezzed === ':this-turn' &&
              rezCostFn(state, ':corp', target) <= spentCredits;
          }),
        },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          derezFn(state, side, eid, target, { 'msg-keys': { 'include-cost-from-eid': paymentEid } });
        }),
      }, card, null);
    }),
  }],
};

// Security Chip
export const securityChip: CardDef = {
  title: 'Security Chip',
  abilities: [
    {
      label: 'Add [Link] strength to a non-Cloud icebreaker until the end of the run',
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `add ${getLinkFn(state)} strength to ${target.title} until the end of the run`; })(); },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!runFn(state);
      }),
      prompt: 'Choose one non-Cloud icebreaker',
      choices: { card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && !hasSubtypeFn(c, 'Cloud') && installedFn(c) },
      cost: [toC(':trash-can')],
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; pumpFn(target, getLinkFn(state), ':end-of-run'); }),
    },
    {
      label: 'Add [Link] strength to any Cloud icebreakers until the end of the run',
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `add ${getLinkFn(state)} strength to ${targets.length} Cloud icebreakers until the end of the run`; })(); },
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!runFn(state);
      }),
      prompt: 'Choose any number of Cloud icebreakers',
      choices: { max: 50, card: (c: Card) => hasSubtypeFn(c, 'Icebreaker') && hasSubtypeFn(c, 'Cloud') && installedFn(c) },
      cost: [toC(':trash-can')],
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        for (const t of targets) {
          pumpFn(state, side, t, getLinkFn(state), ':end-of-run');
          updateBreakerStrengthFn(state, side, t);
        }
      }),
    },
  ],
};

// Security Nexus
export const securityNexus: CardDef = {
  title: 'Security Nexus',
  'static-abilities': [
    muPlusFn(1),
    linkPlusFn(1),
  ],
  events: [{
    event: 'encounter-ice',
    skippable: true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    optional: {
      prompt: 'Trace 5 to bypass current ice?',
      once: ':per-turn',
      'yes-ability': {
        msg: 'force the Corp to initiate a trace',
        trace: {
          base: 5,
          successful: {
            msg: 'give the Runner 1 tag and end the run',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              yield wait_for(state, [{ asyncResult: 'result' }, gainTagsFn(state, ':runner', 1)], []);
              endRunFn(state, side, eid, card);
            }),
          },
          unsuccessful: {
            msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `bypass ${cardStr(state, forms.currentIce?.(state))}`,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { bypassIceFn(state); }),
          },
        },
      },
    },
  }],
};

// Severnius Stim Implant
export const severniusStimImplant: CardDef = {
  title: 'Severnius Stim Implant',
  let: {
    implantFn: (srv: string, kw: string) => ({
      prompt: 'Choose at least 2 cards to trash',
      cost: [toC('click', 1)],
      choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (runnerFn(state)?.hand?.length ?? 0);
      }), card: (c: Card) => runnerFn(c) && inHandFn(c) },
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `trash ${quantify(targets.length, 'card')} and access ${quantify(Math.floor(targets.length / 2), 'additional card')}`,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const bonus = Math.floor(targets.length / 2);
        yield wait_for(state, [{ asyncResult: 'result' },
          trashCardsFn(state, side, targets, { unpreventable: true, causeCard: card })], []);
        registerEventsFn(state, side, card, [breachAccessBonus(kw, bonus, { duration: ':end-of-run' })]);
        makeRunFn(state, side, eid, srv, card);
      }),
    }),
  },
  abilities: [{
    action: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (runnerFn(state)?.hand?.length ?? 0) >= 2;
    }),
    label: 'Run HQ or R&D',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['HQ', 'R&D'],
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; continue_ability(
      (() => {
        const srv = target === 'HQ' ? ':hq' : ':rd';
        const kw = target === 'HQ' ? ':hq' : ':rd';
        return {
          prompt: 'Choose at least 2 cards to trash',
          cost: [toC('click', 1)],
          choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            return (runnerFn(state)?.hand?.length ?? 0);
          }), card: (c: Card) => runnerFn(c) && inHandFn(c) },
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `trash ${quantify(targets.length, 'card')} and access ${quantify(Math.floor(targets.length / 2), 'additional card')}`,
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const bonus = Math.floor(targets.length / 2);
            yield wait_for(state, [{ asyncResult: 'result' },
              trashCardsFn(state, side, targets, { unpreventable: true, causeCard: card })], []);
            registerEventsFn(state, side, card, [breachAccessBonus(kw, bonus, { duration: ':end-of-run' })]);
            makeRunFn(state, side, eid, srv, card);
          }),
        };
      })(),
      card, null); }),
  }],
};

// Şifr
export const sifr: CardDef = {
  title: 'Şifr',
  let: {
    gatherPreSifrEffects: (sifr: Card, state: State, side: Side, eid: EID, target: Card, targets: Card[]) => {
      // Calculate ice strength at the moment Sifr would affect it
      const effects = (state as any).effects || [];
      const iceStrengthEffects = effects.filter((e: any) => e.type === ':ice-strength');
      return iceStrengthEffects.reduce((sum: number, e: any) => {
        const value = typeof e.value === 'function' ? e.value(state, side, eid, getCardFn(state, e.card), targets) : e.value;
        return sum + value;
      }, 0);
    },
  },
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'encounter-ice',
    skippable: true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    optional: {
      prompt: 'Lower your maximum hand size by 1 to reduce the strength of encountered ice to 0?',
      once: ':per-turn',
      'yes-ability': {
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `lower [their] maximum hand size by 1 and reduce the strength of ${forms.currentIce?.(state)?.title || 'the encountered ice'} to 0`,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { registerLingeringEffectFn(card, {
            type: ':hand-size',
            duration: ':until-runner-turn-begins',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return side === ':runner';
            }),
            value: -1,
          }); registerLingeringEffectFn(':runner', card, {
            type: ':ice-strength',
            duration: ':end-of-encounter',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return sameCard(forms.currentIce?.(state), targets[0]);
            }),
            value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              const currentIce = forms.currentIce?.(state);
              const strength = currentIce?.strength ?? 0;
              return -(strength + (forms.let?.gatherPreSifrEffects?.(card, state, side, eid, currentIce, targets.slice(1)) ?? 0));
            }),
          }); }),
      },
    },
  }],
};
