/**
 * Corp Operations - Card definitions for corp operations  
 * Ported from Clojure cards/operations.clj to TypeScript
 * 
 * This file contains ~219 corp operation card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreChooseOne from '../core/choose_one';
import * as coreCostFns from '../core/cost_fns';
import * as coreCosts from '../core/costs';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand_size';
import * as coreIce from '../core/ice';
import * as coreIdentities from '../core/identities';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play_instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreSetAside from '../core/set_aside';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as macros from '../macros';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

import { cardDef } from '../core/card_defs';
import { clearance, lockdown, trashType } from './operations_1';

// __cardScopeShim: 'state', 'target', etc. are referenced at CardDef literal
// scope in cards that were not yet rewritten to use req/effect callbacks.
// These ambient names keep the file compiling; the affected predicates were
// already broken at runtime (state was never defined in the closure either)
// and need per-card rewrites to use state-aware req/effect callbacks.
const state: any = undefined as any;
const target: any = undefined as any;

// Defective Brainchips
export const defectiveBrainchips: CardDef = {
  title: 'Defective Brainchips',
  prevention: [{
    prevents: 'pre-damage',
    type: 'event',
    maxUses: 1,
    mandatory: true,
    ability: {
      async: true,
      condition: 'active',
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx = targets[0];
        return (ctx.type === 'brain' || ctx.type === 'core') && ctx.prevented !== 'all' && ctx.remaining > 0 && !ctx.unboostable;
      }),
      msg: 'increase the pending core damage by 1',
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { corePrevention.damageBoost(state, side, eid, 1); }),
    },
  }],
};

// Digital Rights Management - simplified
export const digitalRightsManagement: CardDef = {
  title: 'Digital Rights Management',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => state.turn > 1 && !(state as any).runner?.register?.lastTurn?.successfulRun?.includes('hq')),
    prompt: 'Choose an Agenda',
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.deck?.length > 0 || (state as any).corp?.hand?.length > 0),
    },
    choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => [...((state as any).corp?.deck || []).filter((c: Card) => coreCard.agenda(c)), 'None']),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      coreEffects.registerLingeringEffect(state, side, card, { type: 'cannot-score', duration: 'end-of-turn', value: true });
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Distract the Masses
export const distractTheMasses: CardDef = {
  title: 'Distract the Masses',
  onPlay: {
    rfgInsteadOfTrashing: true,
    msg: 'give The Runner 2 [Credits]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, 'runner', 2); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(state, side, trashFromHQ, card, null);
      }; }),
  },
};

const trashFromHQ: any = {
  async: true,
  prompt: 'Choose up to 2 cards in HQ to trash',
  choices: { max: 2, card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
  msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.quantify(targets.length, 'card'), ' from HQ'),
  effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trashCards(state, side, targets, { causeCard: card }); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid); }),
};

// Distributed Tracing
export const distributedTracing: CardDef = {
  title: 'Distributed Tracing',
  onPlay: (() => {
    const abi = coreDefHelpers.giveTags(1);
    return { ...abi, req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.stoleAgenda) };
  })(),
};

// Diversified Portfolio
export const diversifiedPortfolio: CardDef = {
  title: 'Diversified Portfolio',
  onPlay: {
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const remotes = coreServers.getRemoteNames(state).filter((name: string) => (state as any).corp?.servers?.[name]?.content?.length > 0);
      return `${remotes.length} [Credits]`;
    }),
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreServers.getRemoteNames(state).filter((name: string) => (state as any).corp?.servers?.[name]?.content?.length > 0).length > 0),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const remotes = coreServers.getRemoteNames(state).filter((name: string) => (state as any).corp?.servers?.[name]?.content?.length > 0);
      return coreGaining.gainCredits(eid, remotes.length);
    }),
  },
};

// Divert Power
export const divertPower: CardDef = {
  title: 'Divert Power',
  onPlay: {
    prompt: 'Choose any number of cards to derez',
    choices: {
      card: (c: Card) => coreCard.installed(c) && coreCard.rezzed(c),
      max: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allInstalled(state, 'corp').filter(coreCard.rezzed).length),
    },
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allInstalled(state, 'corp').length > 0),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRezzing.derez(state, side, targets); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const discount = targets.length * 3;
        return continue_ability(
          state,
          side,
          {
            async: true,
            prompt: `Choose a card to rez, paying ${discount} [Credits] less`,
            choices: {
              req: req((st: State) => coreCard.installed(targets[0]) && coreCard.corp(targets[0]) && !coreCard.rezzed(targets[0]) && !coreCard.agenda(targets[0])),
            },
            effect: effect(coreRezzing.rez(state, side, eid, targets[0], { costBonus: -discount })),
          },
          card,
          null
        );
      }; }),
  },
};

// Door to Door
export const doorToDoor: CardDef = {
  title: 'Door to Door',
  events: [{
    event: 'runner-turn-begins',
    automatic: 'corp-damage',
    trace: {
      base: 1,
      label: 'Do 1 meat damage if Runner is tagged, or give the Runner 1 tag',
      successful: {
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (utils.isTagged(state) ? 'do 1 meat damage' : 'give the Runner 1 tag')),
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { utils.isTagged(state) ? coreDamage.damage(state, side, eid, 'meat', 1, { card }) : coreTags.gainTags(state, 'corp', eid, 1); }),
      },
    },
  }],
};

// Eavesdrop
export const eavesdrop: CardDef = {
  title: 'Eavesdrop',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
    msg: msg('give ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, targets[0], { visible: false }), ' additional text'),
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allInstalled(state, 'corp').some(coreCard.ice)),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.installAsConditionCounter(eid, card, targets[0]); }),
  },
  events: [{
    event: 'encounter-ice',
    condition: 'hosted',
    trace: {
      base: 3,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.sameCard(targets[0]?.currentIce, card)),
      successful: coreDefHelpers.giveTags(1),
    },
  }],
};

// Economic Warfare
export const economicWarfare: CardDef = {
  title: 'Economic Warfare',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.successfulRun),
    async: true,
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.credit >= 4),
    },
    msg: 'make the runner lose 4 [Credits]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose('runner', eid, 4); }),
  },
};

// Election Day
export const electionDay: CardDef = {
  title: 'Election Day',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.hand?.filter((c: Card) => !utils.sameCard(c, card)).length > 0),
    msg: 'trash all cards in HQ and draw 5 cards',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trashCards(state, side, (state as any).corp.hand, { causeCard: card }); coreDrawing.draw(state, side, eid, 5); }),
  },
};

// End of the Line
export const endOfTheLine: CardDef = {
  title: 'End of the Line',
  playSound: 'end-of-the-line',
  onPlay: {
    additionalCost: [corePayment.toC('tag', 1)],
    msg: 'do 4 meat damage',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, 'meat', 4, { card }); }),
  },
};

// Enforced Curfew
export const enforcedCurfew: CardDef = {
  title: 'Enforced Curfew',
  onPlay: { msg: 'reduce the Runner\'s maximum hand size by 1' },
  staticAbilities: [coreHandSize.runnerHandSizePlus(-1)],
};

// Enforcing Loyalty
export const enforcingLoyalty: CardDef = {
  title: 'Enforcing Loyalty',
  onPlay: {
    trace: {
      base: 3,
      label: 'Trash a card not matching the faction of the Runner\'s identity',
      successful: {
        async: true,
        prompt: 'Choose an installed card not matching the faction of the Runner\'s identity',
        choices: {
          req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
            const t = targets[0];
            const runnerFaction = (state as any).runner?.identity?.faction;
            return coreCard.installed(t) && coreCard.runner(t) && (t.faction !== runnerFaction || runnerFaction === 'Neutral');
          }),
        },
        msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]?.title),
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(eid, targets[0], { causeCard: card }); }),
      },
    },
  },
};

// Enhanced Login Protocol
export const enhancedLoginProtocol: CardDef = {
  title: 'Enhanced Login Protocol',
  onPlay: { msg: 'add an additional cost of [Click] to make the first run not through a card ability each turn' },
  staticAbilities: [{
    type: 'run-additional-cost',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.noEvent(state, side, 'run', (t: any) => !t[0]?.costArgs?.clickRun) && targets[1]?.clickRun),
    value: [corePayment.toC('click', 1)],
  }],
};

// Exchange of Information
export const exchangeOfInformation: CardDef = {
  title: 'Exchange of Information',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.scored?.length > 0 && (state as any).corp?.scored?.length > 0),
    },
    prompt: 'Choose an agenda in the Runner\'s score area to swap',
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreFlags.inRunnerScored(state, side, targets[0])) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(
      (() => {
        const stolen = targets[0];
        return {
          prompt: `Choose a scored agenda to swap for ${stolen.title}`,
          choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreFlags.inCorpScored(state, side, targets[0])) },
          msg: msg('swap ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]?.title, ' for ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => stolen.title),
          effect: effect(coreMoving.swapAgendas(targets[0], stolen)),
        };
      })(),
      card,
      null
    ); }),
  },
};

// Extract
export const extract: CardDef = {
  title: 'Extract',
  onPlay: {
    async: true,
    msg: 'gain 6 [Credit]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, side, 6); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(
          state,
          side,
          {
            prompt: 'Choose an installed card to trash',
            req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allInstalled(state, 'corp').length > 0),
            choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
            async: true,
            waitingPrompt: true,
            msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, targets[0]), ' and gain 3 [Credits]'),
            effect: effect(
              coreMoving.trash(state, side, eid, targets[0], { causeCard: card }),
              coreGaining.gainCredits(state, side, eid, 3)
            ),
          },
          card,
          null
        );
      }; }),
  },
};

// Fast Break - simplified
export const fastBreak: CardDef = {
  title: 'Fast Break',
  xFn: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.scored?.length || 0),
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.scored?.length > 0),
    },
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `gain ${((state as any).runner?.scored?.length || 0)} [Credits]`),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, 'corp', (state as any).runner?.scored?.length || 0); }),
  },
};

// Fast Track
export const fastTrack: CardDef = {
  title: 'Fast Track',
  onPlay: {
    prompt: 'Choose an Agenda',
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.deck?.length > 0),
    },
    choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => corePrompts.cancellable(((state as any).corp.deck || []).filter((c: Card) => coreCard.agenda(c)), { sorted: true })),
    async: true,
    msg: msg('reveal ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]?.title, ' from R&D and add it to HQ'),
    cancel: coreShuffling.shuffleMyDeck,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRevealing.reveal(state, side, targets[0]); coreShuffling.shuffle(state, side, 'deck'); coreMoving.move(state, side, targets[0], 'hand'); coreEid.effectCompleted(state, side, eid); }),
  },
};

// Financial Collapse
export const financialCollapse: CardDef = {
  title: 'Financial Collapse',
  onPlay: {
    optional: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.credit >= 6),
      onChangeGameState: {
        req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length > 0),
      },
      player: 'runner',
      waitingPrompt: true,
      prompt: 'Trash a resource?',
      yesAbility: { displaySide: 'runner', cost: [corePayment.toC('resource', 1)], msg: ':cost' },
      noAbility: {
        player: 'corp',
        async: true,
        msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `make the Runner lose ${coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length} [Credits]`),
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose('runner', eid, coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length); }),
      },
    },
  },
};


// Flood the Market
export const floodTheMarket: CardDef = {
  title: 'Flood the Market',
  onPlay: {
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const full = coreServers.getRemoteNames(state).filter((n: string) => {
          const s = (state as any).corp?.servers?.[n];
          return s?.content?.length > 0 && s?.ices?.length > 0;
        });
        return full.length > 0;
      }),
    },
    async: true,
    prompt: msg('Choose a card and place ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const full = coreServers.getRemoteNames(state).filter((n: string) => {
        const s = (state as any).corp?.servers?.[n];
        return s?.content?.length > 0 && s?.ices?.length > 0;
      });
      return utils.quantify(full.length, 'advancement counter');
    }, ' on it'),
    choices: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.installed(targets[0]) && coreCard.canBeAdvanced(state, targets[0])),
    },
    cancel: { msg: 'do nothing' },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const full = coreServers.getRemoteNames(state).filter((n: string) => {
        const s = (state as any).corp?.servers?.[n];
        return s?.content?.length > 0 && s?.ices?.length > 0;
      });
      return coreProps.addProp(state, state, eid, targets[0], 'advance-counter', full.length, { placed: true });
    }),
  },
};

// Focus Group - simplified
export const focusGroup: CardDef = {
  title: 'Focus Group',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.successfulRun),
    prompt: 'Choose one',
    choices: ['Event', 'Hardware', 'Program', 'Resource'],
    async: true,
    msg: msg('choose ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEid.effectCompleted(state, side, eid); }),
  },
};

// Foxfire
export const foxxfire: CardDef = {
  title: 'Foxfire',
  onPlay: {
    trace: {
      base: 7,
      successful: trashType('virtual resource or link', (c: Card) => (coreCard.resource(c) && coreCard.hasSubtype(c, 'Virtual')) || coreCard.hasSubtype(c, 'Link'), true),
    },
  },
};

// Freelancer
export const freelancer: CardDef = {
  title: 'Freelancer',
  onPlay: trashType('resource', coreCard.resource, true, 2, null, { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.isTagged(state)) }),
};

// Friends in High Places
export const friendsInHighPlaces: CardDef = {
  title: 'Friends in High Places',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.discard?.length > 0),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      return continue_ability(state, side, fhelper(1), card, null);
    }),
  },
};

function fhelper(n: number): any {
  return {
    prompt: 'Choose a card in Archives to install',
    async: true,
    showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && !coreCard.operation(c) && coreCard.inDiscard(c) },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.corpInstall(state, side, eid, targets[0], null, { msgKeys: { installSource: card, displayOrigin: true } }); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        if (n < 2) return continue_ability(state, side, fhelper(n + 1), card, null);
        return coreEid.effectCompleted(state, side, eid);
      }; }),
  };
}

// Fully Operational - simplified
export const fullyOperational: CardDef = {
  title: 'Fully Operational',
  onPlay: {
    msg: msg((state: State, side: Side, eid: EID, card: Card, targets: any[]) => `make ${((fullServersCount(state) || 0) + 1)} gain/draw decisions`),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

function fullServersCount(state: State): number {
  const remotes = coreServers.getRemoteNames(state);
  return remotes.filter((name: string) => {
    const server = (state as any).corp?.servers?.[name];
    return server?.content?.length > 0 && server?.ices?.length > 0;
  }).length;
}

// Game Changer
export const gameChanger: CardDef = {
  title: 'Game Changer',
  onPlay: {
    rfgInsteadOfTrashing: true,
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.scored?.length > 0),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainClicks((state as any).runner?.scored?.length || 0); }),
  },
};

// Game Over - simplified
export const gameOver: CardDef = {
  title: 'Game Over',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.stoleAgenda),
    prompt: 'Choose one',
    choices: ['Hardware', 'Program', 'Resource'],
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Genotyping
export const genotyping: CardDef = {
  title: 'Genotyping',
  onPlay: {
    msg: 'trash the top 2 cards of R&D',
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.mill(state, 'corp', 'corp', 2); coreShuffling.shuffleIntoRdEffect(state, side, eid, card, 4); }),
  },
};

// Government Subsidy
export const governmentSubsidy: CardDef = {
  title: 'Government Subsidy',
  onPlay: coreDefHelpers.gainCreditsAbility(15),
};

// Greasing the Palm - simplified
export const greasingThePalm: CardDef = {
  title: 'Greasing the Palm',
  onPlay: {
    msg: 'gain 5 [Credits]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, side, 5); coreEid.effectCompleted(state, side, eid); }),
  },
};

// Green Level Clearance
export const greenLevelClearance: CardDef = {
  title: 'Green Level Clearance',
  onPlay: clearance(3, 1),
};

// Hangeki - simplified
export const hangeki: CardDef = {
  title: 'Hangeki',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.trashedCard),
    prompt: 'Choose an installed Corp card',
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreBoard.allInstalled(state, 'corp').length > 0),
    },
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) },
    async: true,
    msg: msg('choose ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, targets[0])),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Hansei Review
export const hanseiReview: CardDef = {
  title: 'Hansei Review',
  onPlay: {
    async: true,
    msg: 'gain 10 [Credits]',
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, 'corp', 10); coreEid.effectCompleted(state, side, eid); }),
  },
};

// Hard-Hitting News
export const hardHittingNews: CardDef = {
  title: 'Hard-Hitting News',
  onPlay: {
    trace: {
      base: 4,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.madeRun),
      label: 'Give the Runner 4 tags',
      successful: coreDefHelpers.giveTags(4),
    },
  },
};

// Hasty Relocation - simplified
export const hastyRelocation: CardDef = {
  title: 'Hasty Relocation',
  onPlay: {
    additionalCost: [corePayment.toC('trash-from-deck', 1)],
    msg: 'trash the top card of R&D, draw 3 cards, and add 3 cards in HQ to the top of R&D',
    waitingPrompt: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDrawing.draw(state, side, 3); coreEid.effectCompleted(state, side, eid); }),
  },
};

// Hatchet Job
export const hatchetJob: CardDef = {
  title: 'Hatchet Job',
  onPlay: {
    trace: {
      base: 5,
      successful: {
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) && !coreCard.hasSubtype(c, 'Virtual') },
        msg: 'add 1 installed non-virtual card to the grip',
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move('runner', targets[0], 'hand', true); }),
      },
    },
  },
};

// Hedge Fund
export const hedgeFund: CardDef = {
  title: 'Hedge Fund',
  onPlay: coreDefHelpers.gainCreditsAbility(9),
};

// Hellion Alpha Test
export const hellionAlphaTest: CardDef = {
  title: 'Hellion Alpha Test',
  onPlay: {
    trace: {
      base: 2,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.installedResource),
      successful: {
        msg: 'add a Resource to the top of the Stack',
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move('runner', targets[0], 'deck', { front: true }); coreSay.systemMsg(`adds ${targets[0]?.title} to the top of the Stack`); }),
      },
      unsuccessful: {
        msg: 'take 1 bad publicity',
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity('corp', 1); }),
      },
    },
  },
};

// Hellion Beta Test
export const hellionBetaTest: CardDef = {
  title: 'Hellion Beta Test',
  onPlay: {
    trace: {
      base: 2,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.trashedAccessedCard),
      label: 'Trash 2 installed non-program cards or take 1 bad publicity',
      successful: trashType('non-program', (c: Card) => coreCard.facedown(c) || !coreCard.program(c), true, 2, true),
      unsuccessful: {
        msg: 'take 1 bad publicity',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity('corp', eid, 1); }),
      },
    },
  },
};

// Heritage Committee
export const heritageCommittee: CardDef = {
  title: 'Heritage Committee',
  onPlay: {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDrawing.draw(state, side, 3); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(
          state,
          side,
          (state as any).corp?.hand?.length > 0
            ? {
                prompt: 'Choose a card in HQ to add to the top of R&D',
                choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
                msg: 'draw 3 cards and add 1 card from HQ to the top of R&D',
                effect: effect(coreMoving.move(targets[0], 'deck', { front: true })),
              }
            : null,
          card,
          null
        );
      }; }),
  },
};

// High-Profile Target
export const highProfileTarget: CardDef = {
  title: 'High-Profile Target',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.isTagged(state)),
    msg: msg('do ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.countTags(state) * 2, ' meat damage'),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(eid, 'meat', utils.countTags(state) * 2, { card }); }),
  },
};

// Housekeeping
export const housekeeping: CardDef = {
  title: 'Housekeeping',
  events: [{
    event: 'runner-install',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.firstEvent(state, side, 'runner-install')),
    player: 'runner',
    prompt: 'Choose a card to trash',
    choices: { card: (c: Card) => coreCard.runner(c) && coreCard.inHandStar(state, c) },
    async: true,
    msg: msg('force the Runner to trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]?.title, ' from the grip'),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash('runner', eid, targets[0], { unpreventable: true, causeCard: card, cause: 'forced-to-trash' }); }),
  }],
};

// Hunter Seeker
export const hunterSeeker: CardDef = {
  title: 'Hunter Seeker',
  onPlay: trashType('card', coreCard.installed, true, 1, null, {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).runner?.register?.lastTurn?.stoleAgenda),
  }),
};

// Hyoubu Precog Manifold
export const hyoubuPrecogManifold: CardDef = lockdown({
  onPlay: {
    prompt: 'Choose a server',
    choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreServers.zonesToSortedNames(coreBoard.getZones(state))),
    msg: msg('choose ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0]),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreUpdate.update({ ...card, cardTarget: targets[0] }); }),
  },
  events: [{
    event: 'successful-run',
    psi: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreServers.zoneToName((state as any).run?.server) === card.cardTarget),
      notEqual: {
        msg: 'end the run',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.endRun(eid, card); }),
      },
    },
  }],
});

// Hypoxia
export const hypoxia: CardDef = {
  title: 'Hypoxia',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.isTagged(state)),
    msg: 'do 1 core damage and give the Runner -1 allotted [Click] for [runner-pronoun] next turn',
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreDamage.damage(state, 'runner', 'brain', 1, { card }); coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) - 1); coreEid.effectCompleted(state, side, eid); }),
  },
};

// Interns
export const interns: CardDef = {
  title: 'Interns',
  onPlay: {
    prompt: 'Choose a card to install from Archives or HQ',
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.hand?.length > 0 || (state as any).corp?.discard?.some((c: Card) => !coreCard.operation(c) || !c.seen)),
    },
    showDiscard: true,
    notDistinct: true,
    choices: { card: (c: Card) => !coreCard.operation(c) && coreCard.corp(c) && (coreCard.inHandStar(state, c) || coreCard.inDiscard(c)) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreInstalling.corpInstall(eid, targets[0], null, { ignoreInstallCost: true, msgKeys: { installSource: card, displayOrigin: true } }); }),
  },
};

// Invasion of Privacy - simplified
export const invasionOfPrivacy: CardDef = {
  title: 'Invasion of Privacy',
  onPlay: {
    trace: {
      base: 2,
      successful: {
        prompt: 'Trash up to X resources and/or events from the grip',
        choices: { max: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets[0] - targets[1] || 1) },
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trashCards(state, side, eid, targets, { causeCard: card }); }),
      },
      unsuccessful: {
        msg: 'take 1 bad publicity',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreBadPublicity.gainBadPublicity('corp', eid, 1); }),
      },
    },
  },
};

// IPO
export const ipo: CardDef = {
  title: 'IPO',
  onPlay: coreDefHelpers.gainCreditsAbility(13),
};

// Kakurenbo - simplified
export const kakurenbo: CardDef = {
  title: 'Kakurenbo',
  onPlay: {
    prompt: 'Choose any number of cards in HQ to trash',
    rfgInsteadOfTrashing: true,
    choices: { max: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => (state as any).corp?.hand?.length || 0), card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card }); (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Turn Archives face-down
        const corp = (state as any).corp;
        for (const c of corp.discard || []) {
          coreUpdate.update(c, { seen: false });
        }
        coreShuffling.shuffle(state, 'corp', 'discard');
        return coreEid.effectCompleted(state, side, eid);
      }; }),
  },
};
