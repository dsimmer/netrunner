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
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';

// Import defcard helper - each card is a card definition object
import { defcard } from '../core/def_helpers';
import type { CardDef } from '../../types';

import { makeIcon, runAnyServerAbility, runServerAbility, scry } from './events_1';
import { deepDiveAccess } from './events_3';

// Carpe Diem
export const carpeDiem: CardDef = {
  title: 'Carpe Diem',
  makesRun: true,
  events: [coreMark.markChangedEvent as any],
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, coreMark.identifyMarkAbility as any, card, null as any)],
        []
      );
      const markedServer = (state as any).mark;
      (state as any).runner[card.title as string] = coreServers.centralToName(markedServer);
      coreSay.systemMsg(state, side, `uses ${card.title} to gain 4 [Credits]`);
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', 4)], []);
      yield continue_ability(
        state,
        side,
        {
          optional: {
            prompt: `Run on ${coreServers.zoneToName(markedServer)}?`,
            noAbility: {
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(state, side, `declines to use ${card.title} to make a run`); }),
            },
            yesAbility: {
              msg: `make a run on ${coreServers.zoneToName(markedServer)}`,
              async: true,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRuns.makeRun(state, side, eid, markedServer, card); }),
            },
          },
        },
        card,
        null
      );
    }),
  },
};

// CBI Raid
export const cbiRaid: CardDef = {
  title: 'CBI Raid',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    mandatory: true,
    thisCardRun: true,
    ability: {
      msg: 'force the Corp to add all cards in HQ to the top of R&D',
      player: 'corp',
      waitingPrompt: true,
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(
          (() => {
            const from = (state as any).corp?.hand || [];
            if (from.length > 0) {
              return cbiChoice(from, [], from.length, from);
            }
          })(),
          card,
          null
        ); }),
    },
  }],
};

function cbiChoice(remaining: Card[], chosen: Card[], n: number, original: Card[]): any {
  return {
    player: 'corp',
    prompt: 'Choose a card to move next onto R&D',
    choices: remaining.map((c: Card) => c.title),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const target: any = targets?.[0];
      const targetCard = remaining.find((c: Card) => c.title === target) ?? target;
      continue_ability(
        (() => {
          const newChosen = [targetCard, ...chosen];
          if (newChosen.length < n) {
            return cbiChoice(remaining.filter((c: Card) => c.title !== targetCard.title), newChosen, n, original);
          }
          return cbiFinal(newChosen, original);
        })(),
        card,
        null
      );
    }),
  };
}

function cbiFinal(chosen: Card[], original: Card[]): any {
  return {
    player: 'corp',
    prompt: `The top cards of R&D will be ${chosen.map((c: Card) => c.title).join(', ')}`,
    choices: ['Done', 'Start over'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target: any = targets?.[0];
      if (target === 'Done') {
        for (const c of chosen.reverse()) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck', { front: true })], []);
        }
        coreSay.systemMsg(state, side, `The top cards of R&D are ${chosen.map((c: Card) => c.title).join(', ')}`, { logSide: 'corp' });
        return coreEid.effectCompleted(state, side, eid);
      } else {
        const from = (state as any).corp?.hand || [];
        yield continue_ability(state, side, cbiChoice(from, [], from.length, from), card, null);
      }
    }),
  };
}

// Chain Reaction
export const chainReaction: CardDef = {
  title: 'Chain Reaction',
  onPlay: {
    async: true,
    onChangeGameState: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return (coreBoard.allInstalled(state, 'corp') || []).length > 0 ||
             (coreBoard.allInstalled(state, 'runner') || []).length > 0;
    })},
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if ((coreBoard.allInstalled(state, 'corp') || []).length > 0) {
        yield continue_ability(
          state,
          side,
          {
            prompt: 'choose cards to trash',
            async: true,
            choices: { card: (c: Card) => coreCard.corp(c) && coreCard.installed(c), max: (() => 2) as any, all: true },
            waitingPrompt: true,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(state, 'corp', {
              player: 'corp',
              prompt: 'Choose a Runner card to trash',
              async: true,
              req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return (coreBoard.allInstalled(state, 'runner') || []).length > 0; }),
              choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
              waitingPrompt: true,
              displaySide: 'corp',
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(state, 'corp', eid, targets?.[0]); }),
            }, card, null); }),
          },
          card,
          null
        );
      } else {
        yield continue_ability(
          state,
          'corp',
          {
            player: 'corp',
            prompt: 'Choose a Runner card to trash',
            async: true,
            choices: { card: (c: Card) => coreCard.runner(c) && coreCard.installed(c) },
            waitingPrompt: true,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(state, 'corp', eid, targets?.[0]); }),
          },
          card,
          null
        );
      }
    }),
  },
};

// Charm Offensive
export const charmOffensive: CardDef = {
  title: 'Charm Offensive',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [
    {
      event: 'breach-server',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx?.server === 'archives';
      }),
      silent: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        coreUpdate.updateIn(card as any, ['special', 'accessed'], (s: any) => [
          ...(s || []),
          ...((state as any).corp?.discard || []).map((c: Card) => c.title).filter(Boolean),
        ]);
      }),
    },
    {
      event: 'access-card',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return coreCard.inDiscard(ctx?.accessedCard);
      }),
      silent: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
        const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        coreUpdate.updateIn(card as any, ['special', 'accessed'], (s: any) => [...(s || []), ctx.accessedCard.title]);
      }),
    },
    {
      event: 'run-ends',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return ((coreCard.getCard(state, card) as any)?.special?.accessed?.length || 0) > 0; }),
      async: true,
      interactive: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return true; }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const rezzedTitles = (coreBoard.allInstalled(state, 'corp') || [])
          .filter((c: Card) => coreCard.rezzed(c))
          .map((c: Card) => c.title);
        const accessedTitles = (coreCard.getCard(state, card) as any)?.special?.accessed || [];
        const intersection = (rezzedTitles as string[]).filter((t: string) => (accessedTitles as string[]).includes(t));
        if (intersection.length > 0) {
          yield continue_ability(
            state,
            side,
            {
              async: true,
              prompt: 'Trash a rezzed copy of a card you accessed',
              choices: { card: (c: Card) => coreCard.rezzed(c) && !!c.title && intersection.includes(c.title) },
              msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, targets?.[0])),
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(state, side, eid, targets?.[0], { causeCard: card }); }),
            },
            card,
            null
          );
        } else {
          return coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Chastushka
export const chastushka: CardDef = {
  title: 'Chastushka',
  makesRun: true,
  onPlay: runServerAbility('hq'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'hq',
    thisCardRun: true,
    mandatory: true,
    ability: coreSabotage.sabotageAbility(4),
  }],
};

// Chrysopoeian Skimming
export const chrysopoeianSkimming: CardDef = {
  title: 'Chrysopoeian Skimming',
  onPlay: {
    prompt: 'Choose an agenda to reveal',
    player: 'corp',
    waitingPrompt: true,
    choices: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const agendas = (state as any).corp?.hand?.filter((c: Card) => coreCard.agenda(c)) || [];
      return [...agendas.map((c: Card) => c.title), 'Done'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target: any = targets?.[0];
      if (target === 'Done') {
        coreSay.systemMsg(state, 'corp', 'declines to reveal an agenda from HQ');
        scry(state, 'runner', card, 'corp', 3);
      } else {
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreRevealing.revealLoud(state, side, eid, card, { forced: true }, target)],
          []
        );
        yield continue_ability(
          state,
          'runner',
          {
            msg: 'gain [Click] and draw 1 card',
            async: true,
            effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainClicks(state, 'runner', 1); coreDrawing.draw(state, 'runner', eid, 1); }),
          },
          card,
          null
        );
      }
    }),
  },
};

// Clean Getaway
export const cleanGetaway: CardDef = {
  title: 'Clean Getaway',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'successful-run',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return forms.thisCardRun; }),
    msg: 'gain 6 [Credits]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, 'runner', eid, 6); }),
  }],
};

// Code Siphon
export const codeSiphon: CardDef = {
  title: 'Code Siphon',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run-replace-breach',
    targetServer: 'rd',
    thisCardRun: true,
    ability: {
      async: true,
      prompt: 'Choose a program to install',
      msg: msg('install ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => (targets?.[0] as any)?.title ?? '', ' and take 1 tag'),
      choices: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const rdIce = -3 * ((state as any).corp?.servers?.rd?.ices?.length || 0);
        return (state as any).runner?.deck?.filter((c: Card) =>
          coreCard.program(c) &&
          coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, c, { costBonus: rdIce })
        ) || [];
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const target: any = targets?.[0];
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.triggerEvent(state, side, 'searched-stack')], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            (coreInstalling.runnerInstall as any)(state, side, eid, target, {
              costBonus: -3 * ((state as any).corp?.servers?.rd?.ices?.length || 0),
              msgKeys: { installSource: card, displayOrigin: true },
            })
          ],
          []
        );
        yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, side, eid, 1)], []);
      }),
    },
  }],
};

// Cold Read
export const coldRead: CardDef = {
  title: 'Cold Read',
  implementation: 'Used programs restriction not enforced',
  makesRun: true,
  data: { counter: { credit: 4 } },
  onPlay: runAnyServerAbility(),
  interactions: {
    'pay-credits': { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return forms.run(state); }), type: 'credit' },
  },
  events: [{
    event: 'run-ends',
    prompt: 'Choose a program that was used during the run',
    choices: { card: (c: Card) => coreCard.program(c) && coreCard.installed(c) },
    msg: msg('trash ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => (targets?.[0] as any)?.title ?? ''),
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(state, side, eid, targets?.[0], { unpreventable: true, causeCard: card }); }),
  }],
};

// Compile
export const compile: CardDef = {
  title: 'Compile',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'encounter-ice',
    skippable: true,
    optional: {
      prompt: 'Install a program?',
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreEvents.firstRunEvent(state, side, 'encounter-ice'); }),
      yesAbility: {
        async: true,
        prompt: 'Choose where to install the program from',
        choices: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
          return coreCard.zoneLocked(state, 'runner', 'discard')
            ? ['Stack']
            : ['Stack', 'Heap'];
        }),
        effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { continue_ability(
          compileFn(targets?.[0] === 'Stack' ? 'deck' : 'discard'),
          card,
          null
        ); }),
      },
    },
  }],
};

function compileFn(where: string): any {
  return {
    prompt: 'Choose a program to install',
    choices: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return corePrompts.cancellable(
        (state as any).runner?.[where]?.filter((c: Card) => coreCard.program(c)) || []
      );
    })},
    async: true,
    cancel: where === 'deck' ? coreShuffling.failToFind! : undefined,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target: any = targets?.[0];
      if (where === 'deck') {
        yield wait_for(state, [{ asyncResult: 'result' }, coreEngine.triggerEvent(state, side, 'searched-stack')], []);
        yield wait_for(state, [{ asyncResult: 'result' }, coreShuffling.shuffle(state, side, 'deck')], []);
      }
      yield wait_for(
        state,
        [{ asyncResult: 'result' },
          (coreInstalling.runnerInstall as any)(state, side, eid, target, {
            ignoreAllCost: true,
            msgKeys: { displayOrigin: true, installSource: card },
          })
        ],
        []
      );
      if (target) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: 'icon',
          duration: 'end-of-run',
          req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return utils.sameCard(target, target); }),
          value: makeIcon('C', card),
        });
        coreEngine.registerEvents(state, side, card, [{
          duration: 'end-of-run',
          event: 'run-ends',
          interactive: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return true; }),
          onChangeGameState: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreCard.installed(coreCard.getCard(state, target)); }), silent: true },
          msg: msg('move ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => coreToString.cardStr(state, target), ' to the bottom of the stack'),
          effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.move(state, side, target, 'deck'); }),
        } as any]);
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  };
}

// Concerto
export const concerto: CardDef = {
  title: 'Concerto',
  makesRun: true,
  interactions: {
    'pay-credits': { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return forms.run(state); }), type: 'credit' },
  },
  onPlay: {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const deck = (state as any).runner?.deck || [];
      const topCard = deck[0];
      if (topCard) {
        yield wait_for(
          state,
          [{ asyncResult: 'result' }, coreRevealing.reveal(state, side, topCard)],
          []
        );
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreProps.addCounter(state, side, card, 'credit', topCard.cost || 0, { placed: true })
          ],
          []
        );
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'runner', topCard, 'hand')], []);
      }
      yield continue_ability(state, side, runAnyServerAbility(), (coreCard.getCard(state, card) ?? card) as Card, null);
    }),
  },
};

// Contaminate
export const contaminate: CardDef = {
  title: 'Contaminate',
  onPlay: {
    msg: msg('place 3 virus counters on ', (state: State, side: Side, eid: EID, card: Card, targets: any[]) => (targets?.[0] as any)?.title ?? ''),
    choices: {
      req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.installed(t) && coreCard.runner(t) && coreVirus.getVirusCounters(state, t) === 0;
      }),
    },
    onChangeGameState: { req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      return (coreBoard.allActiveInstalled(state, 'runner') || []).some((c: Card) => coreVirus.getVirusCounters(state, c) === 0);
    })},
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { (coreProps.addCounter as any)(state, 'runner', eid, targets?.[0], 'virus', 3, null); }),
  },
};

// Corporate "Grant"
export const corporateGrant: CardDef = {
  title: 'Corporate "Grant"',
  events: [{
    event: 'runner-install',
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> { return coreEvents.firstEvent(state, side, 'runner-install'); }),
    msg: 'force the Corp to lose 1 [Credit]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.lose(state, 'corp', 'credit', 1); }),
  }],
};

// Corporate Scandal
export const corporateScandal: CardDef = {
  title: 'Corporate Scandal',
  onPlay: {
    msg: 'give the Corp 1 additional bad publicity',
    implementation: 'No enforcement that this Bad Pub cannot be removed',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreUpdate.updateIn<number>(state, ['corp', 'bad-publicity', 'additional'], (n) => (n || 0) + 1);
      coreSay.systemMsg(state, side, 'give the Corp 1 additional bad publicity');
    }),
  },
  leavePlay: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreUpdate.updateIn<number>(state, ['corp', 'bad-publicity', 'additional'], (n) => (n || 1) - 1);
  }),
};

// Creative Commission
export const creativeCommission: CardDef = {
  title: 'Creative Commission',
  onPlay: {
    msg: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => {
      const runner = (state as any).runner;
      let result = 'gain 5 [Credits]';
      if (runner.click > 0) result += ' and lose [Click]';
      return result;
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const runner = (state as any).runner;
      if (runner.click > 0) {
        yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.loseClicks(state, 'runner', 1)], []);
      }
      yield wait_for(state, [{ asyncResult: 'result' }, coreGaining.gainCredits(state, 'runner', eid, 5)], []);
    }),
  },
};

// Credit Crash
export const creditCrash: CardDef = {
  title: 'Credit Crash',
  makesRun: true,
  onPlay: runAnyServerAbility(),
  events: [{
    event: 'pre-access-card',
    once: 'per-run',
    async: true,
    req: req(function*(state: any, side: any, eid: any, card: any, targets: any[]): Generator<any, any, any> {
      const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return !coreCard.agenda(ctx?.accessedCard);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      const c = ctx.accessedCard;
      const title = c.title;
      let cost: number;
      if (coreCard.asset(c) || coreCard.upgrade(c) || coreCard.ice(c)) {
        cost = coreCostFns.rezCost(state, side, c) || 0;
      } else if (coreCard.operation(c)) {
        cost = coreCostFns.playCost(state, side, c) || 0;
      } else {
        cost = 0;
      }
      if (corePayment.canPay(state, 'corp', eid, card, null, [corePayment.toC('credit', cost)])) {
        yield continue_ability(
          state,
          'corp',
          {
            optional: {
              waitingPrompt: true,
              prompt: msg(`Spend ${cost} [Credits] to prevent the trash of ${title}?`),
              player: 'corp',
              yesAbility: {
                async: true,
                effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(state, 'corp', `spends ${cost} [Credits] to prevent ${title} from being trashed at no cost`); coreGaining.lose(state, 'corp', 'credit', cost); }),
              },
              noAbility: {
                msg: msg('trash ', () => title, ' at no cost'),
                async: true,
                effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreMoving.trash(state, side, eid, { ...c, seen: true }, { causeCard: card }); }),
              },
            },
          },
          card,
          null
        );
      } else {
        coreSay.systemMsg(state, side, `uses ${card.title} to trash ${title} at no cost`);
        yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.trash(state, side, eid, { ...c, seen: true }, null)], []);
      }
    }),
  }],
};

// Credit Kiting
// Credit Kiting
export const creditKiting: CardDef = {
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.some((s: string) => ['hq', 'rd', 'archives'].includes(s));
    }),
    prompt: 'Choose a card to install',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return !coreCard.event(t) &&
          coreCard.inHandStar(state, t) &&
          coreInstalling.runnerCanPayAndInstall(state, side, { ...eid, source: card }, t, { costBonus: -8 });
      }),
    },
    async: true,
    cancel: {
      msg: 'take 1 tag',
      async: true,
      effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreTags.gainTags(state, 'runner', eid, 1); }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target: any = targets?.[0];
      const newEid = coreEid.makeEid(state, { source: card, sourceType: 'runner-install' } as any);
      yield wait_for(
        state,
        [{ asyncResult: 'result' },
          (coreInstalling.runnerInstall as any)(state, 'runner', newEid, target, {
            msgKeys: { installSource: card, displayOrigin: true },
            costBonus: -8,
            suppressCheckpoint: true,
          })
        ],
        []
      );
      yield wait_for(state, [{ asyncResult: 'result' }, coreTags.gainTags(state, 'runner', eid, 1)], []);
    }),
  },
};

// Cyber Threat
export const cyberThreat: CardDef = {
  title: 'Cyber Threat',
  makesRun: true,
  onPlay: {
    prompt: 'Choose a server',
    choices: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreServers.zonesToSortedNames(coreRuns.getRunnableZones(state, side, eid, card, null));
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const serv: any = targets?.[0];
      const corpInstalled = coreBoard.allInstalled(state, 'corp') || [];
      const canRez = corpInstalled.some((c: Card) =>
        coreCard.installed(c) &&
        !coreCard.rezzed(c) &&
        coreCard.ice(c) &&
        corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', coreCostFns.rezCost(state, side, c) || 0)])
      );
      yield continue_ability(
        state,
        'corp',
        canRez
          ? {
              optional: {
                prompt: `Rez a piece of ice protecting ${serv}?`,
                yesAbility: {
                  async: true,
                  prompt: `Choose a piece of ice protecting ${serv} to rez`,
                  player: 'corp',
                  choices: {
                    card: (c: Card) =>
                      coreCard.installed(c) &&
                      !coreCard.rezzed(c) &&
                      coreCard.ice(c) &&
                      corePayment.canPay(state, side, eid, card, null, [corePayment.toC('credit', coreCostFns.rezCost(state, side, c) || 0)]),
                  },
                  effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreRezzing.rez(state, 'corp', eid, targets?.[0]); }),
                  cancel: {
                    async: true,
                    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { (coreFlags.registerRunFlag as any)(
                        state,
                        side,
                        card,
                        'can-rez',
                        function(state: State, _side: Side, card: Card) {
                          if (coreCard.ice(card)) {
                            coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                            return false;
                          }
                          return true;
                        }
                      ); coreRuns.makeRun(state, side, eid, serv, card); }),
                  },
                },
                noAbility: {
                  async: true,
                  effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { (coreFlags.registerRunFlag as any)(
                      state,
                      side,
                      card,
                      'can-rez',
                      function(state: State, _side: Side, card: Card) {
                        if (coreCard.ice(card)) {
                          coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                          return false;
                        }
                        return true;
                      }
                    ); coreRuns.makeRun(state, side, eid, serv, card); }),
                  msg: `make a run on ${serv} during which no ice can be rezzed`,
                },
              },
            }
          : {
              async: true,
              effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { (coreFlags.registerRunFlag as any)(
                  state,
                  side,
                  card,
                  'can-rez',
                  function(state: State, _side: Side, card: Card) {
                    if (coreCard.ice(card)) {
                      coreToasts.toast(state, 'corp', 'Cannot rez ice on this run due to Cyber Threat');
                      return false;
                    }
                    return true;
                  }
                ); coreRuns.makeRun(state, side, eid, serv, card); }),
              msg: `make a run on ${serv} during which no ice can be rezzed`,
            },
        card,
        null
      );
    }),
  },
};

// Data Breach
export const dataBreach: CardDef = {
  title: 'Data Breach',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'run-ends',
    unregisterOnceResolved: true,
    optional: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
        return ctx.successful &&
          forms.thisCardRun &&
          !coreCard.getCard(state, card)?.special?.runAgain &&
          ctx.server === 'rd';
      }),
      prompt: 'Make another run on R&D?',
      yesAbility: runServerAbility('rd'),
    },
  }],
};

// Day Job
export const dayJob: CardDef = {
  title: 'Day Job',
  onPlay: {
    additionalCost: [corePayment.toC('click', 3)],
    msg: 'gain 10 [Credits]',
    async: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreGaining.gainCredits(state, side, eid, 10); }),
  },
};

// Deep Data Mining
export const deepDataMining: CardDef = {
  title: 'Deep Data Mining',
  makesRun: true,
  onPlay: runServerAbility('rd'),
  events: [{
    event: 'successful-run',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { const ctx: any = ((targets as any[])?.[0] as any)?.context ?? (targets as any[])?.[0];
      return ctx.server === 'rd' && forms.thisCardRun;
    }),
    silent: true,
    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreEngine.registerEvents(
        state,
        side,
        card,
        [coreDefHelpers.breachAccessBonus('rd', Math.max(0, Math.min(4, coreMemory.availableMu(state))), { duration: 'end-of-run' })]
      ); }),
  }],
};

// Deep Dive
export const deepDive: CardDef = {
  title: 'Deep Dive',
  onPlay: {
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const reg = (state as any).runner?.register;
      return reg?.successfulRun?.includes('hq') &&
             reg?.successfulRun?.includes('rd') &&
             reg?.successfulRun?.includes('archives');
    }),
    async: true,
    onChangeGameState: { req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> { return (state as any).corp?.deck?.length > 0; }) },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreSetAside.setAside(state, 'corp', eid, (state as any).corp?.deck?.slice(0, 8) || []);
      const top8 = (coreSetAside.getSetAside(state, 'corp', eid) || []).sort((a: Card, b: Card) => (a.title || '').localeCompare(b.title || ''));
      coreSay.systemMsg(state, side, `uses ${card.title} to set aside ${top8.map((c: Card) => c.title).join(', ')} from the top of R&D`);
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, { async: true, prompt: `The set aside cards are: ${top8.map((c: Card) => c.title).join(', ')}`, choices: ['OK'] }, card, null)],
        []
      );
      yield wait_for(
        state,
        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, deepDiveAccess(top8), card, null as any)],
        []
      );
      const target: any = targets?.[0];
      if (target) {
        yield wait_for(
          state,
          [{ asyncResult: 'result' },
            coreEngine.resolveAbility(
              state,
              side,
              {
                optional: {
                  prompt: 'Pay [Click] to access another card?',
                  req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                    return corePayment.canPay(state, 'runner', { ...eid, source: card, sourceType: 'ability' }, card, null, [corePayment.toC('click', 1)]);
                  }),
                  noAbility: {
                    effect: effect((state: State, side: Side, eid: EID, card: Card, targets: any[]) => { coreSay.systemMsg(state, side, `declines to use ${card.title} to access another card`); }),
                  },
                  yesAbility: {
                    async: true,
                    cost: [corePayment.toC('click', 1)],
                    msg: 'access another card',
                    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
                      const innerTarget: any = targets?.[0];
                      yield wait_for(
                        state,
                        [{ asyncResult: 'result' }, coreEngine.resolveAbility(state, side, deepDiveAccess(innerTarget), card, null as any)],
                        []
                      );
                      return coreEid.effectCompleted(state, side, eid);
                    }),
                  },
                },
              } as any,
              card,
              null as any
            )
          ],
          []
        );
        for (const c of coreSetAside.getSetAside(state, 'corp', eid) || []) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck')], []);
        }
        coreShuffling.shuffle(state, 'corp', 'deck');
      } else {
        for (const c of coreSetAside.getSetAside(state, 'corp', eid) || []) {
          yield wait_for(state, [{ asyncResult: 'result' }, coreMoving.move(state, 'corp', c, 'deck')], []);
        }
        coreShuffling.shuffle(state, 'corp', 'deck');
      }
      return coreEid.effectCompleted(state, side, eid);
    }),
  },
};
