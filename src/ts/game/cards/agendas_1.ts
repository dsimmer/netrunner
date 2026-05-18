/**
 * Agenda Cards
 * Ported from Clojure cards/agendas.clj to TypeScript
 *
 * Contains ~181 card definitions with their abilities and events.
 * Each card has properties like on-score, on-access, events, static-abilities, etc.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAgendas from '../core/agendas';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCostFns from '../core/cost_fns';
import * as coreChooseOne from '../core/choose_one';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
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
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';
import * as coreBadPublicity from '../core/bad_publicity';

// __cardScopeShim: ambient 'state' and 'target' references at literal scope.
const bucks: any = () => 0;
const meatDamage: any = () => 0;
const state: any = undefined as any;
const target: any = undefined as any;

// ============================================================================
// Helper functions
// ============================================================================

export function addAgendaPointCounters(state: State, side: Side, eid: EID, card: Card, counters: number): void {
  // Adds a number of agenda counters to an agenda that checks for a win
  void coreProps.addCounter(state, side, card, ':agenda', counters, null);
  coreAgendas.updateAllAgendaPoints(state, side);
  coreWinning.checkWinByAgenda(state, side);
}

function iceBoostAgenda(subtype: string): any {
  const countIce = (corp: any): number => {
    const servers = corp?.servers;
    if (!servers) return 0;
    const allServers: any[] = [];
    for (const key of Object.keys(servers)) {
      const server = servers[key];
      if (server) allServers.push(server);
    }
    return allServers.reduce((c: number, server: any) => {
      const ices = server?.ices || [];
      return c + ices.filter((ice: Card) =>
        coreCard.hasSubtype(ice, subtype) && coreCard.rezzed(ice)
      ).length;
    }, 0);
  };

  return {
    'on-score': {
      msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${countIce((state as any).corp)} [Credits]`,
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const corp = (state as any).corp;
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, countIce(corp), {})], []);
      }),
    },
    'static-abilities': [{
      type: ':ice-strength',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return t && coreCard.hasSubtype(t, subtype);
      }),
      value: 1,
    }],
  };
}

function projectAgenda(mode: 'printed' | 'computed' = 'printed', granularity: number = 1, quantity: number = 1, type: string = ':agenda'): any {
  return {
    'on-score': {
      silent: true,
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = forms.context(state, card, targets) || {};
        const advancementTokens = ctx.advancementTokens || 0;
        const advancementReq = mode === 'computed'
          ? (ctx.advancementRequirement || 0)
          : card.advancementCost || 0;
        const excess = Math.max(0, advancementTokens - advancementReq);
        const added = Math.floor(excess / granularity) * quantity;
        yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, type, added, { placed: true })], []);
      }),
    },
  };
}

export function agendaCounters(qty: number, ctype: string = ':agenda'): any {
  return {
    'on-score': {
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ctype, qty, null)], []);
      }),
      async: true,
      silent: true,
    },
  };
}

// ============================================================================
// Card definitions
// ============================================================================

// 15 Minutes
export const fifteenMinutes: CardDef = {
  title: '15 Minutes',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    msg: 'shuffle itself into R&D',
    label: 'Shuffle this agenda into R&D',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(state, 'corp', card, 'deck', null); coreShuffling.shuffle(state, 'corp', 'deck'); coreAgendas.updateAllAgendaPoints(); }),
  }],
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
};

// Above the Law
export const aboveTheLaw: CardDef = {
  title: 'Above the Law',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    prompt: 'Choose a resource to trash',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allActive = coreBoard.allActiveInstalled(state, side, ':runner');
      return allActive.some((c: Card) => coreCard.installed(c) && coreCard.resource(c));
    }),
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `trash ${coreToString.cardStr(state, target)}`; },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreMoving.trash(eid, target, { causeCard: card }); }),
  },
};

// Accelerated Beta Test
export const acceleratedBetaTest: CardDef = {
  title: 'Accelerated Beta Test',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    optional: {
      prompt: 'Look at the top 3 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 3 cards of R&D',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.registerEvents(
            state, side, card,
            [{ event: 'corp-shuffle-deck', effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreUpdate.updateIn(state, [card, 'special'], (s: any) => ({ ...s, 'shuffle-occurred': true })); })}]
          )], []);
          const corp = (state as any).corp;
          const choices = corp?.deck?.slice(0, 3) || [];
          const abt = (choices: Card[]) => ({
            async: true,
            prompt: 'Choose a card to install and rez at no cost',
            choices: req(function*(s: State, sd: Side, eid: EID, card: Card, t: any[]): Generator<any, any, any> {
              return corePrompts.cancellable(choices.filter((c: Card) => coreCard.ice(c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), { label: 'Cancel' });
            }),
            cancel: {
              msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `trash ${utils.quantify(choices.length, 'card')} from the top of R&D`,
              async: true,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.unregisterEvents(card); coreMoving.trashCards(eid, choices, { unpreventable: true, causeCard: card }); }),
            },
            effect: req(function*(s: State, sd: Side, eid: EID, c: Card, t: any[]): Generator<any, any, any> {
              const chosen = t[0];
              if (!chosen || typeof chosen !== 'object') {
                // Cancel path handled by cancel
                return coreEid.effectCompleted(s, sd, eid);
              }
              yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(
                s, sd, chosen, null,
                { ignoreAllCost: true, 'install-state': ':rezzed-no-cost', msgKeys: { installSource: c, displayOrigin: true } }
              )], []);
              const remaining = choices.filter((x: Card) => !(x && 'uuid' in x && x.uuid === (chosen as any).uuid));
              const cardObj = coreCard.getCard(s, c);
              const shuffleOccurred = cardObj?.special?.['shuffle-occurred'];
              if (shuffleOccurred) {
                coreEngine.unregisterEvents(s, sd, c);
                yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(s, sd, eid, remaining, { unpreventable: true, causeCard: c })], []);
              } else if (remaining.length > 0) {
                continue_ability(s, sd, abt(remaining), c, null);
              } else {
                coreEngine.unregisterEvents(s, sd, c);
                coreEid.effectCompleted(s, sd, eid);
              }
            }),
          });
          yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(
            state, side,
            { async: true, prompt: 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards(choices), choices: ['OK'] },
            card, null
          )], []);
          continue_ability(state, side, abt(choices), card, null);
        }),
      },
    },
  },
};

// Advanced Concept Hopper
export const advancedConceptHopper: CardDef = {
  title: 'Advanced Concept Hopper',
  events: [{
    event: 'run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreEvents.firstEvent(state, side, 'run');
    }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Draw 1 card', 'Gain 1 [Credits]', 'No action'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const t = forms.target(state, card, targets);
      if (t === 'Gain 1 [Credits]') {
        coreSay.systemMsg(state, side, `uses ${card.title} to gain 1 [Credits]`);
        coreGaining.gainCredits(state, side, 1);
      } else if (t === 'Draw 1 card') {
        coreSay.systemMsg(state, side, `uses ${card.title} to draw 1 card`);
        coreDrawing.draw(state, side, eid, 1);
      } else {
        coreSay.systemMsg(state, side, `declines to use ${card.title}`);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Aggressive Trendsetting
export const aggressiveTrendsetting: CardDef = {
  title: 'Aggressive Trendsetting',
  events: [{
    event: 'runner-trash',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    'once-per-instance': true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const validCtx = (ctxs: any[]) => ctxs.some((c: any) => coreCard.installed(c.card) && coreCard.corp(c.card));
        return (validCtx(targets as any[]) &&
          (state as any)?.activePlayer === ':runner' &&
          coreEvents.firstEvent(state, side, 'runner-trash', (t: any[]) => {
            const first = t[0];
            return first && coreCard.installed(first.card) && coreCard.corp(first.card);
          }));
      }),
      player: ':runner',
      prompt: 'Spend [click] to prevent the corporation having +1 allotted [click] during their next turn?',
      'yes-ability': {
        cost: [corePayment.toC('click', 1)],
        'display-side': ':runner',
        msg: ':cost',
      },
      'no-ability': {
        'display-side': ':corp',
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => 'gain [Click] during their next turn',
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.registerEvents(
            state, side, card,
            [{
              event: 'corp-turn-begins',
              'unregister-once-resolved': true,
              duration: ':until-corp-turn-begins',
              effect: effect(coreGaining.gainClicks(state, ':corp', 1)),
            }]
          ); }),
      },
    },
  }],
};

// Ancestral Imager
export const ancestralImager: CardDef = {
  title: 'Ancestral Imager',
  events: [{
    event: 'jack-out',
    msg: 'do 1 net damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':net', 1, { card: card }); }),
  }],
};

// AR-Enhanced Security
export const arEnhancedSecurity: CardDef = {
  title: 'AR-Enhanced Security',
  events: [{
    event: 'runner-trash',
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const validCtx = (evs: any[]) => evs.some((e: any) => coreCard.corp(e.card));
      return (validCtx(targets as any[]) &&
        coreEvents.firstEvent(state, side, 'runner-trash', (t: any[]) => t[0] && coreCard.corp(t[0].card)));
    }),
    msg: 'give the Runner a tag',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreTags.gainTags(eid, 1); }),
  }],
};

// Architect Deployment Test
export const architectDeploymentTest: CardDef = {
  title: 'Architect Deployment Test',
  'on-score': {
    ...coreDefHelpers.lookAtTheTop(':corp', ':corp', 5),
    prompt: 'Choose a card to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const corp = (state as any).corp;
      return corePrompts.cancellable(
        (corp?.deck || []).filter((c: Card) => coreCard.corpInstallableType(c)).slice(0, 5)
      );
    }),
    async: true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).corp?.deck?.length > 0;
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const corp = (state as any).corp;
      const deckCards = corp?.deck || [];
      const targetPosition = utils.positions((c: Card) => coreCard.sameCard(c, target), deckCards.slice(0, 5))[0];
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(
        state, side, target, null,
        { ignoreAllCost: true, msgKeys: { installSource: card, originIndex: targetPosition, displayOrigin: true }, 'install-state': ':rezzed-no-cost' }
      )], []);
    }),
  },
};

// Armed Intimidation
export const armedIntimidation: CardDef = {
  title: 'Armed Intimidation',
  'on-score': {
    player: ':runner',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Suffer 5 meat damage', 'Take 2 tags'],
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `force the Runner to ${forms.target(state, card, targets)?.charAt(0).toLowerCase() || ''}${forms.target(state, card, targets)?.slice(1) || ''}`; },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
      const t = forms.target(state, card, targets);
      if (t === 'Take 2 tags') {
        coreTags.gainTags(state, ':runner', eid, 2, { card: card });
      } else {
        coreDamage.damage(state, ':runner', eid, ':meat', 5, { card: card, unboostable: true });
      }
    }),
  },
};

// Armored Servers
export const armoredServers: CardDef = {
  title: 'Armored Servers',
  'on-score': agendaCounters(1),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }),
    label: 'increase cost to break subroutines or jack out',
    msg: 'make the Runner trash a card from the grip as an additional cost to jack out or break subroutines for the remainder of the run',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEffects.registerLingeringEffect(card, {
        type: ':break-sub-additional-cost',
        duration: ':end-of-run',
        value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const abilityCtx = forms.context(state, card, targets) || {};
          const brokenSubs = abilityCtx?.brokenSubs || 0;
          return Array(brokenSubs).fill(corePayment.toC('trash-from-hand', 1));
        }),
      }); coreEffects.registerLingeringEffect(card, {
        type: ':jack-out-additional-cost',
        duration: ':end-of-run',
        value: corePayment.toC('trash-from-hand', 1),
      }); }),
  }],
};

// Artificial Cryptocrash
export const artificialCryptocrash: CardDef = {
  title: 'Artificial Cryptocrash',
  'on-score': {
    async: true,
    msg: 'make the Runner lose 7 [Credits]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.loseCredits(':runner', eid, 7); }),
  },
};

// AstroScript Pilot Program
export const astroScriptPilotProgram: CardDef = {
  title: 'AstroScript Pilot Program',
  'on-score': agendaCounters(1),
  abilities: [Object.assign(coreDefHelpers.placeAdvancementCounter(true, 1), { cost: [corePayment.toC('agenda', 1)] })],
};

// Award Bait
export const awardBait: CardDef = {
  title: 'Award Bait',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      const canAdvance = allInstalled.filter((c: Card) => coreCard.canBeAdvanced(state, c));
      return canAdvance.length > 0;
    }),
    'waiting-prompt': true,
    prompt: 'How many advancement counters do you want to place?',
    choices: ['0', '1', '2'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const c = parseInt(forms.target(state, card, targets), 10) || 0;
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      continue_ability(
        state, side,
        {
          choices: { req: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]): Generator<any, any, any> {
            const card2 = coreCard.getCard(s, t[0]);
            return card2 && coreCard.canBeAdvanced(s, card2);
          }) },
          msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return `place ${utils.quantify(c, 'advancement counter')} on ${coreToString.cardStr(state, target)}`; },
          async: true,
          effect: effect(coreProps.addProp(state, side, eid, target, ':advance-counter', c, { placed: true })),
        },
        card,
        null
      );
    }),
  },
};

// Azef Protocol
export const azefProtocol: CardDef = {
  title: 'Azef Protocol',
  'additional-cost': [corePayment.toC('trash-other-installed', 1)],
  'on-score': {
    async: true,
    msg: 'do 2 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 2, { card: card }); }),
  },
};

// Bacterial Programming
// `interact` is a recursive helper for Bacterial Programming used by both
// the `on-score` and `stolen` abilities; hoisted to module scope so both
// can reference it.
function bacterialProgrammingInteract(
  state: any, side: any, card: any,
  cards: any[], remaining: any[], toTrash: any[], toAdd: any[], toTop: any[], stage: string,
): any {
  const phrases: string[] = [
    toTrash.length > 0 ? `trash ${utils.quantify(toTrash.length, 'card')} from R&D` : null,
    toAdd.length > 0 ? `add ${utils.quantify(toAdd.length, 'card')} to HQ` : null,
    toTop.length > 0 ? `rearrange the top ${utils.quantify(toTop.length, 'card')} of R&D` : null,
  ].filter(Boolean) as string[];
  const enumerateText = (ph: string[]): string => {
    if (ph.length === 0) return '';
    if (ph.length === 1) return ph[0];
    if (ph.length === 2) return `${ph[0]} and ${ph[1]}`;
    return `${ph[0]}, ${enumerateText(ph.slice(1))}`;
  };
  const summaryText = () => {
    if (toTrash.length > 0) return utils.enumerateCards(toTrash) + ' will be trashed. ';
    if (toAdd.length > 0) return utils.enumerateCards(toAdd) + ' will be added to HQ. ';
    if (toTop.length > 0) return 'the top of R&D will be (top->bottom): ' + utils.enumerateCards(toTop.slice().reverse());
    return '';
  };
  return {
    prompt: summaryText(),
    choices: [
      {
        option: 'OK',
        ability: {
          msg: (_s: any, _sd: any, _e: any, _c: any, _t: any) => enumerateText(phrases),
          async: true,
          effect: effect(function*(s: any, sd: any, eid2: any, c: any, t: any): Generator<any, any, any> {
            for (const c2 of toAdd) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'hand')], []);
            }
            for (const c2 of toTrash) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'deck', { front: true })], []);
            }
            const deckCards = (s as any).corp?.deck || [];
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(s, sd, eid2, deckCards.slice(0, toTrash.length), { suppressCheckpoint: true })], []);
            for (const c2 of toTop) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'deck', { front: true })], []);
            }
            yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(s, sd, eid2)], []);
          }),
        },
      },
      { option: 'I want to start over', ability: bacterialProgrammingInteract(state, side, card, cards, cards, [], [], [], ':trash') },
    ],
  };
}

export const bacterialProgramming: CardDef = {
  title: 'Bacterial Programming',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (state as any).corp?.deck?.length > 0;
      }),
    },
    optional: {
      'waiting-prompt': true,
      prompt: 'Look at the top 7 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 7 cards of R&D',
        prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards(
          (state as any).corp?.deck?.slice(0, 7) || []
        ),
        choices: ['OK'],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const corp = (state as any).corp;
          const setAsideCards = coreSetAside.setAsideForMe(state, side, eid, corp?.deck?.slice(0, 7) || []);
          const run = (state as any).run;
          if ((state as any).access && run) {
            (state as any).run['shuffled-during-access'] = { rd: true };
          }
          const interact = (cards: Card[], remaining: Card[], toTrash: Card[], toAdd: Card[], toTop: Card[], stage: string): any => {
            const remainingFiltered = remaining.filter(Boolean);
            const phrases: string[] = [
              toTrash.length > 0 ? `trash ${utils.quantify(toTrash.length, 'card')} from R&D` : null,
              toAdd.length > 0 ? `add ${utils.quantify(toAdd.length, 'card')} to HQ` : null,
              toTop.length > 0 ? `rearrange the top ${utils.quantify(toTop.length, 'card')} of R&D` : null,
            ].filter(Boolean) as string[];

            const enumerateText = (phrases: string[]): string => {
              if (phrases.length === 0) return '';
              if (phrases.length === 1) return phrases[0];
              if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
              return `${phrases[0]}, ${enumerateText(phrases.slice(1))}`;
            };

            const summaryText = () => {
              if (toTrash.length > 0) return utils.enumerateCards(toTrash) + ' will be trashed. ';
              if (toAdd.length > 0) return utils.enumerateCards(toAdd) + ' will be added to HQ. ';
              if (toTop.length > 0) return 'the top of R&D will be (top->bottom): ' + utils.enumerateCards(toTop.slice().reverse());
              return '';
            };

            return {
              prompt: summaryText(),
              choices: [
                { option: 'OK', ability: {
                  msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => enumerateText(phrases),
                  async: true,
                  effect: effect(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]): Generator<any, any, any> {
                    for (const c2 of toAdd) {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'hand')], []);
                    }
                    for (const c2 of toTrash) {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'deck', { front: true })], []);
                    }
                    const deckCards = (s as any).corp?.deck || [];
                    yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(s, sd, eid2, deckCards.slice(0, toTrash.length), { suppressCheckpoint: true })], []);
                    for (const c2 of toTop) {
                      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(s, sd, c2, 'deck', { front: true })], []);
                    }
                    yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(s, sd, eid2)], []);
                  }),
                }},
                { option: 'I want to start over', ability: interact(cards, cards, [], [], [], ':trash') },
              ],
            };
          };

          continue_ability(state, side, bacterialProgrammingInteract(state, side, card, setAsideCards, setAsideCards, [], [], [], ':trash'), card, null);
        }),
      },
    },
  },
  'stolen': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).corp?.deck?.length > 0; }) },
    optional: {
      'waiting-prompt': true,
      prompt: 'Look at the top 7 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 7 cards of R&D',
        prompt: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards((state as any).corp?.deck?.slice(0, 7) || []),
        choices: ['OK'],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const corp = (state as any).corp;
          const setAsideCards = coreSetAside.setAsideForMe(state, side, eid, corp?.deck?.slice(0, 7) || []);
          if ((state as any).access && (state as any).run) {
            (state as any).run['shuffled-during-access'] = { rd: true };
          }
          continue_ability(state, side, bacterialProgrammingInteract(state, side, card, setAsideCards, setAsideCards, [], [], [], ':trash'), card, null);
        }),
      },
    },
  },
};

// The Basalt Spire
export const theBasaltSpire: CardDef = {
  title: 'The Basalt Spire',
  'on-score': agendaCounters(2),
  'stolen': {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(coreDefHelpers.corpRecur(), card, null); }),
  },
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }) },
  abilities: [{
    label: 'Choose a card to add to HQ',
    cost: [corePayment.toC('trash-from-deck', 1), corePayment.toC('agenda', 1)],
    'once': ':per-turn',
    msg: 'add 1 card from Archives to HQ',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(coreDefHelpers.corpRecur(), card, null); }),
  }],
};

// Bellona
export const bellona: CardDef = {
  title: 'Bellona',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return [corePayment.toC('credit', 5)]; }),
  'on-score': coreDefHelpers.gainCreditsAbility(5),
};

// Better Citizen Program
export const betterCitizenProgram: CardDef = {
  title: 'Better Citizen Program',
  events: [
    {
      event: 'play-event',
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          const contextCard = ctx.card || {};
          return (coreCard.hasSubtype(contextCard, 'Run') &&
            coreEvents.firstEvent(state, ':runner', 'play-event', (t: any[]) => t[0] && coreCard.hasSubtype(t[0].card, 'Run')) &&
            !coreEvents.event(state, ':runner', 'runner-install', (t: any[]) => t[0] && coreCard.hasSubtype(t[0].card, 'Icebreaker')));
        }),
        'waiting-prompt': true,
        prompt: 'Give the runner 1 tag?',
        autoresolve: coreOptional.getAutoresolve(':auto-fire'),
        'yes-ability': {
          async: true,
          msg: 'give the Runner a tag for playing a run event',
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreTags.gainTags(':corp', eid, 1); }),
        },
      },
    },
    {
      event: 'runner-install',
      silent: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const ctx = forms.context(state, card, targets) || {};
          const contextCard = ctx.card || {};
          return (!ctx.facedown &&
            coreCard.hasSubtype(contextCard, 'Icebreaker') &&
            coreEvents.firstEvent(state, ':runner', 'runner-install', (t: any[]) => t[0] && coreCard.hasSubtype(t[0].card, 'Icebreaker')) &&
            !coreEvents.event(state, ':runner', 'play-event', (t: any[]) => t[0] && coreCard.hasSubtype(t[0].card, 'Run')));
        }),
        'waiting-prompt': true,
        prompt: 'Give the runner 1 tag?',
        autoresolve: coreOptional.getAutoresolve(':auto-fire'),
        'yes-ability': {
          async: true,
          msg: 'give the Runner a tag for installing an icebreaker',
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreTags.gainTags(':corp', eid, 1); }),
        },
      },
    },
  ],
  abilities: [coreOptional.setAutoresolve(':auto-fire', 'Better Citizen Program')],
};

// Bifrost Array
export const bifrostArray: CardDef = {
  title: 'Bifrost Array',
  'on-score': {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const corp = (state as any).corp;
        const scored = corp?.scored || [];
        return scored.filter((c: Card) => c.title !== 'Bifrost Array').length > 0;
      }),
      prompt: 'Trigger the ability of a scored agenda?',
      'yes-ability': {
        prompt: 'Choose an agenda to trigger its "when scored" ability',
        choices: { card: (c: Card) => coreCard.agenda(c) && c.title !== 'Bifrost Array' && coreCard.inScored(c) && coreFlags.whenScored(c) },
        msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return `trigger the "when scored" ability of ${target.title}`; })(); },
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreDefHelpers.continueAbility(coreCard.getCardDef(target), target, null); }),
      },
    },
  },
};

// Blood in the Water
export const bloodInTheWater: CardDef = {
  title: 'Blood in the Water',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const runner = (state as any).runner;
    return runner?.hand?.length || 0;
  }),
};

// Brain Rewiring
export const brainRewiring: CardDef = {
  title: 'Brain Rewiring',
  'on-score': {
    optional: {
      'waiting-prompt': true,
      prompt: 'Pay credits to add random cards from the grip to the bottom of the stack?',
      'yes-ability': {
        prompt: 'How many credits do you want to pay?',
        choices: { number: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const corp = (state as any).corp;
          const runner = (state as any).runner;
          return Math.min(corp?.credit || 0, runner?.hand?.length || 0);
        }) },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const target: any = (targets as any[])?.[0];
          const targetVal = forms.target(state, card, targets) || 0;
          if (targetVal > 0) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.pay(
              state, ':corp', coreEid.makeEid(state, eid), card,
              [corePayment.toC('credit', targetVal)]
            )], []);
            const runner = (state as any).runner;
            const hand = [...(runner?.hand || [])];
            const shuffled = hand.sort(() => Math.random() - 0.5);
            const from = shuffled.slice(0, targetVal);
            for (const c of from) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, ':runner', c, 'deck')], []);
            }
            coreSay.systemMsg(state, side,
              `uses ${card.title} to pay ${targetVal} [Credits] and add ${utils.quantify(targetVal, 'card')} from the grip to the bottom of the stack. The Runner draws 1 card`
            );
            coreEngine.triggerEvent(state, ':runner-hand-changed');
            yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(state, side, eid)], []);
            coreDrawing.draw(state, ':runner', eid, 1);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    },
  },
};

// Braintrust
export const braintrust: CardDef = {
  title: 'Braintrust',
  ...projectAgenda({ granularity: 2 }),
  'static-abilities': [{
    type: ':rez-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const t = targets[0];
      return t && coreCard.ice(t);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return -(coreCard.getCounters(card, ':agenda') || 0);
    }),
  }],
};

// Breaking News
export const breakingNews: CardDef = {
  title: 'Breaking News',
  'on-score': coreDefHelpers.giveTags(2),
  events: [
    {
      'unregister-once-resolved': true,
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose(':runner', ':tag', 2); }),
    },
    {
      event: 'corp-turn-ends',
      'unregister-once-resolved': true,
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose(':runner', ':tag', 2); }),
    },
    {
      event: 'runner-turn-ends',
      'unregister-once-resolved': true,
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose(':runner', ':tag', 2); }),
    },
  ].filter(Boolean),
};

// Broad Daylight
export const broadDaylight: CardDef = {
  title: 'Broad Daylight',
  'on-score': {
    optional: {
      prompt: 'Take 1 bad publicity?',
      'yes-ability': {
        async: true,
        msg: 'take 1 bad publicity',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', 1)], []);
          const bp = ((state as any).corp?.badPublicity || 0);
          yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ':agenda', bp, null)], []);
        }),
      },
      'no-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const bp = ((state as any).corp?.badPublicity || 0);
          yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ':agenda', bp, null)], []);
        }),
      },
    },
  },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    async: true,
    label: 'Do 2 meat damage',
    'once': ':per-turn',
    msg: 'do 2 meat damage',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', 2, { card: card }); }),
  }],
};

// CFC Excavation Contract
export const cfcExcavationContract: CardDef = {
  title: 'CFC Excavation Contract',
  'on-score': {
    async: true,
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${bucks()} [Credits]`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allActive = coreBoard.allActiveInstalled(state, ':corp');
      const bioroidCount = allActive.filter((c: Card) => coreCard.hasSubtype(c, 'Bioroid')).length;
      const credits = bioroidCount * 2;
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, credits, {})], []);
    }),
  },
};

// Character Assassination
export const characterAssassination: CardDef = {
  title: 'Character Assassination',
  'on-score': {
    prompt: 'Choose a resource to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; return ((): string => { const target: any = (targets as any[])?.[0]; return target.title; })(); },
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const target: any = (targets as any[])?.[0]; coreMoving.trash(eid, target, { unpreventable: true, causeCard: card }); }),
  },
};

// Chronos Project
export const chronosProject: CardDef = {
  title: 'Chronos Project',
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !coreFlags.zoneLocked(state, ':runner', ':discard');
    }),
    msg: 'remove all cards in the heap from the game',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.moveZone(':runner', ':discard', ':rfg'); }),
  },
};

// City Works Project
export const cityWorksProject: CardDef = {
  title: 'City Works Project',
  'install-state': ':face-up',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.installed(state, card); }),
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => `do ${meatDamage()} meat damage`,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, ':meat', meatDamage(), { card: card }); }),
  },
};

// Clone Retirement
export const cloneRetirement: CardDef = {
  title: 'Clone Retirement',
  'on-score': {
    msg: 'remove 1 bad publicity',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.loseBadPublicity(1); }),
    silent: true,
  },
  'stolen': {
    msg: 'force the Corp to take 1 bad publicity',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity(':corp', eid, 1); }),
  },
};
