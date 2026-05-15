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

import { addRunnerCardToGrip, bioraidBreak, currentlyEncounteringCard, endTheRun, endTheRunUnlessRunnerPays, forcedToAvoidTags, gainPowerCounter, powerCounterAbility, preventRunsThisTurn, runnerLosesCredits, runnerTrashInstalledSub, tagOrPayCredits, tagTrace, takeBadPub, traceAbility, trashProgramSub } from './ice_1';

// Excalibur
export const excalibur: CardDef = {
  title: 'Excalibur',
  subroutines: [preventRunsThisTurn],
};

// Executive Functioning
export const executiveFunctioning: CardDef = {
  title: 'Executive Functioning',
  subroutines: [traceAbility(4, coreDefHelpers.doBrainDamage(1))],
};

// ezaM
export const ezaM: CardDef = {
  title: 'ezaM',
  subroutines: [
    {
      label: 'Look at the top card of R&D',
      'change-in-game-state': { silent: true, req: req(function*(state: State) { return ((state as any).corp?.deck?.length ?? 0) > 0; }) },
      'waiting-prompt': true,
      prompt: msg(function(state: State) {
        return `The top card of R&D is ${(state as any).corp?.deck?.[0]?.title}`;
      }),
      choices: req(function*(state: State) {
        return [
          (state as any).corp?.deck?.length !== 1 ? 'Place it on the bottom of R&D' : null,
          'Done',
        ].filter(Boolean);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `look at the top card of R&D${targets[0] !== 'Done' ? ' and add it to the bottom of R&D' : ''}`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        if (targets[0] !== 'Done') {
          coreMoving.move(state, side, (state as any).corp?.deck?.[0], ':deck');
        }
      }),
    },
    {
      label: 'Each piece of ice gets +1 strength for the remainder of this run.',
      msg: 'give +1 strength to all ice for the remainder of the run',
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
        coreEffects.registerLingeringEffect(state, side, card, {
          type: ':ice-strength',
          duration: ':end-of-run',
          value: 1,
        });
        coreIce.updateAllIce(state, side);
      }),
    },
  ],
  abilities: [{
    cost: [corePayment.toC('click', 1)],
    action: true,
    label: 'Swap this ice with another installed ice.',
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.ice(targets[0]) && coreCard.installed(targets[0]) && !coreCard.sameCard(card, targets[0]);
      }),
    },
    msg: {
      public: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `swap itself with ${coreToString.cardStr(state, targets[0])}`;
      }),
      corp: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `swap itself with ${coreToString.cardStr(state, targets[0], { maybeVisible: true })}`;
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      coreIce.swapIce(state, side, card, targets[0]);
    }),
  }],
};

// F2P
export const f2p: CardDef = {
  title: 'F2P',
  subroutines: [addRunnerCardToGrip, coreDefHelpers.giveTags(1)],
  'runner-abilities': [coreIce.breakSub([corePayment.toC('credit', 2)], 1, null, {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !utils.isTagged(state) && currentlyEncounteringCard(card, state);
    }),
  })],
};

// Fairchild
export const fairchild: CardDef = {
  title: 'Fairchild',
  subroutines: [
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 4)),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 4)),
    endTheRunUnlessRunnerPays(corePayment.toC('trash-installed', 1)),
    endTheRunUnlessRunnerPays(corePayment.toC('brain', 1)),
  ],
};

// Fairchild 1.0
export const fairchild10: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 1 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 1)]) ? 'Pay 1 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 1 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 1)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      }
    }),
  };
  return { title: 'Fairchild 1.0', subroutines: [sub, sub], 'runner-abilities': [bioraidBreak(1, 1)] };
})();

// Fairchild 2.0
export const fairchild20: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 2 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 2)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 2)]) ? 'Pay 2 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 2 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 2)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      }
    }),
  };
  return {
    title: 'Fairchild 2.0',
    subroutines: [sub, sub, coreDefHelpers.doBrainDamage(1)],
    'runner-abilities': [bioraidBreak(2, 2)],
  };
})();

// Fairchild 3.0
export const fairchild30: CardDef = (() => {
  const sub: any = {
    label: 'Force the Runner to pay 3 [Credits] or trash an installed card',
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return `force the Runner to ${utils.decapitalize(targets[0])}`;
    }),
    player: ':runner',
    prompt: 'Choose one',
    'waiting-prompt': true,
    'change-in-game-state': {
      silent: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ||
          corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]);
      }),
    },
    choices: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return [
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', 3)]) ? 'Pay 3 [Credits]' : null,
        corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('trash-installed', 1)]) ? 'Trash an installed card' : null,
      ].filter(Boolean);
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Pay 3 [Credits]') {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, side, coreEid.makeEid(state, eid), card, [corePayment.toC('credit', 3)])], []);
        coreSay.systemMsg(state, side, result?.msg ?? '');
        coreEid.effectCompleted(state, side, eid);
      } else if (targets[0] === 'Trash an installed card') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', runnerTrashInstalledSub, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return {
    title: 'Fairchild 3.0',
    subroutines: [
      sub, sub,
      {
        label: 'Do 1 core damage or end the run',
        prompt: 'Choose one',
        'waiting-prompt': true,
        choices: ['Do 1 core damage', 'End the run'],
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return utils.decapitalize(targets[0]);
        }),
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          if (targets[0] === 'Do 1 core damage') {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreDamage.damage(state, side, eid, ':brain', 1, { card })], []);
          } else {
            yield wait_for(state, [{ asyncResult: 'result' },
              coreRuns.endRun(state, ':corp', eid, card)], []);
          }
        }),
      },
    ],
    'runner-abilities': [bioraidBreak(3, 3)],
  };
})();

// Fenris
export const fenris: CardDef = {
  title: 'Fenris',
  'on-rez': takeBadPub,
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun],
};

// Fire Wall
export const fireWall: CardDef = {
  title: 'Fire Wall',
  ...wallIce([endTheRun]),
};

// Flare
export const flare: CardDef = {
  title: 'Flare',
  subroutines: [
    traceAbility(6, {
      label: 'Trash 1 piece of hardware, do 2 meat damage, and end the run',
      async: true,
      effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
        const hasHardware = coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hardware(c));
        let innerAbility: any;
        if (hasHardware) {
          innerAbility = {
            prompt: 'Choose a piece of hardware to trash',
            label: 'Trash a piece of hardware',
            choices: { card: (c: Card) => coreCard.hardware(c), all: true },
            msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              return `trash ${(tgts[0] as any)?.title}, do 2 meat damage, and end the run`;
            }),
            async: true,
            effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreMoving.trash(s, sd, coreEid.makeEid(s, e), tgts[0], { cause: ':subroutine', suppressCheckpoint: true })], []);
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, coreEid.makeEid(s, e), ':meat', 2, { unpreventable: true, suppressCheckpoint: true, card: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' }, coreRuns.endRun(s, sd, e, c)], []);
            }),
          };
        } else {
          innerAbility = {
            async: true,
            msg: 'do 2 meat damage and end the run',
            effect: req(function*(s: State, sd: Side, e: EID, c: Card) {
              yield wait_for(s, [{ asyncResult: 'result' },
                coreDamage.damage(s, sd, coreEid.makeEid(s, e), ':meat', 2, { unpreventable: true, suppressCheckpoint: true, card: c })], []);
              yield wait_for(s, [{ asyncResult: 'result' }, coreRuns.endRun(s, sd, e, c)], []);
            }),
          };
        }
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
      }),
    }),
  ],
};

// Flyswatter
export const flyswatter: CardDef = {
  title: 'Flyswatter',
  'suppress-rez-sound': req(function*(state: State, side: Side, eid: EID, card: Card) {
    return !!(state as any).run && forms.thisServer(state, card) && !coreEffects.isDisabledReg(state, card);
  }),
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card);
    }),
    msg: 'purge virus counters',
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreSay.playSfx(state, side, 'virus-purge');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEffects.purge(state, side, eid)], []);
    }),
  },
  subroutines: [endTheRun],
};

// Flywheel
export const flywheel: CardDef = (() => {
  const sub: any = {
    label: 'Gain 1 [Credit]. You may draw 1 card',
    async: true,
    msg: 'gain 1 [Credit]',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, coreEid.makeEid(state, eid), 1)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, 1)], []);
    }),
  };
  return { title: 'Flywheel', subroutines: [sub, sub] };
})();

// Formicary
export const formicary: CardDef = {
  title: 'Formicary',
  'derezzed-events': [{
    event: ':approach-server',
    interactive: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, null) !== 'No';
    }),
    silent: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, null) === 'No';
    }),
    optional: {
      prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
        return `Rez and move ${coreToString.cardStr(state, card, { visible: true })} to protect the approached server?`;
      }),
      autoresolve: (state: State, side: Side, eid: EID, card: Card, targets: any[]) =>
        coreEngine.getAutoresolve(state, side, card, ':auto-fire')(state, side, eid, card, targets),
      req: req(function*(state: State, side: Side, eid: EID, card: Card) {
        return coreRezzing.canRez(state, side, card) &&
          corePayment.canPay(state, side, eid, card, null, coreRezzing.getRezCost(state, side, card, null));
      }),
      'yes-ability': {
        async: true,
        effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
          const result: any = yield wait_for(state, [{ asyncResult: 'result' },
            coreRezzing.rez(state, side, card)], []);
          if (coreCard.rezzed(result?.card ?? card)) {
            coreSay.systemMsg(state, side,
              'uses Formicary to move itself to the innermost position of the attacked server. The runner is now encountering it');
            const currentCard = coreCard.getCard(state, card);
            coreMoving.move(state, side, currentCard,
              [':servers', coreRuns.targetServer(state), ':ices'], { front: true });
            (state as any).run.position = 1;
            coreRuns.setNextPhase(state, ':encounter-ice');
            coreRuns.setCurrentIce(state);
            coreIce.updateAllIce(state, side);
            coreIce.updateAllIcebreakers(state, side);
          }
          coreEid.effectCompleted(state, side, eid);
        }),
      },
    },
  }],
  subroutines: [endTheRunUnlessRunnerPays(corePayment.toC('net', 2))],
  abilities: [coreEngine.setAutoresolve(':auto-fire', 'Formicary rezzing and moving itself on approach')],
};

// Free Lunch
export const freeLunch: CardDef = {
  title: 'Free Lunch',
  abilities: [powerCounterAbility(runnerLosesCredits(1))],
  subroutines: [gainPowerCounter, gainPowerCounter],
};

// Funhouse
export const funhouse: CardDef = {
  title: 'Funhouse',
  'on-encounter': {
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return targets[0] === 'Take 1 tag'
        ? `force the runner to ${utils.decapitalize(targets[0])} on encountering it`
        : utils.decapitalize(targets[0]);
    }),
    player: ':runner',
    prompt: 'Choose one',
    choices: req(function*(state: State) {
      return [
        !forcedToAvoidTags(state, ':runner' as Side) ? 'Take 1 tag' : null,
        'End the run',
      ].filter(Boolean);
    }),
    'waiting-prompt': true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      if (targets[0] === 'Take 1 tag') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreTags.gainTags(state, ':runner', eid, 1, { unpreventable: true })], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':runner', eid, card)], []);
      }
    }),
  },
  subroutines: [tagOrPayCredits(4)],
};

// Galahad
export const galahad: CardDef = {
  title: 'Galahad',
  ...grailIce(endTheRun),
};

// Gatekeeper
export const gatekeeper: CardDef = (() => {
  const revealAndShuffle: any = {
    prompt: 'Reveal and shuffle up to 3 agendas into R&D',
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) && coreCard.agenda(c),
      max: req(function*() { return 3; }),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRevealing.revealLoud(state, side, card, { andThen: ', and shuffle [them] into R&D' }, targets)], []);
      for (const c of targets) coreMoving.move(state, ':corp', c, ':deck');
      coreMoving.shuffle(state, ':corp', ':deck');
      coreEid.effectCompleted(state, ':corp', eid);
    }),
    cancel: coreMoving.shuffleMyDeck,
  };
  const drawRevealShuffle: any = {
    async: true,
    label: 'Draw cards, reveal and shuffle agendas',
    'waiting-prompt': true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.drawUpTo(state, side, eid, card, 3)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, revealAndShuffle, card, null)], []);
    }),
  };
  return {
    title: 'Gatekeeper',
    'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
      return (card as any).rezzed === ':this-turn' ? 6 : 0;
    }))],
    subroutines: [drawRevealShuffle, endTheRun],
  };
})();

// Gemini
export const gemini: CardDef = {
  title: 'Gemini',
  ...constellationIce(coreDefHelpers.doNetDamage(1)),
};

// Gold Farmer
export const goldFarmer: CardDef = (() => {
  function gfLoseCredits(state: State, side: Side, eid: EID, n: number): any {
    if (n > 0) {
      return (async function*() {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreGaining.loseCredits(state, ':runner', coreEid.makeEid(state, eid), 1)], []);
        yield wait_for(state, [{ asyncResult: 'result' }, gfLoseCredits(state, side, eid, n - 1)], []);
      })();
    }
    return coreEid.effectCompleted(state, side, eid);
  }
  return {
    title: 'Gold Farmer',
    implementation: 'Auto breaking will break even with too few credits',
    'on-break-subs': {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return (context?.brokenSubs ?? context?.['broken-subs'] ?? []).some((s: any) => s.printed);
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        const nSubs = (context?.brokenSubs ?? context?.['broken-subs'] ?? []).filter((s: any) => s.printed).length;
        return `force the runner to lose ${nSubs} [Credits] for breaking printed subs`;
      }),
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        const n = (context?.brokenSubs ?? context?.['broken-subs'] ?? []).filter((s: any) => s.printed).length;
        yield wait_for(state, [{ asyncResult: 'result' }, gfLoseCredits(state, side, eid, n)], []);
      }),
    },
    subroutines: [
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
      endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
    ],
  };
})();

// Grim
export const grim: CardDef = {
  title: 'Grim',
  'on-rez': takeBadPub,
  subroutines: [trashProgramSub],
};

// Grubber
export const grubber: CardDef = {
  title: 'Grubber',
  'on-rez': {
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return coreServers.protectingACentral(state, card);
    }) },
    async: true,
    msg: 'take 1 bad publicity',
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreBadPublicity.gainBadPublicity(state, side, eid, 1)], []);
    }),
  },
  subroutines: [
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
    endTheRunUnlessRunnerPays(corePayment.toC('credit', 3)),
  ],
};

// Guard
export const guard: CardDef = {
  title: 'Guard',
  'static-abilities': [{
    type: ':bypass-ice',
    req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return coreCard.sameCard(card, targets[0]);
    }),
    value: false,
  }],
  subroutines: [endTheRun],
};

// Gutenberg
export const gutenberg: CardDef = {
  title: 'Gutenberg',
  subroutines: [tagTrace(7)],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State, side: Side, eid: EID, card: Card) {
    return coreServers.protectingRD(state, card) ? 3 : 0;
  }))],
};

// Gyri Labyrinth
export const gyriLabyrinth: CardDef = {
  title: 'Gyri Labyrinth',
  subroutines: [{
    req: req(function*(state: State) { return !!(state as any).run; }),
    label: "Reduce Runner's hand size by 2",
    msg: "reduce the Runner's maximum hand size by 2 until the start of the next Corp turn",
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':hand-size',
        duration: ':until-corp-turn-begins',
        req: req(function*(s: State, sd: Side) { return sd === ':runner'; }),
        value: -2,
      });
    }),
  }],
};

// Hadrian's Wall
export const hadriansWall: CardDef = {
  title: "Hadrian's Wall",
  ...wallIce([endTheRun, endTheRun]),
};

// Hafrún
export const hafrun: CardDef = (() => {
  function preventSubBreakBy(t: Card): any {
    return {
      type: ':prevent-paid-ability',
      duration: ':end-of-run',
      value: true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const [breakCard, breakAbility] = targets;
        return coreCard.sameCard(breakCard, t) &&
          (breakAbility?.break != null || breakAbility?.breaks != null ||
            breakAbility?.heapBreakerBreak != null || breakAbility?.breakCost != null);
      }),
    };
  }
  return {
    title: 'Hafrún',
    subroutines: [endTheRun],
    'on-rez': {
      optional: {
        prompt: 'Trash a card from HQ to prevent subroutines from being broken by a Runner card abilities for the remainder of the run?',
        req: req(function*(state: State, side: Side, eid: EID, card: Card) {
          return !!(state as any).run && forms.thisServer(state, card) &&
            ((state as any).corp?.hand?.length ?? 0) > 0;
        }),
        'waiting-prompt': true,
        'yes-ability': {
          cost: [corePayment.toC('trash-from-hand', 1)],
          async: true,
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            const innerAbility = {
              'waiting-prompt': true,
              prompt: 'Choose an installed Runner card',
              async: true,
              choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
              msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                return `trash 1 card from HQ to prevent subroutines from being broken by ${(tgts[0] as any)?.title} abilities for the remainder of the run`;
              }),
              effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
                const t = tgts[0];
                coreEffects.registerLingeringEffect(s, sd, c, {
                  type: ':icon',
                  duration: ':end-of-run',
                  req: req(function*(s2: State, sd2: Side, e2: EID, c2: Card, tgts2: any[]) {
                    return coreCard.sameCard(t, tgts2[0]);
                  }),
                  value: coreEffects.makeIcon('H', c),
                });
                coreEffects.registerLingeringEffect(s, sd, c, preventSubBreakBy(t));
                coreEid.effectCompleted(s, sd, e);
              }),
            };
            yield wait_for(state, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(state, side, innerAbility, card, null)], []);
          }),
        },
        'no-ability': {
          effect: effect(function*(state: State, side: Side, eid: EID, card: Card) {
            coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
          }),
        },
      },
    },
  };
})();

// Hákarl 1.0
export const hakarl10: CardDef = {
  title: 'Hákarl 1.0',
  'runner-abilities': [bioraidBreak(1, 1)],
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun],
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card) {
      return !!(state as any).run && forms.thisServer(state, card) &&
        coreBoard.getAllInstalled(state).filter((c: Card) => !coreCard.sameCard(card, c) && coreCard.rezzed(c)).length > 0;
    }),
    prompt: 'Derez another card to prevent the runner from using printed abilities on bioroid ice this turn?',
    choices: {
      'not-self': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return coreCard.installed(targets[0]) && coreCard.rezzed(targets[0]);
      }),
    },
    'waiting-prompt': true,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.derez(state, side, targets[0])], []);
      coreSay.systemMsg(state, side, 'prevents the runner from using printed abilities on bioroid ice for the rest of the turn');
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':prevent-paid-ability',
        duration: ':end-of-turn',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          return coreCard.ice(tgts[0]) && sd === ':runner' && coreCard.hasSubtype(tgts[0], 'Bioroid');
        }),
        value: true,
      });
      coreEid.effectCompleted(state, side, eid);
    }),
  },
};

// Hagen
export const hagen: CardDef = {
  title: 'Hagen',
  subroutines: [
    {
      label: 'Trash 1 program',
      prompt: 'Choose a program that is not a decoder, fracter or killer',
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `trash ${(targets[0] as any)?.title}`;
      }),
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return coreBoard.allInstalled(state, ':runner').some(
            (c: Card) => coreCard.program(c) && !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']));
        }),
      },
      choices: {
        card: (c: Card) => coreCard.installed(c) && coreCard.program(c) &&
          !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']),
      },
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreRuns.clearWaitPrompt(state, ':runner');
        yield wait_for(state, [{ asyncResult: 'result' },
          coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
      }),
    },
    endTheRun,
  ],
  'static-abilities': [coreIce.iceStrengthBonus(req(function*(state: State) {
    return -coreBoard.allActiveInstalled(state, ':runner')
      .filter((c: Card) => coreCard.hasSubtype(c, 'Icebreaker')).length;
  }))],
};

// Hailstorm
export const hailstorm: CardDef = {
  title: 'Hailstorm',
  subroutines: [
    {
      label: 'Remove a card in the Heap from the game',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State) {
          return !coreFlags.zoneLocked(state, ':runner', ':discard') &&
            ((state as any).runner?.discard?.length ?? 0) > 0;
        }),
      },
      prompt: 'Choose a card in the Heap',
      choices: req(function*(state: State) {
        return coreCard.cancellable((state as any).runner?.discard ?? [], { sorted: true });
      }),
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    },
    endTheRun,
  ],
};

// Hammer
export const hammer: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    const killerBroken = (card as any).subroutines?.filter(
      (s: any) => s.printed && s.broken && !(s.breakerSubtypes ?? s['breaker-subtypes'] ?? []).includes('Killer')
    ) ?? [];
    return killerBroken.length === 0 || coreCard.hasSubtype(targets[0], 'Killer') ? ':unrestricted' : false;
  });
  return {
    title: 'Hammer',
    'static-abilities': [{
      type: ':cannot-auto-break-subs-on-ice',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        const context = targets[0];
        return coreCard.sameCard(card, context?.ice) && !coreCard.hasSubtype(context?.breaker, 'Killer');
      }),
      value: true,
    }],
    subroutines: [
      Object.assign({}, coreDefHelpers.giveTags(1), { breakable: breakableFn }),
      {
        label: 'Choose a resource or piece of hardware to trash',
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        prompt: 'Trash a resource or piece of hardware',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State) {
            return coreBoard.allInstalled(state, ':runner').some(
              (c: Card) => coreCard.hardware(c) || coreCard.resource(c));
          }),
        },
        choices: {
          req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
            return coreCard.installed(targets[0]) && (coreCard.hardware(targets[0]) || coreCard.resource(targets[0]));
          }),
        },
        async: true,
        breakable: breakableFn,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
      {
        label: 'Choose a program to trash that is not a decoder, fracter or killer',
        'change-in-game-state': {
          silent: true,
          req: req(function*(state: State) {
            return coreBoard.allInstalled(state, ':runner').some(
              (c: Card) => coreCard.program(c) && !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']));
          }),
        },
        prompt: 'Trash a program that is not a decoder, fracter or killer',
        msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          return `trash ${(targets[0] as any)?.title}`;
        }),
        breakable: breakableFn,
        choices: {
          card: (c: Card) => coreCard.installed(c) && coreCard.program(c) &&
            !coreCard.hasAnySubtype(c, ['Decoder', 'Fracter', 'Killer']),
        },
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
        }),
      },
    ],
  };
})();

// Descent
export const descent: CardDef = (() => {
  const shuffleAb: any = {
    label: 'Draw 1 card and shuffle up to 2 agendas in HQ and/or Archives into R&D',
    msg: 'draw 1 card',
    async: true,
    cost: [corePayment.toC('credit', 1)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      coreSay.playSfx(state, side, 'click-card');
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, side, coreEid.makeEid(state, eid), 1)], []);
      const shuffleAbility = {
        prompt: 'Choose up to 2 agendas in HQ and/or Archives',
        choices: {
          max: 2,
          card: (c: Card) => coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
        },
        async: true,
        'show-discard': true,
        effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
          yield wait_for(s, [{ asyncResult: 'result' },
            coreRevealing.revealLoud(s, sd, c, { andThen: 'shuffle [them] into R&D' }, tgts)], []);
          for (const t of tgts) coreMoving.move(s, ':corp', t, ':deck');
          coreMoving.shuffle(s, ':corp', ':deck');
          coreEid.effectCompleted(s, sd, e);
        }),
      };
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, shuffleAbility, card, null)], []);
    }),
  };
  return {
    title: 'Descent',
    events: [{
      event: ':corp-turn-begins',
      skippable: true,
      interactive: req(function*() { return true; }),
      req: req(function*(state: State, side: Side, eid: EID, card: Card) { return coreCard.rezzed(card); }),
      optional: {
        prompt: msg(function(state: State, side: Side, eid: EID, card: Card) {
          return `Add ${coreToString.cardStr(state, card)} to HQ?`;
        }),
        'yes-ability': {
          effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
            coreMoving.move(state, side, card, ':hand');
          }),
          msg: msg(function(state: State, side: Side, eid: EID, card: Card) {
            return `add ${coreToString.cardStr(state, card)} to HQ`;
          }),
        },
      },
    }],
    expend: shuffleAb,
    subroutines: [endTheRun],
  };
})();

// Harvester
export const harvester: CardDef = (() => {
  const sub: any = {
    label: "Runner draws 3 cards and discards down to maximum hand size",
    msg: "make the Runner draw 3 cards and discard down to [runner-pronoun] maximum hand size",
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.draw(state, ':runner', coreEid.makeEid(state, eid), 3)], []);
      const handSize = utils.handSize(state, ':runner');
      const hand: Card[] = (state as any).runner?.hand ?? [];
      const delta = hand.length - handSize;
      if (delta > 0) {
        const discardAbility = {
          prompt: `Choose ${utils.quantify(delta, 'card')} to discard`,
          player: ':runner',
          choices: { max: delta, card: (c: Card) => coreCard.inHand(c) },
          async: true,
          'display-side': ':runner',
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `discard ${utils.enumerateCards(tgts)}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            const discarded = tgts.map((t: Card) => coreMoving.move(s, sd, t, ':discard'));
            const ev = sd === ':runner' ? ':runner-discard-to-hand-size' : ':corp-discard-to-hand-size';
            coreEvents.queueEvent(s, ev, { cards: discarded });
            yield wait_for(s, [{ asyncResult: 'result' },
              coreCheckpoint.checkpoint(s, null, e, { durations: [ev] })], []);
          }),
        };
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, ':runner', discardAbility, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
  return { title: 'Harvester', subroutines: [sub, sub] };
})();

// Heimdall 1.0
export const heimdall10: CardDef = {
  title: 'Heimdall 1.0',
  subroutines: [coreDefHelpers.doBrainDamage(1), endTheRun, endTheRun],
  'runner-abilities': [bioraidBreak(1, 1)],
};
