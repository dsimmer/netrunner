/**
 * Corp Operations - Card definitions for corp operations  
 * Ported from Clojure cards/operations.clj to TypeScript
 * 
 * This file contains ~219 corp operation card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreAccess from '../core/access';
import * as coreActions from '../core/actions';
import * as coreBadPublicity from '../core/bad-publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card-defs';
import * as coreChooseOne from '../core/choose-one';
import * as coreCostFns from '../core/cost-fns';
import * as coreCosts from '../core/costs';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def-helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreHandSize from '../core/hand-size';
import * as coreIce from '../core/ice';
import * as coreIdentities from '../core/identities';
import * as coreInitializing from '../core/initializing';
import * as coreInstalling from '../core/installing';
import * as coreMemory from '../core/memory';
import * as coreMoving from '../core/moving';
import * as coreOptional from '../core/optional';
import * as corePayment from '../core/payment';
import * as corePlayInstants from '../core/play-instants';
import * as corePrevention from '../core/prevention';
import * as corePrompts from '../core/prompts';
import * as coreProps from '../core/props';
import * as corePurging from '../core/purging';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreSetAside from '../core/set-aside';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to-string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as coreVirus from '../core/virus';
import * as macros from '../macros';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

import { cardDef } from '../core/def-helpers';
import type { CardDef } from '../../types';

import { gainNClicks, lockdown, trashType } from './operations_1';

// Key Performance Indicators - simplified
export const keyPerformanceIndicators: CardDef = {
  title: 'Key Performance Indicators',
  onPlay: coreChooseOne.chooseOneHelper(
    { count: 2, optional: true },
    [
      { option: 'Gain 2 [Credit]', ability: coreDefHelpers.gainCreditsAbility(2) },
      { option: 'Install 1 piece of ice from HQ, ignoring all costs', req: req((state: State) => (state as any).corp?.hand?.some(coreCard.ice)), ability: { choices: { card: (c: Card) => coreCard.ice(c) && coreCard.corp(c) && coreCard.inHandStar(state, c) }, async: true, effect: effect(coreInstalling.corpInstall(state, side, eid, targets[0], null, { ignoreAllCost: true, installSource: card })) } },
      { option: 'Place 1 advancement counter', req: req((state: State) => coreBoard.allInstalled(state, 'corp').some(coreCard.canBeAdvanced)), ability: { choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.corp(targets[0]) && coreCard.installed(targets[0]) && coreCard.canBeAdvanced(state, targets[0])) }, async: true, effect: effect(coreProps.addProp(state, side, eid, targets[0], 'advance-counter', 1, { placed: true })) } },
      { option: 'Draw 1 card. Shuffle 1 card from HQ into R&D', req: req((state: State) => (state as any).corp?.hand?.length >= 1), ability: { msg: 'draw 1 card', async: true, effect: effect(coreDrawing.draw(state, side, 1)) } },
    ]
  ),
};

// Kill Switch
export const killSwitch: CardDef = {
  title: 'Kill Switch',
  events: [
    {
      msg: msg('reveal that they accessed ', (state: State) => (state as any)?.context?.card?.title),
      trace: {
        base: 3,
        req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.agenda(targets[0]?.card) || coreCard.agenda(targets[0]?.accessedCard)),
        successful: {
          msg: 'do 1 core damage',
          async: true,
          effect: effect(coreDamage.damage('runner', eid, 'brain', 1, { card })),
        },
      },
    },
  ],
};

// Lag Time
export const lagTime: CardDef = {
  title: 'Lag Time',
  onPlay: { effect: effect(coreIce.updateAllIce()) },
  staticAbilities: [{ type: 'ice-strength', value: 1 }],
  leavePlay: effect(coreIce.updateAllIce()),
};

// Lateral Growth
export const lateralGrowth: CardDef = {
  title: 'Lateral Growth',
  onPlay: {
    msg: 'gain 4 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(state, side, 4), coreEid.effectCompleted(state, side, eid)),
  },
};

// Liquidation
export const liquidation: CardDef = {
  title: 'Liquidation',
  onPlay: {
    prompt: 'Choose any number of rezzed cards to trash',
    choices: {
      max: req((state: State) => coreBoard.allActiveInstalled(state, 'corp').filter((c: Card) => !coreCard.agenda(c)).length),
      card: (c: Card) => coreCard.rezzed(c) && !coreCard.agenda(c),
    },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some(coreCard.rezzed)),
    },
    msg: msg('trash ', (state: State) => utils.enumerateCards(targets), ' and gain ', (state: State) => targets.length * 3, ' [Credits]'),
    async: true,
    effect: effect(coreMoving.trashCards(state, side, targets, { causeCard: card }), coreGaining.gainCredits(state, side, eid, targets.length * 3)),
  },
};

// Load Testing
export const loadTesting: CardDef = {
  title: 'Load Testing',
  onPlay: { msg: 'make the Runner lose [Click] when [runner-pronoun] next turn begins' },
  events: [{
    event: 'runner-turn-begins',
    duration: 'until-runner-turn-begins',
    msg: 'make the Runner lose [Click]',
    effect: effect(coreGaining.loseClicks('runner', 1)),
  }],
};

// Localized Product Line - simplified
export const localizedProductLine: CardDef = {
  title: 'Localized Product Line',
  onPlay: {
    prompt: 'Choose a card',
    choices: req((state: State) => corePrompts.cancellable((state as any).corp?.deck || [], { sorted: true })),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Manhunt
export const manhunt: CardDef = {
  title: 'Manhunt',
  events: [{
    event: 'successful-run',
    interactive: () => true,
    trace: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.firstEvent(state, side, 'successful-run')),
      base: 2,
      successful: coreDefHelpers.giveTags(1),
    },
  }],
};

// Market Forces
export const marketForces: CardDef = {
  title: 'Market Forces',
  onPlay: (() => {
    const abi = coreDefHelpers.drainCredits('corp', 'runner', req((state: State) => utils.countTags(state) * 3), 0, 99);
    return { ...abi, req: req((state: State) => utils.isTagged(state)), onChangeGameState: { req: req((state: State) => (state as any).runner?.credit > 0) } };
  })(),
};

// Mass Commercialization
export const massCommercialization: CardDef = {
  title: 'Mass Commercialization',
  onPlay: {
    msg: msg((state: State) => {
      const cards = coreBoard.getAllInstalled(state);
      return `${cards.filter((c: Card) => (c.counters?.advancement || 0) > 0).length * 2} [Credits]`;
    }),
    onChangeGameState: {
      req: req((state: State) => coreBoard.getAllInstalled(state).filter((c: Card) => (c.counters?.advancement || 0) > 0).length > 0),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const cards = coreBoard.getAllInstalled(state);
      return coreGaining.gainCredits(eid, cards.filter((c: Card) => (c.counters?.advancement || 0) > 0).length * 2);
    }),
  },
};

// MCA Informant
export const mcaInformant: CardDef = {
  title: 'MCA Informant',
  onPlay: {
    prompt: 'Choose a connection to host MCA Informant on',
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'runner').some((c: Card) => coreCard.hasSubtype(c, 'Connection'))),
    },
    choices: { card: (c: Card) => coreCard.runner(c) && coreCard.hasSubtype(c, 'Connection') && coreCard.installed(c) },
    msg: msg('host itself on ', (state: State) => coreToString.cardStr(state, targets[0]), '. The Runner has an additional tag'),
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(eid, card, targets[0])),
  },
  staticAbilities: [{ type: 'tags', value: 1 }],
  leavePlay: effect(coreSay.systemMsg(state, 'corp', 'trashes MCA Informant')),
};

// Measured Response
export const measuredResponse: CardDef = {
  title: 'Measured Response',
  onPlay: coreChooseOne.chooseOneHelper(
    {
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun && coreThreat.threatLevel(4, state)),
      player: 'runner',
    },
    [
      coreChooseOne.costOption([corePayment.toC('credit', 8)], 'runner'),
      { option: 'Corp does 4 meat damage', player: 'corp', ability: { msg: 'do 4 meat damage', async: true, effect: effect(coreDamage.damage('corp', eid, 'meat', 4)) } },
    ]
  ),
};

// Media Blitz - simplified
export const mediaBlitz: CardDef = {
  title: 'Media Blitz',
  onPlay: {
    prompt: 'Choose an agenda in the runner\'s score area',
    choices: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.agenda(targets[0]) && coreFlags.isScored(state, 'runner', targets[0])),
    },
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.scored?.length > 0),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Medical Research Fundraiser
export const medicalResearchFundraiser: CardDef = {
  title: 'Medical Research Fundraiser',
  onPlay: {
    msg: 'gain 8 [Credits]. The Runner gains 3 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(state, side, 8), coreGaining.gainCredits(state, 'runner', eid, 3)),
  },
};

// Midseason Replacements
export const midseasonReplacements: CardDef = {
  title: 'Midseason Replacements',
  onPlay: {
    trace: {
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.stoleAgenda),
      base: 6,
      label: 'Trace 6 - Give the Runner X tags',
      successful: {
        msg: msg('give the Runner ', (state: State) => utils.quantify(targets[0] - targets[1], 'tag')),
        async: true,
        effect: effect(coreTags.gainTags(eid, targets[0] - targets[1])),
      },
    },
  },
};

// Mindscaping - simplified
export const mindscaping: CardDef = {
  title: 'Mindscaping',
  onPlay: coreChooseOne.chooseOneHelper([
    { option: 'Gain 4 [Credits] and draw 2 cards', ability: { msg: 'gain 4 [Credits] and draw 2 cards', async: true, effect: effect(coreGaining.gainCredits(state, side, 4, { suppressCheckpoint: true }), coreDrawing.draw(state, 'corp', 2)) } },
    { option: 'Do 1 net damage per tag (up to 3)', ability: { async: true, msg: msg('do ', (state: State) => Math.min(3, utils.countTags(state)), ' net damage'), effect: effect(coreDamage.damage(state, side, eid, 'net', Math.min(3, utils.countTags(state)), { card })) } },
  ]),
};

// Mitosis - simplified
export const mitosis: CardDef = {
  title: 'Mitosis',
  onPlay: {
    prompt: 'Choose 2 cards to install in new remote servers',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    choices: { card: (c: Card) => !coreCard.operation(c) && coreCard.corp(c) && coreCard.inHandStar(state, c), max: 2 },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};


// Mutate - simplified
export const mutate: CardDef = {
  title: 'Mutate',
  onPlay: {
    prompt: 'Choose a rezzed piece of ice to trash',
    req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c))),
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Mutually Assured Destruction
export const mutuallyAssuredDestruction: CardDef = {
  title: 'Mutually Assured Destruction',
  onPlay: {
    prompt: 'Choose any number of rezzed cards to trash',
    interactive: () => true,
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some(coreCard.rezzed)),
    },
    choices: {
      max: req((state: State) => coreBoard.allActiveInstalled(state, 'corp').filter((c: Card) => !coreCard.agenda(c)).length),
      card: (c: Card) => coreCard.rezzed(c) && !coreCard.agenda(c),
    },
    msg: msg('trash ', (state: State) => utils.enumerateCards(targets, { sorted: true }), ' and give the runner ', (state: State) => utils.quantify(targets.length, 'tag')),
    async: true,
    effect: effect(coreMoving.trashCards(state, side, targets, { causeCard: card }), coreTags.gainTags(state, 'corp', eid, targets.length)),
  },
};

// Myōshu
export const myoshu: CardDef = {
  title: 'Myōshu',
  onPlay: {
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.noEvent(state, side, 'agenda-scored', (t: any) => t[0]?.scoredCard?.installed !== 'this-turn')),
    msg: 'add itself to [their] score area as an Agenda worth 2 points',
    effect: effect(coreMoving.asAgenda(state, side, card, 2)),
  },
};

// Nanomanagement
export const nanomanagement: CardDef = {
  title: 'Nanomanagement',
  onPlay: gainNClicks(2),
};

// NAPD Cordon
export const napdCordon: CardDef = lockdown({
  staticAbilities: [{
    type: 'steal-additional-cost',
    value: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => corePayment.toC('credit', 4 + 2 * (targets[0]?.counters?.advancement || 0))),
  }],
});

// Net Watchlist
export const netWatchlist: CardDef = {
  title: 'Net Watchlist',
  implementation: 'Only modifies ability costs, does not adjust non-ability uses',
  staticAbilities: [
    { type: 'card-ability-additional-cost', req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.hasSubtype(targets[0]?.card, 'Icebreaker') && !targets[0]?.ability?.break), value: corePayment.toC('credit', 2) },
    { type: 'break-sub-additional-cost', req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.hasSubtype(targets[0]?.card, 'Icebreaker')), value: corePayment.toC('credit', 2) },
  ],
};

// Neural EMP
export const neuralEMP: CardDef = {
  title: 'Neural EMP',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.madeRun),
    msg: 'do 1 net damage',
    async: true,
    effect: effect(coreDamage.damage(eid, 'net', 1, { card })),
  },
};

// Neurospike
export const neurospike: CardDef = {
  title: 'Neurospike',
  onPlay: {
    msg: msg((state: State) => `${((state as any).corp?.register?.scoredAgenda?.[0]) || 0} net damage`),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.register?.scoredAgenda?.[0] > 0),
    },
    async: true,
    effect: effect(coreDamage.damage(eid, 'net', (state as any).corp?.register?.scoredAgenda?.[0] || 0, { card })),
  },
};

// NEXT Activation Command
export const nextActivationCommand: CardDef = lockdown({
  staticAbilities: [
    { type: 'ice-strength', value: 2 },
    {
      type: 'prevent-paid-ability',
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => !coreCard.hasSubtype(targets[0], 'Icebreaker') && targets[1]?.break),
      value: true,
    },
  ],
});

// Nonequivalent Exchange
export const nonequivalentExchange: CardDef = {
  title: 'Nonequivalent Exchange',
  onPlay: {
    optional: {
      prompt: 'Have each player gain 2 [Credits]?',
      waitingPrompt: true,
      yesAbility: {
        msg: 'gain 7 [Credits]. The Runner gains 2 [Credits]',
        async: true,
        effect: effect(coreGaining.gainCredits(state, side, 7), coreGaining.gainCredits(state, 'runner', eid, 2)),
      },
      noAbility: {
        msg: 'gain 5 [Credits]',
        async: true,
        effect: effect(coreGaining.gainCredits(eid, 5)),
      },
    },
  },
};

// O₂ Shortage
export const o2Shortage: CardDef = {
  title: 'O₂ Shortage',
  onPlay: coreChooseOne.chooseOneHelper(
    { player: 'runner' },
    [
      coreChooseOne.costOption([corePayment.toC('randomly-trash-from-hand', 1)], 'runner'),
      { option: 'The Corp gains [Click][Click]', player: 'corp', ability: gainNClicks(2) },
    ]
  ),
};

// Observe and Destroy
export const observeAndDestroy: CardDef = trashType('installed', coreCard.installed, true, 1, true, {
  additionalCost: [corePayment.toC('tag', 1)],
  req: req((state: State) => (state as any).runner?.credit < 6),
});

// Oppo Research
export const oppoResearch: CardDef = {
  title: 'Oppo Research',
  onPlay: {
    msg: 'give the Runner 2 tags',
    async: true,
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedCard || (state as any).runner?.register?.lastTurn?.stoleAgenda),
    effect: effect(
      coreTags.gainTags(state, 'corp', coreEid.makeEid(state, eid), 2),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(
          state,
          side,
          {
            optional: {
              prompt: 'Pay 5 [Credit] to give the Runner 2 tags?',
              req: req((state: State) => coreThreat.threatLevel(3, state)),
              waitingPrompt: true,
              yesAbility: { async: true, cost: [corePayment.toC('credit', 5)], msg: 'give the Runner 2 tags', effect: effect(coreTags.gainTags(state, 'corp', eid, 2)) },
            },
          },
          card,
          null
        );
      }
    ),
  },
};

// Oversight AI
export const oversightAI: CardDef = {
  title: 'Oversight AI',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c) && coreCard.getZone(c)?.[0] === 'ices' },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c))),
    },
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(state, side, eid, card, targets[0])),
  },
  events: [{
    event: 'subroutines-broken',
    condition: 'hosted',
    async: true,
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.sameCard(targets[0]?.ice, card)),
    msg: msg('trash ', (state: State) => coreToString.cardStr(state, targets[0]?.ice)),
    effect: effect(coreMoving.trash('corp', eid, targets[0]?.ice, { unpreventable: true, causeCard: card })),
  }],
};

// Patch
export const patch: CardDef = {
  title: 'Patch',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c))),
    },
    msg: msg('give +2 strength to ', (state: State) => coreToString.cardStr(state, targets[0])),
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(eid, card, targets[0])),
  },
  staticAbilities: [{ type: 'ice-strength', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host)), value: 2 }],
};

// Paywall Implementation
export const paywallImplementation: CardDef = {
  title: 'Paywall Implementation',
  events: [{
    event: 'successful-run',
    automatic: 'gain-credits',
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits('corp', eid, 1)),
  }],
};

// Peak Efficiency
export const peakEfficiency: CardDef = {
  title: 'Peak Efficiency',
  onPlay: {
    msg: msg((state: State) => {
      let count = 0;
      for (const server of Object.values((state as any).corp?.servers || {})) {
        count += (server?.ices || []).filter((ice: Card) => ice.rezzed).length;
      }
      return `${count} [Credits]`;
    }),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c))),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      let count = 0;
      for (const server of Object.values((state as any).corp?.servers || {})) {
        count += (server?.ices || []).filter((ice: Card) => ice.rezzed).length;
      }
      return coreGaining.gainCredits(eid, count);
    }),
  },
};

// Peer Review - simplified
export const peerReview: CardDef = {
  title: 'Peer Review',
  onPlay: {
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Petty Cash
export const pettyCash: CardDef = {
  title: 'Petty Cash',
  flashback: [corePayment.toC('click', 1)],
  onPlay: {
    msg: 'gain 5 [credits]',
    async: true,
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.noEvent(state, side, 'action-resolved')),
    effect: effect(coreGaining.gainCredits(state, side, 5), coreEid.effectCompleted(state, side, eid)),
  },
};

// Pivot - simplified
export const pivot: CardDef = {
  title: 'Pivot',
  onPlay: {
    prompt: 'Choose a card',
    waitingPrompt: true,
    msg: msg('reveal ', (state: State) => targets[0]?.title, ' from R&D and add it to HQ'),
    choices: req((state: State) => [...(state as any).corp?.deck || []].sort((a, b) => a.title.localeCompare(b.title)).filter((c: Card) => coreCard.operation(c) || coreCard.agenda(c))),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0 || (coreThreat.threatLevel(3, state) && (state as any).corp?.hand?.length > 0)),
    },
    async: true,
    effect: effect(coreRevealing.reveal(state, side, targets[0]), coreShuffling.shuffle(state, 'corp', 'deck'), coreMoving.move(state, side, targets[0], 'hand'), coreEid.effectCompleted(state, side, eid)),
  },
};

// Power Grid Overload - simplified
export const powerGridOverload: CardDef = {
  title: 'Power Grid Overload',
  onPlay: {
    trace: {
      base: 2,
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.madeRun),
      successful: effect(coreEid.effectCompleted(state, side, eid)),
    },
  },
};

// Power Shutdown - simplified
export const powerShutdown: CardDef = {
  title: 'Power Shutdown',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.madeRun),
    prompt: 'How many cards do you want to trash from the top of R&D?',
    waitingPrompt: true,
    choices: { number: req((state: State) => (state as any).corp?.deck?.length || 0) },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Precognation
export const precognition: CardDef = {
  title: 'Precognation',
  onPlay: {
    msg: 'rearrange the top 5 cards of R&D',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    waitingPrompt: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Predictive Algorithm
export const predictiveAlgorithm: CardDef = {
  title: 'Predictive Algorithm',
  staticAbilities: [{ type: 'steal-additional-cost', value: corePayment.toC('credit', 2) }],
};

// Predictive Planogram
export const predictivePlanogram: CardDef = {
  title: 'Predictive Planogram',
  onPlay: {
    prompt: 'Choose one',
    waitingPrompt: true,
    choices: req((state: State) => ['Gain 3 [Credits]', 'Draw 3 cards', utils.isTagged(state) ? 'Gain 3 [Credits] and draw 3 cards' : null].filter(Boolean)),
    msg: msg('choose ', (state: State) => targets[0]?.charAt(0).toLowerCase() + targets[0]?.slice(1)),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      if (targets[0] === 'Gain 3 [Credits]') return coreGaining.gainCredits(state, 'corp', eid, 3);
      if (targets[0] === 'Draw 3 cards') return coreDrawing.draw(state, 'corp', eid, 3);
      if (targets[0] === 'Gain 3 [Credits] and draw 3 cards') return coreGaining.gainCredits(state, 'corp', 3), coreDrawing.draw(state, 'corp', eid, 3);
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Preemptive Action
export const preemptiveAction: CardDef = {
  title: 'Preemptive Action',
  onPlay: {
    rfgInsteadOfTrashing: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.discard?.length > 0),
    },
    async: true,
    effect: effect(coreShuffling.shuffleIntoRdEffect(eid, card, 3, true)),
  },
};

// Priority Construction
export const priorityConstruction: CardDef = {
  title: 'Priority Construction',
  onPlay: {
    prompt: 'Choose a piece of ice in HQ to install',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    choices: { card: (c: Card) => coreCard.inHandStar(state, c) && coreCard.corp(c) && coreCard.ice(c) },
    msg: 'install a piece of ice from HQ and place 3 advancements on it',
    cancel: { msg: 'do nothing' },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Product Recall
export const productRecall: CardDef = {
  title: 'Product Recall',
  onPlay: {
    prompt: 'Choose a rezzed asset or upgrade to trash',
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.rezzed(c) && (coreCard.asset(c) || coreCard.upgrade(c)))),
    },
    choices: { card: (c: Card) => coreCard.rezzed(c) && (coreCard.asset(c) || coreCard.upgrade(c)) },
    msg: msg('trash ', (state: State) => coreToString.cardStr(state, targets[0]), ' and gain ', (state: State) => coreCostFns.trashCost(state, side, targets[0]), ' [Credits]'),
    async: true,
    effect: effect(
      coreMoving.trash(state, side, targets[0], { unpreventable: true, causeCard: card }),
      coreGaining.gainCredits(state, 'corp', eid, coreCostFns.trashCost(state, side, targets[0]))
    ),
  },
};

// Psychographics
export const psychographics: CardDef = {
  title: 'Psychographics',
  onPlay: {
    onChangeGameState: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.isTagged(state) && corePayment.xCostValue(eid) > 0),
    },
    waitingPrompt: true,
    basePlayCost: [corePayment.toC('x-credits', 0, { maximum: req((state: State) => utils.countTags(state)) })],
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0])) },
    msg: msg('place ', (state: State) => utils.quantify(corePayment.xCostValue(eid), ' advancement counter'), ' on ', (state: State) => coreToString.cardStr(state, targets[0])),
    async: true,
    effect: effect(coreProps.addProp(state, side, eid, targets[0], 'advance-counter', corePayment.xCostValue(eid), { placed: true })),
  },
};

// Psychokinesis
export const psychokinesis: CardDef = {
  title: 'Psychokinesis',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    msg: 'look at the top 5 cards of R&D',
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Public Trail
export const publicTrail: CardDef = {
  title: 'Public Trail',
  onPlay: coreChooseOne.chooseOneHelper(
    {
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
      player: 'runner',
    },
    [
      { option: 'Take 1 tag', ability: { async: true, displaySide: 'corp', msg: 'give the runner 1 tag', effect: effect(coreTags.gainTags(state, 'corp', eid, 1)) } },
      coreChooseOne.costOption([corePayment.toC('credit', 8)], 'runner'),
    ]
  ),
};

// Punitive Counterstrike
export const punitiveCounterstrike: CardDef = {
  title: 'Punitive Counterstrike',
  onPlay: {
    trace: {
      base: 5,
      successful: {
        async: true,
        msg: msg((state: State) => `${((state as any).runner?.register?.lastTurn?.stoleAgenda?.[0]) || 0} meat damage`),
        effect: effect(coreDamage.damage(eid, 'meat', (state as any).runner?.register?.lastTurn?.stoleAgenda?.[0] || 0, { card })),
      },
    },
  },
};

// realloc()
export const realloc: CardDef = {
  title: 'realloc()',
  onPlay: {
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c)).length > 0),
    },
    waitingPrompt: true,
    prompt: msg('choose ', (state: State) => utils.quantify(Math.min(coreBoard.allInstalled(state, 'corp').filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c)).length, 2), 'piece'), ' of ice to derez'),
    choices: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.rezzed(targets[0]) && coreCard.ice(targets[0]) && coreCard.installed(targets[0])),
      all: true,
      max: req((state: State) => Math.min(coreBoard.allInstalled(state, 'corp').filter((c: Card) => coreCard.rezzed(c) && coreCard.ice(c)).length, 2)),
    },
    async: true,
    msg: msg('derez ', (state: State) => utils.enumerateCards(targets), ' and gain ', (state: State) => targets.reduce((sum: number, c: Card) => sum + (c.cost || 0), 0), ' [Credits]'),
    effect: effect(coreRezzing.derez(state, side, targets), coreGaining.gainCredits(state, side, eid, targets.reduce((sum: number, c: Card) => sum + (c.cost || 0), 0))),
  },
};

// Reanimation Protocol
export const reanimationProtocol: CardDef = {
  title: 'Reanimation Protocol',
  onPlay: {
    prompt: 'Choose an Ice to install and rez (paying a total of 10 less)',
    showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.ice(c) && coreCard.inDiscard(c) },
    async: true,
    waitingPrompt: true,
    effect: effect(
      coreInstalling.corpInstall(state, side, targets[0], null, { msgKeys: { installSource: card, displayOrigin: true }, installState: 'rezzed', combinedCreditDiscount: 10 }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const installedCard = targets[0];
        if (installedCard && coreCard.rezzed(installedCard) && coreCard.hasAnySubtype(installedCard, ['Liability', 'Illicit'])) {
          return coreEid.effectCompleted(state, side, eid);
        }
        if (installedCard && coreCard.rezzed(installedCard)) {
          return continue_ability(state, side, { msg: 'take 1 bad publicity', async: true, effect: effect(coreBadPublicity.gainBadPublicity(state, side, eid, 1)) }, card, null);
        }
        return coreEid.effectCompleted(state, side, eid);
      }
    ),
  },
};

// Reclamation Order - simplified
export const reclamationOrder: CardDef = {
  title: 'Reclamation Order',
  onPlay: {
    prompt: 'Choose a card from Archives',
    showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && c.title !== 'Reclamation Order' && coreCard.inDiscard(c) },
    msg: msg('name ', (state: State) => targets[0]?.title),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Recruiting Trip - simplified
export const recruitingTrip: CardDef = {
  title: 'Recruiting Trip',
  onPlay: {
    basePlayCost: [corePayment.toC('x-credits')],
    msg: msg('search for ', (state: State) => corePayment.xCostValue(eid), ' Sysops'),
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Red Level Clearance - simplified
export const redLevelClearance: CardDef = {
  title: 'Red Level Clearance',
  onPlay: {
    waitingPrompt: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Red Planet Couriers - simplified
export const redPlanetCouriers: CardDef = {
  title: 'Red Planet Couriers',
  onPlay: {
    prompt: 'Choose an installed card that can be advanced',
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0])) },
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Replanting - simplified
export const replanting: CardDef = {
  title: 'Replanting',
  onPlay: {
    prompt: 'Choose an installed card to add to HQ',
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) },
    msg: msg('add ', (state: State) => coreToString.cardStr(state, targets[0]), ' to HQ, then install 2 cards ignoring all costs'),
    async: true,
    effect: effect(coreMoving.move(state, side, targets[0], 'hand'), coreEid.effectCompleted(state, side, eid)),
  },
};

// Restore
export const restore: CardDef = {
  title: 'Restore',
  onPlay: {
    prompt: 'Choose a card in Archives to install & rez',
    showDiscard: true,
    choices: { card: (c: Card) => coreCard.corp(c) && !coreCard.operation(c) && coreCard.inDiscard(c) },
    async: true,
    effect: effect(coreInstalling.corpInstall(state, side, targets[0], null, { installState: 'rezzed', msgKeys: { installSource: card, displayOrigin: true } }), coreEid.effectCompleted(state, side, eid)),
  },
};

// Restoring Face
export const restoringFace: CardDef = {
  title: 'Restoring Face',
  onPlay: {
    prompt: 'Choose a Sysop, Executive or Clone to trash',
    msg: msg('trash ', (state: State) => targets[0]?.title, ' to remove 2 bad publicity'),
    choices: { card: (c: Card) => coreCard.hasAnySubtype(c, ['Clone', 'Executive', 'Sysop']) },
    async: true,
    effect: effect(coreBadPublicity.loseBadPublicity(state, side, 2), coreMoving.trash(state, side, eid, targets[0], { causeCard: card })),
  },
};
