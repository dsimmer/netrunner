/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { State, Side, Card, EID } from '../../types';
import * as coreBadPublicity from '../core/bad_publicity';
import * as coreBoard from '../core/board';
import * as coreCard from '../core/card';
import * as coreCardDefs from '../core/card_defs';
import * as coreCheckpoint from '../core/checkpoint';
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
import * as coreIce from '../core/ice';
import * as coreInstalling from '../core/installing';
import * as coreMoving from '../core/moving';
import * as corePayment from '../core/payment';
import * as coreProps from '../core/props';
import * as coreRevealing from '../core/revealing';
import * as coreRezzing from '../core/rezzing';
import * as coreRuns from '../core/runs';
import * as coreSay from '../core/say';
import * as coreServers from '../core/servers';
import * as coreTags from '../core/tags';
import * as coreThreat from '../core/threat';
import * as coreToString from '../core/to_string';
import * as coreToasts from '../core/toasts';
import * as coreUpdate from '../core/update';
import * as utils from '../utils';
import { req, effect, msg, wait_for, continue_ability, forms } from '../macros';
import type { CardDef } from '../../types';

import { addRunnerCardToGrip, bioraidBreak, doPsi, endTheRun, endTheRunUnlessRunnerPays, gainCreditsSub, gainPowerCounter, powerCounterAbility, runnerLosesClick, runnerLosesCredits, runnerTrashInstalledSub, tagTrace, traceAbility, trashHardwareSub, trashProgramSub, trashResourceSub, wonderSub } from './ice_1';

// Lethe
export const lethe: CardDef = {
  title: 'Lethe',
  events: [
    Object.assign({}, coreDefHelpers.giveTags(1), {
      event: ':bypassed-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.sameCard(card, targets[0]);
      }),
    }),
    Object.assign({}, coreDefHelpers.giveTags(1), {
      event: ':subroutines-broken',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return coreCard.sameCard(context?.ice, card) && context?.allSubsBroken;
      }),
    }),
  ],
  subroutines: [
    {
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.discard?.length ?? 0) > 0; }) },
      label: 'add card from Archives to R&D',
      prompt: 'Choose a card to add to the top or bottom of R&D',
      'show-discard': true,
      choices: { card: (c: Card) => coreCard.corp(c) && coreCard.inDiscard(c) },
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreIce.moveCardToTopOrBottom(targets[0], ':corp'), card, null)], []);
      }),
    },
    addRunnerCardToGrip,
  ],
};

// Lionsmane
export const lionsmane: CardDef = {
  title: 'Lionsmane',
  subroutines: (() => {
    const twoNetOption: any = {
      option: 'Corp does 2 net damage',
      ability: {
        msg: 'do 2 net damage',
        'display-side': ':corp',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', eid, ':net', 2, { card })], []);
        }),
      },
    };
    return [
      coreDefHelpers.doNetDamage(2),
      coreChooseOne.chooseOneHelper({
        label: 'Do 2 net damage unless the Runner pays 3 [Credits]',
        player: ':runner',
      }, [
        coreChooseOne.costOption([corePayment.toC('credit', 3)], ':runner'),
        twoNetOption,
      ]),
      coreChooseOne.chooseOneHelper({
        label: 'Do 2 net damage unless the Runner jacks out',
        player: ':runner',
      }, [
        {
          option: 'Jack out',
          ability: {
            msg: 'jack out',
            'display-side': ':runner',
            async: true,
            effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
              yield wait_for(state, [{ asyncResult: 'result' },
                coreRuns.jackOut(state, ':runner', eid)], []);
            }),
          },
        },
        twoNetOption,
      ]),
    ];
  })(),
};

// Little Engine
export const littleEngine: CardDef = {
  title: 'Little Engine',
  subroutines: [
    endTheRun,
    endTheRun,
    {
      msg: 'make the Runner gain 5 [Credits]',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':runner', eid, 5)], []);
      }),
    },
  ],
};

// Lockdown
export const lockdown: CardDef = {
  title: 'Lockdown',
  subroutines: [{
    label: 'The Runner cannot draw cards for the remainder of this turn',
    msg: 'prevent the Runner from drawing cards',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreDrawing.preventDraw(state);
    }),
  }],
};

// Logjam
export const logjam: CardDef = {
  title: 'Logjam',
  advanceable: ':always',
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreCard.getCounters(card, ':advancement');
  }))],
  'on-rez': {
    msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
      return `place ${utils.quantify(1 + utils.faceupArchivesTypes((state as any).corp), 'advancement counter')} on itself`;
    }),
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter',
          1 + utils.faceupArchivesTypes((state as any).corp), { placed: true })], []);
    }),
  },
  subroutines: [
    Object.assign({}, gainCreditsSub(2), endTheRun, { label: 'Gain 2 [Credits] and end the run', msg: 'gain 2 [Credits] and end the run' }),
    endTheRun,
    endTheRun,
  ],
};

// Loki
export const loki: CardDef = {
  title: 'Loki',
  'on-encounter': {
    req: req(function*(state: State) {
      return coreBoard.allActiveInstalled(state, ':corp').filter((c: Card) => coreCard.ice(c)).length >= 2;
    }),
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.active(c), 'not-self': true },
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `choose ${coreToString.cardStr(state, targets[0])}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const target = targets[0];
      coreEffects.registerLingeringEffect(state, ':corp', card, {
        type: ':gain-subtype',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        value: (target as any).subtypes,
      });
      const additionalSubs = ((target as any).subroutines ?? []).map((s: any) => s['sub-effect']);
      coreEffects.registerLingeringEffect(state, ':corp', card, {
        type: ':additional-subroutines',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) { return coreCard.sameCard(card, tgts[0]); }),
        duration: ':end-of-run',
        value: { position: ':front', subroutines: additionalSubs },
      });
    }),
  },
  subroutines: [{
    label: 'End the run unless the Runner shuffles the grip into the stack',
    player: ':runner',
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State) {
      const hand = (state as any).runner?.hand ?? [];
      const deck = (state as any).runner?.deck ?? [];
      return [
        !(hand.length === 0 && deck.length < 2) ? 'Shuffle the grip into the stack' : null,
        'End the run',
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0] === 'End the run'
        ? utils.decapitalize(targets[0])
        : `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        for (const c of (state as any).runner?.hand ?? []) {
          coreMoving.move(state, ':runner', c, ':deck');
        }
        coreMoving.shuffle(state, ':runner', ':deck');
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Loot Box
export const lootBox: CardDef = (() => {
  function top3(state: State): Card[] {
    return ((state as any).runner?.deck ?? []).slice(0, 3);
  }
  return {
    title: 'Loot Box',
    subroutines: [
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 2)),
      {
        label: 'Reveal the top 3 cards of the Stack',
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const deck = (state as any).runner?.deck ?? [];
          if (deck.length > 0) {
            const top = top3(state);
            coreSay.systemMsg(state, side,
              `uses ${(card as any).title} to reveal ${utils.enumerateCards(top)} from the top of the stack`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRevealing.reveal(state, side, coreEid.makeEid(state, eid), top)], []);
            const pickAbility = {
              'waiting-prompt': true,
              prompt: 'Choose a card to add to the Grip',
              choices: req(function*() { return top3(state); }),
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `add ${(tgts[0] as any)?.title} to the Grip, gain ${(tgts[0] as any)?.cost} [Credits], shuffle the Stack and trash itself`;
              }),
              async: true,
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                coreMoving.move(s, ':runner', tgts[0], ':hand');
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreGaining.gainCredits(s, ':corp', coreEid.makeEid(s, e), (tgts[0] as any)?.cost ?? 0)], []);
                coreMoving.shuffle(s, ':runner', ':deck');
                yield wait_for(s, [{ asyncResult: 'result' },
                  coreMoving.trash(s, ':corp', e, c, { cause: ':subroutine' })], []);
                coreRuns.encounterEnds(s, sd, e);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, pickAbility, card, null)], []);
          } else {
            coreSay.systemMsg(state, side, `uses ${(card as any).title} to trash itself`);
            yield wait_for(state, [{ asyncResult: 'result' },
              coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
            coreRuns.encounterEnds(state, side, eid);
          }
        }),
      },
    ],
  };
})();

// Lotus Field
export const lotusField: CardDef = {
  title: 'Lotus Field',
  'static-abilities': [{
    type: ':cannot-lower-strength',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]?.ice);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Lycan
export const lycan: CardDef = {
  title: 'Lycan',
  ...morphIce('Sentry', 'Code Gate', trashProgramSub),
};

// Lycian Multi-Munition
export const lycianMultiMunition: CardDef = (() => {
  function iceSubtypeChoice(choices: string[], state: State, side: Side, card: Card): any {
    return {
      prompt: 'Choose an ice subtype',
      choices,
      async: true,
      effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
        if (tgts[0] === 'Done') {
          coreEid.effectCompleted(s, sd, e);
        } else {
          const remaining = choices.filter((ch: string) => ch !== tgts[0]);
          const newChoices = [...new Set([...remaining, 'Done'])];
          coreSay.systemMsg(s, sd, `uses ${(c as any).title} to make itself gain ${tgts[0]}`);
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':gain-subtype',
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(c, tgts2[0]);
            }),
            value: tgts[0],
          });
          yield wait_for(s, [{ asyncResult: 'result' },
            coreEngine.resolveAbility(s, sd, iceSubtypeChoice(newChoices, s, sd, c), c, null)], []);
        }
      }),
    };
  }
  return {
    title: 'Lycian Multi-Munition',
    'on-rez': {
      async: true,
      'waiting-prompt': true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, iceSubtypeChoice(['Barrier', 'Code Gate', 'Sentry'], state, side, card), card, null)], []);
      }),
    },
    'derez-effect': {
      effect: req(function*(state: State, side: Side) {
        coreEffects.unregisterEffectsForCard(state, side, (card: Card) => (e: any) => e.type === ':gain-subtype');
      }),
    },
    events: [
      {
        event: ':runner-turn-ends',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, ':corp', eid, card)], []);
        }),
      },
      {
        event: ':corp-turn-ends',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.derez(state, ':corp', eid, card)], []);
        }),
      },
    ],
    subroutines: [
      {
        label: '(Code Gate) Force the Runner to lose [Click] and 1 [Credit]',
        msg: 'force the Runner to lose [Click] and 1 [Credit]',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card) {
            return coreCard.hasSubtype(card, 'Code Gate') &&
              (((state as any).runner?.credit ?? 0) > 0 || ((state as any).runner?.click ?? 0) > 0);
          }),
        },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 1)], []);
          coreGaining.loseClicks(state, ':runner', 1);
          coreEid.effectCompleted(state, side, eid);
        }),
      },
      {
        label: '(Sentry) Trash a program',
        prompt: 'Choose a program to trash',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State, side: Side, eid: EID, card: Card) {
            return coreCard.hasSubtype(card, 'Sentry') &&
              coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
          }),
        },
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
      {
        label: '(Barrier) Gain 1 [Credit] and end the run',
        msg: 'gain 1 [Credit] and end the run',
        'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return coreCard.hasSubtype(card, 'Barrier');
        }) },
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, ':corp', eid, card)], []);
        }),
      },
    ],
  };
})();

// M.I.C.
export const mic: CardDef = {
  title: 'M.I.C.',
  abilities: [{
    label: 'End the run unless the Runner spends [Click]',
    msg: 'end the run unless the Runner spends [Click]',
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    async: true,
    cost: [corePayment.toC('trash-can', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side,
          endTheRunUnlessRunnerPays(corePayment.toC('click', 1), 'ability'), card, null)], []);
      if ((state as any).run && coreIce.getCurrentIce(state) === card) {
        coreRuns.encounterEnds(state, side, eid);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
  subroutines: [runnerLosesClick, runnerLosesClick, endTheRun],
};

// Machicolation A
export const machicolationA: CardDef = {
  title: 'Machicolation A',
  subroutines: [
    trashProgramSub,
    trashProgramSub,
    trashHardwareSub,
    {
      label: 'Runner loses 3 [Credits], if able. End the run',
      msg: msg(function(state: State) {
        return ((state as any).runner?.credit ?? 0) >= 3
          ? 'make the Runner lose 3 [Credits] and end the run'
          : 'end the run';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        if (((state as any).runner?.credit ?? 0) >= 3) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 3)], []);
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    },
  ],
};

// Machicolation B
export const machicolationB: CardDef = {
  title: 'Machicolation B',
  subroutines: [
    trashResourceSub,
    trashResourceSub,
    coreDefHelpers.doNetDamage(1),
    {
      label: 'Runner loses [click], if able. End the run',
      msg: msg(function(state: State) {
        return ((state as any).runner?.click ?? 0) > 0
          ? 'make the Runner lose [click] and end the run'
          : 'end the run';
      }),
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        if (((state as any).runner?.click ?? 0) > 0) {
          coreGaining.loseClicks(state, ':runner', 1);
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      }),
    },
  ],
};

// Macrophage
export const macrophage: CardDef = {
  title: 'Macrophage',
  subroutines: [
    traceAbility(4, {
      label: 'Purge virus counters',
      msg: 'purge virus counters',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEffects.purge(state, side, eid)], []);
      }),
    }),
    traceAbility(3, {
      label: 'Trash a virus',
      prompt: 'Choose a virus to trash',
      choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hasSubtype(c, 'Virus') },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreRuns.clearWaitPrompt(state, ':runner');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    }),
    traceAbility(2, {
      label: 'Remove a virus in the Heap from the game',
      req: req(function*(state: State) { return !coreFlags.zoneLocked(state, ':runner', ':discard'); }),
      prompt: 'Choose a virus in the Heap to remove from the game',
      choices: req(function*(state: State) {
        return coreCard.cancellable(
          ((state as any).runner?.discard ?? []).filter((c: Card) => coreCard.hasSubtype(c, 'Virus')),
          { sorted: true }
        );
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    }),
    traceAbility(1, endTheRun),
  ],
};

// Magnet
export const magnet: CardDef = {
  title: 'Magnet',
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreBoard.allInstalled(state, ':corp').some((ice: Card) =>
        coreCard.ice(ice) && !coreCard.sameCard(ice, card) &&
        ((ice as any).hosted ?? []).some((h: Card) => coreCard.program(h))
      );
    }),
    prompt: 'Choose a Program to host',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `host ${coreToString.cardStr(state, targets[0])}`;
    }),
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.program(targets[0]) &&
          coreCard.ice((targets[0] as any).host) &&
          !coreCard.sameCard((targets[0] as any).host, card);
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreCard.host(state, side, card, targets[0]);
      coreEffects.updateDisabledCards(state);
      coreEvents.triggerEvent(state, ':corp', ':subroutines-should-update');
    }),
  },
  'static-abilities': [{
    type: ':disable-card',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard((targets[0] as any)?.host, card) &&
        (targets[0] as any)?.title !== 'Hush' &&
        coreCard.program(targets[0]);
    }),
    value: true,
  }],
  subroutines: [endTheRun],
};

// Mamba
export const mamba: CardDef = {
  title: 'Mamba',
  abilities: [powerCounterAbility(Object.assign({}, coreDefHelpers.doNetDamage(1), {
    req: req(function*(state: State) { return !!(state as any).run; }),
  }))],
  subroutines: [coreDefHelpers.doNetDamage(1), doPsi(gainPowerCounter)],
};

// Marker
export const marker: CardDef = {
  title: 'Marker',
  subroutines: [{
    label: 'Give next encountered ice "End the run"',
    msg: 'give next encountered ice "[Subroutine] End the run" after all its other subroutines for the remainder of the run',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEvents.registerEvents(state, side, card, [{
        event: ':encounter-ice',
        duration: ':end-of-run',
        'unregister-once-resolved': true,
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.rezzed(tgts[0]?.ice);
        }),
        msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return `give ${(tgts[0]?.ice as any)?.title} "[Subroutine] End the run" after all its other subroutines`;
        }),
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          const tCard = tgts[0]?.ice;
          coreEffects.registerLingeringEffect(s, sd, c, {
            type: ':additional-subroutines',
            req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
              return coreCard.sameCard(tCard, tgts2[0]);
            }),
            duration: ':end-of-run',
            value: { subroutines: [endTheRun] },
          });
        }),
      }]);
    }),
  }],
};

// Markus 1.0
export const markus10: CardDef = {
  title: 'Markus 1.0',
  subroutines: [runnerTrashInstalledSub, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Maskirovka
export const maskirovka: CardDef = {
  title: 'Maskirovka',
  subroutines: [gainCreditsSub(2), endTheRun],
};

// Masvingo
export const masvingo: CardDef = {
  title: 'Masvingo',
  ...heroToHero(endTheRun),
  'on-rez': {
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreProps.addProp(state, side, eid, card, ':advance-counter', 1, { placed: true })], []);
    }),
  },
};

// Matrix Analyzer
export const matrixAnalyzer: CardDef = {
  title: 'Matrix Analyzer',
  'on-encounter': Object.assign({}, coreDefHelpers.placeAdvancementCounter(true), { cost: [corePayment.toC('credit', 1)] }),
  subroutines: [tagTrace(2)],
};

// Mausolus
export const mausolus: CardDef = {
  title: 'Mausolus',
  advanceable: ':always',
  subroutines: [
    {
      label: 'Gain 1 [Credits] (Gain 3 [Credits])',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `gain ${wonderSub(card, 3) ? 3 : 1} [Credits]`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, side, eid, wonderSub(card, 3) ? 3 : 1)], []);
      }),
    },
    {
      label: 'Do 1 net damage (Do 3 net damage)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `do ${wonderSub(card, 3) ? 3 : 1} net damage`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDamage.damage(state, side, eid, ':net', wonderSub(card, 3) ? 3 : 1, { card })], []);
      }),
    },
    {
      label: 'Give the Runner 1 tag (and end the run)',
      async: true,
      msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `give the Runner 1 tag${wonderSub(card, 3) ? ' and end the run' : ''}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':corp', coreEid.makeEid(state, eid), 1)], []);
        if (wonderSub(card, 3)) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreRuns.endRun(state, side, eid, card)], []);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    },
  ],
};

// Meridian
export const meridian: CardDef = {
  title: 'Meridian',
  subroutines: [{
    label: 'Gain 4 [Credits] and end the run',
    'waiting-prompt': true,
    prompt: 'Choose one',
    choices: ['Corp gains 4 [Credits] and end the run', 'Add Meridian to score area'],
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0].startsWith('Corp')
        ? 'gain 4 [Credits] and end the run'
        : `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0].startsWith('Corp')) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), 4)], []);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':runner', eid, card)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.encounterEnds(state, side, coreEid.makeEid(state, eid))], []);
        coreCard.asAgenda(state, ':runner', card, -1);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  }],
};

// Merlin
export const merlin: CardDef = {
  title: 'Merlin',
  ...grailIce(coreDefHelpers.doNetDamage(2)),
};

// Meru Mati
export const meruMati: CardDef = {
  title: 'Meru Mati',
  subroutines: [endTheRun],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreServers.protectingHQ(state, card) ? 3 : 0;
  }))],
};

// Metamorph
export const metamorph: CardDef = {
  title: 'Metamorph',
  subroutines: [{
    label: 'Swap 2 pieces of ice or swap 2 installed non-ice',
    msg: 'swap 2 pieces of ice or swap 2 installed non-ice',
    async: true,
    prompt: 'Choose one',
    'waiting-prompt': true,
    req: req(function*(state: State) {
      const installed = coreBoard.allInstalled(state, ':corp');
      return installed.filter((c: Card) => coreCard.ice(c)).length >= 2 ||
        installed.filter((c: Card) => !coreCard.ice(c)).length >= 2;
    }),
    choices: req(function*(state: State) {
      const installed = coreBoard.allInstalled(state, ':corp');
      return [
        installed.filter((c: Card) => coreCard.ice(c)).length >= 2 ? 'Swap 2 pieces of ice' : null,
        installed.filter((c: Card) => !coreCard.ice(c)).length >= 2 ? 'Swap 2 non-ice' : null,
      ].filter(Boolean);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      let innerAbility: any;
      if (targets[0] === 'Swap 2 pieces of ice') {
        innerAbility = {
          prompt: 'Choose 2 pieces of ice to swap',
          choices: { card: (c: Card) => coreCard.installed(c) && coreCard.ice(c), 'not-self': true, max: 2, all: true },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `swap the positions of ${coreToString.cardStr(s, tgts[0])} and ${coreToString.cardStr(s, tgts[1])}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreIce.swapIce(s, sd, tgts[0], tgts[1]);
          }),
        };
      } else {
        innerAbility = {
          prompt: 'Choose 2 cards to swap',
          choices: { card: (c: Card) => coreCard.installed(c) && !coreCard.ice(c), max: 2, all: true },
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `swap the positions of ${coreToString.cardStr(s, tgts[0])} and ${coreToString.cardStr(s, tgts[1])}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            coreCard.swapInstalled(s, sd, tgts[0], tgts[1]);
          }),
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
    }),
  }],
};

// Mestnichestvo
export const mestnichestvo: CardDef = {
  title: 'Mestnichestvo',
  advanceable: ':always',
  'on-encounter': {
    optional: {
      prompt: 'Remove 1 hosted advancement counter to make the Runner lose 3 [Credits]?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreCard.getCounters(coreCard.getCard(state, card), ':advancement') > 0;
      }),
      'yes-ability': {
        async: true,
        msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `spend 1 hosted advancement counter from ${(card as any).title} to force the Runner to lose 3 [Credits]`;
        }),
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreProps.addProp(state, ':corp', coreEid.makeEid(state, eid), card, ':advance-counter', -1, { placed: true })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreGaining.loseCredits(state, ':runner', eid, 3)], []);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  subroutines: [runnerLosesCredits(3), endTheRun],
};

// Mganga
export const mganga: CardDef = {
  title: 'Mganga',
  subroutines: [
    doPsi(
      {
        async: true,
        label: 'Do 2 net damage',
        msg: 'do 2 net damage and trash itself',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', coreEid.makeEid(state, eid), ':net', 2, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
          coreRuns.encounterEnds(state, side, eid);
        }),
      },
      {
        async: true,
        label: 'Do 1 net damage',
        msg: 'do 1 net damage and trash itself',
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, ':corp', coreEid.makeEid(state, eid), ':net', 1, { card })], []);
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, ':corp', coreEid.makeEid(state, eid), card, { cause: ':subroutine' })], []);
          coreRuns.encounterEnds(state, side, eid);
        }),
      }
    ),
  ],
};

// Mind Game
export const mindGame: CardDef = {
  title: 'Mind Game',
  subroutines: [
    doPsi({
      label: 'Redirect the run to another server',
      async: true,
      prompt: 'Choose a server',
      'waiting-prompt': true,
      choices: req(function*(state: State) {
        const currentServer = coreServers.zoneName((state as any).run?.server);
        return forms.servers(state).filter((s: string) => s !== currentServer);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `redirect the run to ${targets[0]} and for the remainder of the run, the runner must add 1 installed card to the bottom of the stack as an additional cost to jack out`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const run = (state as any).run;
        const canRedirect = run && (run.encounters ?? []).length === 1 && run.phase !== ':success';
        if (canRedirect) {
          coreRuns.redirectRun(state, side, targets[0], ':approach-ice');
        }
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':jack-out-additional-cost',
          duration: ':end-of-run',
          value: [corePayment.toC('add-installed-to-bottom-of-deck', 1)],
        });
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, coreRuns.offerJackOut(), card, null)], []);
        if (canRedirect && !(state as any).run?.endRun?.ended) {
          coreRuns.encounterEnds(state, side, eid);
        } else {
          coreEid.effectCompleted(state, side, eid);
        }
      }),
    }),
  ],
};

// Minelayer
export const minelayer: CardDef = {
  title: 'Minelayer',
  subroutines: [{
    async: true,
    choices: { card: (c: Card) => coreCard.ice(c) && coreCard.inHand(c) },
    prompt: 'Choose a piece of ice to install from HQ',
    'change-in-game-state': { req: req(function*(state: State) { return ((state as any).corp?.hand?.length ?? 0) > 0; }), silent: true },
    label: 'install ice from HQ, ignoring all costs',
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0],
          coreServers.zoneName(coreRuns.targetServer(state)),
          { ignoreAllCost: true, msgKeys: { installSource: card, displayOrigin: true } })], []);
    }),
  }],
};

// Mirāju
export const miraju: CardDef = {
  title: 'Mirāju',
  events: [{
    event: ':end-of-encounter',
    async: true,
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const context = targets[0];
      const firstPrinted = (context?.ice?.subroutines ?? []).find((s: any) => s.printed);
      return coreCard.sameCard(card, context?.ice) && firstPrinted?.broken;
    }),
    msg: 'make the Runner continue the run on Archives',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      const run = (state as any).run;
      if (run && (run.encounters ?? []).length === 1 && run.phase !== ':success') {
        coreRuns.redirectRun(state, side, 'Archives', ':approach-ice');
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, ':runner', coreEid.makeEid(state, eid), coreRuns.offerJackOut(), card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, eid, card)], []);
    }),
  }],
  subroutines: [{
    async: true,
    label: 'Draw 1 card, then shuffle 1 card from HQ into R&D',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          optional: {
            prompt: 'Draw 1 card?',
            'yes-ability': {
              async: true, msg: 'draw 1 card',
              effect: effect(function*(s: State, sd: Side, e: EID) {
                yield wait_for(s, [{ asyncResult: 'result' }, coreDrawing.draw(s, sd, e, 1)], []);
              }),
            },
          },
        }, card, null)], []);
      const shuffleAbility = {
        prompt: 'Choose 1 card in HQ to shuffle into R&D',
        choices: { card: (c: Card) => coreCard.inHand(c) && coreCard.corp(c) },
        msg: 'shuffle 1 card in HQ into R&D',
        effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          coreMoving.move(s, sd, tgts[0], ':deck');
          coreMoving.shuffle(s, ':corp', ':deck');
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, shuffleAbility, card, null)], []);
    }),
  }],
};
