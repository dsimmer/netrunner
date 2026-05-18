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
import { breakSubFn } from './_helpers';
import type { CardDef } from '../../types';

import { addCounterFn, allActiveInstalledFn, buildCostString, bypassIceFn, canPayToRezFn, cancelable, cardStr, decapitalize, drawAbility, drawFn, effectCompletedFn, enumerateCards, eventCountFn, eventFn, findCardFn, findLatestFn, firstEventFn, gainClicksFn, gainCreditsFn, gainTagsFn, getCardFn, getCounters, getxFn, hasSubtypeFn, hostFn, iceFn, inDeckFn, inDiscardFn, inHandFn, installedFn, isTaggedFn, makeIcon, makeRunFn, moveFn, muPlusFn, playSfx, preventDamageFn, preventEncounterFn, preventableFn, programFn, quantify, registerEventsFn, resolveAbilityFn, rezAdditionalCostBonusFn, rezCostFn, rezFn, runnerCanPayAndInstallFn, runnerFn, runnerHandSizePlusFn, runnerInstallFn, sameCard, shuffleDeck, systemMsg, toC, trashCardsFn, trashOnEmptyFn, triggerEventFn, turnArchivesFaceupFn, zoneLockedFn } from './hardware_1';

// Stub helpers (to be ported from clj cards/*.clj)
function runFn(_server?: any, _opts?: any): any { return {}; }

// Helper for card-def
export function cardDefFn(...args: any[]): any {
  return (coreCard.cardDef as any)?.(...args);
}

// ============================================================================
// Card definitions
// ============================================================================

// Acacia
export const acacia: CardDef = {
  title: 'Acacia',
  events: [{
    event: 'purge',
    optional: {
      'waiting-prompt': true,
      prompt: 'Trash Acacia to gain 1 [Credits] for each purged virus counter?',
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const counters = (state as any).total_purged_counters ?? 0;
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, { causeCard: card })], []);
          systemMsg(state, side, `trashes Acacia and gains ${counters} [Credit]`);
          gainCreditsFn(state, side, counters);
        }),
      },
    },
  }],
};

// Adjusted Matrix
export const adjustedMatrix: CardDef = {
  title: 'Adjusted Matrix',
  implementation: 'Click Adjusted Matrix to use the ability',
  'on-install': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allActiveInstalled = allActiveInstalledFn(state, ':runner');
      return allActiveInstalled.some((c: Card) => hasSubtypeFn(c, 'Icebreaker'));
    }),
    prompt: 'Choose an icebreaker',
    choices: { card: (c: Card) => runnerFn(c) && hasSubtypeFn(c, 'Icebreaker') && installedFn(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `host itself on ${cardStr(state, target)}`; },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; hostFn(state, side, getCardFn(state, target), card); }),
  },
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const host = forms.host?.(state, card);
      return host && sameCard(targets[0], host);
    }),
    value: 'AI',
  }],
  abilities: [{
    ...breakSubFn(toC(':lose-click', 1), 1, 'All', { req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) }),
  } as any],
};

// AirbladeX (JSRF Ed.)
export const airbladeX: CardDef = {
  title: 'AirbladeX (JSRF Ed.)',
  data: { counter: { power: 3 } },
  prevention: [
    {
      prevents: 'damage',
      type: 'ability',
      ability: {
        async: true,
        cost: [toC('power', 1)],
        msg: 'prevent 1 net damage',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (forms.runFn(state) &&
            (ctx.type === 'net' || ctx.type === ':net') &&
            preventableFn(ctx));
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          preventDamageFn(state, side, eid, 1);
        }),
      },
    },
    {
      prevents: 'encounter',
      type: 'ability',
      ability: {
        async: true,
        cost: [toC('power', 1)],
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.remaining > 0);
        }),
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `prevent the encounter ability on ${(forms.context(state, card, targets) as any)?.ice?.title || 'the encountered ice'}`,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          preventEncounterFn(state, side, eid);
        }),
      },
    },
  ],
  events: [trashOnEmptyFn('power')],
};

// Akamatsu Mem Chip
export const akamatsuMemChip: CardDef = {
  title: 'Akamatsu Mem Chip',
  'static-abilities': [muPlusFn(1)],
};

// Alarm Clock
export const alarmClock: CardDef = {
  title: 'Alarm Clock',
  let: {
    ability: {
      once: ':per-turn',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(state as any)['runner-phase-12'];
      }),
      msg: 'make a run on HQ',
      'makes-run': true,
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        registerEventsFn(state, side, card, [{
          event: 'encounter-ice',
          skippable: true,
          'unregister-once-resolved': true,
          duration: ':end-of-run',
          optional: {
            prompt: 'Spend [Click][Click] to bypass encountered ice?',
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return firstEventFn(state, side, 'encounter-ice');
            }),
            'yes-ability': {
              cost: [toC('click', 2)],
              req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                return (getCardFn(state, card)?.runner?.click ?? 0) >= 2;
              }),
              msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `bypass ${cardStr(state, (forms.context(state, card, targets) as any)?.ice)}`,
              effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                bypassIceFn(state);
              }),
            },
          },
        }]);
        makeRunFn(state, side, eid, ':hq', card);
      }),
    },
  },
  flags: { 'runner-phase-12': req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }) },
  events: [{
    event: 'runner-turn-begins',
    skippable: true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    optional: {
      once: ':per-turn',
      prompt: 'Make a run on HQ?',
      'yes-ability': { let: { ability: null } },
    },
  }],
  abilities: [forms.let?.ability],
};

// Amanuensis
export const amanuensis: CardDef = {
  title: 'Amanuensis',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'runner-lose-tag',
      optional: {
        prompt: 'Remove 1 power counter to draw 2 cards?',
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          return (ctx.side === ':runner' || ctx.side === 'runner') &&
            (ctx.amount > 0) &&
            (getCounters(card, 'power') > 0);
        }),
        'yes-ability': drawAbility(2, null, { cost: [toC('power', 1)] }),
      },
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return isTaggedFn(state);
      }),
      msg: 'place 1 power counter on itself',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        addCounterFn(state, side, card, 'power', 1);
      }),
    },
  ],
};

// Aniccam
export const aniccam: CardDef = {
  title: 'Aniccam',
  'static-abilities': [muPlusFn(1)],
  events: [
    {
      event: 'corp-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(':runner', eid, 1); }),
    },
    {
      event: 'runner-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(':runner', eid, 1); }),
    },
    {
      event: 'game-trash',
      async: true,
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const eventTargets = targets || [];
        const hasEvent = eventTargets.some((t: any) => t.card && eventFn(t.card));
        if (!hasEvent) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => x.card && eventFn(x.card)));
      }),
      'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return !!(runnerFn(state as unknown as State)?.deck?.length);
      }) },
      msg: 'draw 1 card',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { drawFn(':runner', eid, 1); }),
    },
  ],
};

// Archives Interface
export const archivesInterface: CardDef = {
  title: 'Archives Interface',
  events: [{
    event: 'breach-server',
    automatic: ':pre-breach',
    async: true,
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      const run = forms.run(state);
      const corp = (state as any).corp;
      return ((ctx.server === ':archives' || ctx.server === 'archives') &&
        (run?.maxAccess ?? 0) !== 0 &&
        (corp?.discard?.length ?? 0) > 0);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        turnArchivesFaceupFn(state, side, [':archives'])], []);
      continue_ability(state, side, {
        optional: {
          prompt: 'Remove a card from the game instead of accessing it?',
          'yes-ability': {
            prompt: 'Choose a card in Archives',
            choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return (state as any).corp?.discard || [];
            }),
            msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `remove ${target?.title || 'the target'} from the game`; })(); },
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreMoving.move(':corp', target, ':rfg'); }),
          },
        },
      }, card, null);
    }),
  }],
};

// Astrolabe
export const astrolabe: CardDef = {
  title: 'Astrolabe',
  'static-abilities': [muPlusFn(1)],
  events: [drawAbility(1, null, { event: 'server-created' })],
};

// Autoscripter
export const autoscripter: CardDef = {
  title: 'Autoscripter',
  events: [
    {
      event: 'runner-install',
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const program = ctx.card;
        if (!program || !programFn(program)) return false;
        if ((state as any).activePlayer !== ':runner') return false;
        const prevZone = ctx['previous-zone'] || [];
        if (!prevZone.includes('hand') && !prevZone.includes(':hand')) return false;
        return firstEventFn(state, ':runner', 'runner-install',
          (t: any[]) => {
            const first = t[0];
            const pz = first?.card ? (first.card['previous-zone'] || []) : [];
            return pz.includes('hand') && programFn(first.card);
          });
      }),
      msg: 'gain [Click]',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainClicksFn(1); }),
    },
    {
      event: 'unsuccessful-run',
      async: true,
      msg: 'trash itself',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(eid, card, { causeCard: card }); }),
    },
  ],
};

// Basilar Synthgland 2KVJ
export const basilarSynthgland: CardDef = {
  title: 'Basilar Synthgland 2KVJ',
  'on-install': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 2, { card: card }); }),
  },
  'in-play': [':click-per-turn', 1],
};

// Blackguard
export const blackguard: CardDef = {
  title: 'Blackguard',
  'static-abilities': [muPlusFn(2)],
  events: [{
    event: 'expose',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      return !!(ctx.cards?.length);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx = forms.context(state, card, targets) || {};
      const cards = ctx.cards || [];
      if (cards.length === 1) {
        // force-rez single card
        const c = cards[0];
        const cname = c.title || 'the card';
        const cost = rezCostFn(state, side, c);
        const additionalCosts = rezAdditionalCostBonusFn(state, side, c);
        const payable = canPayToRezFn(state, ':corp', eid, c);
        if (!payable) {
          effectCompletedFn(state, side, eid);
        } else if (additionalCosts?.length) {
          continue_ability(state, side, {
            optional: {
              'waiting-prompt': true,
              prompt: `Pay [Credits] ${cost}, plus ${decapitalize(buildCostString(additionalCosts))} as an additional cost to rez ${cname}?`,
              player: ':corp',
              'yes-ability': {
                async: true,
                effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { rezFn(':corp', eid, c); }),
              },
              'no-ability': {
                msg: `declines to pay additional costs and is not forced to rez ${cname}`,
              },
            },
          }, card, null);
        } else {
          rezFn(state, ':corp', eid, c);
        }
      } else {
        // choose a card to force rez
        const chooseFn = (cardsList: Card[]) => {
          if (cardsList.length === 1) {
            return resolveAbilityFn(state, side, {
              msg: `force the rez of ${cardsList[0].title}`,
              async: true,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { rezFn(state, ':corp', eid, cardsList[0]); }),
            }, card, null);
          }
          resolveAbilityFn(state, side, {
            prompt: 'Force the Corp to rez which card?',
            req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !!(cardsList?.length); }),
            choices: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return cardsList; }),
            async: true,
            effect: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]): Generator<any, any, any> {
              const chosen = t[0];
              if (chosen) {
                // resolve force rez on chosen
                const cost = rezCostFn(s, sd, chosen);
                const additionalCosts = rezAdditionalCostBonusFn(s, sd, chosen);
                const payable = canPayToRezFn(s, ':corp', eid2, chosen);
                if (!payable) {
                  effectCompletedFn(s, sd, eid2);
                } else if (additionalCosts?.length) {
                  continue_ability(s, sd, {
                    optional: {
                      'waiting-prompt': true,
                      prompt: `Pay [Credits] ${cost}, plus ${decapitalize(buildCostString(additionalCosts))} as an additional cost to rez ${chosen.title}?`,
                      player: ':corp',
                      'yes-ability': {
                        async: true,
                        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { rezFn(sd, eid2, chosen); }),
                      },
                      'no-ability': {
                        msg: `declines to pay additional costs and is not forced to rez ${chosen.title}`,
                      },
                    },
                  }, c, null);
                } else {
                  rezFn(s, ':corp', eid2, chosen);
                }
                // continue with remaining
                const remaining = cardsList.filter(x => !sameCard(x, chosen));
                if (remaining.length > 0) {
                  continue_ability(s, sd, { prompt: 'Choose next', choices: remaining, async: true,
                    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { chooseFn(remaining); })
                  }, c, null);
                }
              }
            }),
          }, card, null);
        };
        chooseFn(cards);
      }
    }),
  }],
};

// Bling
export const bling: CardDef = {
  title: 'Bling',
  'static-abilities': [
    muPlusFn(1),
    {
      type: ':can-play-as-if-in-hand',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const host = forms.host?.(state, card);
        return host && sameCard(targets[0], host);
      }),
      value: true,
    },
  ],
  events: [
    {
      event: 'runner-install',
      skippable: true,
      optional: {
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          const costs = ctx.costs || [];
          const hasNoCredits = !costs.some((c: any) =>
            (c['cost/type'] === ':credit' || c['cost/type'] === 'credit') && c['cost/amount'] > 0);
          return hasNoCredits && !!(runnerFn(state)?.deck?.length);
        }),
        prompt: 'Host the top card of your stack on Bling?',
        'yes-ability': {
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `host ${(runnerFn(state)?.deck?.[0])?.title || 'the top card'}`,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            triggerEventFn(state, side, ':bling-hosted');
            const deck = (state as any).runner?.deck || [];
            const timesHosted = Math.min(eventCountFn(state, null, ':bling-hosted'), 10);
            playSfx(state, side, `bling-${timesHosted}`);
            const topCard = deck[0];
            if (topCard) {
              hostFn(state, side, card, topCard);
            }
          }),
        },
      },
    },
    {
      event: 'runner-turn-ends',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        return !!(cardObj?.hosted?.length);
      }),
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => enumerateCards(hostedFn(state, card), ':sorted'),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        if (hosted.length) {
          trashCardsFn(state, ':runner', eid, hosted);
        }
      }),
    },
  ],
};

// BMI Buffer
export const bmiBuffer: CardDef = {
  title: 'BMI Buffer',
  events: [
    {
      event: 'runner-trash',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const t of targets) {
          const latest = findLatestFn(state, t.card);
          const latestCard = getCardFn(state, latest);
          if (runnerFn(latestCard) && programFn(latestCard) && inDiscardFn(latestCard) &&
              (latestCard['previous-zone'] || [])[0] === 'hand') {
            hostFn(state, side, cardObj, latestCard);
          }
        }
        effectCompletedFn(state, side, eid);
      }),
    },
    {
      event: 'corp-trash',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const t of targets) {
          const latest = findLatestFn(state, t.card);
          const latestCard = getCardFn(state, latest);
          if (runnerFn(latestCard) && programFn(latestCard) && inDiscardFn(latestCard) &&
              (latestCard['previous-zone'] || [])[0] === 'hand') {
            hostFn(state, side, cardObj, latestCard);
          }
        }
        effectCompletedFn(state, side, eid);
      }),
    },
  ],
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    label: 'Install a hosted program',
    prompt: 'Choose a program to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const cardObj = getCardFn(state, card);
      const hosted = cardObj?.hosted || [];
      return cancelable(hosted.filter((c: Card) =>
        runnerCanPayAndInstallFn(state, side, { ...eid, source: card }, c)));
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `install ${target?.title || ''}`; })(); },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target); }),
  }],
};

// BMI Buffer 2
export const bmiBuffer2: CardDef = {
  title: 'BMI Buffer 2',
  events: bmiBuffer.events.map((e: any) => ({ ...e, event: e.event })),
  abilities: [{
    action: true,
    cost: [toC('click', 2)],
    label: 'Install a hosted program',
    prompt: 'Choose a program to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const cardObj = getCardFn(state, card);
      return cardObj?.hosted || [];
    }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `install ${target?.title || ''}`; })(); },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; runnerInstallFn({ ...eid, source: card, 'source-type': ':runner-install' }, target,
      { ignoreAllCost: true }); }),
  }],
};

// Bookmark
export const bookmark: CardDef = {
  title: 'Bookmark',
  abilities: [
    {
      action: true,
      label: 'Host up to 3 cards from the grip facedown',
      cost: [toC('click', 1)],
      'keep-menu-open': ':while-clicks-left',
      msg: 'host up to 3 cards from the grip facedown',
      choices: { max: 3, card: (c: Card) => runnerFn(c) && inHandFn(c) },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        for (const t of targets) {
          hostFn(state, side, cardObj, t, { facedown: true });
        }
      }),
    },
    {
      action: true,
      label: 'Add all hosted cards to the grip',
      cost: [toC('click', 1)],
      msg: 'add all hosted cards to the grip',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hosted = cardObj?.hosted || [];
        for (const c of hosted) {
          moveFn(state, side, c, ':hand');
        }
      }),
    },
    {
      label: 'Add all hosted cards to the grip',
      'fake-cost': [toC(':trash-can')],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const hostedCards = cardObj?.hosted || [];
        for (const c of hostedCards) {
          moveFn(state, side, c, ':hand');
        }
        continue_ability(state, side, {
          cost: [toC(':trash-can')],
          msg: `add ${quantify(hostedCards.length, 'hosted card')} to the grip`,
        }, card, null);
      }),
    },
  ],
};

// Boomerang
export const boomerang: CardDef = {
  title: 'Boomerang',
  'on-install': {
    prompt: 'Choose an installed piece of ice',
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `target ${cardStr(state, target)}`; },
    choices: { card: (c: Card) => installedFn(c) && iceFn(c) },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreUpdate.update(state, side, { ...card, special: { ...card.special, 'boomerang-target': target } }); }),
  },
  'static-abilities': [{
    type: ':icon',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const cardObj = getCardFn(state, card);
      const boomerangTarget = cardObj?.special?.['boomerang-target'];
      return boomerangTarget && sameCard(targets[0], boomerangTarget);
    }),
    'while-disabled': true,
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return makeIcon('B', card);
    }),
  }],
  abilities: [
    // Break subroutine ability
    {
      ...breakSubFn(toC(':trash-can'), 2, 'All', {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          const cardObj = getCardFn(state, card);
          const boomerangTarget = cardObj?.special?.['boomerang-target'];
          if (!boomerangTarget) return true;
          const encounters = (state as any).encounters || [];
          return encounters.some((e: any) => sameCard(boomerangTarget, e.ice));
        }),
        'additional-ability': {
          effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
            const cardObj = getCardFn(state, card);
            const source = card;
            registerEventsFn(state, side, source, [{
              event: 'run-ends',
              duration: ':end-of-run',
              'unregister-once-resolved': true,
              optional: {
                req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                  const cardObj2 = getCardFn(state, card);
                  const ctx = forms.context(state, card, targets) || {};
                  return !!(ctx.successful &&
                    !zoneLockedFn(state, ':runner', ':discard') &&
                    (runnerFn(state)?.discard || []).some((c: Card) => c.title === cardObj2.title));
                }),
                once: ':per-run',
                prompt: `Shuffle a copy of ${card?.title || 'this card'} back into the Stack?`,
                'yes-ability': {
                  msg: `shuffle a copy of ${card?.title || 'this card'} back into the Stack`,
                  effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { moveFn(
                      (runnerFn(state)?.discard || []).find((c: Card) => c.title === card?.title),
                      ':deck'
                    ); shuffleDeck(state, side, ':deck'); }),
                },
              },
            }]);
          }),
        },
      }),
    },
    // Break 0 subroutines ability
    {
      label: 'Break 0 subroutines',
      cost: [toC(':trash-can')],
      msg: 'break 0 subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        const cardObj = getCardFn(state, card);
        const boomerangTarget = cardObj?.special?.['boomerang-target'];
        if (!boomerangTarget) return true;
        const encounters = (state as any).encounters || [];
        return encounters.some((e: any) => sameCard(boomerangTarget, e.ice));
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardObj = getCardFn(state, card);
        const source = card;
        registerEventsFn(state, side, source, [{
          event: 'run-ends',
          duration: ':end-of-run',
          'unregister-once-resolved': true,
          optional: {
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              const cardObj2 = getCardFn(state, card);
              const ctx = forms.context(state, card, targets) || {};
              return !!(ctx.successful &&
                !zoneLockedFn(state, ':runner', ':discard') &&
                (runnerFn(state)?.discard || []).some((c: Card) => c.title === cardObj2.title));
            }),
            once: ':per-run',
            prompt: `Shuffle a copy of ${card?.title || 'this card'} back into the Stack?`,
            'yes-ability': {
              msg: `shuffle a copy of ${card?.title || 'this card'} back into the Stack`,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { moveFn(
                  (runnerFn(state)?.discard || []).find((c: Card) => c.title === card?.title),
                  ':deck'
                ); shuffleDeck(state, side, ':deck'); }),
            },
          },
        }]);
      }),
    },
  ],
};

// Borrowed Goods
export const borrowedGoods: CardDef = {
  title: 'Borrowed Goods',
  'on-install': {
    'change-in-game-state': { silent: true, req: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return !isTaggedFn(state); }) },
    msg: 'take 1 tag',
    interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { gainTagsFn(state, side, eid, 1); }),
  },
  'static-abilities': [muPlusFn(1)],
};

// Box-E
export const boxE: CardDef = {
  title: 'Box-E',
  'static-abilities': [
    muPlusFn(2),
    runnerHandSizePlusFn(2),
  ],
};

// Brain Cage
export const brainCage: CardDef = {
  title: 'Brain Cage',
  'static-abilities': [runnerHandSizePlusFn(3)],
  'on-install': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':brain', 1, { card: card }); }),
  },
};

// Brain Chip
export const brainChip: CardDef = {
  title: 'Brain Chip',
  'x-fn': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    return Math.max((state as any)?.runner?.agendaPoint ?? 0, 0);
  }),
  'static-abilities': [
    muPlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (getxFn(state, side, eid, card, targets) > 0);
    })),
    muPlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return [':regular', getxFn(state, side, eid, card, targets)];
    })),
    runnerHandSizePlusFn(req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return getxFn(state, side, eid, card, targets);
    })),
  ],
};

// Buffer Drive
export const bufferDrive: CardDef = {
  title: 'Buffer Drive',
  events: [
    {
      event: 'runner-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const hasTrash = targets.some((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)));
        if (!hasTrash) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => runnerFn(x.card) && (inHandFn(x.card) || inDeckFn(x.card))));
      }),
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      prompt: 'Choose 1 trashed card to add to the bottom of the stack',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const trashCards = targets || [];
        const validCards = trashCards
          .filter((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)))
          .map((t: any) => t['moved-card']?.title || t.card?.title)
          .sort();
        return [...validCards, 'No action'];
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        if (target === 'No action') {
          effectCompletedFn(state, side, eid);
          return;
        }
        systemMsg(state, side, `uses ${card.title} to add ${target} to the bottom of the stack`);
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        const cardToMove = findCardFn(target, [...discard].reverse());
        if (cardToMove) {
          moveFn(state, side, cardToMove, ':deck');
        }
        effectCompletedFn(state, side, eid);
      }),
    },
    {
      event: 'corp-trash',
      'once-per-instance': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const hasTrash = targets.some((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)));
        if (!hasTrash) return false;
        return firstEventFn(state, null, 'trash',
          (t: any[]) => t.some((x: any) => runnerFn(x.card) && (inHandFn(x.card) || inDeckFn(x.card))));
      }),
      interactive: req(function*(state: any, side?: any, eid?: any, card?: any, targets?: any): Generator<any, any, any> { return true; }),
      prompt: 'Choose 1 trashed card to add to the bottom of the stack',
      choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const trashCards = targets || [];
        const validCards = trashCards
          .filter((t: any) => runnerFn(t.card) && (inHandFn(t.card) || inDeckFn(t.card)))
          .map((t: any) => t['moved-card']?.title || t.card?.title)
          .sort();
        return [...validCards, 'No action'];
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
        if (target === 'No action') {
          effectCompletedFn(state, side, eid);
          return;
        }
        systemMsg(state, side, `uses ${card.title} to add ${target} to the bottom of the stack`);
        const runner = runnerFn(state);
        const discard = runner?.discard || [];
        const cardToMove = findCardFn(target, [...discard].reverse());
        if (cardToMove) {
          moveFn(state, side, cardToMove, ':deck');
        }
        effectCompletedFn(state, side, eid);
      }),
    },
  ],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !zoneLockedFn(state, ':runner', ':discard');
    }),
    label: 'Add a card from the heap to the top of the stack',
    cost: [toC(':remove-from-game')],
    'show-discard': true,
    choices: { card: (c: Card) => runnerFn(c) && inDiscardFn(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `add ${target?.title || ''} to the top of the stack`; })(); },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; moveFn(target, ':deck', { front: true }); }),
  }],
};
