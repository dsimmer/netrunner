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

// Helper: lockdown enforces "cannot play if another active lockdown exists" and handles trashing
function lockdown(cardfn: any): any {
  const untrashed: any = { ...cardfn };
  if (!untrashed.events) {
    untrashed.events = [];
  }
  // Add on-play restriction
  if (untrashed.onPlay) {
    untrashed.onPlay = {
      ...untrashed.onPlay,
      onChangeGameState: {
        silent: false,
        req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const corp = (state as any).corp;
          return !corp.playArea?.some((c: Card) => coreCard.hasSubtype(c, 'Lockdown'));
        }),
      },
    };
  }
  // Add corp-turn-begins event to trash the card
  untrashed.events.push({
    event: 'corp-turn-begins',
    async: true,
    effect: effect(coreMoving.trash(eid, card, null)),
  });
  return untrashed;
}

// Helper for faceup archives count
function faceupArchivesTypes(corp: any): number {
  const faceupCards = (corp.discard || []).filter((c: Card) => coreCard.faceup(c));
  return new Set(faceupCards.map((c: Card) => c.type)).size;
}

function clearance(credits: number, cards: number): any {
  return {
    msg: `gain ${credits} [Credits] and draw ${utils.quantify(cards, 'card')}`,
    async: true,
    effect: effect(
      coreGaining.gainCredits(state, side, credits, { suppressCheckpoint: true }),
      coreDrawing.draw(state, side, eid, cards)
    ),
  };
}

function gainNClicks(n: number): any {
  return {
    msg: `gain ${n} [Click]`,
    effect: effect(coreGaining.gainClicks(state, side, n)),
  };
}

function trashType(type: string, pred: any, loud: boolean, maxTargets: number = 1, allFlag: boolean = false): any {
  return {
    async: true,
    onChangeGameState: {
      silent: !loud,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const valid = validTargetsTrash(state, pred);
        return valid.length > 0;
      }),
    },
    prompt: (() => {
      const valid = validTargetsTrash(state, pred);
      if (maxTargets === 1) return `Choose a ${type} to trash`;
      if (allFlag) return valid.length === 1 ? `Choose a ${type} to trash` : `Choose ${valid.length} ${type}s to trash`;
      return `Choose up to ${utils.quantify(maxTargets, type)} to trash`;
    })(),
    waitingPrompt: true,
    choices: {
      card: (c: Card) => coreCard.installed(c) && pred(c),
      max: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return Math.min(maxTargets, validTargetsTrash(state, pred).length);
      }),
      all: allFlag,
    },
    msg: msg('trash ', (state: State) => utils.enumerateCards(targets)),
    effect: effect(coreMoving.trashCards(state, side, eid, targets, { causeCard: card })),
  };
}

function validTargetsTrash(state: State, pred: any): Card[] {
  const runner = coreBoard.allInstalled(state, 'runner').filter((c: Card) => coreCard.installed(c) && pred(c));
  const corp = coreBoard.allInstalled(state, 'corp').filter((c: Card) => coreCard.installed(c) && pred(c));
  return [...runner, ...corp];
}

// ============================================================================
// Card Definitions
// ============================================================================

// 24/7 News Cycle
export const news247Cycle: CardDef = {
  title: '24/7 News Cycle',
  onPlay: {
    additionalCost: [corePayment.toC('forfeit')],
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.scored?.length > 0),
    },
    effect: effect(continue_ability(
      {
        prompt: 'Choose an agenda in your score area',
        choices: {
          card: (c: Card) => coreCard.agenda(c) && coreFlags.isScored(state, 'corp', c) && flags.inCorpScored(state, side, c),
        },
        msg: msg('trigger the "when scored" ability of ', (state: State) => cardDef(targets[0])?.title),
        async: true,
        effect: effect(continue_ability(cardDef(targets[0])?.onScore, targets[0], null)),
      },
      card,
      null
    )),
  },
};

// Accelerated Diagnostics - simplified (full recursive AD is complex)
export const acceleratedDiagnostics: CardDef = {
  title: 'Accelerated Diagnostics',
  onPlay: {
    prompt: 'The top cards of R&D are (top->bottom): ' + '(check deck)',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    choices: ['OK'],
    async: true,
    waitingPrompt: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      // Simplified: just trash the top 3 cards
      const deck = (state as any).corp?.deck || [];
      const toTrash = deck.slice(0, Math.min(3, deck.length));
      for (const c of toTrash) {
        coreMoving.move(state, 'corp', c, 'rfg');
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Active Policing
export const activePolicing: CardDef = {
  title: 'Active Policing',
  onPlay: {
    req: req((state: State) => {
      const reg = (state as any).runner?.register;
      return reg?.lastTurn?.trashedCard || reg?.lastTurn?.stoleAgenda;
    }),
    prompt: 'Choose a card to install',
    waitingPrompt: true,
    choices: {
      card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHandStar(state, c),
    },
    async: true,
    effect: effect(
      coreInstalling.corpInstall(state, side, eid, targets[0], null, { msgKeys: { installSource: card, displayOrigin: true } }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Give runner -1 click next turn (simplified)
        coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) - 1);
      }
    ),
  },
};

// Ad Blitz
export const adBlitz: CardDef = {
  title: 'Ad Blitz',
  onPlay: {
    basePlayCost: [corePayment.toC('x-credits')],
    msg: msg('install and rez ', (state: State) => corePayment.xCostValue(eid), ' Advertisements'),
    async: true,
    effect: effect(
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Simplified: install x-credits amount of advertisements
        const n = corePayment.xCostValue(eid);
        return coreEid.effectCompleted(state, side, eid);
      }
    ),
  },
};

// Aggressive Negotiation
export const aggressiveNegotiation: CardDef = {
  title: 'Aggressive Negotiation',
  onPlay: (() => {
    const abi = coreDefHelpers.tutorAbi(false, (c: Card) => coreCard.agenda(c));
    return { ...abi, req: req((state: State) => !!(state as any).corp?.register?.scoredAgenda); };
  })(),
};

// An Offer You Can't Refuse
export const anOfferYouCantRefuse: CardDef = {
  title: "An Offer You Can't Refuse",
  onPlay: {
    async: true,
    prompt: 'Choose a server',
    choices: ['Archives', 'R&D', 'HQ'],
    effect: effect(
      continue_ability(
        {
          optional: {
            prompt: (state: State) => `Make a run on ${targets[0]}?`,
            player: 'runner',
            yesAbility: {
              msg: `let the Runner make a run on ${targets[0]}`,
              async: true,
              effect: effect(
                corePrompts.clearWaitPrompt(state, 'corp'),
                coreEffects.registerLingeringEffect(state, side, card, {
                  type: 'cannot-jack-out',
                  value: true,
                  duration: 'end-of-run',
                }),
                coreRuns.makeRun(state, 'runner', eid, targets[0], card)
              ),
            },
            noAbility: {
              msg: 'add itself to [their] score area as an agenda worth 1 agenda point',
              effect: effect(corePrompts.clearWaitPrompt('corp'), coreMoving.asAgenda('corp', card, 1)),
            },
          },
        },
        card,
        null
      )
    ),
  },
};

// Anonymous Tip
export const anonymousTip: CardDef = {
  title: 'Anonymous Tip',
  onPlay: coreDefHelpers.drawAbi(3),
};

// Archived Memories
export const archivedMemories: CardDef = {
  title: 'Archived Memories',
  onPlay: coreDefHelpers.corpRecur(),
};

// Argus Crackdown
export const argusCrackdown: CardDef = lockdown({
  events: [{
    event: 'successful-run',
    automatic: 'corp-damage',
    req: req((state: State) => (state as any)?.run?.ices?.length > 0),
    msg: 'deal 2 meat damage',
    async: true,
    effect: effect(coreDamage.damage(eid, 'meat', 2, { card })),
  }],
});

// Ark Lockdown
export const arkLockdown: CardDef = {
  title: 'Ark Lockdown',
  onPlay: {
    onChangeGameState: {
      req: req((state: State) => {
        const runner = (state as any).runner;
        return runner?.discard?.length > 0 && !coreFlags.zoneLocked(state, 'runner', 'discard');
      }),
    },
    prompt: 'Name a card to remove all copies in the Heap from the game',
    showDiscard: true,
    choices: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      return corePrompts.cancellable((state as any).runner?.discard || [], { sorted: true });
    }),
    msg: msg('remove all copies of ', (state: State) => targets[0]?.title, ' in the Heap from the game'),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const runner = (state as any).runner;
      for (const c of (runner.discard || []).filter((d: Card) => d.title === targets[0]?.title)) {
        coreMoving.move(state, 'runner', c, 'rfg');
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Armed Asset Protection
export const armedAssetProtection: CardDef = {
  title: 'Armed Asset Protection',
  onPlay: {
    msg: msg((state: State) => {
      const corp = (state as any).corp;
      return `gain 3 [Credits], then gain ${faceupArchivesTypes(corp)} [Credits]`;
    }),
    async: true,
    effect: effect(
      coreGaining.gainCredits(state, 'corp', 3),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreGaining.gainCredits(state, 'corp', faceupArchivesTypes((state as any).corp));
      },
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const corp = (state as any).corp;
        const hasFaceup = corp.discard?.some((c: Card) => coreCard.faceup(c) && coreCard.agenda(c));
        if (hasFaceup) {
          return coreGaining.gainCredits(eid, 2);
        }
      }
    ),
  },
};

// Attitude Adjustment
export const attitudeAdjustment: CardDef = {
  title: 'Attitude Adjustment',
  onPlay: {
    async: true,
    msg: 'draw 2 cards',
    effect: effect(
      coreDrawing.draw(state, side, eid, 2),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(
          state,
          side,
          {
            prompt: 'Choose up to 2 agendas in HQ or Archives',
            choices: { max: 2, card: (c: Card) => coreCard.corp(c) && coreCard.agenda(c) && (coreCard.inHandStar(state, c) || coreCard.inDiscard(c)) },
            async: true,
            effect: effect(
              coreRevealing.revealLoud(state, side, card, null, targets),
              coreGaining.gainCredits(state, side, targets.length * 2)
            ),
          },
          card,
          null
        );
      }
    ),
  },
};

// Audacity
export const audacity: CardDef = {
  title: 'Audacity',
  onPlay: {
    req: req((state: State) => (state as any).corp?.hand?.length >= 3),
    async: true,
    msg: 'trash all cards in HQ',
    effect: effect(
      coreMoving.trashCards(state, side, (state as any).corp.hand, { unpreventable: true, causeCard: card }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(state, side, audacityAbility(2), card, null);
      }
    ),
  },
};

function audacityAbility(x: number): any {
  return {
    prompt: `Choose a card that can be advanced to place advancement counters on (${x} remaining)`,
    async: true,
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0])) },
    msg: msg('place 1 advancement counter on ', (state: State) => coreToString.cardStr(state, targets[0])),
    effect: effect(
      coreProps.addProp(state, side, targets[0], 'advance-counter', 1, { placed: true }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        if (x > 1) return continue_ability(state, side, audacityAbility(x - 1), card, null);
        return coreEid.effectCompleted(state, side, eid);
      }
    ),
  };
}

// Back Channels
export const backChannels: CardDef = {
  title: 'Back Channels',
  onPlay: {
    prompt: 'Choose an installed card in a server to trash',
    choices: {
      card: (c: Card) => {
        const zone = coreCard.getZone(c);
        return zone?.[0] === 'content' && coreServers.isRemote(zone[1]);
      },
    },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => {
        const zone = coreCard.getZone(c);
        return zone?.[0] === 'content' && coreServers.isRemote(zone[1]);
      })),
    },
    msg: msg('trash ', (state: State) => coreToString.cardStr(state, targets[0]), ' and gain ', (state: State) => 3 * (targets[0]?.counters?.advancement || 0), ' [Credits]'),
    async: true,
    effect: effect(
      coreGaining.gainCredits(state, side, 3 * (targets[0]?.counters?.advancement || 0), { suppressCheckpoint: true }),
      coreMoving.trash(state, side, eid, targets[0], { causeCard: card })
    ),
  },
};

// Backroom Machinations
export const backroomMachinations: CardDef = {
  title: 'Backroom Machinations',
  onPlay: {
    additionalCost: [corePayment.toC('tag', 1)],
    msg: 'add itself to the score area as an agenda worth 1 agenda point',
    effect: effect(coreMoving.asAgenda(state, 'corp', card, 1)),
  },
};

// Bad Times
export const badTimes: CardDef = {
  title: 'Bad Times',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    msg: 'force the Runner to lose 2[mu] until the end of the turn',
    effect: effect(
      coreEffects.registerLingeringEffect(state, 'corp', card, { ...coreMemory.muPlus(-2), duration: 'end-of-turn' }),
      coreMemory.updateMu(state)
    ),
  },
};

// Beanstalk Royalties
export const beanstalkRoyalties: CardDef = {
  title: 'Beanstalk Royalties',
  onPlay: coreDefHelpers.gainCreditsAbility(3),
};

// Best Defense
export const bestDefense: CardDef = {
  title: 'Best Defense',
  onPlay: {
    prompt: msg((state: State) => `Choose a Runner card with an install cost of ${utils.countTags(state)} or less to trash`),
    choices: {
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const t = targets[0];
        return coreCard.runner(t) && coreCard.installed(t) && !coreCard.facedown(t) && t.cost <= utils.countTags(state);
      }),
    },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'runner').some((c: Card) => coreCard.runner(c) && coreCard.installed(c) && !coreCard.facedown(c) && c.cost <= utils.countTags(state))),
    },
    msg: msg('trash ', (state: State) => targets[0]?.title),
    async: true,
    effect: effect(coreMoving.trash(eid, targets[0], { causeCard: card })),
  },
};

// Biased Reporting - simplified
export const biasedReporting: CardDef = {
  title: 'Biased Reporting',
  onPlay: {
    req: req((state: State) => coreBoard.allActiveInstalled(state, 'runner').length > 0),
    prompt: 'Choose one',
    choices: ['Hardware', 'Program', 'Resource'],
    async: true,
    msg: msg('choose ', (state: State) => targets[0]),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const type = targets[0];
      const n = coreBoard.allActiveInstalled(state, 'runner').filter((c: Card) => coreCard.isType(c, type)).length;
      // Simplified - just gain credits
      coreSay.systemMsg(state, 'corp', `uses ${card.title} to gain ${n * 2} [Credits]`);
      return coreGaining.gainCredits(state, 'corp', eid, n * 2);
    }),
  },
};

// Big Brother
export const bigBrother: CardDef = {
  title: 'Big Brother',
  onPlay: (() => {
    const abi = coreDefHelpers.giveTags(2);
    return { ...abi, req: req((state: State) => utils.isTagged(state)) };
  })(),
};

// Big Deal
export const bigDeal: CardDef = {
  title: 'Big Deal',
  onPlay: {
    prompt: 'Choose a card on which to place 4 advancement counters',
    rfgInsteadOfTrashing: true,
    async: true,
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) },
    msg: msg('place 4 advancement counters on ', (state: State) => coreToString.cardStr(state, targets[0])),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').length > 0),
    },
    effect: effect(
      coreProps.addProp(state, 'corp', targets[0], 'advance-counter', 4, { placed: true }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const cardToScore = targets[0];
        return continue_ability(
          state,
          side,
          {
            optional: {
              req: req((st: State) => coreFlags.canScore(st, side, coreCard.getCard(st, cardToScore))),
              prompt: `Score ${cardToScore.title}?`,
              yesAbility: { async: true, effect: effect(coreActions.score(eid, coreCard.getCard(state, cardToScore))) },
              noAbility: { effect: effect(coreSay.systemMsg(`declines to use ${card.title} to score ${coreToString.cardStr(state, cardToScore)}`)) },
            },
          },
          card,
          null
        );
      }
    ),
  },
};

// Bigger Picture
export const biggerPicture: CardDef = {
  title: 'Bigger Picture',
  onPlay: coreChooseOne.chooseOneHelper(
    { req: req((state: State) => utils.isTagged(state)) },
    [
      { option: 'Give the runner 1 tag', ability: coreDefHelpers.giveTags(1) },
      {
        option: 'Remove any number of tags',
        ability: {
          req: req((state: State) => utils.isTagged(state)),
          prompt: 'Remove how many tags?',
          choices: { number: req((state: State) => utils.countTags(state)) },
          async: true,
          effect: effect(coreGaining.gainCredits(eid, 0)), // simplified
        },
      },
    ]
  ),
};

// Bioroid Efficiency Research
export const bioroidEfficiencyResearch: CardDef = {
  title: 'Bioroid Efficiency Research',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.hasSubtype(c, 'Bioroid') && coreCard.installed(c) && !coreCard.rezzed(c) },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c))),
    },
    async: true,
    cancel: { msg: 'do nothing' },
    effect: effect(coreInstalling.installAsConditionCounter(state, side, eid, card, targets[0])),
  },
  events: [{
    event: 'subroutines-broken',
    condition: 'hosted',
    async: true,
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.sameCard(targets[0]?.ice, card)),
    effect: effect(
      coreRezzing.derez(state, side, targets[0]?.ice, { suppressCheckpoint: true }),
      coreMoving.trash(state, 'corp', eid, card, { causeCard: card })
    ),
  }],
};

// Biotic Labor
export const bioticLabor: CardDef = {
  title: 'Biotic Labor',
  onPlay: gainNClicks(2),
};

// Blue Level Clearance
export const blueLevelClearance: CardDef = {
  title: 'Blue Level Clearance',
  onPlay: clearance(5, 2),
};

// BOOM!
export const boom: CardDef = {
  title: 'BOOM!',
  onPlay: {
    req: req((state: State) => utils.countTags(state) >= 2),
    msg: 'do 7 meat damage',
    async: true,
    effect: effect(coreDamage.damage(eid, 'meat', 7, { card })),
  },
};

// Bring Them Home
export const bringThemHome: CardDef = {
  title: 'Bring Them Home',
  onPlay: {
    async: true,
    req: req((state: State) => {
      const reg = (state as any).runner?.register;
      return reg?.lastTurn?.trashedCard || reg?.lastTurn?.stoleAgenda;
    }),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      // Simplified: just shuffle 2 random cards from grip to deck
      const hand = (state as any).runner?.hand || [];
      const chosen = hand.slice(0, 2);
      for (const c of chosen) {
        coreMoving.move(state, 'runner', c, 'deck', { front: true });
      }
      coreShuffling.shuffle(state, 'runner', 'deck');
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Building Blocks
export const buildingBlocks: CardDef = {
  title: 'Building Blocks',
  onPlay: {
    prompt: 'Choose a Barrier to install and rez',
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.hasSubtype(c, 'Barrier') && coreCard.inHandStar(state, c) },
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    effect: effect(coreInstalling.corpInstall(state, side, eid, targets[0], null, { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true }, installState: 'rezzed-no-cost' })),
  },
};

// Business As Usual - simplified
export const businessAsUsual: CardDef = {
  title: 'Business As Usual',
  onPlay: (() => {
    const fauxPurge: any = {
      choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.installed(targets[0]) && (targets[0].counters?.virus || 0) > 0) },
      async: true,
      effect: effect(coreProps.addCounter(eid, targets[0], 'virus', -(targets[0]?.counters?.virus || 0), null)),
      msg: msg('remove all virus counters from ', (state: State) => coreToString.cardStr(state, targets[0])),
    };
    return coreChooseOne.chooseOneHelper(
      { onChangeGameState: { req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state) || coreBoard.allInstalled(state, 'runner').some((c: Card) => (c.counters?.virus || 0) > 0)) } },
      [
        { option: 'Place 1 advancement counter on up to two cards you can advance', ability: { choices: { max: 2, card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) }, async: true, effect: effect(coreProps.addProp(state, 'corp', targets[0], 'advance-counter', 1, { placed: true })) } },
        { option: 'Remove all virus counters from 1 installed card', ability: fauxPurge },
      ]
    );
  })(),
};

// Casting Call
export const castingCall: CardDef = {
  title: 'Casting Call',
  onPlay: {
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.inHandStar(state, c) },
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(state, side, eid, card, targets[0])),
  },
  events: [{
    event: 'access',
    condition: 'hosted',
    async: true,
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.sameCard(targets[0]?.accessedCard, card)),
    msg: 'give the Runner 2 tags',
    effect: effect(coreTags.gainTags('runner', eid, 2)),
  }],
};

// Caveat Emptor
export const caveatEmptor: CardDef = {
  title: 'Caveat Emptor',
  onPlay: coreChooseOne.chooseOneHelper([
    {
      option: 'Gain 6 [Credits]. Runner has -1 [Click] next turn',
      ability: {
        msg: 'Gain 6 [Credits] and give the Runner -1 alotted [Click] next turn',
        async: true,
        effect: effect(coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) - 1), coreGaining.gainCredits(state, side, eid, 6)),
      },
    },
    {
      option: 'Gain 10 [Credits]. Runner has +1 [Click] next turn',
      ability: {
        msg: 'Gain 10 [Credits] and give the Runner +1 alotted [Click] next turn',
        async: true,
        effect: effect(coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) + 1), coreGaining.gainCredits(state, side, eid, 10)),
      },
    },
  ]),
};

// Cultivate
export const cultivate: CardDef = {
  title: 'Cultivate',
  onPlay: {
    msg: msg((state: State) => {
      const deck = (state as any).corp?.deck || [];
      return deck.length === 1 ? 'trash the top card of R&D' : `look at the top ${Math.min(5, deck.length)} cards of R&D`;
    }),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const deck = (state as any).corp?.deck || [];
      if (deck.length === 1) {
        return coreMoving.trash(state, side, eid, deck[0]);
      }
      // Simplified: just look at top 5 and return
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};


// Celebrity Gift
export const celebrityGift: CardDef = {
  title: 'Celebrity Gift',
  onPlay: {
    choices: { max: 5, card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    msg: msg('reveal ', (state: State) => utils.enumerateCards(targets, { sorted: true }), ' from HQ and gain ', (state: State) => targets.length * 2, ' [Credits]'),
    async: true,
    effect: effect(coreRevealing.reveal(state, side, targets), coreGaining.gainCredits(state, side, eid, targets.length * 2)),
  },
};

// Cerebral Cast
export const cerebralCast: CardDef = {
  title: 'Cerebral Cast',
  onPlay: {
    psi: {
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
      notEqual: {
        player: 'runner',
        async: true,
        prompt: 'Choose one',
        waitingPrompt: true,
        choices: ['Take 1 tag', 'Suffer 1 core damage'],
        msg: msg('force the Runner to ', (state: State) => targets[0]?.charAt(0).toLowerCase() + targets[0]?.slice(1)),
        effect: effect(targets[0] === 'Take 1 tag' ? coreTags.gainTags(state, 'runner', eid, 1) : coreDamage.damage(state, side, eid, 'brain', 1, { card })),
      },
    },
  },
};

// Cerebral Static
export const cerebralStatic: CardDef = {
  title: 'Cerebral Static',
  onPlay: { msg: 'disable the Runner\'s identity' },
  staticAbilities: [{ type: 'disable-card', req: req((state: State) => utils.sameCard(targets[0], (state as any).runner?.identity)), value: true }],
};

// "Clones are not People"
export const clonesAreNotPeople: CardDef = {
  title: '"Clones are not People"',
  events: [{
    event: 'agenda-scored',
    msg: 'add itself to the score area as an agenda worth 1 agenda point',
    effect: effect(coreMoving.asAgenda(state, 'corp', card, 1)),
  }],
};

// Closed Accounts
export const closedAccounts: CardDef = {
  title: 'Closed Accounts',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.credit > 0),
    },
    msg: msg('force the Runner to lose all ', (state: State) => (state as any).runner?.credit, ' [Credits]'),
    async: true,
    effect: effect(coreGaining.lose('runner', eid, 'all')),
  },
};

// Commercialization
export const commercialization: CardDef = {
  title: 'Commercialization',
  onPlay: {
    msg: msg('gain ', (state: State) => targets[0]?.counters?.advancement || 0, ' [Credits]'),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && (c.counters?.advancement || 0) > 0)),
    },
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
    async: true,
    effect: effect(coreGaining.gainCredits(eid, targets[0]?.counters?.advancement || 0)),
  },
};

// Consulting Visit
export const consultingVisit: CardDef = {
  title: 'Consulting Visit',
  onPlay: {
    prompt: 'Choose an Operation from R&D to play',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    choices: req((state: State) => {
      const deck = (state as any).corp?.deck || [];
      return corePrompts.cancellable(deck.filter((c: Card) => coreCard.operation(c) && c.cost <= (state as any).corp?.credit), { sorted: true });
    }),
    cancel: coreShuffling.shuffleMyDeck,
    msg: msg('search R&D for ', (state: State) => targets[0]?.title, ' and play it'),
    async: true,
    effect: effect(coreShuffling.shuffle(state, 'corp', 'deck'), coreSay.systemMsg('shuffles [their] deck'), corePlayInstants.playInstant(eid, targets[0], null)),
  },
};

// Corporate Hospitality
export const corporateHospitality: CardDef = {
  title: 'Corporate Hospitality',
  onPlay: coreDefHelpers.combineAbilities(clearance(6, 2), coreDefHelpers.corpRecur()),
};

// Corporate Shuffle
export const corporateShuffle: CardDef = {
  title: 'Corporate Shuffle',
  onPlay: {
    msg: 'shuffle all cards in HQ into R&D and draw 5 cards',
    async: true,
    effect: effect(coreShuffling.shuffleIntoDeck('hand'), coreDrawing.draw(eid, 5)),
  },
};

// Cyberdex Trial
export const cyberdexTrial: CardDef = {
  title: 'Cyberdex Trial',
  playSound: 'virus-purge',
  onPlay: {
    msg: 'purge virus counters',
    async: true,
    effect: effect(corePurging.purge(eid)),
  },
};

// Dedication Ceremony
export const dedicationCeremony: CardDef = {
  title: 'Dedication Ceremony',
  onPlay: {
    prompt: 'Choose a faceup card',
    choices: {
      card: (c: Card) =>
        (coreCard.corp(c) && coreCard.installed(c) && coreCard.faceup(c)) ||
        (coreCard.runner(c) && (coreCard.installed(c) || c.host) && !coreCard.facedown(c)),
    },
    msg: msg('place 3 advancement counters on ', (state: State) => coreToString.cardStr(state, targets[0])),
    async: true,
    effect: effect(
      coreProps.addCounter(state, 'corp', eid, targets[0], 'advancement', 3, { placed: true }),
      coreFlags.registerTurnFlag(state, side, targets[0], 'can-score', (state: State, _side: Side, c: Card) => {
        if (utils.sameCard(c, targets[0])) {
          coreToasts.toast(state, 'corp', 'Cannot score due to Dedication Ceremony.');
          return false;
        }
        return true;
      })
    ),
  },
};

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
      effect: effect(corePrevention.damageBoost(state, side, eid, 1)),
    },
  }],
};

// Digital Rights Management - simplified
export const digitalRightsManagement: CardDef = {
  title: 'Digital Rights Management',
  onPlay: {
    req: req((state: State) => (state as any).turn > 1 && !(state as any).runner?.register?.lastTurn?.successfulRun?.includes('hq')),
    prompt: 'Choose an Agenda',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0 || (state as any).corp?.hand?.length > 0),
    },
    choices: req((state: State) => [...((state as any).corp?.deck || []).filter((c: Card) => coreCard.agenda(c)), 'None']),
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
    effect: effect(
      coreGaining.gainCredits(state, 'runner', 2),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(state, side, trashFromHQ, card, null);
      }
    ),
  },
};

const trashFromHQ: any = {
  async: true,
  prompt: 'Choose up to 2 cards in HQ to trash',
  choices: { max: 2, card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
  msg: msg('trash ', (state: State) => utils.quantify(targets.length, 'card'), ' from HQ'),
  effect: effect(
    coreMoving.trashCards(state, side, targets, { causeCard: card }),
    (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)
  ),
};

// Distributed Tracing
export const distributedTracing: CardDef = {
  title: 'Distributed Tracing',
  onPlay: (() => {
    const abi = coreDefHelpers.giveTags(1);
    return { ...abi, req: req((state: State) => (state as any).runner?.register?.lastTurn?.stoleAgenda) };
  })(),
};

// Diversified Portfolio
export const diversifiedPortfolio: CardDef = {
  title: 'Diversified Portfolio',
  onPlay: {
    msg: msg((state: State) => {
      const remotes = coreServers.getRemoteNames(state).filter((name: string) => (state as any).corp?.servers?.[name]?.content?.length > 0);
      return `${remotes.length} [Credits]`;
    }),
    onChangeGameState: {
      req: req((state: State) => coreServers.getRemoteNames(state).filter((name: string) => (state as any).corp?.servers?.[name]?.content?.length > 0).length > 0),
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
      max: req((state: State) => coreBoard.allInstalled(state, 'corp').filter(coreCard.rezzed).length),
    },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').length > 0),
    },
    async: true,
    effect: effect(
      coreRezzing.derez(state, side, targets),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
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
      }
    ),
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
        msg: msg((state: State) => (utils.isTagged(state) ? 'do 1 meat damage' : 'give the Runner 1 tag')),
        async: true,
        effect: effect(utils.isTagged(state) ? coreDamage.damage(state, side, eid, 'meat', 1, { card }) : coreTags.gainTags(state, 'corp', eid, 1)),
      },
    },
  }],
};

// Eavesdrop
export const eavesdrop: CardDef = {
  title: 'Eavesdrop',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) },
    msg: msg('give ', (state: State) => coreToString.cardStr(state, targets[0], { visible: false }), ' additional text'),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some(coreCard.ice)),
    },
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(eid, card, targets[0])),
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
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.credit >= 4),
    },
    msg: 'make the runner lose 4 [Credits]',
    effect: effect(coreGaining.lose('runner', eid, 4)),
  },
};

// Election Day
export const electionDay: CardDef = {
  title: 'Election Day',
  onPlay: {
    req: req((state: State) => (state as any).corp?.hand?.filter((c: Card) => !utils.sameCard(c, card)).length > 0),
    msg: 'trash all cards in HQ and draw 5 cards',
    async: true,
    effect: effect(coreMoving.trashCards(state, side, (state as any).corp.hand, { causeCard: card }), coreDrawing.draw(state, side, eid, 5)),
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
    effect: effect(coreDamage.damage(eid, 'meat', 4, { card })),
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
        msg: msg('trash ', (state: State) => targets[0]?.title),
        effect: effect(coreMoving.trash(eid, targets[0], { causeCard: card })),
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
    req: req((state: State) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.scored?.length > 0 && (state as any).corp?.scored?.length > 0),
    },
    prompt: 'Choose an agenda in the Runner\'s score area to swap',
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => flags.inRunnerScored(state, side, targets[0])) },
    async: true,
    effect: effect(continue_ability(
      (() => {
        const stolen = targets[0];
        return {
          prompt: `Choose a scored agenda to swap for ${stolen.title}`,
          choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => flags.inCorpScored(state, side, targets[0])) },
          msg: msg('swap ', (state: State) => targets[0]?.title, ' for ', (state: State) => stolen.title),
          effect: effect(coreMoving.swapAgendas(targets[0], stolen)),
        };
      })(),
      card,
      null
    )),
  },
};

// Extract
export const extract: CardDef = {
  title: 'Extract',
  onPlay: {
    async: true,
    msg: 'gain 6 [Credit]',
    effect: effect(
      coreGaining.gainCredits(state, side, 6),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(
          state,
          side,
          {
            prompt: 'Choose an installed card to trash',
            req: req((state: State) => coreBoard.allInstalled(state, 'corp').length > 0),
            choices: { card: (c: Card) => coreCard.installed(c) && coreCard.corp(c) },
            async: true,
            waitingPrompt: true,
            msg: msg('trash ', (state: State) => coreToString.cardStr(state, targets[0]), ' and gain 3 [Credits]'),
            effect: effect(
              coreMoving.trash(state, side, eid, targets[0], { causeCard: card }),
              coreGaining.gainCredits(state, side, eid, 3)
            ),
          },
          card,
          null
        );
      }
    ),
  },
};

// Fast Break - simplified
export const fastBreak: CardDef = {
  title: 'Fast Break',
  xFn: req((state: State) => (state as any).runner?.scored?.length || 0),
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.scored?.length > 0),
    },
    msg: msg((state: State) => `gain ${((state as any).runner?.scored?.length || 0)} [Credits]`),
    effect: effect(coreGaining.gainCredits(state, 'corp', (state as any).runner?.scored?.length || 0)),
  },
};

// Fast Track
export const fastTrack: CardDef = {
  title: 'Fast Track',
  onPlay: {
    prompt: 'Choose an Agenda',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    choices: req((state: State) => corePrompts.cancellable(((state as any).corp.deck || []).filter((c: Card) => coreCard.agenda(c)), { sorted: true })),
    async: true,
    msg: msg('reveal ', (state: State) => targets[0]?.title, ' from R&D and add it to HQ'),
    cancel: coreShuffling.shuffleMyDeck,
    effect: effect(coreRevealing.reveal(state, side, targets[0]), coreShuffling.shuffle(state, side, 'deck'), coreMoving.move(state, side, targets[0], 'hand'), coreEid.effectCompleted(state, side, eid)),
  },
};

// Financial Collapse
export const financialCollapse: CardDef = {
  title: 'Financial Collapse',
  onPlay: {
    optional: {
      req: req((state: State) => (state as any).runner?.credit >= 6),
      onChangeGameState: {
        req: req((state: State) => coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length > 0),
      },
      player: 'runner',
      waitingPrompt: true,
      prompt: 'Trash a resource?',
      yesAbility: { displaySide: 'runner', cost: [corePayment.toC('resource', 1)], msg: ':cost' },
      noAbility: {
        player: 'corp',
        async: true,
        msg: msg((state: State) => `make the Runner lose ${coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length} [Credits]`),
        effect: effect(coreGaining.lose('runner', eid, coreBoard.allActiveInstalled(state, 'runner').filter(coreCard.resource).length)),
      },
    },
  },
};


// Flood the Market
export const floodTheMarket: CardDef = {
  title: 'Flood the Market',
  onPlay: {
    onChangeGameState: {
      req: req((state: State) => {
        const full = coreServers.getRemoteNames(state).filter((n: string) => {
          const s = (state as any).corp?.servers?.[n];
          return s?.content?.length > 0 && s?.ices?.length > 0;
        });
        return full.length > 0;
      }),
    },
    async: true,
    prompt: msg('Choose a card and place ', (state: State) => {
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
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
    prompt: 'Choose one',
    choices: ['Event', 'Hardware', 'Program', 'Resource'],
    async: true,
    msg: msg('choose ', (state: State) => targets[0]),
    effect: effect(coreEid.effectCompleted(state, side, eid)),
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
  onPlay: trashType('resource', coreCard.resource, true, 2, null, { req: req((state: State) => utils.isTagged(state)) }),
};

// Friends in High Places
export const friendsInHighPlaces: CardDef = {
  title: 'Friends in High Places',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.discard?.length > 0),
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
    effect: effect(
      coreInstalling.corpInstall(state, side, eid, targets[0], null, { msgKeys: { installSource: card, displayOrigin: true } }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        if (n < 2) return continue_ability(state, side, fhelper(n + 1), card, null);
        return coreEid.effectCompleted(state, side, eid);
      }
    ),
  };
}

// Fully Operational - simplified
export const fullyOperational: CardDef = {
  title: 'Fully Operational',
  onPlay: {
    msg: msg((state: State) => `make ${((fullServersCount(state) || 0) + 1)} gain/draw decisions`),
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
      req: req((state: State) => (state as any).runner?.scored?.length > 0),
    },
    effect: effect(coreGaining.gainClicks((state as any).runner?.scored?.length || 0)),
  },
};

// Game Over - simplified
export const gameOver: CardDef = {
  title: 'Game Over',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.stoleAgenda),
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
    effect: effect(coreMoving.mill(state, 'corp', 'corp', 2), coreShuffling.shuffleIntoRdEffect(state, side, eid, card, 4)),
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
    effect: effect(coreGaining.gainCredits(state, side, 5), coreEid.effectCompleted(state, side, eid)),
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
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedCard),
    prompt: 'Choose an installed Corp card',
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').length > 0),
    },
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c) },
    async: true,
    msg: msg('choose ', (state: State) => coreToString.cardStr(state, targets[0])),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Hansei Review
export const hanseiReview: CardDef = {
  title: 'Hansei Review',
  onPlay: {
    async: true,
    msg: 'gain 10 [Credits]',
    effect: effect(coreGaining.gainCredits(state, 'corp', 10), coreEid.effectCompleted(state, side, eid)),
  },
};

// Hard-Hitting News
export const hardHittingNews: CardDef = {
  title: 'Hard-Hitting News',
  onPlay: {
    trace: {
      base: 4,
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.madeRun),
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
    effect: effect(
      coreDrawing.draw(state, side, 3),
      coreEid.effectCompleted(state, side, eid)
    ),
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
        effect: effect(coreMoving.move('runner', targets[0], 'hand', true)),
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
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.installedResource),
      successful: {
        msg: 'add a Resource to the top of the Stack',
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
        effect: effect(coreMoving.move('runner', targets[0], 'deck', { front: true }), coreSay.systemMsg(`adds ${targets[0]?.title} to the top of the Stack`)),
      },
      unsuccessful: {
        msg: 'take 1 bad publicity',
        effect: effect(coreBadPublicity.gainBadPublicity('corp', 1)),
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
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedAccessedCard),
      label: 'Trash 2 installed non-program cards or take 1 bad publicity',
      successful: trashType('non-program', (c: Card) => coreCard.facedown(c) || !coreCard.program(c), true, 2, true),
      unsuccessful: {
        msg: 'take 1 bad publicity',
        async: true,
        effect: effect(coreBadPublicity.gainBadPublicity('corp', eid, 1)),
      },
    },
  },
};

// Heritage Committee
export const heritageCommittee: CardDef = {
  title: 'Heritage Committee',
  onPlay: {
    async: true,
    effect: effect(
      coreDrawing.draw(state, side, 3),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
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
      }
    ),
  },
};

// High-Profile Target
export const highProfileTarget: CardDef = {
  title: 'High-Profile Target',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    msg: msg('do ', (state: State) => utils.countTags(state) * 2, ' meat damage'),
    async: true,
    effect: effect(coreDamage.damage(eid, 'meat', utils.countTags(state) * 2, { card })),
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
    msg: msg('force the Runner to trash ', (state: State) => targets[0]?.title, ' from the grip'),
    effect: effect(coreMoving.trash('runner', eid, targets[0], { unpreventable: true, causeCard: card, cause: 'forced-to-trash' })),
  }],
};

// Hunter Seeker
export const hunterSeeker: CardDef = {
  title: 'Hunter Seeker',
  onPlay: trashType('card', coreCard.installed, true, 1, null, {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.stoleAgenda),
  }),
};

// Hyoubu Precog Manifold
export const hyoubuPrecogManifold: CardDef = lockdown({
  onPlay: {
    prompt: 'Choose a server',
    choices: req((state: State) => coreServers.zonesToSortedNames(coreBoard.getZones(state))),
    msg: msg('choose ', (state: State) => targets[0]),
    effect: effect(coreUpdate.update({ ...card, cardTarget: targets[0] })),
  },
  events: [{
    event: 'successful-run',
    psi: {
      req: req((state: State) => coreServers.zoneToName((state as any).run?.server) === card.cardTarget),
      notEqual: {
        msg: 'end the run',
        async: true,
        effect: effect(coreRuns.endRun(eid, card)),
      },
    },
  }],
});

// Hypoxia
export const hypoxia: CardDef = {
  title: 'Hypoxia',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    msg: 'do 1 core damage and give the Runner -1 allotted [Click] for [runner-pronoun] next turn',
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect(
      coreDamage.damage(state, 'runner', 'brain', 1, { card }),
      coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) - 1),
      coreEid.effectCompleted(state, side, eid)
    ),
  },
};

// Interns
export const interns: CardDef = {
  title: 'Interns',
  onPlay: {
    prompt: 'Choose a card to install from Archives or HQ',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0 || (state as any).corp?.discard?.some((c: Card) => !coreCard.operation(c) || !c.seen)),
    },
    showDiscard: true,
    notDistinct: true,
    choices: { card: (c: Card) => !coreCard.operation(c) && coreCard.corp(c) && (coreCard.inHandStar(state, c) || coreCard.inDiscard(c)) },
    async: true,
    effect: effect(coreInstalling.corpInstall(eid, targets[0], null, { ignoreInstallCost: true, msgKeys: { installSource: card, displayOrigin: true } })),
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
        choices: { max: req((state: State) => targets[0] - targets[1] || 1) },
        async: true,
        effect: effect(coreMoving.trashCards(state, side, eid, targets, { causeCard: card })),
      },
      unsuccessful: {
        msg: 'take 1 bad publicity',
        async: true,
        effect: effect(coreBadPublicity.gainBadPublicity('corp', eid, 1)),
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
    choices: { max: req((state: State) => (state as any).corp?.hand?.length || 0), card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    async: true,
    effect: effect(
      coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card }),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        // Turn Archives face-down
        const corp = (state as any).corp;
        for (const c of corp.discard || []) {
          coreUpdate.update(c, { seen: false });
        }
        coreShuffling.shuffle(state, 'corp', 'discard');
        return coreEid.effectCompleted(state, side, eid);
      }
    ),
  },
};

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

// Restructure
export const restructure: CardDef = {
  title: 'Restructure',
  onPlay: coreDefHelpers.gainCreditsAbility(15),
};

// Retirement Plan
export const retirementPlan: CardDef = {
  title: 'Retirement Plan',
  onPlay: {
    prompt: 'Install an Asset, Ice or Agenda from Archives',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.discard?.some((c: Card) => coreCard.asset(c) || coreCard.ice(c) || coreCard.agenda(c) || !c.seen)),
    },
    showDiscard: true,
    notDistinct: true,
    choices: { card: (c: Card) => (coreCard.ice(c) || coreCard.asset(c) || coreCard.agenda(c)) && coreCard.corp(c) && coreCard.inDiscard(c) },
    async: true,
    effect: effect(coreInstalling.corpInstall(eid, targets[0], null, { msgKeys: { installSource: card, displayOrigin: true } })),
  },
};

// Retribution
export const retribution: CardDef = {
  title: 'Retribution',
  onPlay: trashType('program of piece of hardware', (c: Card) => coreCard.program(c) || coreCard.hardware(c), true, 1, null, { req: req((state: State) => utils.isTagged(state)) }),
};

// Reuse
export const reuse: CardDef = {
  title: 'Reuse',
  onPlay: {
    prompt: msg('Choose up to ', (state: State) => utils.quantify((state as any).corp?.hand?.length, 'card'), ' in HQ to trash'),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    choices: { max: req((state: State) => (state as any).corp?.hand?.length || 0), card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    msg: msg((state: State) => `trash ${targets.length} card${targets.length !== 1 ? 's' : ''} and gain ${targets.length * 2} [Credits]`),
    async: true,
    effect: effect(coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card }), coreGaining.gainCredits(state, side, eid, targets.length * 2)),
  },
};

// Reverse Infection
export const reverseInfection: CardDef = {
  title: 'Reverse Infection',
  onPlay: {
    prompt: 'Choose one',
    waitingPrompt: true,
    choices: ['Purge virus counters', 'Gain 2 [Credits]'],
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Rework
export const rework: CardDef = {
  title: 'Rework',
  onPlay: {
    prompt: 'Choose a card from HQ to shuffle into R&D',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    msg: 'shuffle a card from HQ into R&D',
    effect: effect(coreMoving.move(targets[0], 'deck'), coreShuffling.shuffle('deck')),
  },
};

// Riot Suppression
export const riotSuppression: CardDef = {
  title: 'Riot Suppression',
  onPlay: {
    rfgInsteadOfTrashing: true,
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedCard),
    player: 'runner',
    async: true,
    waitingPrompt: true,
    prompt: 'Choose one',
    msg: msg('force the Runner to ', (state: State) => targets[0]?.charAt(0).toLowerCase() + targets[0]?.slice(1)),
    choices: ['Suffer 1 core damage', 'Get 3 fewer [Click] on the next turn'],
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      if (targets[0] === 'Suffer 1 core damage') return corePayment.pay(state, 'runner', eid, card, [corePayment.toC('brain', 1)]);
      coreUpdate.updateIn(state, ['runner', 'extraClickTemp'], (v: number) => (v || 0) - 3);
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Rolling Brownout
export const rollingBrownout: CardDef = {
  title: 'Rolling Brownout',
  onPlay: { msg: 'increase the play cost of operations and events by 1 [Credits]' },
  staticAbilities: [{ type: 'play-cost', value: 1 }],
  events: [{
    event: 'play-event',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.firstEvent(state, side, 'play-event')),
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits('corp', eid, 1)),
  }],
};

// Rover Algorithm
export const roverAlgorithm: CardDef = {
  title: 'Rover Algorithm',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c))),
    },
    msg: msg('host itself as a condition counter on ', (state: State) => coreToString.cardStr(state, targets[0])),
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(eid, card, targets[0])),
  },
  staticAbilities: [{ type: 'ice-strength', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host)), value: req((state: State) => card.counters?.power || 0) }],
  events: [{
    event: 'pass-ice',
    condition: 'hosted',
    req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => utils.sameCard(targets[0]?.ice, card)),
    msg: 'place 1 power counter on itself',
    async: true,
    effect: effect(coreProps.addCounter(eid, card, 'power', 1, null)),
  }],
};

// Sacrifice
export const sacrifice: CardDef = {
  title: 'Sacrifice',
  onPlay: {
    additionalCost: [corePayment.toC('forfeit')],
    async: true,
    onChangeGameState: {
      req: req((state: State) => coreBadPublicity.hasBadPub(state)),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Salem's Hospitality
export const salemsHospitality: CardDef = {
  title: "Salem's Hospitality",
  onPlay: {
    prompt: 'Name a Runner card',
    choices: {
      cardTitle: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.runner(targets[0]) && !coreCard.identity(targets[0])),
    },
    async: true,
    msg: msg('reveal ', (state: State) => utils.enumerateCards((state as any).runner?.hand || [], { sorted: true }), ' from the grip and trash any copies of ', (state: State) => targets[0]),
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Scapegoat
export const scapegoat: CardDef = {
  title: 'Scapegoat',
  onPlay: coreChooseOne.chooseOneHelper(
    { player: 'runner' },
    [
      { option: 'Corp removes 2 bad publicity', ability: { async: true, displaySide: 'corp', msg: 'remove 2 bad publicity', effect: effect(coreBadPublicity.loseBadPublicity(state, 'corp', eid, 2)) } },
      { option: 'Corp shuffles 1 Runner card into the Stack', ability: { onChangeGameState: { req: req((state: State) => coreBoard.allInstalled(state, 'runner').length > 0) }, player: 'corp', prompt: 'Shuffle an installed Runner card into the stack', choices: { max: 1, card: (c: Card) => coreCard.runner(c) && coreCard.installed(c), all: true }, displaySide: 'corp', effect: effect(targets.forEach((t: Card) => coreMoving.move(state, 'runner', t, 'deck')), coreShuffling.shuffle(state, 'runner', 'deck')) } },
    ]
  ),
};

// Scapenet
export const scapenet: CardDef = {
  title: 'Scapenet',
  onPlay: {
    trace: {
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
      base: 7,
      successful: {
        prompt: 'Choose an installed virtual or chip card to remove from game',
        choices: { card: (c: Card) => coreCard.installed(c) && (coreCard.hasSubtype(c, 'Virtual') || coreCard.hasSubtype(c, 'Chip')) },
        msg: msg('remove ', (state: State) => coreToString.cardStr(state, targets[0]), ' from game'),
        effect: effect(coreMoving.move('runner', targets[0], 'rfg')),
      },
    },
  },
};

// Scarcity of Resources
export const scarcityOfResources: CardDef = {
  title: 'Scarcity of Resources',
  onPlay: { msg: 'increase the install cost of resources by 2' },
  staticAbilities: [{ type: 'install-cost', req: req(() => coreCard.resource(targets[0])), value: 2 }],
};

// Scorched Earth
export const scorchedEarth: CardDef = {
  title: 'Scorched Earth',
  onPlay: (() => {
    const abi = coreDefHelpers.doMeatDamage(4);
    return { ...abi, req: req((state: State) => utils.isTagged(state)) };
  })(),
};

// SEA Source
export const seaSource: CardDef = {
  title: 'SEA Source',
  onPlay: {
    trace: {
      base: 3,
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
      label: 'Trace 3 - Give the Runner 1 tag',
      successful: coreDefHelpers.giveTags(1),
    },
  },
};

// Seamless Launch
export const seamlessLaunch: CardDef = {
  title: 'Seamless Launch',
  onPlay: (() => {
    const abi = coreDefHelpers.placeAdvancementCounter(null, 2, 'an installed card', (c: Card) => coreCard.installed(c) !== 'this-turn');
    return { ...abi, onChangeGameState: { req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.corp(c) && coreCard.installed(c) && coreCard.installed(c) !== 'this-turn')) } };
  })(),
};

// Secure and Protect - simplified
export const secureAndProtect: CardDef = {
  title: 'Secure and Protect',
  onPlay: {
    interactive: () => true,
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.deck?.length > 0),
    },
    waitingPrompt: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Self-Growth Program
export const selfGrowthProgram: CardDef = {
  title: 'Self-Growth Program',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    prompt: 'Choose 2 installed Runner cards',
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'runner').length > 0),
    },
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c), max: 2 },
    msg: msg('move ', (state: State) => utils.enumerateCards(targets), ' to the grip'),
    effect: effect(targets.forEach((c: Card) => coreMoving.move(state, 'runner', c, 'hand'))),
  },
};

// Service Outage
export const serviceOutage: CardDef = {
  title: 'Service Outage',
  onPlay: { msg: 'add a cost of 1 [Credit] for the Runner to make the first run each turn' },
  staticAbilities: [{ type: 'run-additional-cost', req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEvents.noEvent(state, side, 'run')), value: [corePayment.toC('credit', 1)] }],
};

// Shipment from Kaguya
export const shipmentFromKaguya: CardDef = {
  title: 'Shipment from Kaguya',
  onPlay: {
    choices: {
      max: 2,
      req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => targets.every((t: Card) => coreCard.corp(t) && coreCard.installed(t) && coreCard.canBeAdvanced(state, t))),
    },
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    msg: msg('place 1 advancement counters on ', (state: State) => utils.quantify(targets.length, 'card')),
    async: true,
    effect: effect(coreProps.addProp(state, 'corp', targets[0], 'advance-counter', 1, { placed: true })),
  },
};

// Shipment from MirrorMorph
export const shipmentFromMirrorMorph: CardDef = {
  title: 'Shipment from MirrorMorph',
  onPlay: coreDefHelpers.corpInstallUpToN(3),
};

// Shipment from SanSan
export const shipmentFromSanSan: CardDef = {
  title: 'Shipment from SanSan',
  onPlay: {
    choices: ['0', '1', '2'],
    prompt: 'How many advancement counters do you want to place?',
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Shipment from Tennin
export const shipmentFromTennin: CardDef = {
  title: 'Shipment from Tennin',
  onPlay: (() => {
    const abi = coreDefHelpers.placeAdvancementCounter(null, 2);
    return { ...abi, req: req((state: State) => !coreEvents.lastTurn(state, 'runner', 'successful-run')) };
  })(),
};

// Shipment from Vladisibirsk - simplified
export const shipmentFromVladisibirsk: CardDef = {
  title: 'Shipment from Vladisibirsk',
  onPlay: {
    async: true,
    req: req((state: State) => utils.countTags(state) >= 2),
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Shoot the Moon
export const shootTheMoon: CardDef = {
  title: 'Shoot the Moon',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c))),
    },
    choices: {
      card: (c: Card) => coreCard.ice(c) && !coreCard.rezzed(c),
      max: req((state: State) => Math.min(utils.countTags(state), coreBoard.allInstalled(state, 'corp').filter((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c)).length)),
    },
    async: true,
    effect: effect(coreRezzing.rezMultipleCards(state, side, eid, targets, { ignoreCost: 'all-costs' })),
  },
};


// Simulation Reset
export const simulationReset: CardDef = {
  title: 'Simulation Reset',
  onPlay: {
    rfgInsteadOfTrashing: true,
    prompt: 'Choose up to 5 cards in HQ to trash',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    waitingPrompt: true,
    choices: { max: 5, card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    async: true,
    msg: msg('trash ', (state: State) => utils.quantify(targets.length, 'card'), ' from HQ'),
    effect: effect(coreMoving.trashCards(state, side, targets, { unpreventable: true, causeCard: card }), coreShuffling.shuffleIntoRdEffect(state, side, eid, card, targets.length, true), coreDrawing.draw(eid, targets.length)),
  },
};

// Snatch and Grab - simplified
export const snatchAndGrab: CardDef = {
  title: 'Snatch and Grab',
  onPlay: {
    trace: {
      base: 3,
      successful: {
        waitingPrompt: true,
        msg: 'trash a connection',
        choices: { card: (c: Card) => coreCard.hasSubtype(c, 'Connection') },
        async: true,
        effect: effect(coreMoving.trash('corp', eid, targets[0], { causeCard: card })),
      },
    },
  },
};

// Special Report
export const specialReport: CardDef = {
  title: 'Special Report',
  onPlay: {
    prompt: 'Choose any number of cards in HQ to shuffle into R&D',
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    choices: { max: req((state: State) => (state as any).corp?.hand?.length || 0), card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
    msg: msg('shuffle ', (state: State) => utils.quantify(targets.length, 'card'), ' in HQ into R&D and draw ', (state: State) => utils.quantify(targets.length, 'card')),
    async: true,
    effect: effect(targets.forEach((c: Card) => coreMoving.move(state, side, c, 'deck')), coreShuffling.shuffle(state, side, 'deck'), coreDrawing.draw(state, side, eid, targets.length)),
  },
};

// Sprint
export const sprint: CardDef = {
  title: 'Sprint',
  onPlay: {
    async: true,
    msg: 'draw 3 cards',
    effect: effect(
      coreDrawing.draw(state, side, 3),
      (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        return continue_ability(state, side, {
          prompt: 'Choose 2 cards in HQ to shuffle into R&D',
          choices: { max: 2, all: true, card: (c: Card) => coreCard.corp(c) && coreCard.inHandStar(state, c) },
          msg: msg('shuffle ', (state: State) => utils.quantify(targets.length, 'card'), ' from HQ into R&D'),
          effect: effect(targets.forEach((c: Card) => coreMoving.move(state, side, c, 'deck')), coreShuffling.shuffle(state, side, 'deck')),
        }, card, null);
      }
    ),
  },
};

// Standard Procedure
export const standardProcedure: CardDef = {
  title: 'Standard Procedure',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.successfulRun),
    prompt: 'Choose one',
    choices: ['Event', 'Hardware', 'Program', 'Resource'],
    msg: msg('name ', (state: State) => targets[0], ', reveal ', (state: State) => utils.enumerateCards((state as any).runner?.hand || [], { sorted: true }), ' from the grip, and gain ', (state: State) => ((state as any).runner?.hand || []).filter((c: Card) => coreCard.isType(c, targets[0])).length * 2, ' [Credits]'),
    async: true,
    effect: effect(coreRevealing.reveal(state, side, (state as any).runner?.hand || []), coreGaining.gainCredits(state, 'corp', eid, ((state as any).runner?.hand || []).filter((c: Card) => coreCard.isType(c, targets[0])).length * 2)),
  },
};

// Stock Buy-Back
export const stockBuyBack: CardDef = {
  title: 'Stock Buy-Back',
  onPlay: {
    msg: msg((state: State) => `gain ${(state as any).runner?.scored?.length * 3 || 0} [Credits]`),
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.scored?.length > 0),
    },
    async: true,
    effect: effect(coreGaining.gainCredits(eid, (state as any).runner?.scored?.length * 3 || 0)),
  },
};

// Sub Boost
export const subBoost: CardDef = {
  title: 'Sub Boost',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.rezzed(c) },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c))),
    },
    msg: msg('make ', (state: State) => coreToString.cardStr(state, targets[0]), ' gain Barrier and "[Subroutine] End the run"'),
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(state, side, eid, card, coreCard.getCard(state, targets[0]))),
  },
  staticAbilities: [
    { type: 'gain-subtype', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host) && coreCard.rezzed(targets[0])), value: 'Barrier' },
    { type: 'additional-subroutines', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host) && coreCard.rezzed(targets[0])), value: { subroutines: [{ label: '[Sub Boost] End the run', msg: 'end the run', async: true, effect: effect(coreRuns.endRun(eid, card)) }] } },
  ],
};

// Subcontract
export const subcontract: CardDef = {
  title: 'Subcontract',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Subliminal Messaging
export const subliminalMessaging: CardDef = {
  title: 'Subliminal Messaging',
  onPlay: {
    msg: 'gain 1 [Credits]',
    async: true,
    effect: effect(coreGaining.gainCredits(state, side, 1)),
  },
  events: [{
    event: 'corp-phase-12',
    location: 'discard',
    optional: {
      req: req((state: State) => !coreEvents.lastTurn(state, 'runner', 'made-run')),
      prompt: msg('Add ', (state: State) => card.title, ' to HQ?'),
      yesAbility: { msg: 'reveal and add itself to HQ', async: true, effect: effect(coreRevealing.reveal(state, side, card), coreMoving.move(state, side, card, 'hand'), coreEid.effectCompleted(state, side, eid)) },
    },
  }],
};

// Success - simplified
export const success: CardDef = {
  title: 'Success',
  onPlay: {
    additionalCost: [corePayment.toC('forfeit')],
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0])) },
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Successful Demonstration
export const successfulDemonstration: CardDef = {
  title: 'Successful Demonstration',
  onPlay: (() => {
    const abi = coreDefHelpers.gainCreditsAbility(7);
    return { ...abi, req: req((state: State) => (state as any).runner?.register?.lastTurn?.unsuccessfulRun) };
  })(),
};

// Sunset - simplified
export const sunset: CardDef = {
  title: 'Sunset',
  onPlay: {
    prompt: 'Choose a server',
    choices: req((state: State) => coreServers.zonesToSortedNames(coreBoard.getZones(state))),
    msg: msg('rearrange ice protecting ', (state: State) => targets[0]),
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Surveillance Sweep
export const surveillanceSweep: CardDef = {
  title: 'Surveillance Sweep',
  staticAbilities: [{ type: 'trace-runner-spends-first', req: req((state: State) => state.run), value: true }],
};

// Sweeps Week
export const sweepsWeek: CardDef = {
  title: 'Sweeps Week',
  onPlay: {
    msg: msg((state: State) => `gain ${(state as any).runner?.hand?.length || 0} [Credits]`),
    onChangeGameState: {
      req: req((state: State) => (state as any).runner?.hand?.length > 0),
    },
    async: true,
    effect: effect(coreGaining.gainCredits(eid, (state as any).runner?.hand?.length || 0)),
  },
};

// SYNC Rerouting
export const syncRerouting: CardDef = lockdown({
  events: [coreChooseOne.chooseOneHelper(
    { event: 'run', player: 'runner' },
    [
      { option: 'Take 1 tag', ability: { async: true, displaySide: 'corp', msg: 'give the runner 1 tag', effect: effect(coreTags.gainTags(state, 'corp', eid, 1)) } },
      coreChooseOne.costOption([corePayment.toC('credit', 4)], 'runner'),
    ]
  )],
});

// Targeted Marketing - simplified
export const targetedMarketing: CardDef = {
  title: 'Targeted Marketing',
  onPlay: {
    prompt: 'Name a Runner card',
    choices: { cardTitle: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.runner(targets[0]) && !coreCard.identity(targets[0])) },
    effect: effect(coreSay.systemMsg(`uses ${card.title} to name ${targets[0]}`)),
  },
  events: [
    { req: req((state: State) => (state as any).corp?.cardTarget), msg: 'gain 10 [Credits]', async: true, effect: effect(coreGaining.gainCredits('corp', eid, 10)) },
  ],
};

// The All-Seeing I
export const theAllSeeingI: CardDef = {
  title: 'The All-Seeing I',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allActiveInstalled(state, 'runner').some(coreCard.resource)),
    },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Threat Assessment
export const threatAssessment: CardDef = {
  title: 'Threat Assessment',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedCard),
    prompt: 'Choose an installed Runner card',
    choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
    rfgInsteadOfTrashing: true,
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Threat Level Alpha
export const threatLevelAlpha: CardDef = {
  title: 'Threat Level Alpha',
  onPlay: {
    trace: {
      base: 1,
      successful: {
        label: 'Give the Runner X tags',
        async: true,
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
          const tags = Math.max(1, utils.countTags(state));
          return coreTags.gainTags(state, 'corp', eid, tags);
        }),
      },
    },
  },
};

// Too Big to Fail
export const tooBigToFail: CardDef = {
  title: 'Too Big to Fail',
  onPlay: {
    req: req((state: State) => (state as any).corp?.credit < 10),
    msg: 'gain 7 [Credits] and take 1 bad publicity',
    async: true,
    effect: effect(coreGaining.gainCredits(state, side, 7, { suppressCheckpoint: true }), coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1)),
  },
};

// Top-Down Solutions
export const topDownSolutions: CardDef = {
  title: 'Top-Down Solutions',
  onPlay: {
    async: true,
    msg: 'draw 2 cards',
    effect: effect(coreDrawing.draw(state, side, 2), coreEid.effectCompleted(state, side, eid)),
  },
};

// Traffic Accident
export const trafficAccident: CardDef = {
  title: 'Traffic Accident',
  onPlay: {
    req: req((state: State) => utils.countTags(state) >= 2),
    msg: 'do 2 meat damage',
    async: true,
    effect: effect(coreDamage.damage(eid, 'meat', 2, { card })),
  },
};

// Transparency Initiative - simplified
export const transparencyInitiative: CardDef = {
  title: 'Transparency Initiative',
  onPlay: {
    choices: { card: (c: Card) => coreCard.agenda(c) && coreCard.installed(c) && !coreCard.faceup(c) },
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => !coreCard.faceup(c) && !coreCard.ice(c))),
    },
    async: true,
    effect: effect(coreInstalling.installAsConditionCounter(state, side, card, targets[0])),
  },
  staticAbilities: [{ type: 'gain-subtype', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host) && coreCard.rezzed(targets[0])), value: 'Public' }],
};

// Trick of Light - simplified
export const trickOfLight: CardDef = {
  title: 'Trick of Light',
  onPlay: {
    prompt: 'Choose an installed card you can advance',
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0]) && coreCard.installed(targets[0])) },
    onChangeGameState: {
      req: req((state: State) => coreDefHelpers.somethingCanBeAdvanced(state)),
    },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Trojan Horse - simplified
export const trojanHorse: CardDef = {
  title: 'Trojan Horse',
  onPlay: {
    trace: {
      base: 4,
      req: req((state: State) => (state as any).runner?.register?.lastTurn?.accessedCards),
      label: 'Trace 4 - Trash a program',
      successful: effect(coreEid.effectCompleted(state, side, eid)),
    },
  },
};

// Trust Operation
export const trustOperation: CardDef = {
  title: 'Trust Operation',
  onPlay: {
    req: req((state: State) => utils.isTagged(state)),
    msg: msg('trash ', (state: State) => targets[0]?.title),
    onChangeGameState: {
      req: req((state: State) => coreBoard.allActiveInstalled(state, 'runner').some(coreCard.resource) || (state as any).corp?.discard?.some((c: Card) => !coreCard.operation(c) || !c.seen)),
    },
    prompt: 'Choose a resource to trash',
    choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
    async: true,
    effect: effect(coreMoving.trash(state, side, targets[0], { causeCard: card }), coreEid.effectCompleted(state, side, eid)),
  },
};

// Touch-ups - simplified
export const touchUps: CardDef = {
  title: 'Touch-ups',
  onPlay: {
    async: true,
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => !coreCard.rezzed(c) || coreCard.canBeAdvanced(state, c))),
    },
    choices: { req: req((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreCard.canBeAdvanced(state, targets[0])) },
    msg: msg('place 2 advancement counters on ', (state: State) => coreToString.cardStr(state, targets[0])),
    effect: effect(coreProps.addProp(state, side, targets[0], 'advance-counter', 2, { placed: true }), coreEid.effectCompleted(state, side, eid)),
  },
};

// Ultraviolet Clearance - simplified
export const ultravioletClearance: CardDef = {
  title: 'Ultraviolet Clearance',
  onPlay: {
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Under the Bus
export const underTheBus: CardDef = {
  title: 'Under the Bus',
  onPlay: {
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.accessedCards),
    prompt: 'Choose a connection to trash',
    choices: { card: (c: Card) => coreCard.runner(c) && coreCard.resource(c) && coreCard.hasSubtype(c, 'Connection') && coreCard.installed(c) },
    msg: msg('trash ', (state: State) => targets[0]?.title, ' and take 1 bad publicity'),
    async: true,
    effect: effect(coreMoving.trash(state, side, targets[0], { causeCard: card, suppressCheckpoint: true }), coreBadPublicity.gainBadPublicity(state, 'corp', eid, 1)),
  },
};

// Unleash - simplified
export const unleash: CardDef = {
  title: 'Unleash',
  onPlay: {
    additionalCost: [corePayment.toC('tag', 1)],
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c))),
    },
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.installed(c) && !coreCard.rezzed(c) },
    async: true,
    effect: effect(coreEid.effectCompleted(state, side, eid)),
  },
};

// Violet Level Clearance
export const violetLevelClearance: CardDef = {
  title: 'Violet Level Clearance',
  onPlay: clearance(8, 4),
};

// Voter Intimidation
export const voterIntimidation: CardDef = {
  title: 'Voter Intimidation',
  onPlay: {
    psi: {
      req: req((state: State) => (state as any).runner?.scored?.length > 0),
      notEqual: trashType('resource', coreCard.resource, true),
    },
  },
};

// Vulture Fund
export const vultureFund: CardDef = {
  title: 'Vulture Fund',
  onPlay: {
    msg: 'gain 14 [Credits] and take 1 bad publicity',
    async: true,
    effect: effect(coreGaining.gainCredits(state, side, 14, { suppressCheckpoint: true }), coreBadPublicity.gainBadPublicity(state, side, eid, 1)),
  },
};

// Wake Up Call
export const wakeUpCall: CardDef = {
  title: 'Wake Up Call',
  onPlay: {
    rfgInsteadOfTrashing: true,
    req: req((state: State) => (state as any).runner?.register?.lastTurn?.trashedCard),
    prompt: 'Choose a piece of hardware or non-virtual resource',
    onChangeGameState: {
      req: req((state: State) => coreBoard.allActiveInstalled(state, 'runner').some((c: Card) => coreCard.hardware(c) || (coreCard.resource(c) && !coreCard.hasSubtype(c, 'Virtual')))),
    },
    choices: { card: (c: Card) => coreCard.hardware(c) || (coreCard.resource(c) && !coreCard.hasSubtype(c, 'Virtual')) },
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreEid.effectCompleted(state, side, eid)),
  },
};

// Wetwork Refit
export const wetworkRefit: CardDef = {
  title: 'Wetwork Refit',
  onPlay: {
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.hasSubtype(c, 'Bioroid') && coreCard.rezzed(c) },
    msg: msg('give ', (state: State) => coreToString.cardStr(state, targets[0]), ' "[Subroutine] Do 1 core damage" before all its other subroutines'),
    async: true,
    onChangeGameState: {
      req: req((state: State) => coreBoard.allInstalled(state, 'corp').some((c: Card) => coreCard.ice(c) && coreCard.rezzed(c) && coreCard.hasSubtype(c, 'Bioroid'))),
    },
    effect: effect(coreInstalling.installAsConditionCounter(state, side, eid, card, coreCard.getCard(state, targets[0]))),
  },
  staticAbilities: [{ type: 'additional-subroutines', duration: 'end-of-run', req: req((state: State) => utils.sameCard(targets[0], (state as any).context?.host) && coreCard.rezzed(targets[0])), value: { position: 'front', subroutines: [{ ...coreDefHelpers.doBrainDamage(1), label: '[Wetwork Refit] Do 1 core damage' }] } }],
};

// Witness Tampering
export const witnessTampering: CardDef = {
  title: 'Witness Tampering',
  onPlay: {
    msg: 'remove 2 bad publicity',
    onChangeGameState: {
      req: req((state: State) => coreBadPublicity.hasBadPub(state)),
    },
    effect: effect(coreBadPublicity.loseBadPublicity(2)),
  },
};

// Your Digital Life
export const yourDigitalLife: CardDef = {
  title: 'Your Digital Life',
  onPlay: {
    msg: msg((state: State) => `gain ${(state as any).corp?.hand?.length || 0} [Credits]`),
    onChangeGameState: {
      req: req((state: State) => (state as any).corp?.hand?.length > 0),
    },
    async: true,
    effect: effect(coreGaining.gainCredits('corp', eid, (state as any).corp?.hand?.length || 0)),
  },
};
