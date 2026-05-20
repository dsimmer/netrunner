/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains card definitions for cards alphabetically after "TMI"
 * that were skipped in the initial conversion.
 */

import type { Card, CardDef, EID, Side, State } from '../../types';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreDamage from '../core/damage';
import * as coreDefHelpers from '../core/def_helpers';
import * as coreDrawing from '../core/drawing';
import * as coreEffects from '../core/effects';
import * as coreEid from '../core/eid';
import * as coreEngine from '../core/engine';
import * as coreEvents from '../core/events';
import * as coreFlags from '../core/flags';
import * as coreGaining from '../core/gaining';
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as corePrompts from '../core/prompts';
import * as coreRevealing from '../core/revealing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreShuffling from '../core/shuffling';
import * as coreTags from '../core/tags';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability } from '../macros';
import { constellationIce, morphIce, zeroToHero } from './_helpers';
import {
  bioraidBreak,
  cannotStealOrTrashSub,
  doPsi,
  drawUpToSub,
  endTheRun,
  endTheRunUnlessCorpPays,
  endTheRunUnlessRunnerPays,
  gainCreditsSub,
  gainPowerCounter,
  harmonicIceCount,
  powerCounterAbility,
  resolveAnotherSubroutine,
  runnerLosesClick,
  runnerLosesCredits,
  runnerTrashInstalledSub,
  takeBadPub,
  tagTrace,
  traceAbility,
  trashHardwareSub,
  trashInstalledSub,
  trashProgramSub,
  variableSubsIce,
} from './ice_1';

// Local stubs (mirrors pattern used in ice_2.ts / ice_7.ts)
function spaceIce(..._args: any[]): any { return {}; }

// Tollbooth
export const tollbooth: CardDef = {
  title: 'Tollbooth',
  'on-encounter': {
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const result: any = yield wait_for(state, [{ asyncResult: 'result' },
        corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card,
          [corePayment.toC('credit', 3)])], []);
      if (result?.['cost-paid']) {
        coreSay.systemMsg(state, ':runner',
          `${result.msg} on encountering ${(card as any).title}`);
        coreEid.effectCompleted(state, side, eid);
      } else {
        coreSay.systemMsg(state, ':corp',
          `uses ${(card as any).title} to end the run`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }
    }),
  },
  subroutines: [endTheRun],
};

// Tour Guide
export const tourGuide: CardDef = (() => {
  return {
    title: 'Tour Guide',
    ...variableSubsIce(
      (state: State) => coreBoard.allActiveInstalled(state as any, ':corp')
        .filter((c: Card) => coreCard.asset(c)).length,
      endTheRun,
    ),
  };
})();

// Trebuchet
export const trebuchet: CardDef = {
  title: 'Trebuchet',
  'on-rez': takeBadPub,
  subroutines: [trashInstalledSub, traceAbility(6, cannotStealOrTrashSub)],
};

// Tribunal
export const tribunal: CardDef = {
  title: 'Tribunal',
  subroutines: [runnerTrashInstalledSub, runnerTrashInstalledSub, runnerTrashInstalledSub],
};

// Tsurugi
export const tsurugi: CardDef = {
  title: 'Tsurugi',
  subroutines: [
    endTheRunUnlessCorpPays(corePayment.toC('credit', 1)),
    coreDefHelpers.doNetDamage(1),
    coreDefHelpers.doNetDamage(1),
    coreDefHelpers.doNetDamage(1),
  ],
};

// Turnpike
export const turnpike: CardDef = {
  title: 'Turnpike',
  'on-encounter': runnerLosesCredits(1),
  subroutines: [tagTrace(5)],
};

// Tyrant
export const tyrant: CardDef = {
  title: 'Tyrant',
  ...zeroToHero(endTheRun),
};

// Universal Connectivity Fee
export const universalConnectivityFee: CardDef = {
  title: 'Universal Connectivity Fee',
  subroutines: [{
    label: 'Force the Runner to lose credits',
    async: true,
    msg: msg(function(state: State) {
      return `force the Runner to lose ${(state as any).runner?.tag?.base > 0 || (state as any).tagged
        ? 'all credits and trash itself'
        : '1 [Credits]'}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const tagged = (state as any).runner?.tag?.base > 0 || (state as any).tagged;
      if (tagged) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), ':all' as any)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
        coreRuns.encounterEnds(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', eid, 1)], []);
      }
    }),
  }],
};

// Upayoga
export const upayoga: CardDef = {
  title: 'Upayoga',
  subroutines: [
    doPsi(runnerLosesCredits(2)),
    resolveAnotherSubroutine(
      (c: Card) => !!coreCard.hasSubtype(c, 'Psi'),
      'Resolve a subroutine on a rezzed psi ice',
      true,
    ),
  ],
};

// Uroboros
export const uroboros: CardDef = {
  title: 'Uroboros',
  subroutines: [
    traceAbility(4, {
      label: 'Prevent the Runner from making another run this turn',
      msg: 'prevent the Runner from making another run this turn',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':cannot-run',
          duration: ':end-of-turn',
          value: true,
        } as any);
      }),
    }),
    traceAbility(4, endTheRun),
  ],
};

// Týr
export const tyr: CardDef = {
  title: 'Týr',
  subroutines: [
    coreDefHelpers.doBrainDamage(2),
    coreDefHelpers.combineAbilities(trashInstalledSub, gainCreditsSub(3)),
    endTheRun,
  ],
  'runner-abilities': [bioraidBreak(1, 1, {
    'additional-ability': {
      effect: req(function*(state: State): Generator<any, any, any> {
        const corp = (state as any).corp;
        corp['extra-click-temp'] = (corp['extra-click-temp'] || 0) + 1;
      }),
    },
  })],
};

// Vampyronassa
export const vampyronassa: CardDef = {
  title: 'Vampyronassa',
  subroutines: [
    runnerLosesCredits(2),
    gainCreditsSub(2),
    coreDefHelpers.doNetDamage(2),
    drawUpToSub(2, { 'allow-zero-draws': true }),
  ],
};

// Vanilla
export const vanilla: CardDef = {
  title: 'Vanilla',
  subroutines: [endTheRun],
};

// Vasilisa
export const vasilisa: CardDef = {
  title: 'Vasilisa',
  'on-encounter': Object.assign({}, coreDefHelpers.placeAdvancementCounter(true), {
    cost: [corePayment.toC('credit', 1)],
  }),
  subroutines: [coreDefHelpers.giveTags(1)],
};

// Veritas
export const veritas: CardDef = {
  title: 'Veritas',
  subroutines: [
    gainCreditsSub(2),
    runnerLosesCredits(2),
    traceAbility(2, coreDefHelpers.giveTags(1)),
  ],
};

// Viktor 1.0
export const viktor10: CardDef = {
  title: 'Viktor 1.0',
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Viktor 2.0
export const viktor20: CardDef = {
  title: 'Viktor 2.0',
  abilities: [powerCounterAbility(coreDefHelpers.doBrainDamage(1))],
  subroutines: [traceAbility(2, gainPowerCounter), endTheRun],
  'runner-abilities': [bioraidBreak(2, 2)],
};

// Vikram 1.0
export const vikram10: CardDef = {
  title: 'Vikram 1.0',
  implementation: 'Program prevention is not implemented',
  subroutines: [
    { msg: 'prevent the Runner from using programs for the remainder of this run' },
    traceAbility(4, coreDefHelpers.doBrainDamage(1)),
    traceAbility(4, coreDefHelpers.doBrainDamage(1)),
  ],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Viper
export const viper: CardDef = {
  title: 'Viper',
  subroutines: [
    traceAbility(3, runnerLosesClick),
    traceAbility(3, endTheRun),
  ],
};

// Virgo
export const virgo: CardDef = {
  title: 'Virgo',
  ...constellationIce(coreDefHelpers.giveTags(1)),
};

// Wall of Static
export const wallOfStatic: CardDef = {
  title: 'Wall of Static',
  subroutines: [endTheRun],
};

// Wall of Thorns
export const wallOfThorns: CardDef = {
  title: 'Wall of Thorns',
  subroutines: [coreDefHelpers.doNetDamage(2), endTheRun],
};

// Watchtower
export const watchtower: CardDef = {
  title: 'Watchtower',
  subroutines: [{
    label: 'Search R&D and add 1 card to HQ',
    prompt: 'Choose a card to add to HQ',
    msg: 'add a card from R&D to HQ',
    'change-in-game-state': {
      req: req(function*(state: State): Generator<any, any, any> {
        return ((state as any).corp?.deck?.length ?? 0) > 0;
      }),
    },
    choices: req(function*(state: State): Generator<any, any, any> {
      return [...((state as any).corp?.deck ?? [])].sort();
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      coreShuffling.shuffle(state, ':corp', ':deck');
      coreMoving.move(state, ':corp', targets[0], ':hand');
    }),
  }],
};

// Wendigo
export const wendigo: CardDef = {
  title: 'Wendigo',
  implementation: 'Program prevention is not implemented',
  ...morphIce('Code Gate', 'Barrier', {
    msg: 'prevent the Runner from using a chosen program for the remainder of this run',
  }),
};

// Whirlpool
export const whirlpool: CardDef = {
  title: 'Whirlpool',
  subroutines: [{
    label: 'The Runner cannot jack out for the remainder of this run',
    msg: 'prevent the Runner from jacking out and trash itself',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':cannot-jack-out',
        value: true,
        duration: ':end-of-run',
      } as any);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
      coreRuns.encounterEnds(state, side, eid);
    }),
  }],
};

// Whitespace
export const whitespace: CardDef = {
  title: 'Whitespace',
  subroutines: [
    runnerLosesCredits(3),
    {
      label: 'End the run if the Runner has 6 [Credits] or less',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).runner?.credit ?? 0) < 7;
        }),
      },
      msg: 'end the run',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    },
  ],
};

// Woodcutter
export const woodcutter: CardDef = {
  title: 'Woodcutter',
  ...zeroToHero(coreDefHelpers.doNetDamage(1)),
};

// Wormhole
export const wormhole: CardDef = {
  title: 'Wormhole',
  ...spaceIce(resolveAnotherSubroutine()),
};

// Wotan
export const wotan: CardDef = {
  title: 'Wotan',
  subroutines: [
    endTheRunUnlessRunnerPays(corePayment.toC('click', 2)),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
    endTheRunUnlessRunnerPays(corePayment.toC('program', 1)),
    endTheRunUnlessRunnerPays(corePayment.toC('brain', 1)),
  ],
};

// Wraparound
export const wraparound: CardDef = {
  title: 'Wraparound',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State): Generator<any, any, any> {
    return !coreBoard.allActiveInstalled(state as any, ':runner')
      .some((c: Card) => coreCard.hasSubtype(c, 'Fracter'));
  }), 7)],
};

// ============================================================================
// Complex cards
// ============================================================================

// Tocsin — search R&D for up to one barrier and up to one sentry, then add to HQ.
export const tocsin: CardDef = (() => {
  function searchForType(type: string | null, chosen: Card[]): any {
    if (type) {
      const nextT = type === 'Barrier' ? 'Sentry' : null;
      return {
        prompt: `Pick a ${type} to add to HQ`,
        choices: req(function*(state: State): Generator<any, any, any> {
          return corePrompts.cancellable(
            ((state as any).corp?.deck || []).filter((c: Card) => coreCard.hasSubtype(c, type)),
            ':sorted',
          );
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, searchForType(nextT, [...chosen, targets[0]]), card, null)], []);
        }),
        cancel: {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, searchForType(nextT, chosen), card, null)], []);
          }),
        },
      };
    }
    const tutorChoice = chosen.length > 0
      ? {
        option: 'OK',
        ability: {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRevealing.revealLoud(state, side, coreEid.makeEid(state, eid), card,
                { 'and-then': ', and add [them] to HQ' }, chosen)], []);
            for (const c of chosen) {
              coreMoving.move(state, ':corp', c, ':hand');
            }
            coreShuffling.shuffle(state, ':corp', ':deck');
            coreEid.effectCompleted(state, side, eid);
          }),
        },
      }
      : {
        option: 'OK',
        ability: {
          msg: 'shuffle R&D',
          effect: effect(function*(state: State, side: Side): Generator<any, any, any> {
            coreShuffling.shuffle(state, side, ':deck');
          }),
        },
      };
    return {
      prompt: chosen.length > 0
        ? `You will tutor ${utils.enumerateCards(chosen)}`
        : 'You will shuffle R&D',
      choices: [tutorChoice.option, 'I want to start over'],
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        if (targets[0] === 'OK') {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, tutorChoice.ability, card, null)], []);
        } else {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, searchForType('Barrier', []), card, null)], []);
        }
      }),
    };
  }
  return {
    title: 'Tocsin',
    subroutines: [runnerLosesCredits(2), endTheRun, endTheRun],
    expend: {
      'change-in-game-state': {
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).corp?.deck?.length ?? 0) > 0;
        }),
      },
      cost: [corePayment.toC('credit', 1)],
      msg: 'search R&D for up to 1 barrier and up to 1 sentry',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, searchForType('Barrier', []), card, null)], []);
      }),
    },
  };
})();

// Tree Line
export const treeLine: CardDef = {
  title: 'Tree Line',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.getCounters(card, ':advancement');
  }))],
  subroutines: [{
    msg: 'gain 1 [Credits] and end the run',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRuns.endRun(state, side, eid, card)], []);
    }),
  }],
  advanceable: ':always',
  expend: Object.assign({},
    coreDefHelpers.placeAdvancementCounter(null, 3, 'an ice', (c: Card) => coreCard.ice(c)),
    { cost: [corePayment.toC('credit', 1)] }),
};

// Tributary
export const tributary: CardDef = {
  title: 'Tributary',
  subroutines: [
    {
      label: 'Draw 1 card and install a piece of ice from HQ protecting another server',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.maybeDraw(state, side, coreEid.makeEid(state, eid), card, 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, {
            choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
            prompt: 'Choose a piece of ice to install',
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              const thisServer = coreServers.zoneName((coreCard.getZone(card) as string[])?.[1]);
              const nice = tgts[0];
              yield wait_for(s, [{ asyncResult: 'result' },
                coreEngine.resolveAbility(s, sd, {
                  prompt: `Choose a location to install ${(nice as any).title}`,
                  choices: req(function*(ss: State): Generator<any, any, any> {
                    return coreInstalling.installableServers(ss, nice).filter((srv: string) => srv !== thisServer);
                  }),
                  async: true,
                  effect: req(function*(ss: State, ssd: Side, se: EID, sc: Card, stgts: any[]): Generator<any, any, any> {
                    yield wait_for(ss, [{ asyncResult: 'result' },
                      coreInstalling.corpInstall(ss, ssd, se, nice, stgts[0],
                        { 'ignore-install-cost': true,
                          msgKeys: { installSource: card, displayOrigin: true } })], []);
                  }),
                }, c, null)], []);
            }),
          }, card, null)], []);
      }),
    },
    {
      label: 'Give +2 strength to each piece of ice for the remainder of the run',
      msg: 'give +2 strength to each piece of ice for the remainder of the run',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':ice-strength',
          duration: ':end-of-run',
          value: 2,
        } as any);
        coreIce.updateAllIce(state, side);
      }),
    },
  ],
  events: [{
    event: ':run',
    req: req(function*(state: State, side: Side): Generator<any, any, any> {
      return coreEvents.firstEvent(state, side, ':run');
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const targetServer = (state as any).run?.server;
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: `Move ${(card as any).title} to the outermost position of ${coreServers.zoneName(targetServer)}?`,
            'waiting-prompt': true,
            'yes-ability': {
              once: ':per-turn',
              msg: `move itself to the outermost position of ${coreServers.zoneName(targetServer)}`,
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card): Generator<any, any, any> {
                const moved = coreMoving.move(s, sd, coreCard.getCard(s, c) as any,
                  [':servers', (targetServer as any[])?.[0], ':ices']);
                coreRuns.redirectRun(s, sd, targetServer);
                coreEngine.unregisterEvents(s, sd, moved as any);
                coreEngine.registerDefaultEvents(s, sd, moved as any);
                coreEid.effectCompleted(s, sd, e);
              }),
            },
          },
        }, card, null)], []);
    }),
  }],
};

// Troll
export const troll: CardDef = {
  title: 'Troll',
  'on-encounter': traceAbility(2, {
    label: 'Force the Runner to spend [Click] or end the run',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t === 'Spend [Click]'
        ? `force the runner to ${utils.decapitalize(t)}`
        : utils.decapitalize(t);
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('click', 1)])
          ? 'Spend [Click]'
          : null,
        'End the run',
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'Spend [Click]'
        && corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('click', 1)])) {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('click', 1)])], []);
        if (result?.msg) coreSay.systemMsg(state, side, result.msg);
        coreEid.effectCompleted(state, ':runner', eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }
    }),
  }),
};

// Turing
export const turing: CardDef = {
  title: 'Turing',
  'static-abilities': [
    {
      type: ':cannot-break-subs-on-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const ctx = targets?.[0];
        return coreCard.sameCard(card, ctx?.ice) && coreCard.hasSubtype(ctx?.icebreaker, 'AI');
      }),
      value: true,
    },
    coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return !coreCard.protectingACentral(state as any, card);
    }), 3),
  ],
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('click', 3))],
};

// Unsmiling Tsarevna
export const unsmilingTsarevna: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    const subs = ((card as any).subroutines || []) as any[];
    const someBrokenPrinted = subs.filter((s: any) => s.broken && s.printed).length > 0;
    if (!someBrokenPrinted) return true;
    return !coreEffects.anyEffects(state, side, ':unsmiling-effect',
      (v: any) => v === true, card, [card]);
  });
  const onRezAbility: any = {
    async: true,
    msg: 'let the Runner gain 2 [Credits] to prevent them from breaking more than 1 printed subroutine on this ice per encounter for the remainder of this run',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':runner', coreEid.makeEid(state, eid), 2)], []);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':unsmiling-effect',
        duration: ':end-of-run',
        req: req(function*(_s: State, _sd: Side, _e: EID, _c: Card, tgts: any[]): Generator<any, any, any> {
          return coreCard.sameCard(card, tgts[0]);
        }),
        value: true,
      } as any);
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':cannot-auto-break-subs-on-ice',
        duration: ':end-of-run',
        req: req(function*(_s: State, _sd: Side, _e: EID, _c: Card, tgts: any[]): Generator<any, any, any> {
          return coreCard.sameCard(card, tgts?.[0]?.ice);
        }),
        value: true,
      } as any);
      coreEid.effectCompleted(state, side, eid);
    }),
  };
  return {
    title: 'Unsmiling Tsarevna',
    subroutines: [
      Object.assign({}, coreDefHelpers.giveTags(1), { breakable: breakableFn }),
      Object.assign({}, coreDefHelpers.doNetDamage(2), { breakable: breakableFn }),
      Object.assign({}, {
        async: true,
        label: 'Draw up to 2 cards',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDrawing.maybeDraw(state, side, eid, card, 2)], []);
        }),
      }, { breakable: breakableFn }),
    ],
    'on-rez': {
      optional: {
        prompt: 'Let the Runner gain 2 [Credits]?',
        'waiting-prompt': true,
        req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          return !!(state as any).run && coreServers.cardToServer(state as any, card) ===
            coreServers.cardToServer(state as any, ((state as any).run as any));
        }),
        'yes-ability': {
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, onRezAbility, card, null)], []);
          }),
        },
        'no-ability': {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
          }),
        },
      },
    },
  };
})();

// Valentão
export const valentao: CardDef = {
  title: 'Valentão',
  'additional-cost': [corePayment.toC('tag-or-bad-pub', 1)],
  subroutines: [
    gainCreditsSub(2),
    runnerLosesCredits(2),
    Object.assign({}, endTheRun, {
      label: 'End the run if you have more credits than the Runner',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).corp?.credit ?? 0) > ((state as any).runner?.credit ?? 0);
        }),
      },
    }),
  ],
};

// Vertigo
export const vertigo: CardDef = {
  title: 'Vertigo',
  events: [{
    event: ':pass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(targets?.[0]?.ice, card);
    }),
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State): Generator<any, any, any> {
        return ((state as any).runner?.click ?? 0) === 0;
      }),
    },
    msg: 'prevent the Runner from stealing or trashing Corp cards for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      coreFlags.registerRunFlag(state, side, card, ':can-steal',
        (_state: State, _side: Side, _c: Card) => {
          coreToasts.toast(state, ':runner', 'Cannot steal due to Vertigo.', 'warning');
          return false;
        });
      coreFlags.registerRunFlag(state, side, card, ':can-trash',
        (_state: State, _side: Side, c: Card) => {
          if (coreCard.corp(c)) {
            coreToasts.toast(state, ':runner', 'Cannot trash due to Vertigo.', 'warning');
            return false;
          }
          return true;
        });
    }),
  }],
  subroutines: [runnerLosesClick],
};

// Vicsek
export const vicsek: CardDef = {
  title: 'Vicsek',
  subroutines: [
    {
      label: 'Do X damage and give the Runner X tags.',
      async: true,
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> { return utils.isTagged(state); }),
      },
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        const x = utils.countTags(state);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, side, coreEid.makeEid(state, eid), x, { 'suppress-checkpoint': true })], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', x)], []);
      }),
    },
    {
      label: 'Give the Runner 1 tag. Trash this ice.',
      async: true,
      msg: 'give the runner 1 tag',
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, side, coreEid.makeEid(state, eid), 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
        coreRuns.encounterEnds(state, side, eid);
      }),
    },
  ],
};

// Virtual Service Agent
export const virtualServiceAgent: CardDef = {
  title: 'Virtual Service Agent',
  subroutines: [runnerLosesCredits(1)],
  implementation: 'Might be incorrect if decoder is uninstalled',
  events: [{
    event: ':end-of-encounter',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const printedSub = (((card as any).subroutines || []) as any[]).find((s: any) => s.printed);
      const ctx = targets?.[0];
      return coreCard.sameCard(card, ctx?.ice) &&
        (!printedSub?.broken || !(new Set(printedSub?.['breaker-subtypes'] || [])).has('Decoder'));
    }),
    msg: 'give the Runner 1 tag',
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreTags.gainTags(state, side, eid, 1)], []);
    }),
  }],
};

// Waiver
export const waiver: CardDef = {
  title: 'Waiver',
  subroutines: [traceAbility(5, {
    label: 'Reveal the grip and trash cards',
    msg: msg(function(state: State) {
      return `reveal ${utils.enumerateCards((state as any).runner?.hand || [], ':sorted')} from the grip`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const grip = (state as any).runner?.hand || [];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.reveal(state, side, grip)], []);
      const delta = (targets?.[0] ?? 0) - (targets?.[1] ?? 0);
      const cards = grip.filter((c: Card) => ((c as any).cost ?? 0) <= delta);
      coreSay.systemMsg(state, side,
        `uses ${(card as any).title} to trash ${utils.enumerateCards(cards)}`);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreMoving.trashCards(state, side, eid, cards, { cause: ':subroutine' })], []);
    }),
  })],
};

// Wave
export const wave: CardDef = {
  title: 'Wave',
  'on-rez': {
    optional: {
      prompt: 'Search R&D for a piece of ice?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return !!(state as any).run && coreServers.cardToServer(state as any, card) ===
          coreServers.cardToServer(state as any, ((state as any).run as any));
      }),
      'yes-ability': {
        prompt: 'Choose a piece of ice',
        async: true,
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `reveal ${(targets[0] as any)?.title} from R&D and add it to HQ`;
        }),
        choices: req(function*(state: State): Generator<any, any, any> {
          return corePrompts.cancellable(
            ((state as any).corp?.deck || []).filter((c: Card) => coreCard.ice(c)),
            ':sorted',
          );
        }),
        cancel: {
          effect: effect(function*(state: State, side: Side): Generator<any, any, any> {
            coreShuffling.shuffle(state, side, ':deck');
          }),
        },
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRevealing.reveal(state, side, targets[0])], []);
          coreShuffling.shuffle(state, side, ':deck');
          coreMoving.move(state, side, targets[0], ':hand');
          coreEid.effectCompleted(state, side, eid);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  'rez-sound': 'wave',
  subroutines: [{
    label: 'Gain 1 [Credits] for each rezzed piece of Harmonic ice',
    msg: msg(function(state: State) {
      return `gain ${harmonicIceCount((state as any).corp)} [Credits]`;
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', eid, harmonicIceCount((state as any).corp))], []);
    }),
  }],
};

// Weir
export const weir: CardDef = {
  title: 'Weir',
  subroutines: [
    runnerLosesClick,
    {
      label: 'Runner trashes 1 card from the grip',
      'change-in-game-state': {
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).runner?.hand?.length ?? 0) > 0;
        }),
        silent: true,
      },
      prompt: 'Choose a card to trash',
      player: ':runner',
      choices: req(function*(state: State): Generator<any, any, any> {
        return (state as any).runner?.hand || [];
      }),
      'not-distinct': true,
      'display-side': ':corp',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `force the Runner to trash ${(targets[0] as any)?.title} from [their] grip`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, ':runner', eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
  ],
};

// Winchester
export const winchester: CardDef = {
  title: 'Winchester',
  subroutines: [
    traceAbility(4, trashProgramSub),
    traceAbility(3, trashHardwareSub),
  ],
  'static-abilities': [{
    type: ':additional-subroutines',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      return coreCard.sameCard(card, targets[0]) && coreCard.protectingHq(state as any, card);
    }),
    value: { subroutines: [traceAbility(3, endTheRun)] },
  }],
};

// Yagura
export const yagura: CardDef = {
  title: 'Yagura',
  subroutines: [
    {
      label: 'Look at the top card of R&D',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).corp?.deck?.length ?? 0) > 0;
        }),
      },
      optional: {
        prompt: msg(function(state: State) {
          const top = ((state as any).corp?.deck || [])[0];
          return `Move ${(top as any)?.title} to the bottom of R&D?`;
        }),
        'yes-ability': {
          msg: 'move the top card of R&D to the bottom',
          effect: effect(function*(state: State, side: Side): Generator<any, any, any> {
            const top = ((state as any).corp?.deck || [])[0];
            if (top) coreMoving.move(state, side, top, ':deck');
          }),
        },
        'no-ability': {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
            coreSay.systemMsg(state, ':corp',
              `declines to use ${(card as any).title} to move the top card of R&D to the bottom`);
          }),
        },
      },
    },
    coreDefHelpers.doNetDamage(1),
  ],
};

// spent-click-to-break-sub helper — checks if any breaker used this run has a click-cost break ability.
function spentClickToBreakSub(state: State): boolean {
  const events = coreEvents.runEvents(state as any, null, ':subroutines-broken') as any[];
  const breakers = events.map((entry: any) => entry?.[0]?.breaker).filter(Boolean);
  for (const b of breakers) {
    const abs = (((b as any).side === 'Runner' ? (b as any).abilities : (b as any)['runner-abilities']) || []) as any[];
    for (const ab of abs) {
      const costs = ([] as any[]).concat((ab as any)['break-cost'] || []);
      if (costs.some((c: any) => (c as any)?.['cost/type'] === ':lose-click' || (c as any)?.type === ':lose-click')) {
        return true;
      }
    }
  }
  return false;
}

// Zed 1.0
export const zed10: CardDef = (() => {
  const sub = {
    label: 'Do 1 core damage',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      if (spentClickToBreakSub(state)) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreDefHelpers.doBrainDamage(1), card, null)], []);
      } else {
        coreSay.systemMsg(state, side, 'does not do core damage with Zed 1.0');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Zed 1.0',
    subroutines: [sub, sub],
    'runner-abilities': [bioraidBreak(1, 1)],
  };
})();

// Zed 2.0
export const zed20: CardDef = {
  title: 'Zed 2.0',
  subroutines: [
    trashHardwareSub,
    trashHardwareSub,
    {
      label: 'Do 1 core damage',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        if (spentClickToBreakSub(state)) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(state, side, coreDefHelpers.doBrainDamage(2), card, null)], []);
        } else {
          coreSay.systemMsg(state, side, 'does not do core damage with Zed 2.0');
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
  'runner-abilities': [bioraidBreak(2, 2)],
};
