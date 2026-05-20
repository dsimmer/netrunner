/**
 * ICE Cards
 * Ported from Clojure cards/ice.clj to TypeScript
 *
 * Contains ~317 card definitions with their abilities and events.
 */

import type { Card, CardDef, EID, Side, State } from '../../types';
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
// ============================================================================
// Helper functions
// ============================================================================

export function forcedToAvoidTags(...args: any[]): boolean {
  return (coreEffects.anyEffects as any)?.(...args);
}

export function currentlyEncounteringCard(card: Card, state: State): boolean {
  return coreCard.sameCard(coreRuns.getCurrentEncounter(state)?.ice, card);
}

export function bioraidBreak(cost: number, qty: number, args: any = {}): any {
  return coreIce.breakSub([corePayment.toC('lose-click', cost)], qty, null,
    Object.assign({}, args, {
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return !coreEffects.isDisabledReg(state, card) && currentlyEncounteringCard(card, state);
      }),
    })
  );
}

export const endTheRun: any = {
  label: 'End the run',
  msg: 'end the run',
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRuns.endRun(state, ':corp', eid, card)], []);
  }),
};

export const endTheRunIfTagged: any = {
  label: 'End the run if the Runner is tagged',
  'change-in-game-state': { req: req(function*(state: State): Generator<any, any, any> { return utils.isTagged(state); }), silent: true },
  msg: 'end the run',
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRuns.endRun(state, ':corp', eid, card)], []);
  }),
};

export const preventRunsThisTurn: any = {
  label: 'The Runner cannot make another run this turn',
  msg: 'prevent the Runner from making another run',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreFlags.registerTurnFlag(state, side, card, ':can-run', null);
  }),
};

export function maybeDrawSub(qty: number): any {
  return {
    async: true,
    label: `You may draw ${utils.quantify(qty, 'card')}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.maybeDraw(state, side, eid, card, qty)], []);
    }),
  };
}

export function drawUpToSub(qty: number, args: any = {}): any {
  return {
    async: true,
    label: `Draw up to ${utils.quantify(qty, 'card')}`,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreDrawing.drawUpTo(state, side, eid, card, qty, args)], []);
    }),
  };
}

export function endTheRunUnlessRunnerPays(cost: any, reason: string = 'subroutine'): any {
  return {
    player: ':runner',
    async: true,
    label: `End the run unless the Runner pays ${corePayment.buildCostLabel([cost])}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return ['End the run',
        corePayment.canPay(state, ':runner', eid, card, null, [cost])
          ? utils.capitalize(corePayment.costToString([cost]))
          : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      const t = targets[0];
      return t === 'End the run'
        ? utils.decapitalize(t)
        : `force the runner to ${utils.decapitalize(t)}`;
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':runner', coreEid.makeEid(state, eid), card, [cost])], []);
        if (result?.msg) {
          coreSay.systemMsg(state, ':runner',
            `${result.msg} due to ${(card as any).title} ${reason}`);
        }
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

export function endTheRunUnlessCorpPays(cost: any): any {
  return {
    async: true,
    label: `End the run unless the Corp pays ${corePayment.buildCostLabel([cost])}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return ['End the run',
        corePayment.canPay(state, ':corp', eid, card, null, [cost])
          ? utils.capitalize(corePayment.costToString([cost]))
          : null,
      ].filter(Boolean);
    }),
    msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
      return utils.decapitalize(targets[0]);
    }),
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        const result: any = yield wait_for(state, [{ asyncResult: 'result' },
          corePayment.pay(state, ':corp', coreEid.makeEid(state, eid), card, [cost])], []);
        if (result?.msg) coreSay.systemMsg(state, ':corp', result.msg);
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

export function endTheRunUnlessRunner(label: string, prompt: string, ability: any): any {
  return {
    player: ':runner',
    async: true,
    label: `End the run unless the Runner ${label}`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: ['End the run', utils.capitalize(prompt)],
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      if (targets[0] === 'End the run') {
        coreSay.systemMsg(state, ':corp', `uses ${(card as any).title} to end the run`);
        yield wait_for(state, [{ asyncResult: 'result' },
          coreRuns.endRun(state, ':corp', eid, card)], []);
      } else {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, ability, card, null)], []);
      }
    }),
  };
}

export const gainPowerCounter: any = {
  label: 'Place 1 power counter',
  msg: 'place 1 power counter on itself',
  'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    return coreCard.installed(card);
  })},
  async: true,
  effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreProps.addCounter(state, side, eid, card, ':power', 1, { placed: true })], []);
  }),
};

export function rezAnIce(args: any = {}): any {
  const costBonus = args.costBonus ?? 0;
  const tagStr = `Rez an ice${costBonus === 0 ? '' : costBonus > 0 ? `, paying ${costBonus} more` : `, paying ${-costBonus} less`}`;
  return {
    label: tagStr,
    prompt: tagStr,
    async: true,
    'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
      return coreBoard.allInstalled(state, ':corp').some((c: Card) => coreCard.ice(c) && !coreCard.rezzed(c));
    })},
    choices: {
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        const t = targets[0];
        return coreCard.installed(t) && coreCard.ice(t) && !coreCard.rezzed(t) &&
          coreRezzing.canPayToRez(state, side, eid, t, args);
      }),
    },
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreRezzing.rez(state, side, eid, targets[0], args)], []);
    }),
  };
}

export function traceAbility(base: number, ability: any, unAbility?: any): any {
  if (unAbility) {
    const label = `${ability.label} / ${unAbility.label}`;
    return { label: `Trace ${base} - ${label}`, trace: { base, label, successful: ability, unsuccessful: unAbility } };
  }
  return { label: `Trace ${base} - ${ability.label}`, trace: { base, label: ability.label, successful: ability } };
}

export function tagTrace(base: number, n: number = 1): any {
  return traceAbility(base, coreDefHelpers.giveTags(n));
}

export function tagOrPayCredits(x: number): any {
  return {
    label: `Give the Runner 1 tag unless they pay ${x} [Credits]`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const canPay = corePayment.canPay(state, ':runner', eid, card, null, [corePayment.toC('credit', x)]);
      let ability: any;
      if (canPay) {
        ability = coreChooseOne.chooseOneHelper({ player: ':runner' }, [
          { option: 'Take 1 tag', ability: coreDefHelpers.giveTags(1) },
          coreChooseOne.costOption([corePayment.toC('credit', x)], ':runner'),
        ]);
      } else {
        ability = {
          msg: 'give the Runner 1 tag',
          async: true,
          effect: req(function*(s: State, sd: Side, e: EID): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' }, coreTags.gainTags(s, sd, e, 1)], []);
          }),
        };
      }
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, ability, card, null)], []);
    }),
  };
}

export function gainCreditsSub(credits: number): any {
  return {
    label: `Gain ${credits} [Credits]`,
    msg: `gain ${credits} [Credits]`,
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, side, eid, credits)], []);
    }),
  };
}

export function corpsGainsAndRunnerLosesCredits(gain: number, loss: number): any {
  return {
    label: `Gain ${gain} [Credits], Runner loses ${loss} [Credits]`,
    msg: `gain ${gain} [Credits] and force the Runner to lose ${loss} [Credits]`,
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.gainCredits(state, ':corp', coreEid.makeEid(state, eid), gain)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, loss)], []);
    }),
  };
}

export function powerCounterAbility(ability: any): any {
  return Object.assign({}, ability, { cost: [corePayment.toC('power', 1)] });
}

export function doPsi(neqAbility: any, eqAbility?: any): any {
  if (eqAbility) {
    return {
      label: `Psi Game - ${neqAbility['label-neq']} / ${eqAbility['label-eq']}`,
      msg: `start a psi game (${neqAbility['label-neq']} / ${eqAbility['label-eq']})`,
      psi: { 'not-equal': neqAbility, equal: eqAbility },
    };
  }
  return {
    label: `Psi Game - ${neqAbility.label}`,
    msg: `start a psi game (${neqAbility.label})`,
    psi: { 'not-equal': neqAbility },
  };
}

export const runnerLosesClick: any = {
  label: 'Force the Runner to lose [Click]',
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return ((state as any).runner?.click ?? 0) > 0;
  })},
  msg: 'force the Runner to lose [Click], if able',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreGaining.loseClicks(state, ':runner', 1);
  }),
};

export function runnerLosesCredits(credits: number): any {
  return {
    label: `Make the Runner lose ${credits} [Credits]`,
    msg: `force the Runner to lose ${credits} [Credits]`,
    'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
      return ((state as any).runner?.credit ?? 0) > 0;
    })},
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreGaining.loseCredits(state, ':runner', eid, credits)], []);
    }),
  };
}

export const addRunnerCardToGrip: any = {
  label: 'Add an installed Runner card to the grip',
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').length > 0;
  })},
  'waiting-prompt': true,
  prompt: 'Choose a card',
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
  msg: 'add 1 installed card to the grip',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    const target = targets[0];
    coreMoving.move(state, ':runner', target, ':hand', true);
    coreSay.systemMsg(state, side, `adds ${(target as any).title} to the grip`);
  }),
};

export const addProgramToTopOfStack: any = {
  prompt: 'Add a program to the top of the stack',
  'waiting-prompt': true,
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  label: 'Add installed program to the top of the stack',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `add ${(targets[0] as any)?.title} to the top of the stack`;
  }),
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    coreMoving.move(state, ':runner', targets[0], ':deck', { front: true });
  }),
};

export const trashProgramSub: any = {
  prompt: 'Choose a program to trash',
  label: 'Trash a program',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

export const runnerTrashProgramSub: any = {
  prompt: 'Choose a program to trash',
  player: ':runner',
  label: 'Force the Runner to trash a program',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `force the runner to trash ${(targets[0] as any)?.title}`;
  }),
  'display-side': ':corp',
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.program(c));
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.program(c) },
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

export const trashHardwareSub: any = {
  prompt: 'Choose a piece of hardware to trash',
  label: 'Trash a piece of hardware',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.hardware(c) },
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.hardware(c));
  })},
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

export const trashResourceSub: any = {
  prompt: 'Choose a resource to trash',
  label: 'Trash a resource',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.resource(c) },
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').some((c: Card) => coreCard.resource(c));
  })},
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

export const trashInstalledSub: any = {
  async: true,
  prompt: 'Choose an installed card to trash',
  label: 'Trash an installed Runner card',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `trash ${(targets[0] as any)?.title}`;
  }),
  'waiting-prompt': true,
  'change-in-game-state': { silent: true, req: req(function*(state: State): Generator<any, any, any> {
    return coreBoard.allInstalled(state, ':runner').length > 0;
  })},
  choices: { card: (c: Card) => coreCard.installed(c) && coreCard.runner(c) },
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreMoving.trash(state, side, eid, targets[0], { cause: ':subroutine' })], []);
  }),
};

export const runnerTrashInstalledSub: any = Object.assign({}, trashInstalledSub, {
  player: ':runner',
  label: 'Force the Runner to trash an installed card',
  msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
    return `force the Runner to trash ${(targets[0] as any)?.title}`;
  }),
});

export function installFromHqSub(args: any = {}): any {
  return {
    label: 'Install a card from HQ',
    prompt: 'Choose a card to install from HQ',
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inHand(c) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card } }, args))], []);
    }),
  };
}

export function installFromArchivesSub(args: any = {}): any {
  return {
    label: 'Install a card from Archives',
    prompt: 'Choose a card to install from Archives',
    'show-discard': true,
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && coreCard.inDiscard(c) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card, displayOrigin: true } }, args))], []);
    }),
  };
}

export function installFromHqOrArchivesSub(args: any = {}): any {
  return {
    label: 'Install a card from HQ or Archives',
    prompt: 'Choose a card to install from HQ or Archives',
    'show-discard': true,
    'waiting-prompt': true,
    choices: { card: (c: Card) => coreCard.corpInstallableType(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)) },
    async: true,
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreInstalling.corpInstall(state, side, eid, targets[0], null,
          Object.assign({ msgKeys: { installSource: card, displayOrigin: true } }, args))], []);
    }),
  };
}

export const cannotStealOrTrashSub: any = {
  label: 'The Runner cannot steal or trash Corp cards for the remainder of this run',
  msg: 'prevent the Runner from stealing or trashing Corp cards for the remainder of the run',
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreFlags.registerRunFlag(state, side, card, ':can-steal',
      (_state: State, _side: Side, _card: Card) => {
        coreToasts.toast(state, ':runner', 'Cannot steal due to subroutine.', 'warning');
        return false;
      });
    coreFlags.registerRunFlag(state, side, card, ':can-trash',
      (_state: State, _side: Side, c: Card) => {
        if (coreCard.corp(c)) {
          coreToasts.toast(state, ':runner', 'Cannot trash due to subroutine.', 'warning');
          return false;
        }
        return true;
      });
  }),
};

export function wallIce(subroutines: any[]): any {
  return {
    advanceable: ':always',
    subroutines,
    'static-abilities': [coreIce.iceStrengthBonus(
      req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return coreCard.getCounters(card, ':advancement');
      })
    )],
  };
}

function spaceIce(...abilities: any[]): any {
  return {
    advanceable: ':always',
    subroutines: abilities,
    'rez-cost-bonus': req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return -3 * coreCard.getCounters(card, ':advancement');
    }),
  };
}

function grailInHand(card: Card): boolean {
  return coreCard.corp(card) && coreCard.inHand(card) && coreCard.hasSubtype(card, 'Grail');
}

function addGrailSubs(cards: Card[]): any {
  if (!cards.length) return null;
  const t = cards[0];
  const s: any[] = (coreCardDefs.cardDef(t) as any)?.subroutines || [];
  return {
    prompt: `Add ${(s[0] as any)?.label} subroutine where?`,
    choices: ['Front', 'End'],
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const isFront = targets[0] === 'Front' ? ':front' : null;
      coreEffects.registerLingeringEffect(state, side, card, {
        type: ':additional-subroutines',
        duration: ':end-of-run',
        req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
          return coreCard.sameCard(card, tgts[0]);
        }),
        value: { position: isFront, subroutines: [...s] },
      });
      const rest = cards.slice(1);
      if (rest.length) {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, addGrailSubs(rest), card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

const revealGrail: any = {
  prompt: 'Reveal up to 2 pieces of Grail ice from HQ (first ice chosen will be first sub)',
  interactive: req(function*(state: State, side?: Side, eid?: EID, card?: Card, targets?: any[]): Generator<any, any, any> { return true; }),
  choices: { max: 2, card: grailInHand },
  async: true,
  'waiting-prompt': true,
  effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
    yield wait_for(state, [{ asyncResult: 'result' },
      coreRevealing.revealLoud(state, side, coreEid.makeEid(state, eid), card, null, targets)], []);
    const next = addGrailSubs(targets);
    if (next) {
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, next, card, null)], []);
    } else {
      coreEid.effectCompleted(state, side, eid);
    }
  }),
};

function grailIce(ability: any): any {
  return { 'on-encounter': revealGrail, subroutines: [ability] };
}

export function trashTypeOrEndTheRun(typeName: string, typeFn: (c: Card) => boolean, sub: any): any {
  return {
    label: `Trash 1 ${typeName} or end the run`,
    prompt: 'Choose one',
    'waiting-prompt': true,
    choices: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const hasType = coreBoard.allActiveInstalled(state, ':runner').some(typeFn);
      return [hasType ? `Trash a ${typeName}` : 'Do nothing', 'End the run'];
    }),
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const target = targets[0];
      if (target === 'End the run') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, endTheRun, card, null)], []);
      } else if (target !== 'Do nothing') {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreEngine.resolveAbility(state, side, sub, card, null)], []);
      } else {
        coreEid.effectCompleted(state, side, eid);
      }
    }),
  };
}

export function variableSubsIce(subsCount: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => number, sub: any): any {
  return {
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]);
      }),
      value: req(function*(state: State): Generator<any, any, any> {
        return { subroutines: Array(subsCount(state)).fill(sub) };
      }),
    }],
  };
}

export function subtypeIceCount(corp: any, subtype: string): number {
  const servers = corp?.servers || {};
  return Object.values(servers).flatMap((s: any) => s?.ices || [])
    .filter((ice: Card) => coreCard.rezzed(ice) && coreCard.hasSubtype(ice, subtype)).length;
}

export function nextIceCount(corp: any): number {
  return subtypeIceCount(corp, 'NEXT');
}

function nextIceVariableSubs(sub: any): any {
  return variableSubsIce((state: State, side: Side, eid: EID, card: Card, targets: any[]) => nextIceCount((state as any).corp), sub);
}

export function harmonicIceCount(corp: any): number {
  return subtypeIceCount(corp, 'Harmonic');
}

function morphIce(base: string, other: string, ability: any): any {
  return {
    advanceable: ':always',
    'static-abilities': [
      {
        type: ':lose-subtype',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return coreCard.sameCard(card, targets[0]) &&
            (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') % 2 !== 0);
        }),
        value: base,
      },
      {
        type: ':gain-subtype',
        req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
          return coreCard.sameCard(card, targets[0]) &&
            (coreCard.getCounters(coreCard.getCard(state, card), ':advancement') % 2 !== 0);
        }),
        value: other,
      },
    ],
    subroutines: [ability],
  };
}

function constellationIce(ability: any): any {
  const base = traceAbility(2, ability);
  return {
    subroutines: [Object.assign({}, base, {
      trace: Object.assign({}, base.trace, { kicker: ability, 'kicker-min': 5 }),
    })],
  };
}

function zeroToHero(sub: any): any {
  return {
    advanceable: ':while-rezzed',
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && coreCard.getCounters(card, ':advancement') > 0;
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return { position: ':front', subroutines: Array(coreCard.getCounters(card, ':advancement')).fill(sub) };
      }),
    }],
  };
}

export function heroToHero(sub: any): any {
  return {
    advanceable: ':always',
    'static-abilities': [{
      type: ':additional-subroutines',
      req: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        return coreCard.sameCard(card, targets[0]) && coreCard.getCounters(card, ':advancement') > 0;
      }),
      value: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return { position: ':front', subroutines: Array(coreCard.getCounters(card, ':advancement')).fill(sub) };
      }),
    }],
  };
}

export function wonderSub(card: Card, number: number): boolean {
  return number <= coreCard.getCounters(card, ':advancement');
}

export function resolveAnotherSubroutine(
  pred: (c: Card) => boolean = () => true,
  label = 'Resolve a subroutine on another ice',
  allowSameCard?: boolean
): any {
  const predFn = (card: Card, target: Card) =>
    coreCard.ice(target) && coreCard.rezzed(target) &&
    ((target as any).subroutines?.length ?? 0) >= 1 &&
    (allowSameCard || !coreCard.sameCard(card, target)) && pred(target);
  return {
    async: true,
    label,
    'change-in-game-state': { silent: true, req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreBoard.allInstalled(state, ':corp').some((t: Card) => predFn(card, t));
    })},
    effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      const chosenIce: Card = yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose the ice',
          choices: {
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              return predFn(card, tgts[0]);
            }),
            all: true,
          },
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            coreEid.completeWithResult(s, sd, e, tgts[0]);
          }),
        }, card, null)], []);
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          async: true,
          prompt: 'Choose the subroutine',
          choices: req(function*(s: State): Generator<any, any, any> {
            return coreIce.unbrokenSubroutinesChoice(chosenIce);
          }),
          msg: msg(function(s: State, sd: Side, e: EID, c: Card, tgts: any[]) {
            return `resolve the subroutine ("[subroutine] ${tgts[0]}") from ${(chosenIce as any).title}`;
          }),
          effect: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            const sub = ((chosenIce as any).subroutines || []).find(
              (x: any) => tgts[0] === utils.makeLabel(x['sub-effect'])
            );
            yield wait_for(s, [{ asyncResult: 'result' },
              coreEngine.resolveAbility(s, sd, sub?.['sub-effect'], chosenIce, null)], []);
          }),
        }, card, null)], []);
    }),
  };
}

function implementationNote(...args: any[]): any {
  return (Object.assign as any)?.(...args);
}

export const takeBadPub: any = {
  async: true,
  effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    coreSay.systemMsg(state, side, `takes 1 bad publicity from ${(card as any).title}`);
    yield wait_for(state, [{ asyncResult: 'result' },
      coreBadPublicity.gainBadPublicity(state, ':corp', eid, 1)], []);
  }),
};

// ============================================================================
// Card definitions
// ============================================================================

// Ablative Barrier
export const ablativeBarrier: CardDef = {
  title: 'Ablative Barrier',
  subroutines: [endTheRun],
  'on-rez': {
    req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
      return coreThreat.threatLevel(3, state) && !!(state as any).run && forms.thisServer(state, card);
    }),
    prompt: 'Choose a non-agenda card to install from Archives or HQ in another server',
    'waiting-prompt': true,
    'show-discard': true,
    choices: {
      card: (c: Card) => coreCard.corp(c) && coreCard.corpInstallableType(c) &&
        !coreCard.agenda(c) && (coreCard.inHand(c) || coreCard.inDiscard(c)),
    },
    async: true,
    effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
      const thisServer = coreServers.zoneName((coreCard.getZone(card) as string[])?.[1]);
      const nice = targets[0];
      yield wait_for(state, [{ asyncResult: 'result' },
        coreEngine.resolveAbility(state, side, {
          prompt: 'Choose a server',
          'waiting-prompt': true,
          choices: req(function*(s: State): Generator<any, any, any> {
            return coreInstalling.installableServers(s, nice).filter((srv: string) => srv !== thisServer);
          }),
          async: true,
          effect: effect(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
            yield wait_for(s, [{ asyncResult: 'result' },
              coreInstalling.corpInstall(s, sd, e, nice, tgts[0],
                { msgKeys: { installSource: card, displayOrigin: true } })], []);
          }),
        }, card, null)], []);
    }),
  },
};

// Anemone
export const anemone: CardDef = {
  title: 'Anemone',
  'on-rez': {
    optional: {
      prompt: 'Trash a card from HQ to do 2 net damage?',
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return ((state as any).corp?.hand?.length ?? 0) > 0 &&
          !!(state as any).run && forms.thisServer(state, card);
      }),
      'waiting-prompt': true,
      'yes-ability': {
        msg: 'do 2 net damage',
        cost: [corePayment.toC('trash-from-hand', 1)],
        async: true,
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          yield wait_for(state, [{ asyncResult: 'result' },
            coreDamage.damage(state, side, eid, ':net', 2, { card })], []);
        }),
      },
      'no-ability': {
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreSay.systemMsg(state, ':corp', `declines to use ${(card as any).title}`);
        }),
      },
    },
  },
  subroutines: [coreDefHelpers.doNetDamage(1)],
};

// Ansel 1.0
export const ansel10: CardDef = {
  title: 'Ansel 1.0',
  subroutines: [trashInstalledSub, installFromHqOrArchivesSub(), cannotStealOrTrashSub],
  'runner-abilities': [bioraidBreak(1, 1)],
};

// Ansel 2.0
export const ansel20: CardDef = {
  title: 'Ansel 2.0',
  'runner-abilities': [bioraidBreak(2, 2)],
  subroutines: [
    trashInstalledSub,
    {
      label: 'Remove 1 card in the Heap from the game',
      'change-in-game-state': {
        silent: true,
        req: req(function*(state: State): Generator<any, any, any> {
          return ((state as any).runner?.discard?.length ?? 0) > 0 &&
            !coreFlags.zoneLocked(state, ':runner', ':discard');
        }),
      },
      prompt: 'Choose a card in the heap to remove from the game',
      'show-opponent-discard': true,
      'waiting-prompt': true,
      choices: { card: (c: Card) => coreCard.runner(c) && coreCard.inDiscard(c) },
      msg: msg(function(state: State, side: Side, eid: EID, card: Card, targets: any[]) {
        return `remove ${(targets[0] as any)?.title} from the game`;
      }),
      effect: req(function*(state: State, side: Side, eid: EID, card: Card, targets: any[]): Generator<any, any, any> {
        coreMoving.move(state, ':runner', targets[0], ':rfg');
      }),
    },
    installFromHqOrArchivesSub(),
    endTheRun,
  ],
};

// Anvil
export const anvil: CardDef = {
  title: 'Anvil',
  'on-encounter': {
    optional: {
      prompt: 'Trash another card?',
      'waiting-prompt': true,
      req: req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        return corePayment.canPay(state, side,
          Object.assign({}, eid, { source: card, sourceType: ':ability' }),
          card, null, [corePayment.toC('trash-other-installed', 1)]);
      }),
      'yes-ability': {
        prompt: 'Select another installed card to trash',
        cost: [corePayment.toC('trash-other-installed', 1)],
        msg: 'prevent its printed subroutines being broken this encounter',
        effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
          coreEffects.registerLingeringEffect(state, side, card, {
            type: ':cannot-break-subs-on-ice',
            req: req(function*(s: State, sd: Side, e: EID, c: Card, tgts: any[]): Generator<any, any, any> {
              return coreCard.sameCard(card, (tgts[0] as any)?.ice);
            }),
            value: true,
            duration: ':end-of-encounter',
          });
        }),
      },
    },
  },
  subroutines: [corpsGainsAndRunnerLosesCredits(1, 1), runnerTrashInstalledSub],
};

// Afshar
export const afshar: CardDef = (() => {
  const breakableFn = req(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
    if ((card as any).title === 'Afshar' &&
      (coreCard.getZone(card) as string[])?.[1] === ':hq' &&
      !coreEffects.isDisabledReg(state, card)) {
      return ((card as any).subroutines || []).some((s: any) => s.broken && s.printed)
        ? ':unrestricted' : true;
    }
    return ':unrestricted';
  });
  return {
    title: 'Afshar',
    subroutines: [
      Object.assign({}, runnerLosesCredits(2), { breakable: breakableFn }),
      Object.assign({}, endTheRun, { breakable: breakableFn }),
    ],
  };
})();

// Aiki
export const aiki: CardDef = {
  title: 'Aiki',
  subroutines: [
    doPsi({
      label: 'Runner draws 2 cards',
      msg: 'make the Runner draw 2 cards',
      async: true,
      effect: effect(function*(state: State, side: Side, eid: EID, card: Card): Generator<any, any, any> {
        yield wait_for(state, [{ asyncResult: 'result' },
          coreDrawing.draw(state, ':runner', eid, 2)], []);
      }),
    }),
    coreDefHelpers.doNetDamage(1),
    coreDefHelpers.doNetDamage(1),
  ],
};
