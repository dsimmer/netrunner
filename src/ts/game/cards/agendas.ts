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
import * as coreCostFns from '../core/cost-fns';
import * as coreChooseOne from '../core/choose-one';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
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
import * as coreSetAside from '../core/set-aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreWinning from '../core/winning';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

// ============================================================================
// Helper functions
// ============================================================================

function addAgendaPointCounters(state: State, side: Side, eid: EID, card: Card, counters: number): void {
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
      msg: (msgFn: any) => `gain ${countIce((state as any).corp)} [Credits]`,
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corp = (state as any).corp;
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, countIce(corp), {})], []);
      }),
    },
    'static-abilities': [{
      type: ':ice-strength',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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

function agendaCounters(qty: number, ctype: string = ':agenda'): any {
  return {
    'on-score': {
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    effect: effect(
      coreMoving.move(state, 'corp', card, 'deck', null),
      coreShuffling.shuffle(state, 'corp', 'deck'),
      coreAgendas.updateAllAgendaPoints()
    ),
  }],
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
};

// Above the Law
export const aboveTheLaw: CardDef = {
  title: 'Above the Law',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'Choose a resource to trash',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActive = coreBoard.allActiveInstalled(state, side, ':runner');
      return allActive.some((c: Card) => coreCard.installed(c) && coreCard.resource(c));
    }),
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
    msg: (msgFn: any) => `trash ${coreToString.cardStr(state, target)}`,
    async: true,
    effect: effect(coreMoving.trash(eid, target, { causeCard: card })),
  },
};

// Accelerated Beta Test
export const acceleratedBetaTest: CardDef = {
  title: 'Accelerated Beta Test',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Look at the top 3 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 3 cards of R&D',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.registerEvents(
            state, side, card,
            [{ event: 'corp-shuffle-deck', effect: effect(
              coreUpdate.updateIn(state, [card, 'special'], (s: any) => ({ ...s, 'shuffle-occurred': true }))
            )}]
          )], []);
          const corp = (state as any).corp;
          const choices = corp?.deck?.slice(0, 3) || [];
          const abt = (choices: Card[]) => ({
            async: true,
            prompt: 'Choose a card to install and rez at no cost',
            choices: req(function*(s: State, sd: Side, eid: EID, card: Card, t: any[]) {
              return corePrompts.cancellable(choices.filter((c: Card) => coreCard.ice(c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), { label: 'Cancel' });
            }),
            cancel: {
              msg: (msgFn: any) => `trash ${utils.quantify(choices.length, 'card')} from the top of R&D`,
              async: true,
              effect: effect(
                coreEngine.unregisterEvents(card),
                coreMoving.trashCards(eid, choices, { unpreventable: true, causeCard: card })
              ),
            },
            effect: req(function*(s: State, sd: Side, eid: EID, c: Card, t: any[]) {
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
            s, sd,
            { async: true, prompt: 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards(choices), choices: ['OK'] },
            c, null
          )], []);
          continue_ability(s, sd, abt(choices), c, null);
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.firstEvent(state, side, 'run');
    }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Draw 1 card', 'Gain 1 [Credits]', 'No action'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'once-per-instance': true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
        msg: (msgFn: any) => 'gain [Click] during their next turn',
        effect: effect(
          coreEngine.registerEvents(
            state, side, card,
            [{
              event: 'corp-turn-begins',
              'unregister-once-resolved': true,
              duration: ':until-corp-turn-begins',
              effect: effect(coreGaining.gainClicks(state, ':corp', 1)),
            }]
          )
        ),
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
    effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })),
  }],
};

// AR-Enhanced Security
export const arEnhancedSecurity: CardDef = {
  title: 'AR-Enhanced Security',
  events: [{
    event: 'runner-trash',
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'once-per-instance': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const validCtx = (evs: any[]) => evs.some((e: any) => coreCard.corp(e.card));
      return (validCtx(targets as any[]) &&
        coreEvents.firstEvent(state, side, 'runner-trash', (t: any[]) => t[0] && coreCard.corp(t[0].card)));
    }),
    msg: 'give the Runner a tag',
    effect: effect(coreTags.gainTags(eid, 1)),
  }],
};

// Architect Deployment Test
export const architectDeploymentTest: CardDef = {
  title: 'Architect Deployment Test',
  'on-score': {
    ...coreDefHelpers.lookAtTheTop(':corp', ':corp', 5),
    prompt: 'Choose a card to install',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      return corePrompts.cancellable(
        (corp?.deck || []).filter((c: Card) => coreCard.corpInstallableType(c)).slice(0, 5)
      );
    }),
    async: true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).corp?.deck?.length > 0;
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Suffer 5 meat damage', 'Take 2 tags'],
    msg: (msgFn: any) => `force the Runner to ${forms.target(state, card, targets)?.charAt(0).toLowerCase() || ''}${forms.target(state, card, targets)?.slice(1) || ''}`,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    label: 'increase cost to break subroutines or jack out',
    msg: 'make the Runner trash a card from the grip as an additional cost to jack out or break subroutines for the remainder of the run',
    effect: effect(
      coreEffects.registerLingeringEffect(card, {
        type: ':break-sub-additional-cost',
        duration: ':end-of-run',
        value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const abilityCtx = forms.context(state, card, targets) || {};
          const brokenSubs = abilityCtx?.brokenSubs || 0;
          return Array(brokenSubs).fill(corePayment.toC('trash-from-hand', 1));
        }),
      }),
      coreEffects.registerLingeringEffect(card, {
        type: ':jack-out-additional-cost',
        duration: ':end-of-run',
        value: corePayment.toC('trash-from-hand', 1),
      })
    ),
  }],
};

// Artificial Cryptocrash
export const artificialCryptocrash: CardDef = {
  title: 'Artificial Cryptocrash',
  'on-score': {
    async: true,
    msg: 'make the Runner lose 7 [Credits]',
    effect: effect(coreGaining.loseCredits(':runner', eid, 7)),
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
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': {
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      const canAdvance = allInstalled.filter((c: Card) => coreCard.canBeAdvanced(state, c));
      return canAdvance.length > 0;
    }),
    'waiting-prompt': true,
    prompt: 'How many advancement counters do you want to place?',
    choices: ['0', '1', '2'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = parseInt(forms.target(state, card, targets), 10) || 0;
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      continue_ability(
        state, side,
        {
          choices: { req: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
            const card2 = coreCard.getCard(s, t[0]);
            return card2 && coreCard.canBeAdvanced(s, card2);
          }) },
          msg: (msgFn: any) => `place ${utils.quantify(c, 'advancement counter')} on ${coreToString.cardStr(state, target)}`,
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
    effect: effect(coreDamage.damage(eid, ':meat', 2, { card: card })),
  },
};

// Bacterial Programming
export const bacterialProgramming: CardDef = {
  title: 'Bacterial Programming',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).corp?.deck?.length > 0;
      }),
    },
    optional: {
      'waiting-prompt': true,
      prompt: 'Look at the top 7 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 7 cards of R&D',
        prompt: (msgFn: any) => 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards(
          (state as any).corp?.deck?.slice(0, 7) || []
        ),
        choices: ['OK'],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const setAsideCards = coreSetAside.setAsideForMe(state, side, eid, corp?.deck?.slice(0, 7) || []);
          const run = (state as any).run;
          if ((state as any).access && run) {
            (state as any).run['shuffled-during-access'] = { rd: true };
          }
          const interact = (cards: Card[], remaining: Card[], toTrash: Card[], toAdd: Card[], toTop: Card[], stage: string) => {
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
                  msg: (msgFn: any) => enumerateText(phrases),
                  async: true,
                  effect: effect(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
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

          continue_ability(state, side, interact(setAsideCards, setAsideCards, [], [], [], ':trash'), card, null);
        }),
      },
    },
  },
  'stolen': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.deck?.length > 0; }) },
    optional: {
      'waiting-prompt': true,
      prompt: 'Look at the top 7 cards of R&D?',
      'yes-ability': {
        async: true,
        msg: 'look at the top 7 cards of R&D',
        prompt: (msgFn: any) => 'The top cards of R&D are (top->bottom): ' + utils.enumerateCards((state as any).corp?.deck?.slice(0, 7) || []),
        choices: ['OK'],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const setAsideCards = coreSetAside.setAsideForMe(state, side, eid, corp?.deck?.slice(0, 7) || []);
          if ((state as any).access && (state as any).run) {
            (state as any).run['shuffled-during-access'] = { rd: true };
          }
          continue_ability(state, side, interact(setAsideCards, setAsideCards, [], [], [], ':trash'), card, null);
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
    effect: effect(continue_ability(coreDefHelpers.corpRecur(), card, null)),
  },
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  abilities: [{
    label: 'Choose a card to add to HQ',
    cost: [corePayment.toC('trash-from-deck', 1), corePayment.toC('agenda', 1)],
    'once': ':per-turn',
    msg: 'add 1 card from Archives to HQ',
    async: true,
    effect: effect(continue_ability(coreDefHelpers.corpRecur(), card, null)),
  }],
};

// Bellona
export const bellona: CardDef = {
  title: 'Bellona',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('credit', 5)]; }),
  'on-score': coreDefHelpers.gainCreditsAbility(5),
};

// Better Citizen Program
export const betterCitizenProgram: CardDef = {
  title: 'Better Citizen Program',
  events: [
    {
      event: 'play-event',
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
          effect: effect(coreTags.gainTags(':corp', eid, 1)),
        },
      },
    },
    {
      event: 'runner-install',
      silent: true,
      optional: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
          effect: effect(coreTags.gainTags(':corp', eid, 1)),
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
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const corp = (state as any).corp;
        const scored = corp?.scored || [];
        return scored.filter((c: Card) => c.title !== 'Bifrost Array').length > 0;
      }),
      prompt: 'Trigger the ability of a scored agenda?',
      'yes-ability': {
        prompt: 'Choose an agenda to trigger its "when scored" ability',
        choices: { card: (c: Card) => coreCard.agenda(c) && c.title !== 'Bifrost Array' && coreCard.inScored(c) && coreFlags.whenScored(c) },
        msg: (msgFn: any) => `trigger the "when scored" ability of ${target.title}`,
        async: true,
        effect: effect(coreDefHelpers.continueAbility(coreCard.getCardDef(target), target, null)),
      },
    },
  },
};

// Blood in the Water
export const bloodInTheWater: CardDef = {
  title: 'Blood in the Water',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
        choices: { number: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const runner = (state as any).runner;
          return Math.min(corp?.credit || 0, runner?.hand?.length || 0);
        }) },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t && coreCard.ice(t);
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect(coreGaining.lose(':runner', ':tag', 2)),
    },
    {
      event: 'corp-turn-ends',
      'unregister-once-resolved': true,
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect(coreGaining.lose(':runner', ':tag', 2)),
    },
    {
      event: 'runner-turn-ends',
      'unregister-once-resolved': true,
      req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'make the Runner lose 2 tags',
      effect: effect(coreGaining.lose(':runner', ':tag', 2)),
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
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', 1)], []);
          const bp = ((state as any).corp?.badPublicity || 0);
          yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ':agenda', bp, null)], []);
        }),
      },
      'no-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    effect: effect(coreDamage.damage(eid, ':meat', 2, { card: card })),
  }],
};

// CFC Excavation Contract
export const cfcExcavationContract: CardDef = {
  title: 'CFC Excavation Contract',
  'on-score': {
    async: true,
    msg: (msgFn: any) => `gain ${bucks()} [Credits]`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
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
    msg: (msgFn: any) => target.title,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    effect: effect(coreMoving.trash(eid, target, { unpreventable: true, causeCard: card })),
  },
};

// Chronos Project
export const chronosProject: CardDef = {
  title: 'Chronos Project',
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !coreFlags.zoneLocked(state, ':runner', ':discard');
    }),
    msg: 'remove all cards in the heap from the game',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    effect: effect(coreMoving.moveZone(':runner', ':discard', ':rfg')),
  },
};

// City Works Project
export const cityWorksProject: CardDef = {
  title: 'City Works Project',
  'install-state': ':face-up',
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.installed(state, card); }),
    msg: (msgFn: any) => `do ${meatDamage()} meat damage`,
    async: true,
    effect: effect(coreDamage.damage(eid, ':meat', meatDamage(), { card: card })),
  },
};

// Clone Retirement
export const cloneRetirement: CardDef = {
  title: 'Clone Retirement',
  'on-score': {
    msg: 'remove 1 bad publicity',
    effect: effect(coreBadPublicity.loseBadPublicity(1)),
    silent: true,
  },
  'stolen': {
    msg: 'force the Corp to take 1 bad publicity',
    effect: effect(coreBadPublicity.gainBadPublicity(':corp', eid, 1)),
  },
};

// Corporate Oversight A
export const corporateOversightA: CardDef = {
  title: 'Corporate Oversight A',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Search R&D for a piece of ice to install protecting a remote server?',
      'yes-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
          if (deckIces.length > 0) {
            continue_ability(
              state, side,
              {
                async: true,
                prompt: 'Choose a piece of ice',
                choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const corp = (state as any).corp;
                  return (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
                }),
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const chosenIce = target;
                  continue_ability(
                    state, side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard.installableServers(state, chosenIce).filter((s: string) => !['HQ', 'Archives', 'R&D'].includes(s)),
                      effect: effect(
                        coreShuffling.shuffle(state, ':deck'),
                        coreInstalling.corpInstall(eid, chosenIce, target, { ignoreAllCost: true, 'install-state': ':rezzed-no-cost' })
                      ),
                    },
                    card,
                    null
                  );
                }),
              },
              card,
              null
            );
          } else {
            continue_ability(
              state, side,
              { prompt: 'You have no ice in R&D', choices: ['Carry on!'], 'prompt-type': ':bogus', msg: 'shuffle R&D', effect: effect(coreShuffling.shuffle(state, ':deck')) },
              card,
              null
            );
          }
        }),
      },
    },
  },
};

// Corporate Oversight B
export const corporateOversightB: CardDef = {
  title: 'Corporate Oversight B',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Search R&D for a piece of ice to install protecting a central server?',
      'yes-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
          if (deckIces.length > 0) {
            continue_ability(
              state, side,
              {
                async: true,
                prompt: 'Choose a piece of ice',
                choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const corp = (state as any).corp;
                  return (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
                }),
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const chosenIce = target;
                  continue_ability(
                    state, side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard.installableServers(state, chosenIce).filter((s: string) => ['HQ', 'Archives', 'R&D'].includes(s)),
                      effect: effect(
                        coreShuffling.shuffle(state, ':deck'),
                        coreInstalling.corpInstall(eid, chosenIce, target, { ignoreAllCost: true, 'install-state': ':rezzed-no-cost' })
                      ),
                    },
                    card,
                    null
                  );
                }),
              },
              card,
              null
            );
          } else {
            continue_ability(
              state, side,
              { prompt: 'You have no ice in R&D', choices: ['Carry on!'], 'prompt-type': ':bogus', msg: 'shuffle R&D', effect: effect(coreShuffling.shuffle(state, ':deck')) },
              card,
              null
            );
          }
        }),
      },
    },
  },
};

// Corporate Sales Team
export const corporateSalesTeam: CardDef = {
  title: 'Corporate Sales Team',
  'on-score': agendaCounters(10, ':credit'),
  events: [
    {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (card && (coreCard.getCounters(card, ':credit') || 0) > 0);
      }),
      msg: 'gain 1 [Credits]',
      automatic: ':gain-credits',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.takeCredits(state, side, eid, card, ':credit', 1)], []);
      }),
    },
  ].map(e => ({ ...e, event: 'runner-turn-begins' })),
};

// Corporate War
export const corporateWar: CardDef = {
  title: 'Corporate War',
  'on-score': {
    msg: (msgFn: any) => ((state as any).corp?.credit > 6 ? 'gain 7 [Credits]' : 'lose all credits'),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      if (corp?.credit > 6) {
        coreGaining.gainCredits(state, side, 7);
      } else {
        coreGaining.loseCredits(state, side, ':all');
      }
    }),
  },
};

// Crisis Management
export const crisisManagement: CardDef = {
  title: 'Crisis Management',
  events: [{
    event: 'corp-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    async: true,
    label: 'Do 1 meat damage (start of turn)',
    automatic: ':corp-damage',
    'once': ':per-turn',
    msg: 'do 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { card: card })),
  }],
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    async: true,
    label: 'Do 1 meat damage (start of turn)',
    automatic: ':corp-damage',
    'once': ':per-turn',
    msg: 'do 1 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 1, { card: card })),
  }],
};

// Cyberdex Sandbox
export const cyberdexSandbox: CardDef = {
  title: 'Cyberdex Sandbox',
  'on-score': {
    optional: {
      prompt: 'Purge virus counters?',
      'yes-ability': { msg: 'purge virus counters', async: true, effect: effect(corePurging.purge(eid)) },
    },
  },
  events: [{
    event: 'purge',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.firstEvent(state, side, 'purge');
    }),
    msg: 'gain 4 [Credits]',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, ':corp', eid, 4)], []);
    }),
  }],
};

// Dedicated Neural Net
export const dedicatedNeuralNet: CardDef = {
  title: 'Dedicated Neural Net',
  events: [{
    event: 'successful-run',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    psi: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return forms.target(state, card, targets) === 'hq' &&
          coreEvents.firstEvent(state, side, 'successful-run', (t: any[]) => {
            const first = t[0];
            return first && coreServers.targetServer(first) === 'hq';
          });
      }),
      'not-equal': {
        async: true,
        effect: effect(
          coreEffects.registerLingeringEffect(card, {
            type: ':corp-choose-hq-access',
            duration: ':end-of-run',
            value: true,
          }),
          coreEid.effectCompleted(eid)
        ),
      },
    },
  }],
};

// Degree Mill
export const degreeMill: CardDef = {
  title: 'Degree Mill',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return [corePayment.toC('shuffle-installed-to-stack', 2)];
  }),
};

// Director Haas' Pet Project
export const directorsPetProject: CardDef = {
  title: 'Director Haas\' Pet Project',
  'on-score': {
    optional: {
      prompt: 'Install cards in a new remote server?',
      'yes-ability': {
        async: true,
        prompt: 'Choose a card to install',
        choices: {
          card: (c: Card) => coreCard.corp(c) && !coreCard.operation(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
        },
        'show-discard': true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const remoteNames = coreBoard.getRemoteNames(state);
          const server = remoteNames.length > 0 ? remoteNames[remoteNames.length - 1] : 'New remote';
          yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(
            state, side, target, server,
            { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true } }
          )], []);
          continue_ability(state, side, installAbility(server, 0), card, null);
        }),
      },
    },
  },
};

// Divested Trust
export const divestedTrust: CardDef = {
  title: 'Divested Trust',
  events: [{
    event: 'agenda-stolen',
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const winner = (state as any).winner;
      if (winner) {
        coreEid.effectCompleted(state, side, eid);
        return;
      }
      const foundCard = coreFinding.findLatest(state, card);
      const stolenAgenda = coreFinding.findLatest(state, (forms.context(state, card, targets) || {}).card);
      if (!foundCard || !stolenAgenda) {
        coreEid.effectCompleted(state, side, eid);
        return;
      }
      const title = stolenAgenda.title || '';
      const inScored = coreFlags.inRunnerScored(state, side, foundCard);
      const cardSide = inScored ? ':runner' : ':corp';
      const prompt = `Forfeit Divested Trust to add ${title} to HQ and gain 5 [Credits]?`;
      const message = `add ${title} to HQ and gain 5 [Credits]`;
      continue_ability(
        state, side,
        {
          optional: {
            'waiting-prompt': true,
            prompt: prompt,
            'yes-ability': {
              msg: message,
              async: true,
              effect: effect(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.forfeit(state, cardSide, coreEid.makeEid(state, eid), foundCard)], []);
                yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, stolenAgenda, 'hand')], []);
                coreAgendas.updateAllAgendaPoints(state, side);
                yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid2, 5)], []);
              }),
            },
          },
        },
        foundCard,
        null
      );
    }),
  }],
};

// Domestic Sleepers
export const domesticSleepers: CardDef = {
  title: 'Domestic Sleepers',
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.getCounters(card, ':agenda') || 0) > 0 ? 1 : 0;
  }),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 3)],
    msg: 'place 1 agenda counter on itself',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addAgendaPointCounters(state, side, eid, card, 1);
    }),
  }],
};

// Élivágar Bifurcation
export const elivagarBifurcation: CardDef = {
  title: 'Élivágar Bifurcation',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'waiting-prompt': true,
    prompt: 'Choose a card to derez',
    choices: { card: (c: Card) => coreCard.rezzed(c) },
    async: true,
    effect: effect(coreRezzing.derez(state, side, eid, target)),
  },
};

// Eden Fragment
export const edenFragment: CardDef = {
  title: 'Eden Fragment',
  'static-abilities': [{
    type: ':ignore-install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t && coreCard.ice(t) &&
        (coreEvents.turnEvents(state, side, ':corp-install')
          .map((e: any) => e.card)
          .filter((c: any) => coreCard.ice(c))
          .length === 0);
    }),
    value: true,
  }],
  events: [{
    event: 'corp-install',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t && coreCard.ice(t) &&
        (coreEvents.turnEvents(state, side, ':corp-install')
          .map((e: any) => e.card)
          .filter((c: any) => coreCard.ice(c))
          .length === 0);
    }),
    msg: 'ignore the install cost of the first piece of ice this turn',
  }],
};

// Efficiency Committee
export const efficiencyCommittee: CardDef = {
  title: 'Efficiency Committee',
  'on-score': agendaCounters(3),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    effect: effect(
      coreGaining.gainClicks(2),
      coreFlags.registerTurnFlag!(card, ':can-advance', () => false)
    ),
    'keep-menu-open': ':while-agenda-tokens-left',
    msg: 'gain [Click][Click]',
  }],
};

// Elective Upgrade
export const electiveUpgrade: CardDef = {
  title: 'Elective Upgrade',
  'on-score': agendaCounters(2),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    'once': ':per-turn',
    effect: effect(coreGaining.gainClicks(2)),
    msg: 'gain [Click][Click]',
  }],
};

// Embedded Reporting
export const embeddedReporting: CardDef = {
  title: 'Embedded Reporting',
  ...projectAgenda({ quantity: 2, mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    skippable: true,
    optional: {
      prompt: 'Search R&D for an Operation?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0 && (state as any).corp?.deck?.length > 0;
      }),
      'yes-ability': {
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).filter((c: Card) => coreCard.operation(c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), { sorted: true });
        }),
        prompt: 'Move an operation to the top of R&D',
        async: true,
        msg: (msgFn: any) => `reveal ${target.title} from R&D, shuffle R&D, and place it ontop`,
        cost: [corePayment.toC('agenda', 1)],
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, target)], []);
          const setAside = coreSetAside.setAsideForMe(state, side, eid, [target]);
          const c = setAside[0] || target;
          coreShuffling.shuffle(state, side, ':deck');
          coreMoving.move(state, side, c, 'deck', { front: true });
          coreEid.effectCompleted(state, side, eid);
        }),
        cancel: {
          msg: 'shuffle R&D',
          cost: [corePayment.toC('agenda', 1)],
          effect: effect(coreShuffling.shuffle(state, side, ':deck')),
        },
      },
    },
  }],
};

// Eminent Domain
export const eminentDomain: CardDef = {
  title: 'Eminent Domain',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Search R&D for 1 card to install and rez, ignoring all costs?',
      'yes-ability': {
        async: true,
        prompt: 'Choose a card to install',
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const deck = corp?.deck || [];
          const installable = deck
            .filter((c: Card) => coreCard.corpInstallableType(c))
            .sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
          return [...installable.map((c: Card) => c), 'Cancel'];
        }),
        cancel: coreShuffling.shuffleMyDeck!,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreShuffling.shuffle(state, side, ':deck');
          yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(
            state, side, target, null,
            { 'install-state': ':rezzed-no-cost', msgKeys: { installSource: card, displayOrigin: true }, ignoreAllCost: true }
          )], []);
        }),
      },
    },
  },
  expend: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      return (corp?.hand || []).some((c: Card) => coreCard.corpInstallableType(c));
    }),
    cost: [corePayment.toC('credit', 1)],
    prompt: 'Choose 1 card to install and rez, paying 5 [Credits] less',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.inHand(target) && coreCard.corpInstallableType(target) && !coreCard.sameCard(card, target);
      }),
    },
    msg: 'install and rez 1 card from HQ, paying 5 [Credits] less',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(
        state, side, target, null,
        { 'install-state': ':rezzed', msgKeys: { installSource: card, displayOrigin: true }, combinedCreditDiscount: 5 }
      )], []);
    }),
  },
};


// Encrypted Portals
export const encryptedPortals: CardDef = {
  title: 'Encrypted Portals',
  ...iceBoostAgenda('Code Gate'),
};

// Escalate Vitriol
export const escalateVitriol: CardDef = {
  title: 'Escalate Vitriol',
  abilities: [{
    action: true,
    label: 'Gain 1 [Credit] for each Runner tag',
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }) },
    cost: [corePayment.toC('click', 1)],
    'once': ':per-turn',
    msg: (msgFn: any) => `gain ${utils.countTags(state)} [Credits]`,
    async: true,
    effect: effect(coreGaining.gainCredits(eid, utils.countTags(state))),
  }],
};

// Executive Retreat
export const executiveRetreat: CardDef = {
  title: 'Executive Retreat',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreShuffling.shuffleIntoDeck(state, side, ':hand');
      yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, eid, card, ':agenda', 1, null)], []);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
  },
  abilities: [coreDefHelpers.drawAbi(5, null, { action: true, cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)], 'keep-menu-open': ':while-agenda-tokens-left' })],
};

// Explode-a-palooza
export const explodeAPalooza: CardDef = {
  title: 'Explode-a-palooza',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': {
    optional: {
      'waiting-prompt': true,
      prompt: 'Gain 5 [Credits]?',
      'yes-ability': coreDefHelpers.gainCreditsAbility(5),
    },
  },
};

// Evidence Collection
export const evidenceCollection: CardDef = {
  title: 'Evidence Collection',
  events: [{ event: 'win', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).winner === ':corp'; }), msg: 'reveal set 2' }],
};

// Evidence Collection 2
export const evidenceCollection2: CardDef = {
  title: 'Evidence Collection 2',
  events: [{ event: 'win', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).winner === ':corp'; }), msg: 'reveal set 5' }],
};

// Evidence Collection 3
export const evidenceCollection3: CardDef = {
  title: 'Evidence Collection 3',
  events: [{ event: 'win', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).winner === ':corp'; }), msg: 'reveal set 8' }],
};

// Evidence Collection 4
export const evidenceCollection4: CardDef = {
  title: 'Evidence Collection 4',
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 1; }),
};

// False Lead
export const falseLead: CardDef = {
  title: 'False Lead',
  events: [{
    event: 'post-runner-turn-begins',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const askWhen = card.special?.['ask-when-runner-turn-starts'];
        return (askWhen === 'Always' || (askWhen === 'When tagged' && forms.tagged(state)));
      }),
      prompt: 'Fire False Lead?',
      'waiting-prompt': true,
      'yes-ability': {
        'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.click >= 2; }) },
        label: 'runner loses [Click][Click]',
        msg: 'force the Runner to lose [Click][Click]',
        cost: [corePayment.toC('forfeit-self')],
        effect: effect(coreGaining.loseClicks(':runner', 2)),
      },
    },
  }],
  abilities: [{
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).runner?.click >= 2; }) },
    label: 'runner loses [Click][Click]',
    msg: 'force the Runner to lose [Click][Click]',
    cost: [corePayment.toC('forfeit-self')],
    effect: effect(coreGaining.loseClicks(':runner', 2)),
  }, {
    label: 'Ask when runner turn begins?',
    prompt: 'Ask to use False Lead after the Runner turn begins?',
    choices: ['Always', 'Never', 'When tagged'],
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreUpdate.updateIn(state, side, card, (c: any) => ({ ...c, special: { ...c.special, 'ask-when-runner-turn-starts': forms.target(state, card, targets) } }))], []);
      coreToasts.toast(state, ':corp', `False Lead prompt set to: ${forms.target(state, card, targets)}`, 'warning');
    }),
  }],
};

// Fetal AI
export const fetalAI: CardDef = {
  title: 'Fetal AI',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': { ...(coreDefHelpers.doNetDamage(2)), req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !coreCard.inDiscard(card); }) },
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('credit', 2)]; }),
};

// Firmware Updates
export const firmwareUpdates: CardDef = {
  title: 'Firmware Updates',
  'on-score': agendaCounters(3),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    label: 'Place 1 advancement counter',
    choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t && coreCard.ice(t) && coreCard.canBeAdvanced(state, t);
    }) },
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }),
    msg: (msgFn: any) => `place 1 advancement counter on ${coreToString.cardStr(state, target)}`,
    'once': ':per-turn',
    async: true,
    effect: effect(coreProps.addProp(eid, target, ':advance-counter', 1, { placed: true })),
  }],
};

// Flower Sermon
export const flowerSermon: CardDef = {
  title: 'Flower Sermon',
  'on-score': agendaCounters(5),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    label: 'Reveal the top card of R&D and draw 2 cards',
    'once': ':per-turn',
    msg: (msgFn: any) => `reveal ${(state as any).corp?.deck?.[0]?.title} and draw 2 cards`,
    async: true,
    'waiting-prompt': true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, corp?.deck?.[0])], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 2)], []);
      continue_ability(
        state, side,
        {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return (state as any).corp?.hand?.length > 0;
          }),
          prompt: 'Choose a card in HQ to move to the top of R&D',
          msg: { public: 'add 1 card in HQ to the top of R&D', corp: (msgFn: any) => `add facedown ${target.title} to the top of R&D` },
          choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
          effect: effect(coreMoving.move(target, 'deck', { front: true })),
        },
        card,
        null
      );
    }),
  }],
};

// Fly on the Wall
export const flyOnTheWall: CardDef = {
  title: 'Fly on the Wall',
  'on-score': coreDefHelpers.giveTags(1),
};

// Freedom of Information
export const freedomOfInformation: CardDef = {
  title: 'Freedom of Information',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return -(utils.countTags(state) || 0);
  }),
};

// Fujii Asset Retrieval
export const fujiiAssetRetrieval: CardDef = {
  title: 'Fujii Asset Retrieval',
  stolen: {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'do 2 net damage',
    effect: effect(coreDamage.damage(eid, ':net', 2, { card: card })),
  },
  'on-score': {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'do 2 net damage',
    effect: effect(coreDamage.damage(eid, ':net', 2, { card: card })),
  },
};

// Genetic Resequencing
export const geneticResequencing: CardDef = {
  title: 'Genetic Resequencing',
  'on-score': {
    choices: { card: (c: Card) => coreCard.inScored(c) },
    msg: (msgFn: any) => `place 1 agenda counter on ${target.title}`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, target, ':agenda', 1, null)], []);
      coreAgendas.updateAllAgendaPoints(state);
      coreEid.effectCompleted(state, side, eid);
    }),
    silent: true,
  },
};

// Geothermal Fracking
export const geothermalFracking: CardDef = {
  title: 'Geothermal Fracking',
  'on-score': agendaCounters(2),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    msg: 'gain 7 [Credits] and take 1 bad publicity',
    async: true,
    'keep-menu-open': ':while-agenda-tokens-left',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 7)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, side, eid, 1)], []);
    }),
  }],
};

// Gila Hands Arcology
export const gilaHandsArcology: CardDef = {
  title: 'Gila Hands Arcology',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 2)],
    msg: 'gain 3 [Credits]',
    async: true,
    'keep-menu-open': ':while-2-clicks-left',
    effect: effect(coreGaining.gainCredits(eid, 3)),
  }],
};

// Glenn Station
export const glennStation: CardDef = {
  title: 'Glenn Station',
  abilities: [
    {
      action: true,
      label: 'Host a card from HQ',
      'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).corp?.hand?.length > 0 && !(card.hosted || []).some((c: Card) => coreCard.corp(c));
      }) },
      cost: [corePayment.toC('click', 1)],
      msg: 'host a card from HQ',
      prompt: 'Choose a card to host',
      choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
      effect: effect(coreHosting.host(card, target, { facedown: true })),
    },
    {
      action: true,
      label: 'Add a hosted card to HQ',
      'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (card.hosted || []).some((c: Card) => coreCard.corp(c));
      }) },
      cost: [corePayment.toC('click', 1)],
      msg: 'add a hosted card to HQ',
      prompt: 'Choose a hosted card',
      choices: { all: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const hostedCorpCards = (card.hosted || []).filter((c: Card) => coreCard.corp(c)).map((c: Card) => c.cid);
        const targetCid = target.cid;
        return targetCid && hostedCorpCards.includes(targetCid);
      }) },
      effect: effect(coreMoving.move(target, 'hand')),
    },
  ],
};

// Global Food Initiative
export const globalFoodInitiative: CardDef = {
  title: 'Global Food Initiative',
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 2; }),
};

// Government Contracts
export const governmentContracts: CardDef = {
  title: 'Government Contracts',
  abilities: [{ ...(coreDefHelpers.gainCreditsAbility(4)), action: true, cost: [corePayment.toC('click', 2)], 'keep-menu-open': ':while-2-clicks-left' }],
};

// Government Takeover
export const governmentTakeover: CardDef = {
  title: 'Government Takeover',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    async: true,
    'keep-menu-open': ':while-clicks-left',
    effect: effect(coreGaining.gainCredits(eid, 3)),
    msg: 'gain 3 [Credits]',
  }],
};

// Graft
export const graft: CardDef = {
  title: 'Graft',
  'on-score': {
    async: true,
    msg: 'add up to 3 cards from R&D to HQ',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const graftFn = (n: number) => ({
        prompt: 'Choose a card to add to HQ',
        async: true,
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).slice(), { sorted: true });
        }),
        msg: (msgFn: any) => `add ${target.title} to HQ from R&D`,
        cancel: coreShuffling.shuffleMyDeck!,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, target, 'hand')], []);
          if (n < 3) {
            continue_ability(state, side, graftFn(n + 1), card, null);
          } else {
            coreShuffling.shuffle(state, side, ':deck');
            coreSay.systemMsg(state, side, 'shuffles R&D');
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      });
      continue_ability(state, side, graftFn(1), card, null);
    }),
  },
};

// Greenmail
export const greenmail: CardDef = {
  title: 'Greenmail',
  'on-score': coreDefHelpers.gainCreditsAbility(2),
  'on-forfeit': coreDefHelpers.gainCreditsAbility(4),
};

// Hades Fragment
export const hadesFragment: CardDef = {
  title: 'Hades Fragment',
  flags: { 'corp-phase-12': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (state as any).corp?.discard?.length > 0 && coreFlags.isScored(state, ':corp', card);
  }) },
  abilities: [{
    prompt: 'Choose a card to add to the bottom of R&D',
    label: 'add card to bottom of R&D',
    'show-discard': true,
    event: 'corp-turn-begins',
    'once': ':per-turn',
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
    effect: effect(coreMoving.move(target, 'deck')),
    msg: (msgFn: any) => `add ${(target.seen ? target.title : 'a card')} to the bottom of R&D`,
  }],
  events: [{ ...(coreDefHelpers.gainCreditsAbility(0)), 'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.discard?.length > 0; }), silent: true } }],
};

// Helium-3 Deposit
export const helium3Deposit: CardDef = {
  title: 'Helium-3 Deposit',
  'on-score': {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'How many power counters do you want to place?',
    choices: ['0', '1', '2'],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = parseInt(forms.target(state, card, targets), 10) || 0;
      continue_ability(
        state, side,
        {
          choices: { card: (c: Card) => (coreCard.getCounters(c, ':power') || 0) > 0 },
          msg: (msgFn: any) => `place ${utils.quantify(c, 'power counter')} on ${target.title}`,
          async: true,
          effect: effect(coreProps.addCounter(state, side, eid, target, ':power', c, null)),
        },
        card,
        null
      );
    }),
  },
};

// High-Risk Investment
export const highRiskInvestment: CardDef = {
  title: 'High-Risk Investment',
  'on-score': agendaCounters(1),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.credit > 0;
    }) },
    label: 'gain credits',
    msg: (msgFn: any) => `gain ${(state as any).runner?.credit} [Credits]`,
    async: true,
    'keep-menu-open': ':while-agenda-tokens-left',
    effect: effect(coreGaining.gainCredits(eid, (state as any).runner?.credit || 0)),
  }],
};

// Hollywood Renovation
export const hollywoodRenovation: CardDef = {
  title: 'Hollywood Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardObj = coreCard.getCard(state, card);
      const n = (coreCard.getCounters(cardObj, ':advancement') || 0) >= 6 ? 2 : 1;
      continue_ability(
        state, side,
        {
          choices: { 'not-self': true, req: req(function*(s: State, sd: Side, eid2: EID, c: Card, t: any[]) {
            const t2 = t[0];
            return t2 && coreCard.canBeAdvanced(s, t2);
          }) },
          msg: (msgFn: any) => `place ${utils.quantify(n, 'advancement counter')} on ${coreToString.cardStr(state, target)}`,
          async: true,
          effect: effect(coreProps.addProp(':corp', eid, target, ':advance-counter', n, { placed: true })),
        },
        card,
        null
      );
    }),
  }],
};

// Hostile Takeover
export const hostileTakeover: CardDef = {
  title: 'Hostile Takeover',
  'on-score': {
    msg: 'gain 7 [Credits] and take 1 bad publicity',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 7, { suppressCheckpoint: true })], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
  },
};

// House of Knives
export const houseOfKnives: CardDef = {
  title: 'House of Knives',
  'on-score': agendaCounters(3),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    msg: 'do 1 net damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    'once': ':per-run',
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })),
  }],
};

// Hybrid Release
export const hybridRelease: CardDef = {
  title: 'Hybrid Release',
  'on-score': {
    prompt: 'Choose a facedown card in Archives to install',
    'show-discard': true,
    'waiting-prompt': true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corpDiscard = (state as any).corp?.discard || [];
      return corpDiscard.some((c: Card) => !coreCard.faceup(c));
    }),
    async: true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inDiscard(c) && !coreCard.faceup(c) },
    effect: effect(coreInstalling.corpInstall(eid, target, null, { msgKeys: { installSource: card, displayOrigin: true } })),
  },
};

// Hyperloop Extension
export const hyperloopExtension: CardDef = {
  title: 'Hyperloop Extension',
  'on-score': coreDefHelpers.gainCreditsAbility(3),
  stolen: coreDefHelpers.gainCreditsAbility(3),
};

// Ikawah Project
export const ikawahProject: CardDef = {
  title: 'Ikawah Project',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return [corePayment.toC('click', 1), corePayment.toC('credit', 2)];
  }),
};

// Illicit Sales
export const illicitSales: CardDef = {
  title: 'Illicit Sales',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.resolveAbility(
        state, side,
        {
          optional: {
            prompt: 'Take 1 bad publicity?',
            'yes-ability': { msg: 'take 1 bad publicity', async: true, effect: effect(coreBadPublicity.gainBadPublicity(':corp', eid, 1)) },
          },
        },
        card,
        null
      )], []);
      const n = 3 * (utils.countBadPub(state) || 0);
      coreSay.systemMsg(state, side, `uses ${card.title} to gain ${n} [Credits]`);
      coreGaining.gainCredits(state, side, eid, n);
    }),
  },
};

// Improved Protein Source
export const improvedProteinSource: CardDef = {
  title: 'Improved Protein Source',
  abilities: [{
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  }],
  'on-score': {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  },
  stolen: {
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'make the Runner gain 4 [Credits]',
    effect: effect(coreGaining.gainCredits(':runner', eid, 4)),
  },
};

// Improved Tracers
export const improvedTracers: CardDef = {
  title: 'Improved Tracers',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to increase the strength of Tracer ice by 1`);
      coreSay.systemMsg(state, side, `uses ${card.title} to increase the base strength of all trace subroutines by 1`);
      coreIce.updateAllIce(state, side);
      coreEid.effectCompleted(state, side, eid);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
  'static-abilities': [
    { type: ':ice-strength', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.hasSubtype(targets[0] || {}, 'Tracer'); }), value: 1 },
    { type: ':trace-base-strength', req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const secondTargets = targets[1];
      return secondTargets && (secondTargets as any)['source-type'] === ':subroutine';
    }), value: 1 },
  ],
};

// Jumon
export const jumon: CardDef = {
  title: 'Jumon',
  events: [{
    event: 'corp-turn-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => {
        const zone = coreCard.getZone(c);
        return zone && zone[zone.length - 1] === ':content' && coreServers.isRemote(zone[1]);
      });
    }),
    prompt: 'Choose a card to place 2 advancement counters on',
    choices: { card: (c: Card) => {
      const zone = coreCard.getZone(c);
      return zone && zone[zone.length - 1] === ':content' && coreServers.isRemote(zone[1]);
    }},
    msg: (msgFn: any) => `place 2 advancement counters on ${coreToString.cardStr(state, target)}`,
    async: true,
    effect: effect(coreProps.addProp(':corp', eid, target, ':advance-counter', 2, { placed: true })),
  }],
};

// Kimberlite Field
export const kimberliteField: CardDef = {
  title: 'Kimberlite Field',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    'waiting-prompt': true,
    prompt: 'Choose a rezzed card to trash',
    msg: (msgFn: any) => `trash ${coreToString.cardStr(state, target)}`,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => coreCard.rezzed(c));
    }),
    choices: { card: (c: Card) => coreCard.rezzed(c) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const targetCost = (target as any).cost;
      continue_ability(
        state, side,
        {
          prompt: `Choose a runner card that costs ${targetCost} or less to trash`,
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) && (c as any).cost <= targetCost },
          msg: (msgFn: any) => target.title,
          async: true,
          effect: effect(coreMoving.trash(eid, target)),
        },
        card,
        null
      );
    }),
  },
};

// Kingmaking
export const kingmaking: CardDef = {
  title: 'Kingmaking',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.drawUpTo(state, side, card, 3)], []);
      continue_ability(state, side, addAbi, card, null);
    }),
  },
};

function addAbiFn(): any {
  return {
    prompt: 'Choose 1 agenda worth 1 or less points',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).corp?.hand?.length > 0;
    }),
    async: true,
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.inHand(c) && (c as any).agendapoints <= 1 },
    'waiting-prompt': true,
    msg: (msgFn: any) => `add ${target.title} from HQ to [their] score area`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const c = coreMoving.move(state, ':corp', target, ':scored');
      coreInitializing.cardInit(state, ':corp', c, { 'resolve-effect': false, 'init-data': true });
      coreAgendas.updateAllAdvancementRequirements(state);
      coreAgendas.updateAllAgendaPoints(state);
      coreWinning.checkWinByAgenda(state, side);
      coreEid.effectCompleted(state, side, eid);
    }),
  };
}
const addAbi = addAbiFn();

// Labyrinthine Servers
export const labyrinthineServers: CardDef = {
  title: 'Labyrinthine Servers',
  'on-score': agendaCounters(2, ':power'),
  prevention: [{
    prevents: ':jack-out',
    type: ':ability',
    ability: {
      cost: [corePayment.toC('power', 1)],
      msg: 'prevent the runner from jacking out for the remainder of this run',
      condition: ':active',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return corePrevention.preventable(forms.context(state, card, targets));
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' }, corePrevention.preventJackOut(state, side)], []);
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-jack-out',
          value: true,
          duration: ':end-of-run',
        });
        coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

// Let Them Dream
export const letThemDream: CardDef = {
  title: 'Let Them Dream',
  'on-score': {
    ...coreChooseOne.chooseOneHelper({
      optional: true,
      prompt: 'Search for an Agenda from where?',
    }, [
      { option: 'HQ', ability: findAbi(':hq') },
      { option: 'R&D', ability: findAbi(':rd') },
      { option: 'Archives', ability: findAbi(':archives') },
    ]),
  },
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 1; }),
};

function findAbi(zone: string): any {
  return {
    prompt: 'Choose an agenda',
    'show-discard': zone === ':archives',
    choices: zone === ':rd'
      ? req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).filter((c: Card) => coreCard.agenda(c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), { sorted: true });
        })
      : { card: (c: Card) => coreCard.agenda(c) && (zone === ':hq' ? coreCard.inHand(c) : coreCard.inDiscard(c)) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      moveToOne(target, zone);
    }),
    async: true,
    'cancel-effect': coreShuffling.shuffleMyDeck!,
  };
}

function moveToOne(c: Card, from: string): any {
  const andThen = (s: string) => `${from === ':rd' ? ', shuffle R&D, and then ' : ' and '}${s}`;
  return coreChooseOne.chooseOneHelper({ prompt: `Move ${c.title} where?` }, [
    { option: 'HQ', ability: {
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (from === ':rd') coreShuffling.shuffle(state, side, ':deck');
        coreMoving.move(state, side, c, 'hand');
        coreRevealing.revealLoud(state, side, eid, card, { 'and-then': andThen('add it to HQ') }, c);
      }),
    }},
    { option: 'Bottom of R&D', ability: {
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (from === ':rd') coreShuffling.shuffle(state, side, ':deck');
        coreMoving.move(state, side, c, 'deck');
        coreRevealing.revealLoud(state, side, eid, card, { 'and-then': andThen('add it to the bottom of R&D') }, c);
      }),
    }},
  ]);
}

// License Acquisition
export const licenseAcquisition: CardDef = {
  title: 'License Acquisition',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'Choose an asset or upgrade to install from Archives or HQ',
    'show-discard': true,
    choices: { card: (c: Card) => coreCard.corp(c) && (coreCard.asset(c) || coreCard.upgrade(c)) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    msg: (msgFn: any) => `install and rez ${target.title}, ignoring all costs`,
    async: true,
    effect: effect(coreInstalling.corpInstall(eid, target, null, { 'install-state': ':rezzed-no-cost', msgKeys: { installSource: card, displayOrigin: true } })),
  },
};

// Lightning Laboratory
export const lightningLaboratory: CardDef = {
  title: 'Lightning Laboratory',
  'on-score': agendaCounters(1),
  events: [{
    event: 'run',
    async: true,
    optional: {
      prompt: (msgFn: any) => `Remove 1 hosted agenda counter to rez up to 2 pieces of ice protecting ${coreServers.zoneToName(forms.context(state, card, targets)?.server || '')}, ignoring all costs?`,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0;
      }),
      'yes-ability': {
        cost: [corePayment.toC('agenda', 1)],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const currentServer = (state as any).run?.server?.[0];
          continue_ability(
            state, side,
            {
              prompt: (msgFn: any) => `Choose up to 2 pieces of ice protecting ${coreServers.zoneToName(currentServer)}`,
              'waiting-prompt': true,
              choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] === currentServer, max: 2 },
              async: true,
              cancel: { effect: effect(coreEngine.registerEvents(state, side, card, [iceDerez(currentServer)]) ) },
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.registerEvents(state, side, card, [iceDerez(currentServer)])], []);
                yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.rezMultipleCards(state, side, eid, targets, { 'ignore-cost': ':all-costs', msgKeys: { includeCostFromEid: eid } })], []);
              }),
            },
            card,
            null
          );
        }),
      },
    },
  }],
};

function iceDerez(zone: string): any {
  return {
    event: 'runner-turn-ends',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActive = coreBoard.allActiveInstalled(state, ':corp');
      return allActive.some((c: Card) => (c as any).zone === ['servers', zone, 'ices']);
    }),
    duration: ':end-of-turn',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allActive = coreBoard.allActiveInstalled(state, ':corp');
      const matchingIces = allActive.filter((c: Card) => (c as any).zone === ['servers', zone, 'ices']);
      const derezCount = Math.min(2, matchingIces.length);
      continue_ability(
        state, side,
        {
          prompt: (msgFn: any) => `Choose ${utils.quantify(derezCount, 'piece')} of ice protecting ${coreServers.zoneToName([zone])} to derez`,
          'waiting-prompt': true,
          choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] === zone, max: derezCount, min: derezCount },
          msg: (msgFn: any) => `derez ${utils.enumerateStr(targets.map((t: Card) => coreToString.cardStr(state, t)))}`,
          async: true,
          effect: effect(coreRezzing.derez(state, side, eid, targets)),
        },
        card,
        null
      );
    }),
  };
}

// Longevity Serum
export const longevitySerum: CardDef = {
  title: 'Longevity Serum',
  'on-score': {
    prompt: 'Choose any number of cards in HQ to trash',
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length || 0; }), card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
    msg: { public: (msgFn: any) => `trash ${utils.quantify(targets.length, 'card')} from HQ`, corp: (msgFn: any) => `trash ${utils.quantify(targets.length, 'card')} from HQ (${utils.enumerateCards(targets, { sorted: true })})` },
    async: true,
    cancel: { msg: 'decline trashing any cards from HQ', async: true, effect: effect(coreShuffling.shuffleIntoRDEffect(state, side, eid, card, 3)) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card })], []);
      coreShuffling.shuffleIntoRDEffect(state, side, eid, card, 3);
    }),
  },
};

// Lotus Haze
export const lotusHaze: CardDef = {
  title: 'Lotus Haze',
  'on-score': agendaCounters(3),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    prompt: 'Choose an upgrade to move',
    choices: { card: (c: Card) => coreCard.upgrade(c) && coreCard.rezzed(c) },
    label: 'Move a rezzed upgrade to the root of another server.',
    'waiting-prompt': true,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const toMove = target;
      const zone = (coreCard.getZone(toMove) || [])[1];
      const notSameZone = (zones: string[]) => zones.filter((z: string) => z !== coreServers.zoneToName(zone));
      const legalZonesFn = toMove && (coreCard.getCardDef(toMove) as any)?.legalZones
        ? (zones: string[]) => (coreCard.getCardDef(toMove) as any).legalZones(state, side, eid, card, zones)
        : (zones: string[]) => zones;
      const regionRestriction = (zones: string[]) => {
        if (coreCard.hasSubtype(toMove, 'Region')) {
          return zones.filter((z: string) => {
            const serverZ = coreServers.serverToZone(state, z);
            const content = (state as any).corp?.servers?.[serverZ]?.content;
            return !content?.some((c: Card) => coreCard.hasSubtype(c, 'Region'));
          });
        }
        return zones;
      };
      const serverList = coreBoard.serverList(state);
      const legalMoves = regionRestriction(notSameZone(serverList)).filter(Boolean);
      if (legalMoves.length > 0) {
        continue_ability(
          state, side,
          {
            prompt: 'Choose a server',
            choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return legalMoves; }),
            msg: (msgFn: any) => `move ${toMove.title} to ${target}`,
            effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
              const c = coreMoving.move(state, side, toMove, [...coreServers.serverToZone(state, target), ':content']);
              coreEngine.unregisterEvents(state, side, toMove);
              coreEngine.registerDefaultEvents(state, side, c);
            }),
          },
          card,
          null
        );
      } else {
        continue_ability(
          state, side,
          { prompt: `You have no legal moves for ${toMove.title}`, msg: (msgFn: any) => `reveal that they have no legal moves for ${toMove.title}`, choices: ['OK'] },
          card,
          null
        );
      }
    }),
  }],
};

// Luminal Transubstantiation
export const luminalTransubstantiation: CardDef = {
  title: 'Luminal Transubstantiation',
  'on-score': {
    silent: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreGaining.gainClicks(state, ':corp', 3);
      coreFlags.registerTurnFlag!(state, side, card, ':can-score', function(state: State, side: Side, card: Card) {
        ((): boolean => { coreToasts.toast(state, ':corp', 'Cannot score cards this turn due to Luminal Transubstantiation.', 'warning'); return false; })();
        return false;
      });
    }),
  },
};

// Mandatory Seed Replacement
export const mandatorySeedReplacement: CardDef = {
  title: 'Mandatory Seed Replacement',
  'on-score': {
    async: true,
    msg: 'rearrange any number of ice',
    effect: effect(msr()),
  },
};

function msr(): any {
  return {
    prompt: 'Choose two pieces of ice to swap positions',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), max: 2 },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets.length === 2) {
        coreMoving.swapIce(state, side, targets[0], targets[1]);
        coreSay.systemMsg(state, side, `swaps the position of ${coreToString.cardStr(state, targets[0])} and ${coreToString.cardStr(state, targets[1])}`);
        continue_ability(state, side, msr(), card, null);
      } else {
        coreSay.systemMsg(state, ':corp', 'has finished rearranging ice');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Mandatory Upgrades
export const mandatoryUpgrades: CardDef = {
  title: 'Mandatory Upgrades',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to gain 1 addition [Click] per turn`);
      if ((state as any).activePlayer === ':corp') coreGaining.gainClicks(state, ':corp', 1);
      coreGaining.gain(state, ':corp', ':click-per-turn', 1);
      coreEid.effectCompleted(state, side, eid);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
  'leave-play': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    coreGaining.lose(state, ':corp', ':click', 1, ':click-per-turn', 1);
  }),
};

// Market Research
export const marketResearch: CardDef = {
  title: 'Market Research',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addAgendaPointCounters(state, side, eid, card, 1);
    }),
  },
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.getCounters(card, ':agenda') || 0) === 0 ? 2 : 3;
  }),
};

// Medical Breakthrough
export const medicalBreakthrough: CardDef = {
  title: 'Medical Breakthrough',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'static-abilities': [{
    type: ':advancement-requirement',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (targets[0] || {}).title === 'Medical Breakthrough'; }),
    value: -1,
  }],
};

// Méliès City Luxury Line
export const metiesCityLuxuryLine: CardDef = {
  title: 'Méliès City Luxury Line',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('click', 1)]; }),
  'on-score': { msg: 'gain [Click]', silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }), effect: effect(coreGaining.gainClicks(state, ':corp', 1)) },
};

// Megaprix Qualifier
export const megaprixQualifier: CardDef = {
  title: 'Megaprix Qualifier',
  'on-score': {
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const scored = [...((state as any).corp?.scored || []), ...((state as any).runner?.scored || [])];
      return scored.filter((c: Card) => c.title === 'Megaprix Qualifier').length > 1;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      addAgendaPointCounters(state, side, eid, card, 1);
    }),
  },
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return (coreCard.getCounters(card, ':agenda') || 0) === 0 ? 1 : 2;
  }),
};

// Merger
export const merger: CardDef = {
  title: 'Merger',
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 3; }),
};

// Meteor Mining
export const meteorMining: CardDef = {
  title: 'Meteor Mining',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const tags = utils.countTags(state) || 0;
      return ['Gain 7 [Credits]', tags >= 2 ? 'Do 7 meat damage' : null, 'No action'].filter(Boolean) as string[];
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = forms.target(state, card, targets);
      if (t === 'Gain 7 [Credits]') {
        coreSay.systemMsg(state, side, `uses ${card.title} to gain 7 [Credits]`);
        coreGaining.gainCredits(state, side, eid, 7);
      } else if (t === 'Do 7 meat damage') {
        coreSay.systemMsg(state, side, `uses ${card.title} to do 7 meat damage`);
        coreDamage.damage(state, side, eid, ':meat', 7, { card: card });
      } else {
        coreSay.systemMsg(state, side, `declines to use ${card.title}`);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Midnight-3 Arcology
export const midnight3Arcology: CardDef = {
  title: 'Midnight-3 Arcology',
  'on-score': {
    async: true,
    msg: (msgFn: any) => 'draw 3 cards and skip [their] discard step this turn',
    effect: effect(
      coreEffects.registerLingeringEffect(card, { type: ':skip-discard', duration: ':end-of-turn', value: true }),
      coreDrawing.draw(':corp', eid, 3)
    ),
  },
};

// NAPD Contract
export const napdContract: CardDef = {
  title: 'NAPD Contract',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('credit', 4)]; }),
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return utils.countBadPub(state) || 0;
  }),
};

// Net Quarantine
export const netQuarantine: CardDef = {
  title: 'Net Quarantine',
  'static-abilities': [{
    type: ':trace-force-link',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.turnEvents(state, side, ':initialize-trace').length === 1;
    }),
    value: 0,
  }],
  events: [
    { event: 'successful-trace', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const extra = Math.floor((targets[0]?.runnerSpent || 0) / 2);
      if (extra > 0) {
        coreSay.systemMsg(state, ':corp', `uses ${card.title} to gain ${extra} [Credits]`);
        coreGaining.gainCredits(state, side, eid, extra);
      } else {
        coreEid.effectCompleted(eid);
      }
    })},
    { event: 'unsuccessful-trace', async: true, effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const extra = Math.floor((targets[0]?.runnerSpent || 0) / 2);
      if (extra > 0) {
        coreSay.systemMsg(state, ':corp', `uses ${card.title} to gain ${extra} [Credits]`);
        coreGaining.gainCredits(state, side, eid, extra);
      } else {
        coreEid.effectCompleted(eid);
      }
    })},
  ].filter(Boolean),
};

// New Construction
export const newConstruction: CardDef = {
  title: 'New Construction',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
      }),
      prompt: 'Install a card from HQ in a new remote?',
      'yes-ability': {
        prompt: 'Choose a card to install',
        choices: { card: (c: Card) => !coreCard.operation(c) && !coreCard.ice(c) && coreCard.corp(c) && coreCard.inHand(c) },
        msg: (msgFn: any) => `install a card from HQ${(coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) <= 5 ? ' and rez it, ignoring all costs' : ''}`,
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
          yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(eid, target, 'New remote', {
            'install-state': adv <= 5 ? ':rezzed-no-cost' : undefined,
            msgKeys: { installSource: card, displayOrigin: true },
          })], []);
        }),
      },
    },
  }],
};

// Next Big Thing
export const nextBigThing: CardDef = {
  title: 'Next Big Thing',
  'on-score': agendaCounters(1),
  stolen: agendaCounters(1),
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('agenda')],
    label: 'Draw 4 cards',
    msg: 'draw 4 cards',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreSay.playSfx(state, side, 'click-card-2');
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 4)], []);
      continue_ability(
        state, side,
        {
          prompt: 'Shuffle any number of cards into R&D',
          'waiting-prompt': true,
          choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.hand?.length || 0; }), card: (c: Card) => coreCard.corp(c) && coreCard.inHand(c) },
          msg: { public: (msgFn: any) => `shuffle ${utils.quantify(targets.length, 'card')} from HQ into R&D`, corp: (msgFn: any) => `shuffle ${utils.enumerateCards(targets, { sorted: true })} from HQ into R&D` },
          cancel: coreShuffling.shuffleMyDeck!,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            for (const t of targets) {
              yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, t, 'deck')], []);
            }
            coreShuffling.shuffle(state, side, ':deck');
          }),
        },
        card,
        null
      );
    }),
  }],
};

// NEXT Wave 2
export const nextWave2: CardDef = {
  title: 'NEXT Wave 2',
  'on-score': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      const nextIces = allInstalled.filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c) && coreCard.hasSubtype(c, 'NEXT'));
      if (nextIces.length > 0) {
        continue_ability(
          state, side,
          {
            optional: {
              prompt: 'Do 1 core damage?',
              'yes-ability': { msg: 'do 1 core damage', async: true, effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })) },
            },
          },
          card,
          null
        );
      }
    }),
  },
};

// Nisei MK II
export const niseiMKII: CardDef = {
  title: 'Nisei MK II',
  'on-score': agendaCounters(1),
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    cost: [corePayment.toC('agenda', 1)],
    msg: 'end the run',
    async: true,
    effect: effect(coreRuns.endRun(eid, card)),
  }],
};

// Oaktown Renovation
export const oaktownRenovation: CardDef = {
  title: 'Oaktown Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    msg: (msgFn: any) => `gain ${((coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) >= 5 ? '3' : '2')} [Credits]`,
    async: true,
    effect: effect(coreGaining.gainCredits(eid, (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0) <= 5 ? 3 : 2)),
  }],
};

// Obokata Protocol
export const obokataProtocol: CardDef = {
  title: 'Obokata Protocol',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('net', 4)]; }),
};

// Offworld Office
export const offworldOffice: CardDef = {
  title: 'Offworld Office',
  'on-score': coreDefHelpers.gainCreditsAbility(7),
};

// Off the Books
export const offTheBooks: CardDef = {
  title: 'Off the Books',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    skippable: true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0 && (state as any).corp?.deck?.length > 0;
      }),
      prompt: 'Search R&D for a card?',
      'yes-ability': {
        cost: [corePayment.toC('agenda', 1)],
        choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          return corePrompts.cancellable((corp?.deck || []).slice(), { sorted: true });
        }),
        prompt: 'Tutor a card',
        async: true,
        msg: (msgFn: any) => `reveal ${target.title} from R&D`,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          coreShuffling.shuffle(state, side, ':deck');
          yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, target)], []);
          const targetCard = target;
          continue_ability(
            state, side,
            coreChooseOne.chooseOneHelper([
              { option: `Install ${targetCard.title}`, ability: { async: true, effect: effect(coreInstalling.corpInstall(state, side, eid, targetCard, { 'ignore-install-cost': true, msgArgs: { displayOrigin: true, installSource: card } })) }},
              { option: `Add ${targetCard.title} to HQ`, ability: { msg: (msgFn: any) => `add ${targetCard.title} to HQ`, effect: effect(coreMoving.move(state, side, targetCard, 'hand')) }},
            ]),
            card,
            null
          );
        }),
      },
    },
  }],
};

// Ontological Dependence
export const ontologicalDependence: CardDef = {
  title: 'Ontological Dependence',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return -((state as any).runner?.brainDamage || 0) || 0;
  }),
};


// Oracle Thinktank
export const oracleThinktank: CardDef = {
  title: 'Oracle Thinktank',
  stolen: coreDefHelpers.giveTags(1),
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1), corePayment.toC('tag', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreFlags.isScored(state, ':runner', card); }),
    msg: 'shuffle itself into R&D',
    label: 'Shuffle this agenda into R&D',
    effect: effect(coreMoving.move(':corp', card, 'deck', null), coreShuffling.shuffle(':corp', 'deck'), coreAgendas.updateAllAgendaPoints()),
  }],
  flags: { 'has-abilities-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
};

// Orbital Superiority
export const orbitalSuperiority: CardDef = {
  title: 'Orbital Superiority',
  'on-score': {
    msg: (msgFn: any) => ((utils.isTagged(state) || 0) > 0 ? 'do 4 meat damage' : 'give the Runner 1 tag'),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((utils.isTagged(state) || 0) > 0) {
        coreDamage.damage(state, ':corp', eid, ':meat', 4, { card: card });
      } else {
        coreTags.gainTags(state, ':corp', eid, 1);
      }
    }),
  },
};

// Paper Trail
export const paperTrail: CardDef = {
  title: 'Paper Trail',
  'on-score': {
    trace: {
      base: 6,
      successful: {
        msg: 'trash all connection and job resources',
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const allInstalled = coreBoard.allActiveInstalled(state, ':runner');
          const resources = allInstalled.filter((c: Card) => coreCard.hasSubtype(c, 'Job') || coreCard.hasSubtype(c, 'Connection'));
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, eid, resources, { causeCard: card })], []);
        }),
      },
    },
  },
};

// Personality Profiles
export const personalityProfiles: CardDef = {
  title: 'Personality Profiles',
  events: [
    {
      event: 'searched-stack',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (state as any).runner?.hand?.length > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runnerHand = [...(state as any).runner?.hand || []];
        const c = runnerHand.sort(() => Math.random() - 0.5)[0];
        coreSay.systemMsg(state, side, `uses ${card.title} to force the Runner to trash ${c.title} from the grip at random`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, c, { causeCard: card })], []);
      }),
    },
    {
      event: 'runner-install',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ((ctx.previousZone || []).includes(':discard')) && (state as any).runner?.hand?.length > 0;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const runnerHand = [...(state as any).runner?.hand || []];
        const c = runnerHand.sort(() => Math.random() - 0.5)[0];
        coreSay.systemMsg(state, side, `uses ${card.title} to force the Runner to trash ${c.title} from the grip at random`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, c, { causeCard: card })], []);
      }),
    },
  ].filter(Boolean),
};

// Philotic Entanglement
export const philoticEntanglement: CardDef = {
  title: 'Philotic Entanglement',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).runner?.scored?.length > 0;
    }),
    msg: (msgFn: any) => `do ${(state as any).runner?.scored?.length} net damage`,
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', (state as any).runner?.scored?.length || 0, { card: card })),
  },
};

// Post-Truth Dividend
export const postTruthDividend: CardDef = {
  title: 'Post-Truth Dividend',
  'on-score': {
    optional: {
      prompt: 'Draw 1 card?',
      'yes-ability': { msg: 'draw 1 card', async: true, effect: effect(coreDrawing.draw(eid, 1)) },
      'no-ability': { effect: effect(coreSay.systemMsg(`declines to use ${card.title}`)) },
    },
  },
};

// Posted Bounty
export const postedBounty: CardDef = {
  title: 'Posted Bounty',
  'on-score': {
    optional: {
      prompt: 'Forfeit this agenda to give the Runner 1 tag and take 1 bad publicity?',
      'yes-ability': {
        msg: 'give the Runner 1 tag and take 1 bad publicity',
        cost: [corePayment.toC('forfeit-self')],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', coreEid.makeEid(state, eid), 1, { suppressCheckpoint: true })], []);
          coreTags.gainTags(state, ':corp', eid, 1);
        }),
      },
    },
  },
};

// Priority Requisition
export const priorityRequisition: CardDef = {
  title: 'Priority Requisition',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) && !coreCard.rezzed(c) },
    async: true,
    effect: effect(coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' })),
  },
};

// Private Security Force
export const privateSecurityForce: CardDef = {
  title: 'Private Security Force',
  abilities: [{
    action: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    cost: [corePayment.toC('click', 1)],
    'keep-menu-open': ':while-clicks-left',
    async: true,
    effect: effect(coreDamage.damage(eid, ':meat', 1, { card: card })),
    msg: 'do 1 meat damage',
  }],
};

// Profiteering
export const profiteering: CardDef = {
  title: 'Profiteering',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    choices: ['0', '1', '2', '3'],
    prompt: 'How many bad publicity do you want to take?',
    msg: (msgFn: any) => `take ${target} bad publicity and gain ${5 * parseInt(target, 10)} [Credits]`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const bp = utils.countBadPub(state) || 0;
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', parseInt(target, 10))], []);
      if (bp < (utils.countBadPub(state) || 0)) {
        coreGaining.gainCredits(state, ':corp', eid, 5 * parseInt(target, 10));
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

// Project Ares
export const projectAres: CardDef = {
  title: 'Project Ares',
  'on-score': {
    player: ':runner',
    silent: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const adv = (forms.context(state, card, targets) || {}).advancement || 0;
      return adv > 4 && coreBoard.allInstalled(state, ':runner').length > 0;
    }),
    'waiting-prompt': true,
    prompt: (msgFn: any) => `Choose ${utils.quantify(((forms.context(state, card, targets) || {}).advancement || 0) - 4, 'installed card')} to trash`,
    choices: { max: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const adv = (forms.context(state, card, targets) || {}).advancement || 0;
      return Math.min(adv - 4, coreBoard.allInstalled(state, ':runner').length);
    }), card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
    msg: (msgFn: any) => `force the Runner to trash ${utils.quantify(((forms.context(state, card, targets) || {}).advancement || 0) - 4, 'installed card')} and take 1 bad publicity`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trashCards(state, side, targets, { causeCard: card, cause: ':forced-to-trash' })], []);
      coreSay.systemMsg(state, side, `trashes ${utils.enumerateCards(targets)}`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
    }),
  },
};

// Project Atlas
export const projectAtlas: CardDef = {
  title: 'Project Atlas',
  ...projectAgenda(),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': false,
    prompt: 'Choose a card',
    label: 'Search R&D and add 1 card to HQ',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }),
    msg: (msgFn: any) => `add ${target.title} to HQ from R&D`,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      return corePrompts.cancellable((corp?.deck || []).slice(), { sorted: true });
    }),
    cancel: { msg: 'decide they don\'t want to tutor a card after all' },
    effect: effect(coreShuffling.shuffle(':deck'), coreMoving.move(target, 'hand')),
  }],
};

// Project Beale
export const projectBeale: CardDef = {
  title: 'Project Beale',
  ...projectAgenda({ granularity: 2 }),
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return 2; }),
  'agendapoints-corp': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return 2 + (coreCard.getCounters(card, ':agenda') || 0);
  }),
};

// Project Ingatan
export const projectIngatan: CardDef = {
  title: 'Project Ingatan',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    cost: [corePayment.toC('agenda', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    label: 'Install a card from Archives',
    prompt: 'Install a card from Archives, ignoring all costs',
    'show-discard': true,
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corpDiscard = (state as any).corp?.discard || [];
      return corpDiscard.some((c: Card) => !c.seen || !coreCard.operation(c));
    })},
    choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return !coreCard.operation(target) && coreCard.inDiscard(target);
    })},
    async: true,
    effect: effect(coreInstalling.corpInstall(state, side, eid, target, null, { 'ignore-all-cost': true, msgKeys: { installSource: card, displayOrigin: true } })),
  }],
};

// Project Kusanagi
export const projectKusanagi: CardDef = {
  title: 'Project Kusanagi',
  ...projectAgenda(),
  abilities: [{
    label: 'Give a piece of ice "[Subroutine] Do 1 net damage"',
    prompt: 'Choose a piece of ice',
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    cost: [corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.run(state) && coreBoard.allInstalled(state, ':corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c));
    })},
    'keep-menu-open': ':while-agenda-tokens-left',
    msg: 'make a piece of ice gain "[Subroutine] Do 1 net damage" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = target;
      coreEffects.registerLingeringEffect(card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.sameCard(targets[0] || {}, t); }),
        value: { subroutines: [coreDefHelpers.doNetDamage(1)] },
      });
    }),
  }],
};

// Project Vacheron
export const projectVacheron: CardDef = {
  title: 'Project Vacheron',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'agendapoints-runner': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const prevZone = (card as any)['previous-zone'] || [];
    return (prevZone[0] === ':discard' || (coreCard.getCounters(card, ':agenda') || 0) === 0) ? 3 : 0;
  }),
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':runner' && (card as any)['previous-zone']?.[0] !== ':discard') {
      coreSay.systemMsg(state, side, `uses ${card.title} to place 4 agenda counters on itself`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, eid, coreCard.getCard(state, card), ':agenda', 4, null)], []);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  events: [{
    event: 'runner-turn-begins',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }),
    msg: (msgFn: any) => `remove 1 agenda counter from ${target.title}`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((coreCard.getCounters(card, ':agenda') || 0) > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreProps.addCounter(state, side, card, ':agenda', -1, null)], []);
        coreAgendas.updateAllAgendaPoints(state, side);
        const cardObj = coreCard.getCard(state, card);
        if ((coreCard.getCounters(cardObj, ':agenda') || 0) === 0) {
          const points = coreCard.getAgendaPoints(cardObj) || 0;
          coreSay.systemMsg(state, ':runner', `gains ${utils.quantify(points, 'agenda point')} from ${cardObj.title}`);
        }
        coreWinning.checkWinByAgenda(state, side);
        coreEid.effectCompleted(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Project Vitruvius
export const projectVitruvius: CardDef = {
  title: 'Project Vitruvius',
  ...projectAgenda(),
  abilities: [
    ...coreDefHelpers.corpRecur(),
    { cost: [corePayment.toC('agenda', 1)], 'keep-menu-open': false, req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreCard.getCounters(card, ':agenda') || 0) > 0;
    }) },
  ],
};

// Project Wotan
export const projectWotan: CardDef = {
  title: 'Project Wotan',
  'on-score': agendaCounters(3),
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ci = forms.currentIce(state, card);
      return ci && coreCard.rezzed(ci) && coreCard.hasSubtype(ci, 'Bioroid') && (forms.run(state)?.phase) === ':approach-ice';
    }),
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': ':while-agenda-tokens-left',
    msg: 'make the approached piece of Bioroid ice gain "[Subroutine] End the run" after all its other subroutines for the remainder of this run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const cardTarget = forms.currentIce(state, card);
      coreEffects.registerLingeringEffect(card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.sameCard(targets[0] || {}, cardTarget); }),
        value: { subroutines: [{ label: 'End the run', msg: 'end the run', async: true, effect: effect(coreRuns.endRun(eid, card)) }] },
      });
    }),
  }],
};

// Project Yagi-Uda
export const projectYagiUda: CardDef = {
  title: 'Project Yagi-Uda',
  ...projectAgenda({
    abilities: [{
      async: true,
      'waiting-prompt': true,
      'fake-cost': [corePayment.toC('agenda', 1)],
      'keep-menu-open': false,
      label: 'swap card in HQ with installed card',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return forms.run(state) && corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        continue_ability(state, ':runner', chooseCard((forms.run(state) || {}).server), card, null);
      }),
    }],
  }),
};

function chooseCard(runServer: any): any {
  return {
    async: true,
    prompt: 'Choose a card in or protecting the attacked server',
    choices: { card: (c: Card) => (coreCard.getZone(c) || [])[0] === (runServer || [])[0] },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      continue_ability(state, ':runner', chooseSwap(target), card, null);
    }),
  };
}

function chooseSwap(toSwap: Card): any {
  return {
    async: true,
    prompt: `Choose a card in HQ to swap with ${toSwap.title}`,
    cost: [corePayment.toC('agenda', 1)],
    choices: { 'not-self': true, card: (c: Card) => {
      return coreCard.corp(c) && coreCard.inHand(c) && (!coreCard.ice(toSwap) || coreCard.ice(c));
    }},
    msg: { public: (msgFn: any) => `swap ${coreToString.cardStr(state, toSwap)} with a card from HQ`, corp: (msgFn: any) => `swap ${coreToString.cardStr(state, toSwap, { 'maybe-visible': true })} with a card from HQ (${target.title})` },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.swapCardsAsync(state, side, toSwap, target)], []);
      continue_ability(state, ':runner', coreDefHelpers.offerJackOut(), card, null);
    }),
  };
}

// Puppet Master
export const puppetMaster: CardDef = {
  title: 'Puppet Master',
  events: [{
    event: 'successful-run',
    skippable: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    'waiting-prompt': true,
    prompt: 'Choose a card that can be advanced to place 1 advancement counter on',
    choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.canBeAdvanced(state, card); }) },
    msg: (msgFn: any) => `place 1 advancement counter on ${coreToString.cardStr(state, target)}`,
    async: true,
    effect: effect(coreProps.addProp(':corp', eid, target, ':advance-counter', 1, { placed: true })),
  }],
};

// Proprionegation
export const proprionegation: CardDef = {
  title: 'Proprionegation',
  'on-score': {
    silent: true,
    async: true,
    effect: effect(coreProps.addCounter(eid, card, ':agenda', 1)),
  },
  abilities: [{
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    cost: [corePayment.toC('agenda', 1)],
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).run?.phase !== ':success';
    })},
    label: 'Redirect runner to archives',
    msg: 'make the Runner continue the run on Archives',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((state as any)['forced-encounter']) {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreEid.effectCompleted(state, side, eid);
      } else if ((state as any).run?.phase === ':encounter-ice') {
        if (coreRuns.getCurrentEncounter(state)) {
          coreEngine.triggerEvent(state, ':end-of-encounter', { ice: coreIce.getCurrentIce(state) });
        }
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(state, side, eid, { duration: ':end-of-encounter' })], []);
        coreRuns.clearEncounter(state);
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.startNextPhase(state, side, eid);
      } else {
        coreRuns.clearEncounter(state);
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
        coreRuns.startNextPhase(state, side, eid);
      }
    }),
  }],
};

// Quantum Predictive Model
export const quantumPredictiveModel: CardDef = {
  title: 'Quantum Predictive Model',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.tagged(state); }),
    player: ':runner',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'Quantum Predictive Model will be added to the Corp\'s score area',
    choices: ['OK'],
    msg: (msgFn: any) => 'add itself to [their] score area and gain 1 agenda point',
    effect: effect(coreMoving.move(':corp', card, ':scored', { force: true }), coreAgendas.updateAllAgendaPoints(), coreWinning.checkWinByAgenda()),
  },
};

// Rebranding Team
export const rebrandingTeam: CardDef = {
  title: 'Rebranding Team',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to make all assets gain Advertisement`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [{
    type: ':gain-subtype',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreCard.asset(targets[0] || {}); }),
    value: 'Advertisement',
  }],
};

// Reeducation
export const reeducation: CardDef = {
  title: 'Reeducation',
  'on-score': {
    async: true,
    'waiting-prompt': true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const from = (state as any).corp?.hand || [];
      if (from.length > 0) {
        continue_ability(state, ':corp', corpChoice(from, [], from), card, null);
      } else {
        coreSay.systemMsg(state, side, 'does not add any cards from HQ to bottom of R&D');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  },
};

function corpChoice(remaining: Card[], chosen: Card[], original: Card[]): any {
  return {
    prompt: 'Choose a card to move to bottom of R&D',
    choices: [...remaining, 'Done'],
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const chosenList = [target, ...chosen];
      if (target !== 'Done') {
        const remainingFiltered = remaining.filter((c: Card) => !coreCard.sameCard(c, target));
        if (remainingFiltered.length > 0) {
          continue_ability(state, side, corpChoice(remainingFiltered, [target, ...chosen], original), card, null);
        }
      } else {
        const finalChosen = chosen.filter((c: Card) => c !== 'Done');
        if (finalChosen.length > 0) {
          corpFinal(finalChosen, original);
        } else {
          coreSay.systemMsg(state, side, 'does not add any cards from HQ to bottom of R&D');
          coreEid.effectCompleted(state, side, eid);
        }
      }
    }),
  };
}

function corpFinal(chosen: Card[], original: Card[]): any {
  return {
    prompt: `The bottom cards of R&D will be ${utils.enumerateCards(chosen)}`,
    choices: ['Done', 'Start over'],
    async: true,
    msg: (msgFn: any) => `add ${utils.quantify(chosen.length, 'card')} from HQ to the bottom of R&D and draw ${utils.quantify(chosen.length, 'card')}${chosen.length <= ((state as any).runner?.hand?.length || 0) ? `. The Runner randomly adds ${utils.quantify(chosen.length, 'card')} from [runner-pronoun] Grip to the bottom of the Stack` : ''}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (target === 'Done') {
        const n = chosen.length;
        for (const c of [...chosen].reverse()) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, ':corp', c, 'deck')], []);
        }
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, ':corp', n)], []);
        if (n <= ((state as any).runner?.hand?.length || 0)) {
          const runnerHand = [...((state as any).runner?.hand || [])];
          const shuffled = runnerHand.sort(() => Math.random() - 0.5);
          for (const r of shuffled.slice(0, n)) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, ':runner', r, 'deck')], []);
          }
          coreEngine.triggerEvent(state, ':runner-hand-changed');
          yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.checkpoint(state, side, eid)], []);
        }
        coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, side, 'declines to add cards');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Regenesis
export const regenesis: CardDef = {
  title: 'Regenesis',
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corpDiscard = (state as any).corp?.discard || [];
      const hasFacedown = corpDiscard.some((c: Card) => !coreCard.faceup(c));
      if (!hasFacedown) return false;
      // Check no-event condition simplified
      return true;
    }),
    prompt: 'Choose a face-down agenda in Archives',
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.inDiscard(c) && !coreCard.faceup(c) },
    'show-discard': true,
    async: true,
    msg: (msgFn: any) => `reveal ${(target || []).title} and add it to [their] score area`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, target)], []);
      const c = coreMoving.move(state, ':corp', target, ':scored');
      coreInitializing.cardInit(state, ':corp', c, { 'resolve-effect': false, 'init-data': true });
      coreAgendas.updateAllAdvancementRequirements(state);
      coreAgendas.updateAllAgendaPoints(state);
      coreWinning.checkWinByAgenda(state, side);
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Regulatory Capture
export const regulatoryCapture: CardDef = {
  title: 'Regulatory Capture',
  'advancement-requirement': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return -(Math.min(4, utils.countBadPub(state) || 0));
  }),
};

// Remastered Edition
export const remasteredEdition: CardDef = {
  title: 'Remastered Edition',
  'on-score': agendaCounters(1),
  abilities: [Object.assign(coreDefHelpers.placeAdvancementCounter(null, 1), { cost: [corePayment.toC('agenda', 1)] })],
};

// Remote Data Farm
export const remoteDataFarm: CardDef = {
  title: 'Remote Data Farm',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to increase [their] maximum hand size by 2`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [coreHandSize.corpHandSizePlus(2)],
};

// Remote Enforcement
export const remoteEnforcement: CardDef = {
  title: 'Remote Enforcement',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Search R&D for a piece of ice to install protecting a remote server?',
      'yes-ability': {
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          const corp = (state as any).corp;
          const deckIces = (corp?.deck || []).filter((c: Card) => coreCard.ice(c));
          if (deckIces.length > 0) {
            continue_ability(
              state, side,
              {
                async: true,
                prompt: 'Choose a piece of ice',
                choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const corp = (state as any).corp;
                  return corePrompts.cancellable((corp?.deck || []).filter((c: Card) => coreCard.ice(c)), { sorted: true });
                }),
                cancel: coreShuffling.shuffleMyDeck!,
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const chosenIce = target;
                  continue_ability(
                    state, side,
                    {
                      async: true,
                      prompt: `Choose a server to install ${chosenIce.title} on`,
                      choices: coreBoard.installableServers(state, chosenIce).filter((s: string) => !['HQ', 'Archives', 'R&D'].includes(s)),
                      effect: effect(
                        coreShuffling.shuffle(state, ':deck'),
                        coreInstalling.corpInstall(eid, chosenIce, target, { 'install-state': ':rezzed-no-rez-cost', msgKeys: { installSource: card, displayOrigin: true } })
                      ),
                    },
                    card,
                    null
                  );
                }),
              },
              card,
              null
            );
          } else {
            continue_ability(
              state, side,
              { prompt: 'You have no ice in R&D', choices: ['Carry on!'], 'prompt-type': ':bogus', msg: 'shuffle R&D', effect: effect(coreShuffling.shuffle(state, ':deck')) },
              card,
              null
            );
          }
        }),
      },
    },
  },
};

// Research Grant
export const researchGrant: CardDef = {
  title: 'Research Grant',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.filter((c: Card) => c.title === card.title).length === 0;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      continue_ability(
        state, side,
        {
          prompt: `Choose another installed copy of ${card.title} to score`,
          choices: { card: (c: Card) => c.title === card.title },
          interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
          async: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreBoard.allInstalled(state, ':corp').some((c: Card) => c.title === card.title);
          }),
          effect: effect(coreAgendas.score(eid, coreCard.getCard(state, target), { 'no-req': true })),
          msg: 'score another installed copy of itself',
        },
        card,
        null
      );
    }),
  },
};

// Restructured Datapool
export const restructuredDatapool: CardDef = {
  title: 'Restructured Datapool',
  abilities: [{
    action: true,
    cost: [corePayment.toC('click', 1)],
    label: 'give runner 1 tag',
    'keep-menu-open': ':while-clicks-left',
    trace: {
      base: 2,
      successful: coreDefHelpers.giveTags(1),
    },
  }],
};

// Sacrifice Zone Expansion
export const sacrificeZoneExpansion: CardDef = {
  title: 'Sacrifice Zone Expansion',
  'install-state': ':face-up',
  events: [
    {
      event: 'advance',
      condition: ':faceup',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card) &&
          coreEvents.firstEvent(state, side, 'advance', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
      }),
      msg: 'gain 3 [Credits]',
      async: true,
      effect: effect(coreGaining.gainCredits(eid, 3)),
    },
    {
      event: 'successful-run',
      condition: ':faceup',
      optional: {
        prompt: 'Do 1 meat damage?',
        'once': ':per-turn',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return coreCard.installed(card) && coreServers.targetServer(forms.context(state, card, targets) || {}) !== (coreCard.getZone(card) || [])[1] &&
            corePayment.canPay(state, side, eid, card, null, [corePayment.toC('advancement', 1)]);
        }),
        'yes-ability': {
          cost: [corePayment.toC('advancement', 1)],
          msg: 'do 1 meat damage',
          effect: effect(coreDamage.damage(state, side, eid, ':meat', 1)),
          async: true,
        },
      },
    },
  ],
};

// Salvo Testing
export const salvoTesting: CardDef = {
  title: 'Salvo Testing',
  events: [{
    event: 'agenda-scored',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    optional: {
      prompt: 'Do 1 core damage?',
      'waiting-prompt': true,
      'yes-ability': { msg: 'do 1 core damage', async: true, effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })) },
    },
  }],
};

// SDS Drone Deployment
export const sdsDroneDeployment: CardDef = {
  title: 'SDS Drone Deployment',
  'steal-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return [corePayment.toC('program', 1)]; }),
  'on-score': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreBoard.allInstalledRunnerType(state, ':program').length > 0;
    }),
    'waiting-prompt': true,
    prompt: 'Choose a program to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c), all: true },
    msg: (msgFn: any) => target.title,
    async: true,
    effect: effect(coreMoving.trash(eid, target, { causeCard: card })),
  },
};

// See How They Run
export const seeHowTheyRun: CardDef = {
  title: 'See How They Run',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'give the runner 1 tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, ':runner', 1)], []);
      continue_ability(
        state, side,
        {
          msg: 'start a psi game (do 1 core damage / do 1 net damage)',
          psi: {
            'not-equal': { msg: 'do 1 core damage', async: true, effect: effect(coreDamage.damage(eid, ':brain', 1, { card: card })) },
            equal: { async: true, msg: 'do 1 net damage', effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })) },
          },
        },
        card,
        null
      );
    }),
  },
};

// Self-Destruct Chips
export const selfDestructChips: CardDef = {
  title: 'Self-Destruct Chips',
  'move-zone': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    if (coreCard.inScored(card) && (card as any)['scored-side'] === ':corp') {
      coreSay.systemMsg(state, side, `uses ${card.title} to decrease the Runner's maximum hand size by 1`);
    }
    coreEid.effectCompleted(state, side, eid);
  }),
  'static-abilities': [coreHandSize.runnerHandSizePlus(-1)],
};

// Send a Message
export const sendMessage: CardDef = {
  title: 'Send a Message',
  abilities: [{
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect(coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' })),
  }],
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect(coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' })),
  },
  stolen: {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.installed(c) },
    async: true,
    effect: effect(coreRezzing.rez(eid, target, { 'ignore-cost': ':all-costs' })),
  },
};

// Sensor Net Activation
export const sensorNetActivation: CardDef = {
  title: 'Sensor Net Activation',
  'on-score': agendaCounters(1),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const allInstalled = coreBoard.allInstalled(state, ':corp');
      return allInstalled.some((c: Card) => coreCard.hasSubtype(c, 'Bioroid') && !coreCard.rezzed(c));
    }),
    label: 'Choose a bioroid to rez, ignoring all costs',
    prompt: 'Choose a bioroid to rez, ignoring all costs',
    choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Bioroid') && !coreCard.rezzed(c) },
    async: true,
    effect: effect(function*(state: State, Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.rez(state, side, target, { 'ignore-cost': ':all-costs', msgKeys: { includeCostFromEid: eid } })], []);
      const c = (asyncResult || {}).card;
      const ev = ((state as any).activePlayer === ':corp') ? ':corp-turn-ends' : ':runner-turn-ends';
      coreEngine.registerEvents(state, side, card, [{
        event: ev,
        'unregister-once-resolved': true,
        duration: ':end-of-turn',
        async: true,
        effect: effect(coreRezzing.derez(eid, c)),
      }]);
      coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

// Sentinel Defense Program
export const sentinelDefenseProgram: CardDef = {
  title: 'Sentinel Defense Program',
  events: [{
    event: 'damage',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      return (ctx.amount > 0 && ctx['damage-type'] === ':brain');
    }),
    msg: 'do 1 net damage',
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', 1, { card: card })),
  }],
};

// Sericulture Expansion
export const sericultureExpansion: CardDef = {
  title: 'Sericulture Expansion',
  ...projectAgenda({ mode: 'computed' }),
  events: [{
    event: 'corp-turn-ends',
    ...Object.assign(coreDefHelpers.placeAdvancementCounter(null, 2), {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreBoard.allInstalled(state, ':corp').length > 0 &&
          corePayment.canPay(state, side, eid, card, null, [corePayment.toC('agenda', 1)]);
      }),
      cost: [corePayment.toC('agenda', 1)],
    }),
  }],
};

// Show of Force
export const showOfForce: CardDef = {
  title: 'Show of Force',
  'on-score': {
    async: true,
    msg: 'do 2 meat damage',
    effect: effect(coreDamage.damage(eid, ':meat', 2, { card: card })),
  },
};

// Sisyphus Protocol
export const sisyphusProtocol: CardDef = {
  title: 'Sisyphus Protocol',
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const ice = ctx.ice || {};
      return coreCard.rezzed(ice) &&
        (coreCard.hasSubtype(ice, 'Code Gate') || coreCard.hasSubtype(ice, 'Sentry')) &&
        coreEvents.firstEvent(state, side, 'pass-ice', (t: any[]) => {
          const first = t[0];
          const firstIce = first?.ice || {};
          return coreCard.rezzed(firstIce) &&
            (coreCard.hasSubtype(firstIce, 'Code Gate') || coreCard.hasSubtype(firstIce, 'Sentry'));
        });
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const ctx = forms.context(state, card, targets) || {};
      const encIce = coreCard.getCard(state, ctx.ice);
      continue_ability(
        state, side,
        {
          prompt: (msgFn: any) => `Make the runner encounter ${encIce.title} again?`,
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            const opts: string[] = [];
            if (corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('credit', 1)])) opts.push('Pay 1 [Credit]');
            if (corePayment.canPay(state, ':corp', eid, card, null, [corePayment.toC('trash-from-hand', 1)])) opts.push('Trash 1 card from HQ');
            opts.push('Done');
            return opts.filter(Boolean);
          }),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            if (target === 'Done') {
              coreEid.effectCompleted(state, side, eid);
            } else {
              continue_ability(
                state, side,
                {
                  cost: target === 'Pay 1 [Credit]' ? [corePayment.toC('credit', 1)] : [corePayment.toC('trash-from-hand', 1)],
                  'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                    return encIce && coreCard.rezzed(encIce);
                  })},
                  msg: (msgFn: any) => `make the runner encounter ${coreToString.cardStr(state, encIce)} again`,
                  async: true,
                  effect: effect(coreRuns.forceIceEncounter(state, side, eid, encIce)),
                },
                card,
                null
              );
            }
          }),
        },
        encIce,
        targets
      );
    }),
  }],
};

// Slash and Burn Agriculture
export const slashAndBurnAgriculture: CardDef = {
  title: 'Slash and Burn Agriculture',
  expend: Object.assign(coreDefHelpers.placeAdvancementCounter(true, 2), { cost: [corePayment.toC('credit', 1)] }),
};

// SSL Endorsement
export const sslEndorsement: CardDef = {
  title: 'SSL Endorsement',
  flags: { 'has-events-when-stolen': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  abilities: [coreOptional.setAutoresolve(':auto-fire', 'SSL Endorsement')],
  stolen: agendaCounters(9, ':credit'),
  'on-score': agendaCounters(9, ':credit'),
  events: [{
    event: 'corp-turn-begins',
    automatic: ':gain-credits',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':credit') || 0) > 0;
      }),
      'once': ':per-turn',
      prompt: 'Gain 3 [Credits]?',
      autoresolve: coreOptional.getAutoresolve(':auto-fire'),
      'yes-ability': {
        async: true,
        msg: (msgFn: any) => `gain ${Math.min(3, coreCard.getCounters(card, ':credit') || 0)} [Credits]`,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if ((coreCard.getCounters(card, ':credit') || 0) > 0) {
            yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.takeCredits(state, side, eid, card, ':credit', 3)], []);
          } else {
            coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    },
  }],
};

// Standoff
export const standoff: CardDef = {
  title: 'Standoff',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      corePrompts.showWaitPrompt(String((side === ':corp' ? 'Runner' : 'Corp') + ' to trash a card for Standoff'));
      continue_ability(':runner', stand(':runner'), card, null);
    }),
  },
};

function stand(side: string): any {
  return {
    async: true,
    prompt: 'Choose one of your installed cards to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreTags.sameSide(side, (c as any).side) },
    cancel: {
      'display-side': side,
      msg: 'decline trashing any more cards',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (side === ':runner') {
          yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, ':corp', 1)], []);
          corePrompts.clearWaitPrompt(state, ':corp');
          coreSay.systemMsg(state, ':corp', `uses ${card.title} to draw 1 card and gain 5 [Credits]`);
          coreGaining.gainCredits(state, ':corp', eid, 5);
        } else {
          corePrompts.clearWaitPrompt(state, ':runner');
          coreEid.effectCompleted(state, ':corp', eid);
        }
      }),
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, target,
        side === ':corp' ? { unpreventable: true, causeCard: card } : { unpreventable: true, causeCard: card, cause: ':forced-to-trash' }
      )], []);
      coreSay.systemMsg(state, side, `trashes ${coreToString.cardStr(state, target)} for ${card.title}`);
      corePrompts.clearWaitPrompt(state, coreTags.otherSide(side));
      corePrompts.showWaitPrompt(state, side, `${coreTags.sideStr(coreTags.otherSide(side))} to trash a card for ${card.title}`);
      continue_ability(state, coreTags.otherSide(side), stand(coreTags.otherSide(side)), card, null);
    }),
  };
}

// Stegodon MK IV
export const stegodonMKIV: CardDef = {
  title: 'Stegodon MK IV',
  events: [
    {
      event: 'run',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const rezzedTargets = (coreBoard.allInstalledCorp(state) || [])
          .filter((c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && (coreCard.getZone(c) || [])[1] !== (forms.context(state, card, targets) || {}).server);
        if (rezzedTargets.length > 0) {
          continue_ability(
            state, side,
            {
              prompt: 'Choose a piece of ice protecting another server to derez',
              'waiting-prompt': true,
              choices: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                return rezzedTargets.some((c: Card) => coreCard.sameCard(c, targets[0]));
              })},
              'once': ':per-turn',
              async: true,
              effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                yield wait_for(state, [{ asyncResult: 'result' }, coreRezzing.derez(state, side, target, { msgKeys: { 'and-then': ' and gain 1 [Credits]' } })], []);
                coreGaining.gainCredits(state, side, eid, 1);
              }),
            },
            card,
            null
          );
        }
      }),
    },
    {
      event: 'derez',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return forms.run(state) && coreEvents.firstRunEvent(state, side, 'derez', (ctx: any[]) => ctx.some((c: any) => coreCard.ice(c.card)));
      }),
      msg: 'lower strength of each installed icebreaker by 2',
    },
  ],
  'leave-play': effect(coreIce.updateAllIcebreakers()),
  'static-abilities': [{
    type: ':breaker-strength',
    value: -2,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return forms.run(state) &&
        coreCard.hasSubtype(targets[0] || {}, 'Icebreaker') &&
        coreEvents.runEventCount(state, side, 'derez', (ctx: any[]) => ctx.some((c: any) => coreCard.ice(c.card))) >= 1;
    }),
  }],
};

// Sting!
export const sting: CardDef = {
  title: 'Sting!',
  'on-score': {
    msg: (msgFn: any) => `deal ${1 + countOppStings(state, ':corp')} net damage`,
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', 1 + countOppStings(state, ':corp'), { card: card })),
  },
  stolen: {
    msg: (msgFn: any) => `deal ${1 + countOppStings(state, ':runner')} net damage`,
    async: true,
    effect: effect(coreDamage.damage(eid, ':net', 1 + countOppStings(state, ':runner'), { card: card })),
  },
};

function countOppStings(state: State, side: Side): number {
  const scored = (state as any)[side]?.scored || [];
  return scored.filter((c: Card) => c.title === 'Sting!').length;
}

// Stoke the Embers
export const stokeTheEmbers: CardDef = {
  title: 'Stoke the Embers',
  'on-score': scoreAbi(3),
  'derezzed-events': [{
    event: 'corp-install',
    optional: {
      prompt: 'Reveal this agenda to gain 2 [Credits] and place 1 advancement counter on an installed card?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (card as any).previousZone?.[0] !== ':hand' &&
          coreCard.sameCard((target as any)?.card || {}, card);
      }),
      'waiting-prompt': true,
      'yes-ability': {
        msg: (msgFn: any) => `reveal itself from ${(card as any).previousZone?.[0]}`,
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, card)], []);
          continue_ability(state, side, scoreAbi(2), coreCard.getCard(state, card), null);
        }),
      },
    },
  }],
};

function scoreAbi(credGain: number): any {
  return {
    msg: (msgFn: any) => `gain ${credGain} [Credits]`,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), credGain)], []);
      const placeAbi = Object.assign(coreDefHelpers.placeAdvancementCounter(null, 1), {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return coreBoard.allInstalledCorp(state).length > 0;
        }),
      });
      continue_ability(state, side, placeAbi, card, null);
    }),
  };
}

// Successful Field Test
export const successfulFieldTest: CardDef = {
  title: 'Successful Field Test',
  'on-score': {
    async: true,
    msg: 'install cards from HQ, ignoring all costs',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const corp = (state as any).corp;
      const handOps = (corp?.hand || []).filter((c: Card) => !coreCard.operation(c));
      const maxOps = handOps.length;
      continue_ability(state, side, sft(1, maxOps), card, null);
    }),
  },
};

function sft(n: number, maxOps: number): any {
  return {
    prompt: 'Choose a card in HQ to install',
    async: true,
    choices: { card: (c: Card) => coreCard.corp(c) && !coreCard.operation(c) && coreCard.inHand(c) },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(state, side, target, null, {
        'ignore-all-cost': true, msgKeys: { installSource: card, displayOrigin: true }
      })], []);
      if (n < maxOps) {
        continue_ability(state, side, sft(n + 1, maxOps), card, null);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

// Superconducting Hub
export const superconductingHub: CardDef = {
  title: 'Superconducting Hub',
  'static-abilities': [{
    type: ':hand-size',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return side === ':corp'; }),
    value: 2,
  }],
  'on-score': {
    optional: {
      prompt: 'Draw 2 cards?',
      'yes-ability': { msg: 'draw 2 cards', async: true, effect: effect(coreDrawing.draw(':corp', eid, 2)) },
    },
  },
};

// Superior Cyberwalls
export const superiorCyberwalls: CardDef = {
  title: 'Superior Cyberwalls',
  ...iceBoostAgenda('Barrier'),
};

// TGTBT
export const tgtbt: CardDef = {
  title: 'TGTBT',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': coreDefHelpers.giveTags(1),
};

// The Cleaners
export const theCleaners: CardDef = {
  title: 'The Cleaners',
  prevention: [{
    prevents: ':pre-damage',
    type: ':event',
    'max-uses': 1,
    mandatory: true,
    ability: {
      async: true,
      condition: ':active',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const ctx = forms.context(state, card, targets) || {};
        return ctx.type === ':meat' &&
          ctx.prevented !== ':all' &&
          ctx['source-player'] === ':corp' &&
          !ctx.unboostable;
      }),
      msg: 'increase the pending meat damage by 1',
      effect: effect(coreDamage.damageBoost(state, side, eid, 1)),
    },
  }],
};

// The Future is Now
export const theFutureIsNow: CardDef = {
  title: 'The Future is Now',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    prompt: 'Choose a card to add to HQ',
    'change-in-game-state': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.deck?.length > 0; }) },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return (state as any).corp?.deck || []; }),
    msg: 'add a card from R&D to HQ and shuffle R&D',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (state as any).corp?.deck?.length > 0;
    }),
    effect: effect(coreShuffling.shuffle(':deck'), coreMoving.move(target, 'hand')),
  },
};

// The Future Perfect
export const theFuturePerfect: CardDef = {
  title: 'The Future Perfect',
  flags: { 'rd-reveal': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }) },
  'on-access': {
    psi: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return !forms.installed(state, card); }),
      'not-equal': {
        msg: 'prevent itself from being stolen',
        async: true,
        effect: effect(
          coreFlags.registerRunFlag(card, ':can-steal', function(_s: State, _sd: Side, c: Card) { return !coreCard.sameCard(c, card); }),
          coreEid.effectCompleted(eid)
        ),
      },
    },
  },
};

// Timely Public Release
export const timelyPublicRelease: CardDef = {
  title: 'Timely Public Release',
  'on-score': agendaCounters(1),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'keep-menu-open': false,
    label: 'Install a piece of ice in any position, ignoring all costs',
    prompt: 'Choose a piece of ice to install',
    'show-discard': true,
    choices: { card: (c: Card) => coreCard.ice(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    async: true,
    msg: 'install an ice from HQ or Archives',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const chosenIce = target;
      continue_ability(
        state, side,
        {
          prompt: 'Choose a server',
          choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return coreBoard.installableServers(state, chosenIce); }),
          async: true,
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            const chosenServer = target;
            const zone = [...coreBoard.serverToZone(state, chosenServer), ':ices'];
            const numIce = ((state as any).corp?.servers?.[zone[1]]?.ices || []).length;
            continue_ability(
              state, side,
              {
                prompt: `Which position to install in? (0 is innermost)`,
                choices: Array.from({ length: numIce + 1 }, (_, i) => String(i)).reverse(),
                async: true,
                effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
                  const idx = parseInt(target, 10);
                  yield wait_for(state, [{ asyncResult: 'result' }, coreInstalling.corpInstall(state, side, eid, chosenIce, chosenServer, {
                    'ignore-all-cost': true, index: idx, msgKeys: { installSource: card, displayOrigin: true }
                  })], []);
                }),
              },
              card,
              null
            );
          }),
        },
        card,
        null
      );
    }),
  }],
};

// Tomorrow's Headline
export const tomorrowsHeadline: CardDef = {
  title: "Tomorrow's Headline",
  'on-score': coreDefHelpers.giveTags(1),
  stolen: coreDefHelpers.giveTags(1),
};

// Transport Monopoly
export const transportMonopoly: CardDef = {
  title: 'Transport Monopoly',
  'on-score': agendaCounters(2),
  abilities: [{
    cost: [corePayment.toC('agenda', 1)],
    'once': ':per-turn',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return forms.run(state); }),
    msg: 'prevent this run from becoming successful',
    effect: effect(coreEffects.registerLingeringEffect(card, {
      type: ':block-successful-run',
      duration: ':end-of-run',
      value: true,
    })),
  }],
};

// Underway Renovation
export const underwayRenovation: CardDef = {
  title: 'Underway Renovation',
  'install-state': ':face-up',
  events: [{
    event: 'advance',
    condition: ':faceup',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, (forms.context(state, card, targets) || {}).card);
    }),
    msg: (msgFn: any) => {
      const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
      const n = adv >= 4 ? 2 : 1;
      const runnerDeck = (state as any).runner?.deck || [];
      if (runnerDeck.length > 0) {
        return `trash ${utils.enumerateCards(runnerDeck.slice(0, n))} from the stack`;
      }
      return 'trash no cards from the stack (it is empty)';
    },
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const adv = coreCard.getCounters(coreCard.getCard(state, card), ':advancement') || 0;
      const n = adv >= 4 ? 2 : 1;
      coreMoving.mill(':corp', eid, ':runner', n);
    }),
  }],
};

function adv4(s: State, c: Card): number {
  return (coreCard.getCounters(coreCard.getCard(s, c), ':advancement') || 0) >= 4 ? 2 : 1;
}

// Unorthodox Predictions
export const unorthodoxPredictions: CardDef = {
  title: 'Unorthodox Predictions',
  implementation: 'Prevention of subroutine breaking is not enforced',
  'on-score': {
    prompt: 'Choose an ice type',
    choices: ['Barrier', 'Code Gate', 'Sentry'],
    msg: (msgFn: any) => `prevent subroutines on ${target} ice from being broken until next turn`,
  },
};

// Utopia Fragment
export const utopiaFragment: CardDef = {
  title: 'Utopia Fragment',
  'static-abilities': [{
    type: ':steal-additional-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return (coreCard.getCounters(targets[0] || {}, ':advancement') || 0) > 0;
    }),
    value: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return corePayment.toC('credit', 2 * (coreCard.getCounters(targets[0] || {}, ':advancement') || 0));
    }),
  }],
};

// Vanity Project
export const vanityProject: CardDef = {
  title: 'Vanity Project',
  // No special implementation
  ...{},
};

// Veterans Program
export const veteransProgram: CardDef = {
  title: 'Veterans Program',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'remove 2 bad publicity',
    effect: effect(coreBadPublicity.loseBadPublicity(2)),
  },
};

// Viral Weaponization
export const viralWeaponization: CardDef = {
  title: 'Viral Weaponization',
  'on-score': {
    effect: effect(coreEngine.registerEvents(card, [{
      event: ((state as any).activePlayer === ':corp') ? ':corp-turn-ends' : ':runner-turn-ends',
      'unregister-once-resolved': true,
      duration: ':end-of-turn',
      msg: (msgFn: any) => `do ${(state as any).runner?.hand?.length} net damage`,
      async: true,
      effect: effect(coreDamage.damage(eid, ':net', (state as any).runner?.hand?.length || 0, { card: card })),
    }])),
  },
};

// Voting Machine Initiative
export const votingMachineInitiative: CardDef = {
  title: 'Voting Machine Initiative',
  'on-score': agendaCounters(3),
  events: [{
    event: 'runner-turn-begins',
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return (coreCard.getCounters(card, ':agenda') || 0) > 0;
      }),
      'waiting-prompt': true,
      prompt: 'Make the Runner lose [Click]?',
      'yes-ability': {
        msg: 'make the Runner lose [Click]',
        cost: [corePayment.toC('agenda', 1)],
        effect: effect(coreGaining.loseClicks(':runner', 1)),
      },
    },
  }],
};

// Vulcan Coverup
export const vulcanCoverup: CardDef = {
  title: 'Vulcan Coverup',
  'on-score': {
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) { return true; }),
    msg: 'do 2 meat damage',
    async: true,
    effect: effect(coreDamage.damage(eid, ':meat', 2, { card: card })),
  },
  stolen: {
    msg: 'force the Corp to take 1 bad publicity',
    async: true,
    effect: effect(coreBadPublicity.gainBadPublicity(':corp', eid, 1)),
  },
};

// Vulnerability Audit
export const vulnerabilityAudit: CardDef = {
  title: 'Vulnerability Audit',
  flags: {
    'can-score': req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const result = coreCard.installed(card) !== ':this-turn';
      if (!result) {
        coreToasts.toast(state, ':corp', 'Cannot score Vulnerability Audit the turn it was installed.', 'warning');
      }
      return result;
    }),
  },
};

// Water Monopoly
export const waterMonopoly: CardDef = {
  title: 'Water Monopoly',
  'static-abilities': [{
    type: ':install-cost',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const targetCard = targets[0];
      const secondTarget = targets[1];
      return coreCard.resource(targetCard) &&
        !coreCard.hasSubtype(targetCard, 'Virtual') &&
        !(secondTarget as any)?.facedown;
    }),
    value: 1,
  }],
};

// Witch Hunt
export const witchHunt: CardDef = {
  title: 'Witch Hunt',
  stolen: bpAbi,
  'on-score': bpAbi,
  events: [{
    'unregister-once-resolved': true,
    event: 'corp-action-phase-ends',
    duration: ':end-of-turn',
    req: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreEvents.firstEvent(':agenda-scored', (t: any[]) => t[0] && coreCard.sameCard(card, t[0].card));
    }),
    msg: (msgFn: any) => ((forms.tagged(state) || 0) > 0 ? 'Remove all tags, and then give the Runner 3 tags' : 'give the Runner 3 tags'),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if ((forms.tagged(state) || 0) > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, ':all', { suppressCheckpoint: true })], []);
        coreTags.gainTags(state, side, eid, 3);
      } else {
        coreTags.gainTags(state, side, eid, 3);
      }
    }),
  }],
};

const bpAbi: any = {
  msg: 'take 1 bad publicity',
  async: true,
  effect: effect(coreBadPublicity.gainBadPublicity(':corp', eid, 1)),
};
