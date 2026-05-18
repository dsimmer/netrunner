/**
 * Event Cards - Runner and Corp event card definitions
 * Ported from Clojure cards/events.clj to TypeScript
 * 
 * This file contains ~224 card definitions with their abilities and events.
 * Each card has properties like makes-run, on-play, events, static-abilities, etc.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreAgendas from '../core/agendas';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCharge from '../core/charge';
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
import * as coreExpose from '../core/expose';
import * as coreFinding from '../core/finding';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreHosting from '../core/hosting';
import * as coreIce from '../core/ice';
import * as coreIdentities from '../core/identities';
import * as coreInstalling from '../core/installing';
import * as coreLink from '../core/link';
import * as coreMark from '../core/mark';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSabotage from '../core/sabotage';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreSetAside from '../core/set_aside';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as utils from '../utils';
import * as jintekiValidator from '../../jinteki/validator';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import { serverCards } from './_helpers';

// Import defcard helper - each card is a card definition object
import { defcard } from '../core/def_helpers';
import type { CardDef } from '../../types';

import { drawAbi, runAnyServerAbility, runServerAbility } from './events_1';
import { rejigPickUp, rejigPutDown } from './events_7';
import * as coreUtils from '../utils';

// __cardScopeShim: ambient placeholders for legacy patterns.
const state: any = undefined as any;
const target: any = undefined as any;
const asyncResult: any = undefined as any;

// Modded
export const modded: CardDef = {
  title: 'Modded',
  onPlay: {
    prompt: 'Choose a program or piece of hardware to install',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (coreDefHelpers.allCardsInHandStar(state, 'runner') || []).length > 0; }),
    },
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return (coreCard.hardware(t) || coreCard.program(t)) && coreCard.inHandStar(state, t) && coreInstalling.runnerCanPayAndInstall(state, side, eid, card, { costBonus: -3 });
      }),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.runnerInstall({ ...eid, source: card, sourceType: 'runner-install' }, msg, { costBonus: -3, msgKeys: { installSource: card, displayOrigin: true } }); }),
  },
};

// Moshing
export const moshing: CardDef = {
  title: 'Moshing',
  onPlay: {
    additionalCost: [corePayment.toC('trash-from-hand', 3)],
    msg: 'draw 3 cards and gain 3 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, eid, 3)], []);
    }),
  },
};

// Mutual Favor
export const mutualFavor: CardDef = {
  title: 'Mutual Favor',
  onPlay: {
    prompt: 'Choose an Icebreaker',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      return corePrompts.cancellable(deck.filter((c: Card) => coreCard.hasSubtype(c, 'Icebreaker')), 'sorted');
    }),
    cancel: coreShuffling.failToFind,
    msg: msg('add ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg, ' from the stack to the grip and shuffle the stack'),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.triggerEvent('searched-stack'); continue_ability(
        (() => {
          const icebreaker = msg;
          if ((state as any).runner?.register?.successfulRun && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, icebreaker)) {
            return {
              optional: {
                prompt: msg('Install ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => icebreaker.title, '?'),
                yesAbility: {
                  async: true,
                  msg: msg('install ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => icebreaker.title),
                  effect: effect(
                    coreInstalling.runnerInstall(state, side, { ...eid, source: card, sourceType: 'runner-install' }, icebreaker, null),
                    coreShuffling.shuffle(state, side, 'deck')
                  ),
                },
                noAbility: {
                  effect: effect(coreMoving.move(state, side, icebreaker, 'hand'), coreShuffling.shuffle(state, side, 'deck')),
                },
              },
            };
          }
          return { effect: effect(coreMoving.move(state, side, icebreaker, 'hand'), coreShuffling.shuffle(state, side, 'deck')) };
        })(),
        card,
        null
      ); }),
  },
};

// Net Celebrity
export const netCelebrity: CardDef = {
  title: 'Net Celebrity',
  recurring: 1,
  interactions: {
    'pay-credits': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }), type: 'recurring' },
  },
};

// Networking
export const networking: CardDef = {
  title: 'Networking',
  onPlay: {
    async: true,
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return utils.isTagged(state) ? 'remove 1 tag' : 'do nothing';
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.loseTags(state, side, 1)], []);
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: msg('Pay 1 [Credits] to add ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => card.title, ' to Grip?'),
            req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
              return corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', 1)]);
            }),
            yesAbility: {
              cost: [corePayment.toC('credit', 1)],
              msg: 'add itself to the Grip',
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(state, side, card, 'hand'); }),
            },
          },
        },
        card,
        null
      );
    }),
  },
};

// Notoriety
export const notoriety: CardDef = {
  title: 'Notoriety',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') && reg?.successfulRun?.includes('rd') && reg?.successfulRun?.includes('archives');
    }),
    msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.asAgenda(state, 'runner', card, 1)], []);
    }),
  },
};

// Office Supplies
export const officeSupplies: CardDef = {
  title: 'Office Supplies',
  onPlay: {
    playCostBonus: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return -coreLink.getLink(state); }),
    prompt: 'Choose one',
    waitingPrompt: true,
    choices: ['Gain 4 [Credits]', 'Draw 4 cards'],
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (msg === 'Gain 4 [Credits]') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 4)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, 'runner', eid, 4)], []);
      }
    }),
  },
};

// On the Lam
export const onTheLam: CardDef = {
  title: 'On the Lam',
  prevention: [
    {
      prevents: 'tag',
      type: 'ability',
      prompt: 'Trash On the Lam to avoid up to 3 tags?',
      ability: { ...(corePrevention.preventUpToNTags(3) || {}), cost: [corePayment.toC('trash-can')] },
    },
    {
      prevents: 'damage',
      type: 'ability',
      prompt: 'Trash On the Lam to prevent up to 3 damage?',
      ability: { ...(corePrevention.preventUpToNDamage(3, ['net', 'meat', 'core', 'brain']) || {}), cost: [corePayment.toC('trash-can')] },
    },
  ],
  onPlay: {
    prompt: 'Choose a resource to host On the Lam on',
    choices: { card: (c: Card) => coreCard.resource(c) && coreCard.installed(c) },
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreCard.resource(c));
      }),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(state, side, `hosts On the Lam on ${msg.title}`); coreInstalling.installAsConditionCounter(state, side, eid, card, msg); }),
  },
};

// Out of the Ashes
export const outOfTheAshes: CardDef = {
  title: "Out of the Ashes",
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'runner-turn-begins',
    skippable: true,
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ashes = (state as any).runner?.discard?.filter((c: Card) => c.title === 'Out of the Ashes') || [];
      return card !== ashes[0] || !coreEngine.notUsedOnce(state, { once: 'per-turn', onceKey: 'out-of-ashes' }, card);
    }),
    location: 'discard',
    once: 'per-turn',
    onceKey: 'out-of-ashes',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreEid.makeEid(state, eid), outOfTheAshesRecur(), card, null)],
        []
      );
      return coreEid.effectCompleted(state, side, eid);
    }),
  }],
};

function outOfTheAshesRecur(): any {
  return {
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !coreCard.zoneLocked(state, 'runner', 'discard'); }),
      prompt: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const count = (state as any).runner?.discard?.filter((c: Card) => c.title === 'Out of the Ashes').length || 0;
        return `Remove Out of the Ashes from the game to make a run? (${count} available)`;
      }),
      yesAbility: {
        async: true,
        msg: 'removes Out of the Ashes from the game to make a run',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, card, 'rfg')], []);
          yield wait_for(
            state,
            [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreEid.makeEid(state, eid), outOfTheAshesRun(), card, null)],
            []
          );
          const next = (state as any).runner?.discard?.find((c: Card) => c.title === 'Out of the Ashes' && !utils.sameCard(card, c));
          if (next) {
            yield continue_ability(state, side, outOfTheAshesRecur(), coreCard.getCard(state, next), null);
          } else {
            return coreEid.effectCompleted(state, side, eid);
          }
        }),
      },
    },
  };
}

function outOfTheAshesRun(): any {
  return {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.makeRun(eid, msg, card); }),
  };
}

// Overclock
export const overclock: CardDef = {
  title: 'Overclock',
  makesRun: true,
  data: { counter: { credit: 5 } },
  interactions: {
    'pay-credits': { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.run(state); }), type: 'credit' },
  },
  onPlay: runAnyServerAbility(),
};

// Paper Tripping
export const paperTripping: CardDef = {
  title: 'Paper Tripping',
  onPlay: {
    msg: 'remove all tags',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return utils.isTagged(state); }),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreTags.loseTags(eid, 'all'); }),
  },
};

// Peace in Our Time
export const peaceInOurTime: CardDef = {
  title: 'Peace in Our Time',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return !(state as any).corp?.registerLastTurn?.scoredAgenda;
    }),
    msg: 'gain 10 [Credits]. The Corp gains 5 [Credits]',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 10)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreFlags.registerTurnFlag(state, side, card, 'can-run', null)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'corp', eid, 5)], []);
    }),
  },
};

// Pinhole Threading
export const pinholeThreading: CardDef = {
  title: 'Pinhole Threading',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run-replace-breach',
    mandatory: true,
    thisCardRun: true,
    ability: {
      prompt: 'Choose a card in the root of another server to access',
      choices: {
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          const topmost = coreCard.getNestedHost(msg);
          const zone = coreCard.getZone(topmost);
          return zone && (state as any).run?.server?.[0] !== zone[1] && zone[zone.length - 1] === 'content';
        }),
      },
      async: true,
      waitingPrompt: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (coreCard.agenda(msg)) {
          const protectedCard = msg;
          coreFlags.registerRunFlag(state, side, card, 'can-steal', function*(_state: State, _side: Side, c: Card): Generator<any, any, any> { return !utils.sameCard(c, protectedCard); });
          coreFlags.registerRunFlag(state, side, card, 'can-trash', function*(_state: State, _side: Side, c: Card): Generator<any, any, any> { return !utils.sameCard(c, protectedCard); });
          yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.accessCard(state, side, protectedCard)], []);
          coreFlags.clearRunFlag(state, side, card, 'can-steal');
          coreFlags.clearRunFlag(state, side, card, 'can-trash');
          return coreEid.effectCompleted(state, side, eid);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' }, coreAccess.accessCard(state, side, eid, msg)], []);
        }
      }),
    },
  }],
};

// Planned Assault
export const plannedAssault: CardDef = {
  title: 'Planned Assault',
  onPlay: {
    prompt: 'Choose a Run event',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).runner?.deck?.length > 0; }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      return deck
        .filter((c: Card) => coreCard.hasSubtype(c, 'Run') && corePayment.canPay(state, side, { ...eid, source: card, sourceType: 'play' }, c, null, [corePayment.toC('credit', coreCostFns.playCost(state, side, c) || 0)]))
        .sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
    }),
    msg: msg('play ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.triggerEvent('searched-stack'); coreShuffling.shuffle(state, side, 'deck'); corePlayInstants.playInstant(eid, msg, { noAdditionalCost: true }); }),
  },
};

// Political Graffiti
export const politicalGraffiti: CardDef = {
  title: 'Political Graffiti',
  makesRun: true,
  onPlay: runServerAbility('archives'),
  staticAbilities: [{
    type: 'agenda-value',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return utils.sameCard(msg, card.host);
    }),
    value: -1,
  }],
  events: [
    {
      event: 'purge',
      condition: 'hosted',
      async: true,
      msg: 'trash itself',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, 'runner', card, { cause: 'purge', causeCard: card })], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreAgendas.updateAllAgendaPoints(state, side)], []);
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
    {
      event: 'successful-run-replace-breach',
      targetServer: 'archives',
      thisCardRun: true,
      mandatory: true,
      ability: {
        prompt: msg('Choose an agenda to host ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => card.title, ' on'),
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreFlags.inCorpScored(state, side, msg); }),
        },
        msg: msg('host itself on ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg, ' as a hosted condition counter'),
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.installAsConditionCounter(state, side, coreEid.makeEid(state, eid), card, msg); coreAgendas.updateAllAgendaPoints(state, side); }),
      },
    },
  ],
};

// Populist Rally
export const populistRally: CardDef = {
  title: 'Populist Rally',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreCard.hasSubtype(c, 'Seedy'));
    }),
    msg: 'give the Corp 1 fewer [Click] to spend on [corp-pronoun] next turn',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose('corp', 'click-per-turn', 1); }),
  },
  events: [{
    event: 'corp-turn-ends',
    duration: 'until-corp-turn-ends',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gain('corp', 'click-per-turn', 1); }),
  }],
};

// Power Nap
export const powerNap: CardDef = {
  title: 'Power Nap',
  onPlay: {
    async: true,
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const count = (state as any).runner?.discard?.filter((c: Card) => coreCard.hasSubtype(c, 'Double')).length || 0;
      return `gain ${count + 2} [Credits]`;
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(eid, (state as any).runner?.discard?.filter((c: Card) => coreCard.hasSubtype(c, 'Double')).length + 2 || 2); }),
  },
};

// Power to the People
export const powerToThePeople: CardDef = {
  title: 'Power to the People',
  events: [{
    event: 'access',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return coreCard.agenda(ctx.accessedCard) && coreEvents.firstEvent(state, side, 'access', (t: any[]) => coreCard.agenda(t[0]?.accessedCard));
    }),
    duration: 'end-of-turn',
    unregisterOnceResolved: true,
    msg: 'gain 7 [Credits]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(eid, 7); }),
  }],
};

// Prey
export const prey: CardDef = {
  title: 'Prey',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return coreCard.rezzed(ctx.ice) && coreEngine.notUsedOnce(state, { once: 'per-run' }, card) && coreIce.getStrength(ctx.ice) <= (coreBoard.allInstalled(state, 'runner') || []).length;
    }),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0]; continue_ability(
        (() => {
          const ice = ctx.ice;
          if (coreIce.getStrength(ice) > 0) {
            return {
              optional: {
                prompt: msg('Trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreUtils.quantify(coreIce.getStrength(ice), 'installed card'), ' to trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ice.title, '?'),
                once: 'per-run',
                yesAbility: {
                  async: true,
                  cost: [corePayment.toC('trash-installed', coreIce.getStrength(ice))],
                  msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, ice)),
                  effect: effect(coreMoving.trash(eid, ice, { causeCard: card })),
                },
              },
            };
          }
          return {
            optional: {
              prompt: msg('Trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => ice.title, '?'),
              once: 'per-run',
              yesAbility: {
                async: true,
                msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, ice)),
                effect: effect(coreMoving.trash(eid, ice, { causeCard: card })),
              },
            },
          };
        })(),
        card,
        null
      ); }),
  }],
};

// Privileged Access
export const privilegedAccess: CardDef = {
  title: 'Privileged Access',
  makesRun: true,
  onPlay: { ...(runServerAbility('archives') || {}), req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !utils.isTagged(state); }) },
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    mandatory: true,
    ability: {
      async: true,
      msg: 'take 1 tag',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreEngine.registerPendingEvent(state, 'runner-gain-tag', card, privilegedAccessInstallResource());
        coreEngine.registerPendingEvent(state, 'runner-gain-tag', card, privilegedAccessInstallProgram());
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', 1)], []);
        coreEngine.unregisterEvents(state, side, card);
        return coreEid.effectCompleted(state, side, eid);
      }),
    },
  }],
};

function privilegedAccessInstallProgram(): any {
  return {
    prompt: 'Choose a program to install',
    waitingPrompt: true,
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const c = coreCard.getCard(state, card);
      return !c?.special?.maybeABonusTag && !coreCard.zoneLocked(state, 'runner', 'discard') && !coreInstalling.installLocked(state, side) && coreThreat.threatLevel(3, state);
    }),
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    abilityName: 'Privileged Access (program)',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const discard = (state as any).runner?.discard || [];
      return [...discard.filter((c: Card) => coreCard.program(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c)).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), 'Done'];
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { msg === 'Done'
        ? coreEid.effectCompleted(state, side, eid)
        : effect(
            coreUpdate.updateIn(state, side, 'maybeABonusTag', true),
            coreInstalling.runnerInstall(coreEid.makeEid(state, { ...eid, source: card, sourceType: 'runner-install' }), msg, { msgKeys: { installSource: card, displayOrigin: true } }),
            coreUpdate.updateIn(state, side, 'maybeABonusTag', () => undefined),
            coreEid.effectCompleted(state, side, eid)
          ); }),
  };
}

function privilegedAccessInstallResource(): any {
  return {
    prompt: 'Choose a resource to install, paying 2 [Credits] less',
    waitingPrompt: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const c = coreCard.getCard(state, card);
      return !c?.special?.maybeABonusTag && !coreCard.zoneLocked(state, 'runner', 'discard') && !coreInstalling.installLocked(state, side);
    }),
    async: true,
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
    abilityName: 'Privileged Access (resource)',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const discard = (state as any).runner?.discard || [];
      return [...discard.filter((c: Card) => coreCard.resource(c) && coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: -2 })).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || '')), 'Done'];
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { msg === 'Done'
        ? coreEid.effectCompleted(state, side, eid)
        : effect(
            coreUpdate.updateIn(state, side, 'maybeABonusTag', true),
            coreInstalling.runnerInstall(coreEid.makeEid(state, { ...eid, source: card, sourceType: 'runner-install' }), msg, { costBonus: -2, msgKeys: { installSource: card, displayOrigin: true } }),
            coreUpdate.updateIn(state, side, 'maybeABonusTag', () => undefined),
            coreEid.effectCompleted(state, side, eid)
          ); }),
  };
}

// Process Automation
export const processAutomation: CardDef = {
  title: 'Process Automation',
  onPlay: {
    msg: 'gain 2 [Credits] and draw 1 card',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, side, 2)], []);
      yield wait_for(state, [{ asyncResult: 'result' }, coreDrawing.draw(state, side, eid, 1)], []);
    }),
  },
};

// Push Your Luck
export const pushYourLuck: CardDef = {
  title: 'Push Your Luck',
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const allAmounts = Array.from({ length: (state as any).runner?.credit + 1 }, (_, i) => i);
      const validAmounts = allAmounts.filter((n: number) => !coreFlags.anyFlagFn(state, 'corp', 'prevent-secretly-spend', n) && !coreFlags.anyFlagFn(state, 'runner', 'prevent-secretly-spend', n));
      const choices = validAmounts.map(String);
      yield continue_ability(state, side, pushYourLuckRunnerChoice(choices), card, null);
    }),
  },
};

function pushYourLuckRunnerChoice(choices: string[]): any {
  return {
    prompt: 'How many credits do you want to spend?',
    waitingPrompt: true,
    choices: choices,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability('corp', pushYourLuckCorpChoice(choices, parseInt(msg, 10)), card, null); }),
  };
}

function pushYourLuckCorpChoice(choices: string[], spent: number): any {
  return {
    player: 'corp',
    waitingPrompt: true,
    prompt: 'Choose one',
    choices: ['Even', 'Odd'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const correctGuess = (msg === 'Even' ? (n: number) => n % 2 === 0 : (n: number) => n % 2 !== 0)(spent);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseCredits(state, 'runner', coreEid.makeEid(state, eid), spent)], []);
      coreSay.systemMsg(state, 'runner', `spends ${spent} [Credit]`);
      coreSay.systemMsg(state, 'corp', `${correctGuess ? '' : 'in'}correctly guesses ${msg.toLowerCase()}`);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.triggerEventSimult(state, side, 'reveal-spent-credits', null, { runnerCredits: spent })],
        []
      );
      if (correctGuess) {
        return coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, 'runner', `gains ${spent * 2} [Credits]`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, spent * 2)], []);
      }
    }),
  };
}

// Pushing the Envelope
export const pushingTheEnvelope: CardDef = {
  title: 'Pushing the Envelope',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null)).length > 0;
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    msg: msg(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (state as any).runner?.hand?.length <= 2 ? 'make a run, and give +2 strength to installed icebreakers' : 'make a run';
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((state as any).runner?.hand?.length <= 2) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreIce.pumpAllIcebreakers(state, side, 2, 'end-of-run')], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreRuns.makeRun(state, side, eid, msg, card)], []);
    }),
  },
};

// Quality Time
export const qualityTime: CardDef = {
  title: 'Quality Time',
  onPlay: drawAbi(5),
};

// Queen's Gambit
export const queensGambit: CardDef = {
  title: "Queen's Gambit",
  onPlay: {
    choices: ['0', '1', '2', '3'],
    prompt: 'How many advancement counters do you want to place?',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(
        (() => {
          const c = parseInt(msg, 10);
          return {
            choices: { card: (c: Card) => coreServers.isRemote(coreCard.getZone(c)?.[1]) && (coreCard.getZone(c) as string[])[(coreCard.getZone(c) as string[]).length - 1] === 'content' && !c.rezzed },
            msg: msg('place ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreUtils.quantify(c, 'advancement counter'), ' on ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, msg), ' and gain ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => c * 2, ' [Credits]'),
            async: true,
            effect: effect(
              coreGaining.gainCredits(state, side, c * 2),
              coreProps.addProp(state, 'corp', msg, 'advance-counter', c, { placed: true }),
              coreFlags.registerTurnFlag(state, side, card, 'can-access', function*(_state: State, _side: Side, c: Card): Generator<any, any, any> { return !utils.sameCard(msg, c); }),
              coreEid.effectCompleted(state, side, eid)
            ),
          };
        })(),
        card,
        null
      ); }),
  },
};

// Quest Completed
export const questCompleted: CardDef = {
  title: 'Quest Completed',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') && reg?.successfulRun?.includes('rd') && reg?.successfulRun?.includes('archives');
    }),
    onChangeGameState: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return (coreBoard.allInstalled(state, 'corp') || []).some((c: Card) => !coreCard.ice(c));
      }),
    },
    choices: { card: (c: Card) => coreCard.installed(c) },
    msg: msg('access ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => msg),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreAccess.accessCard(eid, msg); }),
  },
};

// Raindrops Cut Stone
export const raindropsCutStone: CardDef = {
  title: 'Raindrops Cut Stone',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: 'subroutine-fired',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return card.zone?.includes('play-area');
      }),
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreProps.addCounter(eid, coreCard.getCard(state, card), 'power', 1, null); }),
    },
    {
      event: 'run-ends',
      async: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return forms.thisCardRun; }),
      interactive: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return true; }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const cardsToDraw = coreCard.getCard(state, card)?.power || 0;
        yield continue_ability(
          state,
          side,
          {
            msg: msg(cardsToDraw > 0 ? `draw ${cardsToDraw} card and gain 3 [Credits]` : 'gain 3 [Credits]'),
            async: true,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { cardsToDraw > 0 ? coreDrawing.draw(state, side, cardsToDraw) : null; coreGaining.gainCredits(state, side, eid, 3); }),
          },
          card,
          null
        );
      }),
    },
  ],
};

// Rebirth
export const rebirth: CardDef = {
  title: 'Rebirth',
  onPlay: {
    prompt: 'Choose an identity',
    rfgInsteadOfTrashing: true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runnerIdentity = (state as any).runner?.identity;
      const format = (state as any).format;
      const isDraftId = (c: Card) => c.code?.startsWith('00');
      const isSwappable = (c: Card) =>
        c.type === 'Identity' && c.side === 'Runner' && runnerIdentity?.faction === c.faction && !isDraftId(c) && runnerIdentity?.title !== c.title &&
        (['casual', 'quick-draft', 'preconstructed'].includes(format) || jintekiValidator.legal(format, 'legal', c));
      const swappableIds = (serverCards() || []).filter((c: Card) => isSwappable(c));
      return swappableIds.sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
    }),
    msg: 'change identities',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const oldIdentity = (state as any).runner?.identity;
      for (const c of oldIdentity?.hosted || []) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, side, c, 'temp-hosted')], []);
      }
      coreIdentities.disableIdentity(state, side);
      const newId = { ...msg, zone: ['identity'] };
      const numOldBlanks = oldIdentity?.numDisabled || 0;
      (state as any).runner.identity = newId;
      coreInitializing.cardInit(state, side, newId);
      for (let i = 0; i < numOldBlanks; i++) {
        coreIdentities.disableIdentity(state, side);
      }
      for (const c of (state as any).runner?.tempHosted || []) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreHosting.host(state, side, (state as any).runner?.identity, c, { facedown: true })], []);
      }
    }),
  },
};

// Reboot
export const reboot: CardDef = {
  title: 'Reboot',
  makesRun: true,
  onPlay: { ...(runServerAbility('archives') || {}), rfgInsteadOfTrashing: true },
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'archives',
    thisCardRun: true,
    mandatory: true,
    ability: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return !coreCard.zoneLocked(state, 'runner', 'discard'); }),
      async: true,
      prompt: 'Choose up to 5 cards to install',
      showDiscard: true,
      choices: { max: 5, card: (c: Card) => coreCard.inDiscard(c) && coreCard.runner(c) },
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { rebootInstallCards(targets || [], targets?.map((c: Card) => c.title) || []); }),
    },
  }],
};

function rebootInstallCards(toInstall: Card[], titles: string[]): any {
  if (toInstall.length > 0) {
    return {
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.runnerInstall(state, 'runner', toInstall[0], { facedown: true, noMsg: true }); rebootInstallCards(toInstall.slice(1), titles); }),
    };
  }
  return effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(state, side, coreFinding.findLatest(state, card), 'rfg'); coreSay.systemMsg(state, 'runner', `uses ${card.title} to install ${titles.join(', ')} facedown`); coreEid.effectCompleted(state, side, eid); });
}

// Recon
export const recon: CardDef = {
  title: 'Recon',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    skippable: true,
    optional: coreDefHelpers.offerJackOut({ req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return coreEvents.firstRunEvent(state, side, 'encounter-ice'); }) }),
  }],
};

// Rejig
export const rejig: CardDef = {
  title: 'Rejig',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, 'runner') || []).some((c: Card) => coreCard.runner(c) && (coreCard.program(c) || coreCard.hardware(c)));
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, rejigPickUp(), card, null)],
        []
      );
      yield continue_ability(state, side, rejigPutDown(asyncResult || 0), card, null);
    }),
  },
};
